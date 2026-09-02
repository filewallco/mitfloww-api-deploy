import { z } from "zod";
import { FILE_REVISION_NOTE_MAX_LENGTH } from "@/lib/constants/file-revision-notes";

function trimmedRequiredString(fieldName: string, maxLength: number) {
  return z
    .string({
      invalid_type_error: `${fieldName} must be a string.`,
      required_error: `${fieldName} is required.`,
    })
    .trim()
    .min(1, `${fieldName} is required.`)
    .max(maxLength, `${fieldName} must be at most ${maxLength} characters.`);
}

const normalizedCoordinateSchema = z
  .number({ invalid_type_error: "marker coordinates must be numbers." })
  .finite("marker coordinates must be finite numbers.")
  .min(0, "marker coordinates must be at least 0.")
  .max(1, "marker coordinates must be at most 1.");

const normalizedSizeSchema = z
  .number({ invalid_type_error: "marker size must be a number." })
  .finite("marker size must be a finite number.")
  .min(0.002, "marker size is too small.")
  .max(1, "marker size must be at most 1.");

export const fileRevisionNoteMarkerSchema = z
  .object({
    height: normalizedSizeSchema,
    pageNumber: z
      .number({ invalid_type_error: "pageNumber must be a number." })
      .int("pageNumber must be an integer.")
      .min(1, "pageNumber must be at least 1.")
      .optional()
      .nullable(),
    width: normalizedSizeSchema,
    x: normalizedCoordinateSchema,
    y: normalizedCoordinateSchema,
  })
  .strict()
  .superRefine((marker, ctx) => {
    if (marker.x + marker.width > 1.0001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "marker exceeds the preview width.",
        path: ["width"],
      });
    }

    if (marker.y + marker.height > 1.0001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "marker exceeds the preview height.",
        path: ["height"],
      });
    }
  });


export const fileRevisionNoteItemSchema = z
  .object({
    body: trimmedRequiredString("item", FILE_REVISION_NOTE_MAX_LENGTH),
    markerIndex: z
      .number({ invalid_type_error: "markerIndex must be a number." })
      .int("markerIndex must be an integer.")
      .min(0, "markerIndex must be at least 0."),
  })
  .strict();

export const fileRevisionNoteExistingItemSchema = z
  .object({
    body: trimmedRequiredString("item", FILE_REVISION_NOTE_MAX_LENGTH),
    id: z.string().uuid("item id must be a valid UUID."),
  })
  .strict();

export const fileRevisionNotesParamsSchema = z
  .object({
    id: z.string().uuid("id must be a valid UUID."),
  })
  .strict();

export const fileRevisionNotesQuerySchema = z
  .object({
    fileVersionId: z.string().uuid("fileVersionId must be a valid UUID."),
  })
  .strict();

export const fileRevisionNoteMutationQuerySchema = z
  .object({
    fileVersionId: z.string().uuid("fileVersionId must be a valid UUID."),
  })
  .strict();

export const fileRevisionNoteReplyParamsSchema = z
  .object({
    id: z.string().uuid("id must be a valid UUID."),
    noteId: z.string().uuid("noteId must be a valid UUID."),
  })
  .strict();

export const fileRevisionNoteMarkerParamsSchema = fileRevisionNoteReplyParamsSchema
  .extend({
    markerId: z.string().uuid("markerId must be a valid UUID."),
  })
  .strict();

export const fileRevisionNoteItemParamsSchema = fileRevisionNoteReplyParamsSchema
  .extend({
    itemId: z.string().uuid("itemId must be a valid UUID."),
  })
  .strict();

