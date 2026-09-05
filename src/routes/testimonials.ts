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

const updateTestimonialSchema = z.object({
  title: z.string().optional(),
  slug: z.string().optional(),
  status: z.enum(["draft", "saved", "published", "archived"]).optional(),
  presetId: z.string().optional(),
  canvasJson: z.any().optional(),
  bindingSourceJson: z.any().optional(),
  previewDataUrl: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  projectReviewId: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
});

const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

testimonialsRouter.get("/", asyncHandler(async (_req, res) => {
  const items = await testimonialService.listTestimonials();
  return res.json({ items, status: "success" });
}));

testimonialsRouter.get("/:id", asyncHandler(async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const testimonial = await testimonialService.getTestimonialById(id);
  return res.json({ testimonial, status: "success" });
}));

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

  return res.json({ id: created.id, status: "success", testimonial: created });
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
  if (parsed.projectId !== undefined) updateInput.projectId = parsed.projectId && isUUID(parsed.projectId) ? parsed.projectId : null;
  if (parsed.projectReviewId !== undefined) updateInput.projectReviewId = parsed.projectReviewId && isUUID(parsed.projectReviewId) ? parsed.projectReviewId : null;
  if (parsed.templateId !== undefined) updateInput.templateId = parsed.templateId && isUUID(parsed.templateId) ? parsed.templateId : null;

  const updated = await testimonialService.updateTestimonial(id, updateInput);

  return res.json({
    id: updated.id,
    lastSavedAt: updated.lastSavedAt.toISOString(),
    status: "success",
    testimonial: updated,
  });
}));

testimonialsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const parsed = updateTestimonialSchema.parse(req.body);

  const updateInput: UpdateTestimonialInput = {};
  if (parsed.title !== undefined) updateInput.title = parsed.title;
  if (parsed.slug !== undefined) updateInput.slug = parsed.slug;
  if (parsed.status !== undefined) updateInput.status = parsed.status;
  if (parsed.presetId !== undefined) updateInput.presetId = parsed.presetId as any;
  if (parsed.canvasJson !== undefined) updateInput.canvasJson = parsed.canvasJson;
  if (parsed.bindingSourceJson !== undefined) updateInput.bindingSourceJson = parsed.bindingSourceJson;
  if (parsed.previewDataUrl !== undefined) updateInput.previewDataUrl = parsed.previewDataUrl;
  if (parsed.projectId !== undefined) updateInput.projectId = parsed.projectId && isUUID(parsed.projectId) ? parsed.projectId : null;
  if (parsed.projectReviewId !== undefined) updateInput.projectReviewId = parsed.projectReviewId && isUUID(parsed.projectReviewId) ? parsed.projectReviewId : null;
  if (parsed.templateId !== undefined) updateInput.templateId = parsed.templateId && isUUID(parsed.templateId) ? parsed.templateId : null;

  const updated = await testimonialService.updateTestimonial(id, updateInput);

  return res.json({
    id: updated.id,
    status: "success",
    testimonial: updated,
  });
}));

testimonialsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  await testimonialService.deleteTestimonial(id);
  return res.json({ id, status: "success" });
}));
