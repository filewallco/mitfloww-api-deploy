import { z } from "zod";

import { CLIENT_SHARE_REPORT_REASONS } from "@/lib/dto/client-share";
import { fileQueryParamsSchema } from "@/lib/validation/files";
import {
  fileRevisionNotesQuerySchema,
  updateFileRevisionNoteBodySchema,
  upsertFileRevisionNoteBodySchema,
  replyToFileRevisionNoteBodySchema,
} from "@/lib/validation/file-revision-notes";
import { projectShareTokenParamsSchema } from "@/lib/validation/projects";

export const clientShareFilesQuerySchema = fileQueryParamsSchema
  .omit({
    projectId: true,
  })
  .strict();

export const clientShareFileParamsSchema = projectShareTokenParamsSchema
  .extend({
    fileId: z.string().uuid("fileId must be a valid UUID."),
  })
  .strict();

export const clientShareVersionParamsSchema = clientShareFileParamsSchema
  .extend({
    versionId: z.string().uuid("versionId must be a valid UUID."),
  })
  .strict();

export const clientShareRevisionNoteMutationParamsSchema = clientShareFileParamsSchema
  .extend({
    noteId: z.string().uuid("noteId must be a valid UUID."),
  })
  .strict();


export const clientShareRevisionNoteMarkerParamsSchema = clientShareFileParamsSchema
  .extend({
    markerId: z.string().uuid("markerId must be a valid UUID."),
    noteId: z.string().uuid("noteId must be a valid UUID."),
  })
  .strict();

export const clientShareReportBodySchema = z
  .object({
    message: z
      .string({
        invalid_type_error: "message must be a string.",
      })
      .trim()
      .max(2000, "message is too long.")
      .optional(),
    reason: z.enum(CLIENT_SHARE_REPORT_REASONS, {
      errorMap: () => ({
        message: "reason is invalid.",
      }),
    }),
  })
  .strict();

export const clientShareRevisionNotesQuerySchema =
  fileRevisionNotesQuerySchema;

export const clientShareRevisionNoteBodySchema =
  upsertFileRevisionNoteBodySchema;

export const clientShareRevisionNoteUpdateBodySchema =
  updateFileRevisionNoteBodySchema;

export const clientShareReplyToFileRevisionNoteBodySchema =
  replyToFileRevisionNoteBodySchema;

export const clientShareReviewBodySchema = z
  .object({
    rating: z
      .number({
        invalid_type_error: "rating must be a number.",
        required_error: "rating is required.",
      })
      .int("rating must be a whole number.")
      .min(1, "rating must be at least 1.")
      .max(5, "rating must be at most 5."),
    reviewText: z
      .string({
        invalid_type_error: "reviewText must be a string.",
        required_error: "reviewText is required.",
      })
      .trim()
      .min(1, "reviewText is required.")
      .max(2000, "reviewText is too long."),
  })
  .strict();
