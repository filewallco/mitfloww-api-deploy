import { randomUUID } from "crypto";
import { ZodError } from "zod";
import { CREDIT_ERROR_CODES } from "@/lib/credits/errors";
import type {
  ApiErrorDetail,
  ApiErrorDetails,
  ApiErrorParams,
  ApiErrorResponse,
} from "@/lib/dto/api";
import { isAppError } from "@/lib/errors/app-error";
import { STORAGE_ERROR_CODES } from "@/lib/storage/errors";

type SafeErrorDescriptor = {
  code: string;
  details?: ApiErrorDetails;
  messageKey: string;
  params?: ApiErrorParams;
  requestId: string;
  statusCode: number;
};

type SafeErrorMapping = {
  messageKey: string;
  params?: (details: ApiErrorDetails | undefined) => ApiErrorParams | undefined;
};

const SAFE_ERROR_MAPPINGS: Record<string, SafeErrorMapping> = {
  file_has_revisions: {
    messageKey: "projectsPage.deliverableDeleteBlockedRevisionsDescription",
  },
  file_not_found: {
    messageKey: "common.errors.notFound",
  },
  file_under_review: {
    messageKey: "projectsPage.deliverableDeleteBlockedUnderReviewDescription",
  },
  file_version_last_remaining: {
    messageKey: "filesPage.fileReviewLastVersionCannotDelete",
  },
  file_version_under_review: {
    messageKey: "filesPage.fileReviewUnderReviewCannotDelete",
  },
  final_draft_delete_locked: {
    messageKey: "projectsPage.deliverableDeleteBlockedFinalDraftDescription",
  },
  [CREDIT_ERROR_CODES.insufficientCredits]: {
    messageKey: "common.creditsErrorsInsufficient",
    params: (details) => {
      const safeDetails = readObjectDetails(details);
      const available = safeNumber(safeDetails?.available);
      const required = safeNumber(safeDetails?.required);

      return available != null && required != null
        ? { available, required }
        : undefined;
    },
  },
  [STORAGE_ERROR_CODES.limitExceeded]: {
    messageKey: "common.storageErrorsNotEnough",
    params: (details) => {
      const safeDetails = readObjectDetails(details);
      const availableBytes = safeNumber(safeDetails?.availableBytes);
      const requiredBytes = safeNumber(safeDetails?.requiredBytes);

      return availableBytes != null && requiredBytes != null
        ? {
            available: formatBytes(availableBytes),
            required: formatBytes(requiredBytes),
          }
        : undefined;
    },
  },
  internal_server_error: {
    messageKey: "common.errors.unexpected",
  },
  invalid_share_password: {
    messageKey: "projectsPage.sharePasswordInvalid",
  },
  not_found: {
    messageKey: "common.errors.notFound",
  },
  project_access_denied: {
    messageKey: "common.errors.accessDenied",
  },
  project_duplicate: {
    messageKey: "projectsPage.projectDuplicateForClient",
  },
  protected_revisions_exist: {
    messageKey:
      "projectsPage.deliverableDeleteBlockedProtectedRevisionsDescription",
  },
  request_aborted: {
    messageKey: "common.errors.requestFailed",
  },
  share_access_locked_after_payment: {
    messageKey: "projectsPage.shareAccessLockedAfterPaymentDescription",
  },
  share_email_required: {
    messageKey: "projectsPage.clientShareEmailRequired",
  },
  share_link_expired: {
    messageKey: "projectsPage.shareLinkExpiredDescription",
  },
  share_link_locked: {
    messageKey: "projectsPage.shareLinkLockedDescription",
  },
  share_link_revoked: {
    messageKey: "projectsPage.shareLinkUnavailableDescription",
  },
  share_link_unavailable: {
    messageKey: "projectsPage.shareLinkUnavailableDescription",
  },
  share_password_missing: {
    messageKey: "projectsPage.clientSharePasswordRequired",
  },
  upload_size_exceeds_absolute_limit: {
    messageKey: "common.files.errors.tooLarge",
  },
  upload_size_exceeds_standard_limit: {
    messageKey: "common.files.errors.tooLarge",
  },
  validation_error: {
    messageKey: "common.errors.requestFailed",
  },
};

/**
 * Converts one thrown server error into a sanitized payload.
 *
 * The descriptor only contains safe user-facing data, keeps raw internals out
 * of API responses, and leaves full exception logging to the server only.
 */
export function describeSafeError(error: unknown): SafeErrorDescriptor {
  const requestId = createRequestId();

  if (error instanceof ZodError) {
    return {
      code: "validation_error",
      details: formatZodIssues(error),
      messageKey: "common.errors.requestFailed",
      requestId,
      statusCode: 400,
    };
  }

  if (isAppError(error)) {
    const mapping = resolveSafeErrorMapping(error.code);
    const safeDetails = buildSafeDetails(error.code, error.details);
    const safeParams = mapping.params?.(error.details);

    return {
      code: error.code,
      ...(safeDetails ? { details: safeDetails } : {}),
      messageKey: mapping.messageKey,
      ...(safeParams ? { params: safeParams } : {}),
      requestId,
      statusCode: error.statusCode,
    };
  }

  if (isAbortError(error)) {
    return {
      code: "request_aborted",
      messageKey: "common.errors.requestFailed",
      requestId,
      statusCode: 499,
    };
  }

  return {
    code: "internal_server_error",
    messageKey: "common.errors.unexpected",
    requestId,
    statusCode: 500,
  };
}

