import { z } from "zod";

import {
  fileSettingsConfig,
  getEffectiveMaxRevisionLimit,
  INPUT_LIMITS,
} from "@/config/input-limits";
import { DEFAULT_PROJECT_CURRENCY } from "@/lib/constants/currencies";
import {
  PROJECT_PAYMENT_STATUSES,
  PROJECT_SHARE_MUTATION_ACTIONS,
  type ProjectShareMutationAction,
  type ProjectPaymentStatus,
} from "@/lib/dto/projects";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/lib/query/pagination";
import { PROJECT_SORT_FIELDS } from "@/lib/query/projects";
import { SORT_ORDERS } from "@/lib/query/sorting";
import {
  getExtraRevisionCostValidationError,
  getProjectAmountValidationError,
  type ValidationMessageResult,
} from "@/lib/validation/upload-submission";

const PROJECT_ID_MAX_LENGTH = 255;
const MAX_EXTRA_REVISION_COST_CENTS = fileSettingsConfig.maxCurrencyAmountCents;
const MAX_REVISION_LIMIT = getEffectiveMaxRevisionLimit();
const MAX_SEARCH_LENGTH = 255;

const PROJECT_MUTATION_FIELDS = [
  "amountCents",
  "clientEmail",
  "clientName",
  "currency",
  "extraRevisionCostCents",
  "name",
  "paymentStatus",
  "revisionLimit",
] as const;

export type ProjectMutationField = (typeof PROJECT_MUTATION_FIELDS)[number];

function isProjectMutationField(value: unknown): value is ProjectMutationField {
  return (
    typeof value === "string" &&
    PROJECT_MUTATION_FIELDS.includes(value as ProjectMutationField)
  );
}

function normalizeSpaces(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function emptyStringToUndefined(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function centsToCurrencyAmount(valueCents: number) {
  return valueCents / 100;
}

function toValidationMessageKey(result: ValidationMessageResult) {
  if (result == null) {
    return null;
  }

  return typeof result === "string" ? result : result.key;
}

const projectNameSchema = z
  .string({
    invalid_type_error: "projectNameMustBeString",
    required_error: "projectNameRequired",
  })
  .transform(normalizeSpaces)
  .pipe(
    z
      .string()
      .min(1, "projectNameRequired")
      .max(INPUT_LIMITS.projectTitle, "projectNameTooLong"),
  );

const clientNameSchema = z
  .string({
    invalid_type_error: "clientNameMustBeString",
    required_error: "clientNameRequired",
  })
  .transform(normalizeSpaces)
  .pipe(
    z
      .string()
      .min(1, "clientNameRequired")
      .max(INPUT_LIMITS.clientName, "clientNameTooLong"),
  );

export const optionalClientEmailSchema = z
  .string({
    invalid_type_error: "clientEmailMustBeString",
    required_error: "clientEmailMustBeString",
  })
  .trim()
  .max(INPUT_LIMITS.clientEmail, "clientEmailTooLong")
  .refine(
    (value) => value.length === 0 || z.string().email().safeParse(value).success,
    {
      message: "clientEmailInvalid",
    },
  );

const projectCurrencySchema = z
  .string({
    invalid_type_error: "currencyInvalid",
    required_error: "currencyRequired",
  })
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .length(3, "currencyInvalid")
      .regex(/^[A-Z]{3}$/, "currencyInvalid"),
  )
  .default(DEFAULT_PROJECT_CURRENCY);

const projectPaymentStatusSchema = z
  .enum(PROJECT_PAYMENT_STATUSES, {
    errorMap: () => ({ message: "projectPaymentStatusInvalid" }),
  })
  .optional();

const projectMutationObjectSchema = z.object({
  amountCents: z
    .number({
      invalid_type_error: "projectAmountInvalid",
      required_error: "projectAmountRequired",
    })
    .int("projectAmountInvalid"),
  advancePaymentEnabled: z
    .boolean({
      invalid_type_error: "advancePaymentEnabledInvalid",
    })
    .default(false),
  advanceAmountCents: z
    .number({
      invalid_type_error: "advanceAmountInvalid",
      required_error: "advanceAmountRequired",
    })
    .int("advanceAmountInvalid")
    .default(0),
  clientEmail: optionalClientEmailSchema.default(""),
  clientName: clientNameSchema,
  currency: projectCurrencySchema,
  extraRevisionCostCents: z
    .number({
      invalid_type_error: "extraRevisionCostInvalid",
      required_error: "extraRevisionCostInvalid",
    })
    .int("extraRevisionCostInvalid")
    .min(0, "extraRevisionCostCannotBeNegative")
    .max(MAX_EXTRA_REVISION_COST_CENTS, "extraRevisionCostMustBeAtMost")
    .default(0),
  name: projectNameSchema,
  paymentStatus: projectPaymentStatusSchema,
  revisionLimit: z
    .number({
      invalid_type_error: "revisionLimitMustBeValidNumber",
      required_error: "revisionLimitMustBeValidNumber",
    })
    .int("revisionLimitMustBeWholeNumber")
    .min(0, "revisionLimitCannotBeNegative")
    .max(MAX_REVISION_LIMIT, "revisionLimitMustBeAtMost")
    .default(0),
  watermarkEnabled: z
    .boolean({
      invalid_type_error: "watermarkingInvalid",
    })
    .default(true),
});

export const projectMutationSchema = projectMutationObjectSchema
  .strict()
  .superRefine((value, ctx) => {
    const amountValidationError = toValidationMessageKey(
      getProjectAmountValidationError({
        amount: centsToCurrencyAmount(value.amountCents),
        currency: value.currency,
      }),
    );

    if (amountValidationError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: amountValidationError,
        path: ["amountCents"],
      });
    }

    const extraRevisionCostValidationError = toValidationMessageKey(
      getExtraRevisionCostValidationError({
        currency: value.currency,
        extraRevisionCost: centsToCurrencyAmount(value.extraRevisionCostCents),
        revisionLimit: value.revisionLimit,
      }),
    );

    if (extraRevisionCostValidationError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: extraRevisionCostValidationError,
        path: ["extraRevisionCostCents"],
      });
    }
  });

