import type { Request, Response, NextFunction } from "express";
import { sendError } from "@/lib/api/route";
import { logger } from "@/lib/logger";

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    logger.warn("Headers already sent when error reached errorHandler, delegating to next", {
      path: req.originalUrl || req.url,
      method: req.method,
      error: err instanceof Error ? err.message : String(err),
    });
    return next(err);
  }

  return sendError(res, err);
}