/**
 * Builds the final API error response payload and logs raw failures server-side.
 *
 * The returned payload is safe for the frontend, while unknown or server-side
 * failures still emit the full original error with a request id for debugging.
 */
export function toSafeErrorResponse(error: unknown): {
  payload: ApiErrorResponse;
  statusCode: number;
} {
  const descriptor = describeSafeError(error);

  if (shouldLogRawError(error, descriptor.messageKey)) {
    console.error(`[${descriptor.requestId}] API request failed`, error);
  }

  return {
    payload: {
      error: {
        code: descriptor.code,
        ...(descriptor.details ? { details: descriptor.details } : {}),
        messageKey: descriptor.messageKey,
        ...(descriptor.params ? { params: descriptor.params } : {}),
        requestId: descriptor.requestId,
      },
    },
    statusCode: descriptor.statusCode,
  };
}

// Backwards-compatible wrapper expected by many callsites.
// Returns `{ body, status }` to match older `toSafeErrorPayload` shape.
export function toSafeErrorPayload(
  error: unknown,
  options?: {
    fallbackCode?: string;
    fallbackMessageKey?: string;
    requestId?: string;
    status?: number;
  },
): { body: ApiErrorResponse; status: number } {
  const descriptor = describeSafeError(error);

  const requestId = options?.requestId ?? descriptor.requestId;
  const messageKey = options?.fallbackMessageKey ?? descriptor.messageKey;
  const code = options?.fallbackCode ?? descriptor.code;
  const status = options?.status ?? descriptor.statusCode;

  if (shouldLogRawError(error, messageKey)) {
    console.error(`[${requestId}] API request failed`, error);
  }

  const body: ApiErrorResponse = {
    error: {
      code,
      ...(descriptor.details ? { details: descriptor.details } : {}),
      messageKey,
      ...(descriptor.params ? { params: descriptor.params } : {}),
      requestId,
    },
  };

  return { body, status };
}

// Whitelists only safe error detail fields that the frontend may receive.
function buildSafeDetails(
  code: string,
  details: ApiErrorDetails | undefined,
): ApiErrorDetails | undefined {
  if (Array.isArray(details)) {
    return details.map((detail) => sanitizeDetail(detail));
  }

  const safeDetails = readObjectDetails(details);

  if (!safeDetails) {
    return undefined;
  }

  switch (code) {
    case CREDIT_ERROR_CODES.insufficientCredits:
    case "insufficient_credits":
      return pickObjectKeys(safeDetails, ["available", "required"]);
    case STORAGE_ERROR_CODES.limitExceeded:
    case "storage_limit_exceeded":
      return pickObjectKeys(safeDetails, ["availableBytes", "requiredBytes"]);
    default:
      return undefined;
  }
}

// Generates a correlation id for safe client responses and raw server logs only.
function createRequestId() {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** exponent;

  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export function formatZodIssues(error: ZodError): ApiErrorDetail[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.length > 0 ? issue.path.join(".") : undefined,
  }));
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError")
  );
}

function pickObjectKeys(
  details: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | undefined {
  const picked = Object.fromEntries(
    keys
      .filter((key) => details[key] !== undefined)
      .map((key) => [key, details[key]]),
  );

  return Object.keys(picked).length > 0 ? picked : undefined;
}

function readObjectDetails(
  details: ApiErrorDetails | undefined,
): Record<string, unknown> | null {
  if (!details || Array.isArray(details)) {
    return null;
  }

  return details;
}

// Resolves one safe translation target for a server error code without exposing internals.
function resolveSafeErrorMapping(code: string): SafeErrorMapping {
  const direct = SAFE_ERROR_MAPPINGS[code];

  if (direct) {
    return direct;
  }

  if (code.startsWith("credit_")) {
    return { messageKey: "common.credits.errors.operationFailed" };
  }

  if (code.startsWith("storage_")) {
    return { messageKey: "common.storage.errors.operationFailed" };
  }

  if (code.startsWith("share_") || code.startsWith("client_")) {
    return { messageKey: "common.clientShare.errors.actionFailed" };
  }

  if (code.startsWith("multipart_") || code.startsWith("upload_")) {
    return { messageKey: "common.files.errors.uploadFailed" };
  }

  return { messageKey: "common.errors.unexpected" };
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeDetail(detail: ApiErrorDetail): ApiErrorDetail {
  return {
    ...(detail.code ? { code: detail.code } : {}),
    message: detail.message,
    ...(detail.path ? { path: detail.path } : {}),
  };
}

// Decides when the server should keep logging the raw failure for debugging only.
function shouldLogRawError(error: unknown, messageKey: string) {
  if (!isAppError(error)) {
    return true;
  }

  return error.statusCode >= 500 || messageKey === "common.errors.unexpected";
}