export const projectShareLinkMutationSchema = z
  .object({
    action: z.enum(PROJECT_SHARE_MUTATION_ACTIONS, {
      errorMap: () => ({ message: "share action is invalid." }),
    }),
    passwordEnabled: z
      .boolean({
        invalid_type_error: "passwordEnabled must be true or false.",
      })
      .default(false),
    sharePassword: z.preprocess(
      emptyStringToUndefined,
      z
        .string({
          invalid_type_error: "sharePassword must be a string.",
        })
        .trim()
        .min(1, "sharePassword is required.")
        .max(64, "sharePassword is too long.")
        .optional(),
    ),
    shareToken: z.preprocess(
      emptyStringToUndefined,
      z
        .string({
          invalid_type_error: "shareToken must be a string.",
        })
        .trim()
        .min(1, "shareToken is required.")
        .max(255, "shareToken is too long.")
        .optional(),
    ),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.passwordEnabled &&
      value.action === PROJECT_SHARE_MUTATION_ACTIONS[2] &&
      !value.sharePassword
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sharePassword is required.",
        path: ["sharePassword"],
      });
    }

    if (
      value.action !== PROJECT_SHARE_MUTATION_ACTIONS[2] &&
      !value.shareToken
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "shareToken is required.",
        path: ["shareToken"],
      });
    }
  });

export const projectShareEmailMutationSchema = z
  .object({
    shareClientEmail: optionalClientEmailSchema.refine(
      (value) => value.length > 0,
      {
        message: "clientEmailInvalid",
      },
    ),
  })
  .strict();

export const projectIdParamsSchema = z
  .object({
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

export const projectShareTokenParamsSchema = z
  .object({
    token: z
      .string({
        invalid_type_error: "Share token must be a string.",
        required_error: "Share token is required.",
      })
      .trim()
      .min(1, "Share token is required.")
      .max(PROJECT_ID_MAX_LENGTH, "Share token is too long."),
  })
  .strict();

export const projectSharePasswordValidationSchema = z
  .object({
    email: z.preprocess(
      emptyStringToUndefined,
      optionalClientEmailSchema.optional(),
    ),
    password: z.preprocess(
      emptyStringToUndefined,
      z
        .string({
          invalid_type_error: "password must be a string.",
        })
        .trim()
        .min(1, "password is required.")
        .max(64, "password is too long.")
        .optional(),
    ),
  })
  .strict();

export const projectListQueryParamsSchema = z
  .object({
    hasDeliverables: z.preprocess((value) => {
      const normalizedValue = emptyStringToUndefined(value);

      if (typeof normalizedValue === "boolean") {
        return normalizedValue ? "true" : "false";
      }

      return normalizedValue;
    }, z.enum(["true", "false"], {
      errorMap: () => ({ message: "hasDeliverables must be true or false." }),
    }).transform((value) => value === "true").optional()),
    includeTotal: z.preprocess((value) => {
      const normalizedValue = value === undefined ? "true" : value;

      if (typeof normalizedValue === "boolean") {
        return normalizedValue ? "true" : "false";
      }

      return normalizedValue;
    }, z.enum(["true", "false"], {
      errorMap: () => ({ message: "includeTotal must be true or false." }),
    }).default("true").transform((value) => value === "true")),
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
    order: z.preprocess(
      emptyStringToUndefined,
      z.enum(SORT_ORDERS, {
        errorMap: () => ({ message: "order is invalid." }),
      }).default("desc"),
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
    paymentStatus: z.preprocess(
      emptyStringToUndefined,
      z.enum(PROJECT_PAYMENT_STATUSES, {
        errorMap: () => ({ message: "projectPaymentStatusInvalid" }),
      }).optional(),
    ),
    search: z.preprocess(
      emptyStringToUndefined,
      z
        .string({
          invalid_type_error: "search must be a string.",
        })
        .trim()
        .min(1, "search must not be empty.")
        .max(
          MAX_SEARCH_LENGTH,
          `search must be at most ${MAX_SEARCH_LENGTH} characters.`,
        )
        .optional(),
    ),
    sort: z.preprocess(
      emptyStringToUndefined,
      z.enum(PROJECT_SORT_FIELDS, {
        errorMap: () => ({ message: "sort is invalid." }),
      }).default("updatedAt"),
    ),
  })
  .strict();

export type ProjectMutationValues = z.infer<typeof projectMutationSchema> & {
  paymentStatus?: ProjectPaymentStatus;
};
export type ProjectListQueryParams = z.infer<typeof projectListQueryParamsSchema>;
export type ProjectShareLinkMutationInput = z.infer<
  typeof projectShareLinkMutationSchema
> & {
  action: ProjectShareMutationAction;
};

export function getProjectFieldErrors(input: ProjectMutationValues) {
  const result = projectMutationSchema.safeParse(input);

  if (result.success) {
    return {} satisfies Partial<Record<ProjectMutationField, string>>;
  }

  const fieldErrors: Partial<Record<ProjectMutationField, string>> = {};

  for (const issue of result.error.issues) {
    const path = issue.path[0];

    if (isProjectMutationField(path) && fieldErrors[path] == null) {
      fieldErrors[path] = issue.message;
    }
  }

  return fieldErrors;
}
