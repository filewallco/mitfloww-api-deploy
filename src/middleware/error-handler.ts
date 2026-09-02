import type { Request, Response, NextFunction } from "express";
import { sendError } from "@/lib/api/route";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  return sendError(res, err);
}
