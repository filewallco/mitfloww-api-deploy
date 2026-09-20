import { z } from "zod";
import { ASSET_SHARE_STATUSES, ASSET_SHARE_TEMPLATES } from "@/lib/db/schema/asset-shares";

export const MAX_PREVIEW_IMAGE_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB
export const MAX_PREVIEW_VIDEO_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PREVIEW_FILES_COUNT = 3;

export const previewFileItemSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  storageKey: z.string().min(1),
  previewUrl: z.string().optional().nullable(),
}).refine((file) => {
  const isImage = file.mimeType.startsWith("image/");
  const isVideo = file.mimeType.startsWith("video/");
  if (!isImage && !isVideo) {
    return false;
  }
  if (isImage && file.sizeBytes > MAX_PREVIEW_IMAGE_SIZE_BYTES) {
    return false;
  }
  if (isVideo && file.sizeBytes > MAX_PREVIEW_VIDEO_SIZE_BYTES) {
    return false;
  }
  return true;
}, {
  message: "Preview files must be images (max 1 MB) or videos (max 10 MB).",
});

export const createAssetShareSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Title is required").max(120, "Title cannot exceed 120 characters"),
  description: z.string().max(2000, "Description cannot exceed 2000 characters").optional().nullable(),
  amountCents: z.number().int().positive("Amount must be greater than 0"),
  currency: z.string().trim().length(3, "Currency must be 3 characters").toUpperCase(),
  templateKey: z.enum(ASSET_SHARE_TEMPLATES).default("minimal-modern"),
  previewFiles: z.array(previewFileItemSchema).max(MAX_PREVIEW_FILES_COUNT, "Maximum 3 preview files allowed").default([]),
});

export const updateAssetShareSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title cannot exceed 120 characters").optional(),
  description: z.string().max(2000, "Description cannot exceed 2000 characters").optional().nullable(),
  amountCents: z.number().int().positive("Amount must be greater than 0").optional(),
  templateKey: z.enum(ASSET_SHARE_TEMPLATES).optional(),
  status: z.enum(ASSET_SHARE_STATUSES).optional(),
  previewFiles: z.array(previewFileItemSchema).max(MAX_PREVIEW_FILES_COUNT, "Maximum 3 preview files allowed").optional(),
});

export const assetShareGateSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
});

export const assetSharePurchaseSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
});

const FORBIDDEN_DOWNLOADABLE_EXTENSIONS = new Set(["exe", "bat", "cmd", "sh", "vbs", "msi"]);

export const downloadableFileItemSchema = z.object({
  name: z.string().min(1).max(255),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  extension: z.string().min(1).max(32),
  sizeBytes: z.number().int().positive(),
  storageKey: z.string().min(1),
}).refine((file) => {
  const ext = file.extension.toLowerCase().replace(/^\./, "");
  return !FORBIDDEN_DOWNLOADABLE_EXTENSIONS.has(ext);
}, {
  message: "Executable files (.exe, .bat, .cmd, etc.) are not allowed.",
});

export const uploadAssetShareFilesSchema = z.object({
  files: z.array(downloadableFileItemSchema).min(1, "At least one file is required"),
});
