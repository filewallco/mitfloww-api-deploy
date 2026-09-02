import { z } from "zod";
import {
  INPUT_LIMITS,
  trimFileTitle,
} from "@/config/input-limits";
import {
  getMaxUploadSizeBytesForExtension,
  getUploadExtension,
  isAllowedUploadMimeTypeForExtension,
  isDangerousUploadExtension,
  maxSingleUploadFileSizeBytes,
  normalizeUploadExtension,
  normalizeUploadMimeType,
  uploadConfig,
} from "@/config/upload";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/lib/query/pagination";
import { FILE_SORT_FIELDS, FILE_TYPES } from "@/lib/query/files";
import { SORT_ORDERS } from "@/lib/query/sorting";
import {
  CREATABLE_FILE_UPLOAD_STATUSES,
  FileUploadStatus,
  UPDATABLE_FILE_UPLOAD_STATUSES,
} from "@/lib/dto/file-contracts";
import {
  MULTIPART_UPLOAD_ABORT_REASONS,
  MultipartUploadAbortReason,
} from "@/lib/dto/file-multipart";
import { isManagedUploadStorageKey } from "@/lib/uploads/final-storage-keys";

const ORIGINAL_FILENAME_MAX_LENGTH = 255;
const PROJECT_ID_MAX_LENGTH = 255;
const MAX_SEARCH_LENGTH = 255;
const MAX_MULTIPART_PARTS = Math.ceil(
  maxSingleUploadFileSizeBytes / uploadConfig.multipartPartSizeBytes,
);
const MAX_CLIENT_FILE_ID_LENGTH = 255;
const MAX_UPLOAD_SESSION_ID_LENGTH = 255;
const MAX_STORAGE_BUCKET_LENGTH = 128;
const MAX_STORAGE_KEY_LENGTH = 2048;
const ACCEPTED_MIME_TYPES = new Set<string>(uploadConfig.acceptedMimeTypes);
const ACCEPTED_EXTENSIONS = new Set<string>(uploadConfig.acceptedExtensions);
function requiredStringParams(fieldName: string) {
  return {
    required_error: `${fieldName} is required.`,
    invalid_type_error: `${fieldName} must be a string.`,
  } as const;
}

function requiredNumberParams(fieldName: string) {
  return {
    required_error: `${fieldName} is required.`,
    invalid_type_error: `${fieldName} must be a number.`,
  } as const;
}

function enumMessageParams(message: string) {
  return {
    errorMap: () => ({ message }),
  } as const;
}

function emptyStringToUndefined(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function optionalBooleanQuerySchema(fieldName: string) {
  return z.preprocess(
    (value) => {
      const normalizedValue = emptyStringToUndefined(value);

      if (typeof normalizedValue === "boolean") {
        return normalizedValue ? "true" : "false";
      }

      return normalizedValue;
    },
    z
      .enum(["true", "false"] as const, enumMessageParams(`${fieldName} must be true or false.`))
      .transform((value) => value === "true")
      .optional(),
  );
}

function validateUploadMetadata(
  value: {
    extension: string;
    mimeType: string;
    originalName: string;
    sizeBytes: number;
  },
  ctx: z.RefinementCtx,
) {
  const originalNameExtension = getUploadExtension(value.originalName);

  if (hasDangerousFileExtension(value.originalName)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "originalName extension is not allowed.",
      path: ["originalName"],
    });
  }

  if (isDangerousUploadExtension(value.extension)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "extension is not allowed.",
      path: ["extension"],
    });
  }

  if (originalNameExtension !== value.extension) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "originalName extension must match extension.",
      path: ["originalName"],
    });
  }

  if (!isAllowedUploadMimeTypeForExtension(value.extension, value.mimeType)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "mimeType must match extension.",
      path: ["mimeType"],
    });
  }

  const maxFileSizeBytes = getMaxUploadSizeBytesForExtension(value.extension);

  if (maxFileSizeBytes !== undefined && value.sizeBytes > maxFileSizeBytes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `sizeBytes must be at most ${maxFileSizeBytes} for this file type.`,
      path: ["sizeBytes"],
    });
  }
}

