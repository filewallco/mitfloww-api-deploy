import { Router } from "express";
import { z } from "zod";
import { testimonialService } from "@/lib/services/testimonial-service";
import { creditService } from "@/lib/services/credit-service";
import { AppError } from "@/lib/errors/app-error";
import type { UpdateTestimonialInput } from "@/lib/repositories/testimonial-repository";
import { asyncHandler } from "@/lib/api/route";

export const testimonialsRouter = Router();

const createTestimonialSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  presetId: z.string().optional().nullable(),
  templateId: z.string().optional().nullable(),
  canvasJson: z.any().optional().nullable(),
  bindingSourceJson: z.any().optional().nullable(),
});

const downloadTestimonialSchema = z.object({
  templateId: z.string(),
  testimonialId: z.string().optional().nullable(),
});

const autosaveSchema = z.object({
  bindingSourceJson: z.any().nullable().optional(),
  canvasJson: z.any().nullable().optional(),
  projectId: z.string().nullable().optional(),
  projectReviewId: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
});

const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

testimonialsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = createTestimonialSchema.parse(req.body);
  const validTemplateId = parsed.templateId ? parsed.templateId : null;
  const dbTemplateId = validTemplateId && isUUID(validTemplateId) ? validTemplateId : null;

  if (validTemplateId) {
    const { scope } = await creditService.getOrCreateCreditAccountForScope();
    await creditService.calculateAndDeductFeatureCredits({
      idempotencyKey: `testimonial-customize-${parsed.id}`,
      featureParams: {
        currency: "USD",
        featureKey: "testimonial_customize",
        templateId: validTemplateId,
      },
      scope,
      metadata: {
        testimonialId: parsed.id,
      },
    });
  }

  const created = await testimonialService.createTestimonial({
    id: parsed.id,
    userId: "system",
    title: parsed.title,
    slug: parsed.slug,
    status: "draft",
    templateKey: parsed.templateId ?? "custom-blank",
    templateScope: "system",
    presetId: (parsed.presetId as any) || "square",
    templateId: dbTemplateId,
    canvasJson: parsed.canvasJson || {},
    bindingSourceJson: parsed.bindingSourceJson || null,
  });

  return res.json({ id: created.id, status: "success" });
}));

testimonialsRouter.post("/download", asyncHandler(async (req, res) => {
  const parsed = downloadTestimonialSchema.parse(req.body);
  const { scope } = await creditService.getOrCreateCreditAccountForScope();

  await creditService.calculateAndDeductFeatureCredits({
    idempotencyKey: `testimonial-download-${parsed.templateId}-${Date.now()}`,
    featureParams: {
      currency: "USD",
      featureKey: "testimonial_download",
      templateId: parsed.templateId,
    },
    scope,
    metadata: {
      testimonialId: parsed.testimonialId ?? null,
    },
  });

  return res.json({ status: "success" });
}));

testimonialsRouter.put("/:id/autosave", asyncHandler(async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const parsed = autosaveSchema.parse(req.body);

  const updateInput: UpdateTestimonialInput = {
    lastSavedAt: new Date(),
  };

  if (parsed.bindingSourceJson !== undefined) updateInput.bindingSourceJson = parsed.bindingSourceJson;
  if (parsed.canvasJson !== undefined) updateInput.canvasJson = parsed.canvasJson;
  if (parsed.projectId !== undefined) updateInput.projectId = parsed.projectId;
  if (parsed.projectReviewId !== undefined) updateInput.projectReviewId = parsed.projectReviewId;
  if (parsed.templateId !== undefined) updateInput.templateId = parsed.templateId;

  const updated = await testimonialService.updateTestimonial(id, updateInput);

  return res.json({
    id: updated.id,
    lastSavedAt: updated.lastSavedAt.toISOString(),
    status: "success",
  });
}));