export const upsertFileRevisionNoteBodySchema = z
  .object({
    fileVersionId: z.string().uuid("fileVersionId must be a valid UUID."),
    items: z.array(fileRevisionNoteItemSchema).max(30).optional().default([]),
    markers: z.array(fileRevisionNoteMarkerSchema).max(30).optional().default([]),
    note: z
      .string({
        invalid_type_error: "note must be a string.",
      })
      .trim()
      .max(FILE_REVISION_NOTE_MAX_LENGTH, `note must be at most ${FILE_REVISION_NOTE_MAX_LENGTH} characters.`)
      .optional()
      .default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasNote = value.note.trim().length > 0;
    const hasItems = value.items.length > 0;

    if (!hasNote && !hasItems) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "note or at least one checklist item is required.",
        path: ["note"],
      });
    }

    for (const item of value.items) {
      if (item.markerIndex >= value.markers.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "item markerIndex must point to an existing marker.",
          path: ["items"],
        });
      }
    }
  });

export const updateFileRevisionNoteBodySchema = z
  .object({
    fileVersionId: z.string().uuid("fileVersionId must be a valid UUID."),
    items: z.array(fileRevisionNoteExistingItemSchema).max(30).optional().default([]),
    note: z
      .string({
        invalid_type_error: "note must be a string.",
      })
      .trim()
      .max(FILE_REVISION_NOTE_MAX_LENGTH, `note must be at most ${FILE_REVISION_NOTE_MAX_LENGTH} characters.`)
      .optional()
      .default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasNote = value.note.trim().length > 0;
    const hasItems = value.items.length > 0;

    if (!hasNote && !hasItems) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "note or at least one checklist item is required.",
        path: ["note"],
      });
    }
  });

export const replyToFileRevisionNoteBodySchema = z
  .object({
    fileVersionId: z.string().uuid("fileVersionId must be a valid UUID."),
    reply: trimmedRequiredString("reply", FILE_REVISION_NOTE_MAX_LENGTH),
  })
  .strict();

export const updateFileRevisionNoteItemCompletionBodySchema = z
  .object({
    completed: z.boolean({ invalid_type_error: "completed must be a boolean." }),
    fileVersionId: z.string().uuid("fileVersionId must be a valid UUID."),
  })
  .strict();

export const fileRevisionNoteReportBodySchema = z
  .object({
    fileVersionId: z.string().uuid("fileVersionId must be a valid UUID."),
    message: z
      .string({
        invalid_type_error: "message must be a string.",
      })
      .trim()
      .max(FILE_REVISION_NOTE_MAX_LENGTH, `message must be at most ${FILE_REVISION_NOTE_MAX_LENGTH} characters.`)
      .optional(),
    reason: z
      .string({
        invalid_type_error: "reason must be a string.",
      })
      .trim()
      .min(1, "reason is required.")
      .max(120, "reason must be at most 120 characters."),
    replyId: z.string().uuid("replyId must be a valid UUID.").optional(),
  })
  .strict();

export type FileRevisionNotesParams = z.infer<
  typeof fileRevisionNotesParamsSchema
>;
export type FileRevisionNoteReplyParams = z.infer<
  typeof fileRevisionNoteReplyParamsSchema
>;
export type FileRevisionNoteMarkerParams = z.infer<
  typeof fileRevisionNoteMarkerParamsSchema
>;
export type FileRevisionNoteItemParams = z.infer<
  typeof fileRevisionNoteItemParamsSchema
>;
export type FileRevisionNotesQuery = z.infer<
  typeof fileRevisionNotesQuerySchema
>;
export type FileRevisionNoteMutationQuery = z.infer<
  typeof fileRevisionNoteMutationQuerySchema
>;
export type FileRevisionNoteMarkerInput = z.infer<
  typeof fileRevisionNoteMarkerSchema
>;
export type FileRevisionNoteItemInput = z.infer<
  typeof fileRevisionNoteItemSchema
>;
export type FileRevisionNoteExistingItemInput = z.infer<
  typeof fileRevisionNoteExistingItemSchema
>;
export type UpdateFileRevisionNoteBody = z.infer<
  typeof updateFileRevisionNoteBodySchema
>;
export type UpsertFileRevisionNoteBody = z.infer<
  typeof upsertFileRevisionNoteBodySchema
>;
export type ReplyToFileRevisionNoteBody = z.infer<
  typeof replyToFileRevisionNoteBodySchema
>;