function trimmedRequiredString(fieldName: string, maxLength: number) {
  return z
    .string(requiredStringParams(fieldName))
    .trim()
    .min(1, `${fieldName} is required.`)
    .max(maxLength, `${fieldName} must be at most ${maxLength} characters.`);
}

function capStringLength(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function hasDangerousFileExtension(fileName: string) {
  const segments = fileName
    .split(/[\\/]/)
    .pop()
    ?.toLowerCase()
    .split(".")
    .slice(1) ?? [];

  return segments.some((segment) => isDangerousUploadExtension(`.${segment}`));
}

function trimmedRequiredCappedString(fieldName: string, maxLength: number) {
  return z
    .string(requiredStringParams(fieldName))
    .trim()
    .min(1, `${fieldName} is required.`)
    .transform((value) => (maxLength === INPUT_LIMITS.fileTitle ? trimFileTitle(value) : capStringLength(value, maxLength)));
}

function trimmedOptionalCappedString(fieldName: string, maxLength: number) {
  return z
    .string({
      invalid_type_error: `${fieldName} must be a string.`,
    })
    .trim()
    .min(1, `${fieldName} is required.`)
    .transform((value) => (maxLength === INPUT_LIMITS.fileTitle ? trimFileTitle(value) : capStringLength(value, maxLength)))
    .optional();
}

const normalizedProjectIdSchema = z
  .string({
    invalid_type_error: "projectId must be a string.",
  })
  .trim()
  .min(1, "projectId is required.")
  .max(
    PROJECT_ID_MAX_LENGTH,
    `projectId must be at most ${PROJECT_ID_MAX_LENGTH} characters.`,
  );

const normalizedMimeTypeSchema = z
  .string({
    ...requiredStringParams("mimeType"),
  })
  .trim()
  .min(1, "mimeType is required.")
  .transform(normalizeUploadMimeType)
  .refine(
    (value) => ACCEPTED_MIME_TYPES.has(value),
    "mimeType is not allowed.",
  );

const normalizedExtensionSchema = z
  .string({
    ...requiredStringParams("extension"),
  })
  .trim()
  .min(1, "extension is required.")
  .transform(normalizeUploadExtension)
  .refine(
    (value) => ACCEPTED_EXTENSIONS.has(value),
    "extension is not allowed.",
  );

const uploadMetadataObjectSchema = z
  .object({
    extension: normalizedExtensionSchema,
    mimeType: normalizedMimeTypeSchema,
    originalName: trimmedRequiredString("originalName", ORIGINAL_FILENAME_MAX_LENGTH),
    sizeBytes: z
      .number({
        ...requiredNumberParams("sizeBytes"),
      })
      .int("sizeBytes must be an integer.")
      .min(1, "sizeBytes must be greater than 0.")
      .max(
        maxSingleUploadFileSizeBytes,
        `sizeBytes must be at most ${maxSingleUploadFileSizeBytes}.`,
      ),
  })
  .strict();

const allowLargeUploadsSchema = z
  .boolean({
    invalid_type_error: "largeUploadToggleInvalid",
  })
  .default(false);
const isFinalDraftSchema = z.boolean().default(false);

const watermarkCreditInputSchema = z
  .object({
    durationMinutes: z
      .number({
        invalid_type_error: "durationMinutes must be a number.",
      })
      .int("durationMinutes must be an integer.")
      .positive("durationMinutes must be greater than 0.")
      .optional(),
    mediaType: z.enum(["image", "pdf", "video"] as const, {
      errorMap: () => ({ message: "mediaType is invalid." }),
    }),
    pageCount: z
      .number({
        invalid_type_error: "pageCount must be a number.",
      })
      .int("pageCount must be an integer.")
      .positive("pageCount must be greater than 0.")
      .optional(),
    priorityProcessing: z
      .boolean({
        invalid_type_error: "priorityProcessing must be true or false.",
      })
      .optional(),
    resolutionClass: z
      .enum(["720p", "1080p", "4k"] as const, {
        errorMap: () => ({ message: "resolutionClass is invalid." }),
      })
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mediaType === "pdf" && value.pageCount == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "pageCount is required for PDF watermark uploads.",
        path: ["pageCount"],
      });
    }

    if (value.mediaType === "video") {
      if (value.durationMinutes == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "durationMinutes is required for video watermark uploads.",
          path: ["durationMinutes"],
        });
      }

      if (value.resolutionClass == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "resolutionClass is required for video watermark uploads.",
          path: ["resolutionClass"],
        });
      }
    }
  });

