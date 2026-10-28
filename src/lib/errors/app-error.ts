import type { ApiErrorDetails } from "@/lib/dto/api";

export class AppError extends Error {
  readonly code: string;
  readonly details?: ApiErrorDetails;
  readonly statusCode: number;

  constructor(message: string, statusCode: number, code: string, details?: ApiErrorDetails) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationAppError extends AppError {
  constructor(message: string, details?: ApiErrorDetails) {
    super(message, 400, "validation_error", details);
    this.name = "ValidationAppError";
  }
}

export class ConflictAppError extends AppError {
  constructor(message: string, details?: ApiErrorDetails) {
    super(message, 409, "conflict", details);
    this.name = "ConflictAppError";
  }
}

export class NotFoundAppError extends AppError {
  constructor(message: string, details?: ApiErrorDetails) {
    super(message, 404, "not_found", details);
    this.name = "NotFoundAppError";
  }
}

export class ForbiddenAppError extends AppError {
  constructor(message: string, details?: ApiErrorDetails) {
    super(message, 403, "forbidden", details);
    this.name = "ForbiddenAppError";
  }
}

export class UnauthorizedAppError extends AppError {
  constructor(message = "Authentication required.", details?: ApiErrorDetails) {
    super(message, 401, "unauthorized", details);
    this.name = "UnauthorizedAppError";
  }
}

export function isAppError(error: unknown): error is AppError {
  if (error instanceof AppError) {
    return true;
  }
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    const hasStatus = typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 600;
    const hasCode = typeof err.code === "string" && err.code.length > 0;
    const isAppErrorName =
      err.name === "AppError" ||
      err.name === "ValidationAppError" ||
      err.name === "ConflictAppError" ||
      err.name === "NotFoundAppError" ||
      err.name === "ForbiddenAppError" ||
      err.name === "UnauthorizedAppError";

    return (hasStatus && hasCode) || (isAppErrorName && hasStatus);
  }
  return false;
}
