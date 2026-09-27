import type { Request, Response, NextFunction } from "express";
import { logger } from "@/lib/logger";

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = (req as any).startTime || Date.now();
  const path = req.originalUrl || req.url;
  const isHealthCheck = path === "/api/health" || path === "/health" || path === "/ready" || path === "/live";

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const statusCode = res.statusCode;

    // Keep health check logs at debug level to avoid spamming production logs
    if (isHealthCheck && statusCode < 400) {
      logger.debug(`HTTP ${req.method} ${path} ${statusCode} (${durationMs}ms)`, {
        method: req.method,
        path,
        statusCode,
        durationMs,
      });
      return;
    }

    const logMeta = {
      method: req.method,
      path,
      statusCode,
      durationMs,
      ip: (req as any).ip || (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim(),
      userAgent: req.headers["user-agent"],
    };

    if (statusCode >= 500) {
      logger.error(`HTTP ${req.method} ${path} ${statusCode} (${durationMs}ms)`, logMeta);
    } else if (statusCode >= 400) {
      logger.warn(`HTTP ${req.method} ${path} ${statusCode} (${durationMs}ms)`, logMeta);
    } else {
      logger.info(`HTTP ${req.method} ${path} ${statusCode} (${durationMs}ms)`, logMeta);
    }
  });

  next();
}