export const uploadMetadataSchema = uploadMetadataObjectSchema.superRefine(validateUploadMetadata);

const createFileObjectSchema = uploadMetadataObjectSchema
  .extend({
    name: trimmedRequiredCappedString("name", INPUT_LIMITS.fileTitle),
    projectId: z
      .string(requiredStringParams("projectId"))
      .trim()
      .min(1, "projectId is required.")
      .max(
        PROJECT_ID_MAX_LENGTH,
        `projectId must be at most ${PROJECT_ID_MAX_LENGTH} characters.`,
      ),
    uploadStatus: z
      .enum(CREATABLE_FILE_UPLOAD_STATUSES, enumMessageParams("uploadStatus is invalid."))
      .default(FileUploadStatus.Pending),
  })
  .strict();

export const createFileSchema = createFileObjectSchema.superRefine(validateUploadMetadata);

export const updateFileSchema = z
  .object({
    name: trimmedOptionalCappedString("name", INPUT_LIMITS.fileTitle),
    projectId: normalizedProjectIdSchema.optional(),
    uploadStatus: z
      .enum(UPDATABLE_FILE_UPLOAD_STATUSES, enumMessageParams("uploadStatus is invalid."))
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const fileQueryParamsSchema = z
  .object({
    includeTotal: z.preprocess(
      (value) => (value === undefined ? "true" : value),
      optionalBooleanQuerySchema("includeTotal").default(true),
    ),
    limit: z.preprocess(
      (value) => (value === undefined ? DEFAULT_PAGE_SIZE : value),
      z
        .coerce.number({
          invalid_type_error: "limit must be a number.",
        })
        .int("limit must be an integer.")
        .min(1, "limit must be at least 1.")
        .max(MAX_PAGE_SIZE, `limit must be at most ${MAX_PAGE_SIZE}.`),
    ),
    order: z.preprocess(
      emptyStringToUndefined,
      z
        .enum(SORT_ORDERS, enumMessageParams("order is invalid."))
        .default("desc"),
    ),
    page: z.preprocess(
      (value) => (value === undefined ? DEFAULT_PAGE : value),
      z
        .coerce.number({
          invalid_type_error: "page must be a number.",
        })
        .int("page must be an integer.")
        .min(1, "page must be at least 1."),
    ),
    fileType: z.preprocess(
      emptyStringToUndefined,
      z
        .enum(FILE_TYPES, enumMessageParams("fileType is invalid."))
        .optional(),
    ),
    projectId: z.preprocess(
      emptyStringToUndefined,
      z
        .string({
          invalid_type_error: "projectId must be a string.",
        })
        .trim()
        .max(PROJECT_ID_MAX_LENGTH, `projectId must be at most ${PROJECT_ID_MAX_LENGTH} characters.`)
        .optional(),
    ),
    search: z.preprocess(
      emptyStringToUndefined,
      z
        .string({
          invalid_type_error: "search must be a string.",
        })
        .trim()
        .min(1, "search must not be empty.")
        .max(MAX_SEARCH_LENGTH, `search must be at most ${MAX_SEARCH_LENGTH} characters.`)
        .optional(),
    ),
    sort: z.preprocess(
      emptyStringToUndefined,
      z
        .enum(FILE_SORT_FIELDS, enumMessageParams("sort is invalid."))
        .default("createdAt"),
    ),
    uploadStatus: z.preprocess(
      emptyStringToUndefined,
      z
        .enum(UPDATABLE_FILE_UPLOAD_STATUSES, enumMessageParams("uploadStatus is invalid."))
        .optional(),
    ),
  })
  .strict();

export const fileIdParamsSchema = z
  .object({
    id: z.string().uuid("id must be a valid UUID."),
  })
  .strict();

const multipartUploadIdSchema = z
  .string({
    ...requiredStringParams("uploadId"),
  })
  .trim()
  .min(1, "uploadId is required.")
  ;

const clientFileIdSchema = z
  .string({
    ...requiredStringParams("localFileId"),
  })
  .trim()
  .min(1, "localFileId is required.")
  .max(MAX_CLIENT_FILE_ID_LENGTH, `localFileId must be at most ${MAX_CLIENT_FILE_ID_LENGTH} characters.`);

const uploadSessionIdSchema = z
  .string({
    ...requiredStringParams("sessionId"),
  })
  .trim()
  .min(1, "sessionId is required.")
  .max(MAX_UPLOAD_SESSION_ID_LENGTH, `sessionId must be at most ${MAX_UPLOAD_SESSION_ID_LENGTH} characters.`);

const storageBucketSchema = z
  .string({
    ...requiredStringParams("bucket"),
  })
  .trim()
  .min(1, "bucket is required.")
  .max(MAX_STORAGE_BUCKET_LENGTH, `bucket must be at most ${MAX_STORAGE_BUCKET_LENGTH} characters.`);

const managedStorageKeySchema = z
  .string({
    ...requiredStringParams("storageKey"),
  })
  .trim()
  .min(1, "storageKey is required.")
  .max(MAX_STORAGE_KEY_LENGTH, `storageKey must be at most ${MAX_STORAGE_KEY_LENGTH} characters.`)
  .refine(
    (value) => isManagedUploadStorageKey(value),
    "storageKey must reference a managed upload object.",
  );

export const multipartUploadPartParamsSchema = z
  .object({
    id: z.string().uuid("id must be a valid UUID."),
    partNumber: z.coerce
      .number({
        invalid_type_error: "partNumber must be a number.",
      })
      .int("partNumber must be an integer.")
      .min(1, "partNumber must be at least 1.")
      .max(MAX_MULTIPART_PARTS, `partNumber must be at most ${MAX_MULTIPART_PARTS}.`),
  })
  .strict();

export const multipartUploadPartQuerySchema = z
  .object({
    uploadId: multipartUploadIdSchema,
  })
  .strict();

const multipartUploadPartsSchema = z
  .array(
    z
      .object({
        etag: z
          .string({
            ...requiredStringParams("etag"),
          })
          .trim()
          .min(1, "etag is required.")
          .max(255, "etag must be at most 255 characters."),
        partNumber: z
          .number({
            ...requiredNumberParams("partNumber"),
          })
          .int("partNumber must be an integer.")
          .min(1, "partNumber must be at least 1.")
          .max(MAX_MULTIPART_PARTS, `partNumber must be at most ${MAX_MULTIPART_PARTS}.`),
      })
      .strict(),
  )
  .min(1, "parts must include at least one uploaded part.");

export const multipartUploadCompleteSchema = z
  .object({
    parts: multipartUploadPartsSchema,
    uploadId: multipartUploadIdSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const seenPartNumbers = new Set<number>();

    for (const [index, part] of value.parts.entries()) {
      if (seenPartNumbers.has(part.partNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "partNumber values must be unique.",
          path: ["parts", index, "partNumber"],
        });
      }

      seenPartNumbers.add(part.partNumber);
    }
  });

export const multipartUploadAbortSchema = z
  .object({
    reason: z
      .enum(
        MULTIPART_UPLOAD_ABORT_REASONS,
        enumMessageParams("reason is invalid."),
      )
      .default(MultipartUploadAbortReason.Canceled),
    uploadId: multipartUploadIdSchema,
  })
  .strict();

export const cancelFileUploadSchema = z
  .object({
    uploadId: multipartUploadIdSchema.optional(),
  })
  .strict();

export const uploadSessionInitSchema = uploadMetadataObjectSchema
  .extend({
    allowLargeUploads: allowLargeUploadsSchema,
    isFinalDraft: isFinalDraftSchema,
    localFileId: clientFileIdSchema,
    projectId: normalizedProjectIdSchema,
    sessionId: uploadSessionIdSchema,
    targetFileId: z.string().uuid("targetFileId must be a valid UUID.").optional(),
  })
  .strict()
  .superRefine(validateUploadMetadata);

export const uploadObjectContentQuerySchema = z
  .object({
    allowLargeUploads: z.preprocess(
      (value) => (value === undefined ? "false" : value),
      optionalBooleanQuerySchema("allowLargeUploads").default(false),
    ),
    isFinalDraft: z.preprocess(
      (value) => (value === undefined ? "false" : value),
      optionalBooleanQuerySchema("isFinalDraft").default(false),
    ),
    bucket: storageBucketSchema,
    contentType: z.preprocess(
      emptyStringToUndefined,
      normalizedMimeTypeSchema.optional(),
    ),
    sizeBytes: z.coerce
      .number({
        invalid_type_error: "sizeBytes must be a number.",
      })
      .int("sizeBytes must be an integer.")
      .min(1, "sizeBytes must be greater than 0.")
      .max(
        maxSingleUploadFileSizeBytes,
        `sizeBytes must be at most ${maxSingleUploadFileSizeBytes}.`,
      ),
    storageKey: managedStorageKeySchema,
  })
  .strict();

export const uploadSessionMultipartPartQuerySchema = z
  .object({
    allowLargeUploads: z.preprocess(
      (value) => (value === undefined ? "false" : value),
      optionalBooleanQuerySchema("allowLargeUploads").default(false),
    ),
    isFinalDraft: z.preprocess(
      (value) => (value === undefined ? "false" : value),
      optionalBooleanQuerySchema("isFinalDraft").default(false),
    ),
    bucket: storageBucketSchema,
    sizeBytes: z.coerce
      .number({
        invalid_type_error: "sizeBytes must be a number.",
      })
      .int("sizeBytes must be an integer.")
      .min(1, "sizeBytes must be greater than 0.")
      .max(
        maxSingleUploadFileSizeBytes,
        `sizeBytes must be at most ${maxSingleUploadFileSizeBytes}.`,
      ),
    storageKey: managedStorageKeySchema,
    uploadId: multipartUploadIdSchema,
  })
  .strict();

export const uploadSessionMultipartCompleteSchema = z
  .object({
    allowLargeUploads: allowLargeUploadsSchema,
    bucket: storageBucketSchema,
    isFinalDraft: isFinalDraftSchema,
    parts: multipartUploadPartsSchema,
    sizeBytes: z.coerce
      .number({
        invalid_type_error: "sizeBytes must be a number.",
      })
      .int("sizeBytes must be an integer.")
      .min(1, "sizeBytes must be greater than 0.")
      .max(
        maxSingleUploadFileSizeBytes,
        `sizeBytes must be at most ${maxSingleUploadFileSizeBytes}.`,
      ),
    storageKey: managedStorageKeySchema,
    uploadId: multipartUploadIdSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const seenPartNumbers = new Set<number>();

    for (const [index, part] of value.parts.entries()) {
      if (seenPartNumbers.has(part.partNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "partNumber values must be unique.",
          path: ["parts", index, "partNumber"],
        });
      }

      seenPartNumbers.add(part.partNumber);
    }
  });

