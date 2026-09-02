import type { AppMessages } from "@/i18n/messages";
import type {
  ApiErrorDetails,
  ApiErrorParams,
  ApiErrorResponse,
} from "@/lib/dto/api";

type TranslationValues = Record<string, number | string>;

export type SafeErrorTranslations = Partial<{
  [Namespace in keyof AppMessages]: (
    key: string,
    values?: TranslationValues,
  ) => string;
}>;

/**
 * Captures one sanitized API failure on the client.
 *
 * Instances only carry safe user-facing metadata from API responses. They do
 * not contain raw backend internals and are intended for UI rendering only.
 */
export class ApiClientError extends Error {
  readonly code: string;
  readonly details?: ApiErrorDetails;
  readonly messageKey?: string;
  readonly params?: ApiErrorParams;
  readonly requestId?: string;

  constructor(input: {
    code: string;
    details?: ApiErrorDetails;
    message?: string;
    messageKey?: string;
    params?: ApiErrorParams;
    requestId?: string;
  }) {
    super(input.message ?? input.messageKey ?? input.code);
    this.name = "ApiClientError";
    this.code = input.code;
    this.details = input.details;
    this.messageKey = input.messageKey;
    this.params = input.params;
    this.requestId = input.requestId;
  }
}

/**
 * Marks one frontend-generated message as safe to show directly to users.
 *
 * This is only for local client-side failures. It never mutates the DB or
 * storage, and it never carries raw backend or worker exception text.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * Converts one API error payload into a shared client error instance.
 *
 * The returned object only keeps safe response fields so the UI can translate
 * them without exposing raw server internals or response bodies.
 */
export function createApiClientError(input: {
  fallbackCode?: string;
  fallbackMessageKey?: string;
  payload?: ApiErrorResponse | null;
}) {
  const error = input.payload?.error;

  return new ApiClientError({
    code:
      typeof error?.code === "string" && error.code.trim().length > 0
        ? error.code
        : (input.fallbackCode ?? "request_failed"),
    details: error?.details,
    messageKey:
      typeof error?.messageKey === "string" && error.messageKey.trim().length > 0
        ? error.messageKey
        : (input.fallbackMessageKey ?? "common.errors.requestFailed"),
    params: isApiErrorParams(error?.params) ? error.params : undefined,
    requestId:
      typeof error?.requestId === "string" && error.requestId.trim().length > 0
        ? error.requestId
        : undefined,
  });
}

/**
 * Resolves the current safe error code without trusting `error.message`.
 *
 * This helper is read-only, returns UI-safe metadata only, and never mutates
 * the DB, storage, or any worker state.
 */
export function getSafeErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  return null;
}

/**
 * Translates one sanitized message key into a user-facing string.
 *
 * Only message keys and safe params are used here. Raw backend messages are
 * ignored so unknown technical failures fall back to the caller's safe text.
 */
export function translateSafeErrorMessage(
  error: unknown,
  fallback: string,
  translations?: SafeErrorTranslations,
) {
  if (error instanceof UserFacingError) {
    const message = error.message.trim();
    return message.length > 0 ? message : fallback;
  }

  const messageKey =
    typeof error === "object" &&
    error !== null &&
    "messageKey" in error &&
    typeof (error as { messageKey?: unknown }).messageKey === "string"
      ? (error as { messageKey: string }).messageKey
      : null;

  if (!messageKey) {
    return fallback;
  }

  const translationRef = splitMessageKey(messageKey);

  if (!translationRef) {
    return fallback;
  }

  const translate = translations?.[translationRef.namespace];

  if (!translate) {
    return fallback;
  }

  return translate(
    translationRef.key,
    toTranslationValues(
      typeof error === "object" &&
        error !== null &&
        "params" in error &&
        isApiErrorParams((error as { params?: unknown }).params)
        ? (error as { params: ApiErrorParams }).params
        : undefined,
    ),
  );
}

// Validates that API params are already safe scalar values for UI translation only.
function isApiErrorParams(value: unknown): value is ApiErrorParams {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (item) =>
      item === null ||
      typeof item === "boolean" ||
      typeof item === "number" ||
      typeof item === "string",
  );
}

// Splits one safe `namespace.key` reference for translation lookup on the client only.
function splitMessageKey(messageKey: string) {
  const separatorIndex = messageKey.indexOf(".");

  if (separatorIndex <= 0 || separatorIndex >= messageKey.length - 1) {
    return null;
  }

  return {
    key: messageKey.slice(separatorIndex + 1),
    namespace: messageKey.slice(0, separatorIndex) as keyof AppMessages,
  };
}

// Converts safe API params into translation values without trusting raw backend text.
function toTranslationValues(params?: ApiErrorParams) {
  if (!params) {
    return undefined;
  }

  const entries = Object.entries(params)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => [key, typeof value === "boolean" ? `${value}` : value]);

  return entries.length > 0
    ? Object.fromEntries(entries) as TranslationValues
    : undefined;
}
