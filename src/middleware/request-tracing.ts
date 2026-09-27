import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { requestContextStorage } from "@/lib/logger/context";

function generateRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function requestTracingMiddleware(req: Request, res: Response, next: NextFunction) {
  const incomingReqId = req.headers["x-request-id"] || req.headers["x-correlation-id"];
  const requestId = typeof incomingReqId === "string" && incomingReqId.trim().length > 0
    ? incomingReqId.trim().slice(0, 64)
    : generateRequestId();

  const correlationId = typeof req.headers["x-correlation-id"] === "string"
    ? (req.headers["x-correlation-id"] as string).trim().slice(0, 64)
    : requestId;

  // Set response headers for client/operator correlation
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Correlation-Id", correlationId);

  // Attach to express request object
  (req as any).id = requestId;
  (req as any).requestId = requestId;
  (req as any).correlationId = correlationId;
  (req as any).startTime = Date.now();

  const clientIp = (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    ""
  );

  requestContextStorage.run(
    {
      requestId,
      correlationId,
      method: req.method,
      path: req.originalUrl || req.url,
      ip: clientIp,
      startTime: (req as any).startTime,
    },
    () => next()
  );
}
