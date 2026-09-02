import type { Response, Request, NextFunction } from "express";
import type { output, ZodTypeAny } from "zod";
import { ZodError } from "zod";
import type {
  ApiErrorResponse,
  ApiMeta,
  ApiSuccessResponse,
} from "@/lib/dto/api";
import { ValidationAppError } from "@/lib/errors/app-error";
import {
  formatZodIssues,
  toSafeErrorResponse,
} from "@/lib/errors/safe-error-response";

export function parseWithSchema<TSchema extends ZodTypeAny>(
  schema: TSchema,
  input: unknown,
): output<TSchema> {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationAppError("Request validation failed.", formatZodIssues(error));
    }

    throw error;
  }
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  options?: {
    meta?: ApiMeta;
    status?: number;
  },
) {
  const payload: ApiSuccessResponse<T> = {
    data,
    ...(options?.meta ? { meta: options.meta } : {}),
  };

  return res.status(options?.status ?? 200).json(payload);
}

export function sendError(res: Response, error: unknown) {
  const response = toSafeErrorResponse(error);

  return res.status(response.statusCode).json(response.payload satisfies ApiErrorResponse);
}

export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
