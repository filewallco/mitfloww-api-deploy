import { Router } from "express";
import { z } from "zod";
import { testimonialService } from "@/lib/services/testimonial-service";
import { creditService } from "@/lib/services/credit-service";
import { AppError } from "@/lib/errors/app-error";
import type { UpdateTestimonialInput } from "@/lib/repositories/testimonial-repository";
import { asyncHandler } from "@/lib/api/route";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { r2Storage } from "@/lib/storage/r2";
import sharp from "sharp";

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

function extractUploadBuffer(req: any): { buffer: Buffer; filename: string; mimeType: string } {
  if (req.body && typeof req.body === "object" && typeof req.body.fileBase64 === "string") {
    const filename = req.body.filename || "upload.png";
    const mimeType = req.body.mimeType || "image/png";
    const base64Data = req.body.fileBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    return { buffer, filename, mimeType };
  }

  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    const filename = (req.query.filename as string) || "upload.png";
    const mimeType = req.headers["content-type"] || "image/png";
    return { buffer: req.body, filename, mimeType };
  }

  throw new AppError("No file data provided in request.", 400, "missing_file_payload");
}

testimonialsRouter.get("/", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const items = await testimonialService.listTestimonials(actor.id);
  return res.json({ items, status: "success" });
}));

testimonialsRouter.post("/upload", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const file = extractUploadBuffer(req);

  // Server-side size validation: max 1MB (1 * 1024 * 1024 bytes)
  const MAX_FILE_SIZE = 1 * 1024 * 1024;
  if (file.buffer.length > MAX_FILE_SIZE) {
    throw new AppError("File size exceeds the 1MB limit.", 400, "file_too_large");
  }

  // Validate mime type
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
  if (!allowedMimeTypes.includes(file.mimeType.toLowerCase())) {
    throw new AppError("Unsupported file format. Please upload JPEG, PNG, WEBP, GIF, or SVG.", 400, "unsupported_media_type");
  }

  const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const sanitizedBase = sanitizedFilename.replace(/\.[^.]+$/, "");

  let uploadBuffer = file.buffer;
  let contentType = file.mimeType;
  let extension = "webp";

  // Compress and convert to webp unless SVG
  if (file.mimeType.toLowerCase() !== "image/svg+xml") {
    try {
      uploadBuffer = await sharp(file.buffer)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer();
      contentType = "image/webp";
      extension = "webp";
    } catch (err) {
      console.warn("Sharp image compression fallback to original buffer:", err);
    }
  } else {
    extension = "svg";
  }

  const storageKey = `users/${actor.id}/testimonials/${Date.now()}-${sanitizedBase}.${extension}`;

  await r2Storage.uploadFile({
    key: storageKey,
    body: uploadBuffer,
    contentType,
  });

  const publicBase = process.env.R2_PUBLIC_BASE_URL;
  const url = publicBase
    ? `${publicBase.replace(/\/+$/, "")}/${storageKey}`
    : `/api/profile/media?key=${encodeURIComponent(storageKey)}`;

  return res.json({
    url,
    storageKey,
    filename: `${sanitizedBase}.${extension}`,
    size: uploadBuffer.length,
    status: "success",
  });
}));

testimonialsRouter.delete("/upload", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const key = typeof req.query.key === "string" ? req.query.key : typeof req.body?.key === "string" ? req.body.key : "";
  if (!key) {
    return res.status(400).json({ error: "Storage key is required" });
  }

  // Security: only allow deleting assets under the actor's own path
  const userPrefix = `users/${actor.id}/`;
  if (!key.startsWith(userPrefix)) {
    return res.status(403).json({ error: "Forbidden: Cannot delete files of other users" });
  }

  try {
    await r2Storage.deleteFile({ key });
  } catch (err) {
    console.warn("Non-fatal: failed to delete file from R2:", err);
  }

  return res.json({ status: "success", deletedKey: key });
}));

testimonialsRouter.get("/:id", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const testimonial = await testimonialService.getTestimonialById(id, actor.id);
  return res.json({ testimonial, status: "success" });
}));

testimonialsRouter.post("/", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
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
    userId: actor.id,
    title: parsed.title,
    slug: parsed.slug,
    status: "draft",
    templateKey: parsed.templateId ?? "custom-blank",
    templateScope: "user",
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
  const actor = await resolveActiveActor(req);
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

  const updated = await testimonialService.updateTestimonial(id, updateInput, actor.id);

  return res.json({
    id: updated.id,
    lastSavedAt: updated.lastSavedAt.toISOString(),
    status: "success",
    testimonial: updated,
  });
}));

testimonialsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
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

  const updated = await testimonialService.updateTestimonial(id, updateInput, actor.id);

  return res.json({
    id: updated.id,
    status: "success",
    testimonial: updated,
  });
}));

testimonialsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const id = typeof req.params.id === "string" ? req.params.id : "";
  await testimonialService.deleteTestimonial(id, actor.id);
  return res.json({ id, status: "success" });
}));
