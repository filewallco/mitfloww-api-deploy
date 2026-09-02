import { z } from "zod";

import {
  CREDIT_FEATURE_KEYS,
  CREDIT_MEDIA_TYPES,
  CREDIT_PLAN_KEYS,
  CREDIT_VIDEO_RESOLUTION_CLASSES,
  CREDIT_REGIONAL_CURRENCY,
  REVISION_ADD_ON_KEYS,
  STORAGE_ADD_ON_KEYS,
  TEMPLATE_CREDIT_KEYS,
  ZERO_CREDIT_ACTION_KEYS,
} from "@/lib/credits";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/query/pagination";

const CREDIT_QUOTE_FEATURE_KEYS = [
  ...CREDIT_FEATURE_KEYS,
  ...ZERO_CREDIT_ACTION_KEYS,
] as const;

const creditPlanKeySchema = z.enum(CREDIT_PLAN_KEYS);
const projectCurrencySchema = z
  .string({
    invalid_type_error: "projectCurrency must be a string.",
  })
  .trim()
  .toUpperCase()
  .length(3, "projectCurrency must be a valid ISO 4217 currency.")
  .default(CREDIT_REGIONAL_CURRENCY);

const optionalPositiveIntegerSchema = (fieldName: string) =>
  z
    .number({
      invalid_type_error: `${fieldName} must be a number.`,
    })
    .int(`${fieldName} must be an integer.`)
    .positive(`${fieldName} must be greater than 0.`)
    .optional();

export const creditHistoryQueryParamsSchema = z
  .object({
    limit: z.preprocess(
      (value) => (value === undefined ? DEFAULT_PAGE_SIZE : value),
      z.coerce
        .number({
          invalid_type_error: "limit must be a number.",
        })
        .int("limit must be an integer.")
        .min(1, "limit must be at least 1.")
        .max(MAX_PAGE_SIZE, `limit must be at most ${MAX_PAGE_SIZE}.`),
    ),

    page: z.preprocess(
      (value) => (value === undefined ? DEFAULT_PAGE : value),
      z.coerce
        .number({
          invalid_type_error: "page must be a number.",
        })
        .int("page must be an integer.")
        .min(1, "page must be at least 1."),
    ),

    fromDate: z.preprocess(
      (value) => {
        if (value === undefined || value === null || value === "") {
          return undefined;
        }
        return new Date(String(value));
      },
      z.date({
        invalid_type_error: "fromDate must be a valid date.",
      }),
    ),

    toDate: z.preprocess(
      (value) => {
        if (value === undefined || value === null || value === "") {
          return undefined;
        }
        return new Date(String(value));
      },
      z.date({
        invalid_type_error: "toDate must be a valid date.",
      }),
    ),
  })
  .strict();

export const creditQuoteSchema = z
  .object({
    durationMinutes: optionalPositiveIntegerSchema("durationMinutes"),
    extraLargeUploadGb: optionalPositiveIntegerSchema("extraLargeUploadGb"),
    featureKey: z.enum(CREDIT_QUOTE_FEATURE_KEYS, {
      errorMap: () => ({ message: "featureKey is invalid." }),
    }),
    mediaType: z
      .enum(CREDIT_MEDIA_TYPES, {
        errorMap: () => ({ message: "mediaType is invalid." }),
      })
      .optional(),
    isSoftWatermark: z.boolean().optional(),
    months: optionalPositiveIntegerSchema("months"),
    pageCount: optionalPositiveIntegerSchema("pageCount"),
    planKey: creditPlanKeySchema.optional(),
    priorityProcessing: z
      .boolean({
        invalid_type_error: "priorityProcessing must be true or false.",
      })
      .optional(),
    projectCurrency: projectCurrencySchema,
    resolutionClass: z
      .enum(CREDIT_VIDEO_RESOLUTION_CLASSES, {
        errorMap: () => ({ message: "resolutionClass is invalid." }),
      })
      .optional(),
    revisionAddOnKey: z
      .enum(REVISION_ADD_ON_KEYS, {
        errorMap: () => ({ message: "revisionAddOnKey is invalid." }),
      })
      .optional(),
    sizeBytes: optionalPositiveIntegerSchema("sizeBytes"),
    storageAddOnKey: z
      .enum(STORAGE_ADD_ON_KEYS, {
        errorMap: () => ({ message: "storageAddOnKey is invalid." }),
      })
      .optional(),
    templateKey: z
      .enum(TEMPLATE_CREDIT_KEYS, {
        errorMap: () => ({ message: "templateKey is invalid." }),
      })
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    switch (value.featureKey) {
      case "storage_add_on":
        if (!value.storageAddOnKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "storageAddOnKey is required.",
            path: ["storageAddOnKey"],
          });
        }
        break;
      case "revision_add_on":
        if (!value.revisionAddOnKey && !value.extraLargeUploadGb) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "revisionAddOnKey or extraLargeUploadGb is required.",
            path: ["revisionAddOnKey"],
          });
        }
        break;
      case "watermark":
        if (!value.mediaType) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "mediaType is required.",
            path: ["mediaType"],
          });
        }
        if (value.mediaType === "pdf" && !value.pageCount) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "pageCount is required for PDF watermark quotes.",
            path: ["pageCount"],
          });
        }
        if (value.mediaType === "video") {
          if (!value.durationMinutes) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "durationMinutes is required for video watermark quotes.",
              path: ["durationMinutes"],
            });
          }
          if (!value.resolutionClass) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "resolutionClass is required for video watermark quotes.",
              path: ["resolutionClass"],
            });
          }
        }
        break;
      case "large_upload_overage":
        if (!value.sizeBytes) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "sizeBytes is required.",
            path: ["sizeBytes"],
          });
        }
        break;
      case "archive_extension":
        if (value.months !== undefined && value.months <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "months must be greater than 0.",
            path: ["months"],
          });
        }
        break;
      case "video_preview_transcode":
        if (value.durationMinutes === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "durationMinutes is required.",
            path: ["durationMinutes"],
          });
        }
        break;
      case "template_unlock":
        if (!value.templateKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "templateKey is required.",
            path: ["templateKey"],
          });
        }
        break;
    }
  });

export type CreditHistoryQueryParams = z.infer<
  typeof creditHistoryQueryParamsSchema
>;

export type CreditQuoteInput = z.infer<typeof creditQuoteSchema>;
