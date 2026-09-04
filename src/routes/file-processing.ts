import { Router } from "express";
import { z } from "zod";
import { FILE_PROCESSING_CALLBACK_STATUSES } from "@/lib/db/schema";
import { AppError } from "@/lib/errors/app-error";
import { fileService } from "@/lib/services/file-service";
import { getWorkerJobStatus } from "@/lib/processing/worker-client";
import { sendSuccess, parseWithSchema, asyncHandler } from "@/lib/api/route";

export const fileProcessingRouter = Router();

const callbackSchema = z.object({
  jobId: z.string().min(1),
  fileId: z.string().uuid(),
  fileVersionId: z.string().uuid(),
  status: z.enum(FILE_PROCESSING_CALLBACK_STATUSES),
  errorCode: z.string().optional().nullable(),
  errorMessage: z.string().optional().nullable(),
  processed: z.object({
    bucket: z.string(),
    key: z.string(),
    mimeType: z.string(),
    extension: z.string(),
    sizeBytes: z.number().int().nonnegative(),
  }).optional().nullable(),
  log: z.object({
    bucket: z.string(),
    key: z.string(),
  }).optional().nullable(),
}).strict();

function assertCallbackAuth(req: any) {
  const expected = process.env.PROCESSING_CALLBACK_TOKEN || "";
  const actual = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (!expected || actual !== expected) {
    throw new AppError(
      "You don't have permission to perform this action.",
      401,
      "project_access_denied",
    );
  }
}

fileProcessingRouter.post("/callback", asyncHandler(async (req, res) => {
  assertCallbackAuth(req);
  const input = parseWithSchema(callbackSchema, req.body);
  const data = await fileService.applyProcessingCallback(input);
  return sendSuccess(res, data);
}));

const MAX_BATCH_JOB_IDS = 20;

function readJobIds(req: any): string[] {
  let directIds: string[] = [];
  if (Array.isArray(req.query.id)) {
    directIds = req.query.id.map((v: any) => String(v).trim()).filter(Boolean);
  } else if (typeof req.query.id === "string") {
    directIds = [req.query.id.trim()].filter(Boolean);
  } else if (typeof req.query.jobId === "string") {
    directIds = [req.query.jobId.trim()].filter(Boolean);
  }

  const csvIds = typeof req.query.ids === "string"
    ? req.query.ids.split(",").map((v: string) => v.trim()).filter(Boolean)
    : [];

  const unique = Array.from(new Set([...directIds, ...csvIds]));
  return unique.slice(0, MAX_BATCH_JOB_IDS);
}

fileProcessingRouter.get("/jobs", asyncHandler(async (req, res) => {
  const jobIds = readJobIds(req);

  if (jobIds.length === 0) {
    return sendSuccess(res, []);
  }

  const settledJobs = await Promise.allSettled(
    jobIds.map(async (jobId) => {
      let local = await fileService.getProcessingJobByJobId(jobId).catch(() => null);
      const worker = await getWorkerJobStatus(jobId).catch(() => null);

      if (!local && !worker) {
        return null;
      }

      if (local) {
        local = await fileService.reconcileJobIfStale(local, worker).catch(() => local);
      }

      return {
        ...(local || {}),
        jobId,
        worker,
      };
    }),
  );

  const jobs: any[] = [];
  for (const result of settledJobs) {
    if (result.status === "fulfilled" && result.value) {
      jobs.push(result.value);
    }
  }

  return sendSuccess(res, jobs);
}));

fileProcessingRouter.get("/jobs/:id", asyncHandler(async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  let local = await fileService.getProcessingJobByJobId(id).catch(() => null);
  const worker = await getWorkerJobStatus(id).catch(() => null);

  if (!local && !worker) {
    throw new AppError("Processing job not found.", 404, "not_found");
  }

  if (local) {
    local = await fileService.reconcileJobIfStale(local, worker).catch(() => local);
  }

  return sendSuccess(res, {
    ...(local || {}),
    jobId: id,
    worker,
  });
}));

fileProcessingRouter.post("/retry/:versionId", asyncHandler(async (req, res) => {
  const versionId = typeof req.params.versionId === "string" ? req.params.versionId : "";
  const data = await fileService.retryProcessingVersion(versionId);
  return sendSuccess(res, data);
}));