export const uploadSessionMultipartAbortSchema = z
  .object({
    bucket: storageBucketSchema,
    reason: z
      .enum(
        MULTIPART_UPLOAD_ABORT_REASONS,
        enumMessageParams("reason is invalid."),
      )
      .default(MultipartUploadAbortReason.Canceled),
    storageKey: managedStorageKeySchema,
    uploadId: multipartUploadIdSchema,
  })
  .strict();

export const deleteUploadedObjectSchema = z
  .object({
    bucket: storageBucketSchema,
    storageKey: managedStorageKeySchema,
    uploadId: multipartUploadIdSchema.nullable().optional(),
  })
  .strict();

export const commitUploadedFileSchema = uploadMetadataObjectSchema
  .extend({
    bucket: storageBucketSchema,
    fileId: z.string().uuid("fileId must be a valid UUID."),
    localFileId: clientFileIdSchema,
    name: trimmedRequiredCappedString("name", INPUT_LIMITS.fileTitle),
    storageKey: managedStorageKeySchema,
    watermarkCreditInput: watermarkCreditInputSchema.nullable().optional(),
    watermarkEnabled: z
      .boolean({
        invalid_type_error: "watermarkingInvalid",
      })
      .optional(),
  })
  .strict()
  .superRefine(validateUploadMetadata);

