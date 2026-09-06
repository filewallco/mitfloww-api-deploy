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

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
