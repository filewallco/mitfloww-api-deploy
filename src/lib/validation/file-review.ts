import { z } from "zod";
import { commitUploadedFileSchema } from "@/lib/validation/files";

const PROJECT_ID_MAX_LENGTH = 255;

export const projectFileReviewParamsSchema = z
  .object({
    fileId: z.string().uuid("fileId must be a valid UUID."),
    id: z
      .string({
        invalid_type_error: "Project id must be a string.",
        required_error: "Project id is required.",
      })
      .trim()
      .min(1, "Project id is required.")
      .max(PROJECT_ID_MAX_LENGTH, "Project id is too long."),
  })
  .strict();

export const projectFileVersionParamsSchema = projectFileReviewParamsSchema
  .extend({
    versionId: z.string().uuid("versionId must be a valid UUID."),
  })
  .strict();

export const fileVersionReportBodySchema = z
  .object({
    message: z
      .string({
        invalid_type_error: "message must be a string.",
      })
      .trim()
      .max(2000, "message is too long.")
      .optional(),
    reason: z
      .string({
        invalid_type_error: "reason must be a string.",
        required_error: "reason is required.",
      })
      .trim()
      .min(1, "reason is required.")
      .max(120, "reason is too long."),
  })
  .strict();

export const finalDraftReportBodySchema = fileVersionReportBodySchema;

export const commitProjectFileVersionBodySchema = z
  .object({
    allowLargeUploads: z.boolean().default(false),
    files: z
      .array(commitUploadedFileSchema)
      .length(1, "files must include exactly one ready upload."),
    isFinalDraft: z.boolean().optional(),
    useSoftWatermark: z.boolean().optional(),
    markAsFinalDraft: z.boolean().optional(),
    revisionDescription: z.string().trim().max(1000).optional().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.isFinalDraft !== undefined &&
      value.markAsFinalDraft !== undefined &&
      value.isFinalDraft !== value.markAsFinalDraft
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "isFinalDraft and markAsFinalDraft must match when both are provided.",
        path: ["isFinalDraft"],
      });
    }
  })
  .transform((value) => ({
    allowLargeUploads: value.allowLargeUploads,
    files: value.files,
    isFinalDraft: value.isFinalDraft ?? value.markAsFinalDraft ?? false,
    useSoftWatermark: value.useSoftWatermark,
    revisionDescription: value.revisionDescription?.trim() || null,
  }));

export type ProjectFileReviewParams = z.infer<
  typeof projectFileReviewParamsSchema
>;
export type ProjectFileVersionParams = z.infer<
  typeof projectFileVersionParamsSchema
>;
export type CommitProjectFileVersionBody = z.infer<
  typeof commitProjectFileVersionBodySchema
>;
export type FileVersionReportBody = z.infer<typeof fileVersionReportBodySchema>;
export type FinalDraftReportBody = z.infer<typeof finalDraftReportBodySchema>;