export const commitUploadedFilesSchema = z
  .object({
    allowLargeUploads: allowLargeUploadsSchema,
    useSoftWatermark: z.boolean().optional(),
    files: z
      .array(commitUploadedFileSchema)
      .min(1, "files must include at least one ready upload."),
    projectId: z
      .string(requiredStringParams("projectId"))
      .trim()
      .min(1, "projectId is required.")
      .max(PROJECT_ID_MAX_LENGTH, `projectId must be at most ${PROJECT_ID_MAX_LENGTH} characters.`),
  })
  .strict();

export const orphanedUploadCleanupSchema = z
  .object({
    dryRun: z.preprocess((value) => {
      if (value === undefined) {
        return true;
      }

      if (typeof value === "boolean") {
        return value;
      }

      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();

        if (normalized === "true") {
          return true;
        }

        if (normalized === "false") {
          return false;
        }
      }

      return value;
    }, z.boolean({
      invalid_type_error: "dryRun must be true or false.",
    })),
    olderThanHours: z.preprocess(
      (value) => (value === undefined ? 24 : value),
      z
        .coerce
        .number({
          invalid_type_error: "olderThanHours must be a number.",
        })
        .int("olderThanHours must be an integer.")
        .min(1, "olderThanHours must be at least 1.")
        .max(24 * 30, "olderThanHours must be at most 720."),
    ),
  })
  .strict();

export type UploadMetadataInput = z.infer<typeof uploadMetadataSchema>;

export type CreateFileInput = z.infer<typeof createFileSchema>;

export type UpdateFileInput = z.infer<typeof updateFileSchema>;

export type FileQueryParams = z.infer<typeof fileQueryParamsSchema>;

export type FileIdParams = z.infer<typeof fileIdParamsSchema>;

export type MultipartUploadPartParams = z.infer<typeof multipartUploadPartParamsSchema>;

export type MultipartUploadPartQuery = z.infer<typeof multipartUploadPartQuerySchema>;

export type MultipartUploadCompleteInput = z.infer<typeof multipartUploadCompleteSchema>;

export type MultipartUploadAbortInput = z.infer<typeof multipartUploadAbortSchema>;

export type CancelFileUploadInput = z.infer<typeof cancelFileUploadSchema>;

export type UploadSessionInitInput = z.infer<typeof uploadSessionInitSchema>;

export type UploadObjectContentQuery = z.infer<typeof uploadObjectContentQuerySchema>;

export type UploadSessionMultipartPartQuery = z.infer<typeof uploadSessionMultipartPartQuerySchema>;

export type UploadSessionMultipartCompleteInput = z.infer<typeof uploadSessionMultipartCompleteSchema>;

export type UploadSessionMultipartAbortInput = z.infer<typeof uploadSessionMultipartAbortSchema>;

export type DeleteUploadedObjectInput = z.infer<typeof deleteUploadedObjectSchema>;

export type CommitUploadedFilesInput = z.infer<typeof commitUploadedFilesSchema>;

export type OrphanedUploadCleanupInput = z.infer<typeof orphanedUploadCleanupSchema>;
