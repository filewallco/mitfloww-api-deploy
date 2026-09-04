import { Router } from "express";
import { Readable } from "stream";
import { z } from "zod";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getRequestLocale } from "@/middleware/locale";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { projectService } from "@/lib/services/project-service";
import { fileService } from "@/lib/services/file-service";
import { db } from "@/lib/db/client";
import { fileVersions, files } from "@/lib/db/schema";
import { DrizzleProjectRepository } from "@/lib/repositories/project-repository";
import {
  projectListQueryParamsSchema,
  projectMutationSchema,
  projectIdParamsSchema,
  projectShareEmailMutationSchema,
  projectShareLinkMutationSchema,
} from "@/lib/validation/projects";
import {
  projectFileReviewParamsSchema,
  projectFileVersionParamsSchema,
  finalDraftReportBodySchema,
  commitProjectFileVersionBodySchema,
  fileVersionReportBodySchema,
} from "@/lib/validation/file-review";
import { sendSuccess, parseWithSchema, asyncHandler } from "@/lib/api/route";

export const projectsRouter = Router();

function getClientAppBaseUrl(req: any): string | undefined {
  const origin = req.get("origin");
  if (origin && !origin.includes(":4001") && !origin.includes("mitfloww-api")) {
    return origin.trim().replace(/\/+$/, "");
  }

  const referer = req.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.port !== "4001" && !url.hostname.includes("mitfloww-api")) {
        return url.origin;
      }
    } catch {}
  }

  const forwardedHost = req.get("x-forwarded-host");
  if (
    forwardedHost &&
    !forwardedHost.includes(":4001") &&
    !forwardedHost.includes("mitfloww-api")
  ) {
    const proto =
      req.get("x-forwarded-proto") || (req.secure ? "https" : "http");
    return `${proto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  return undefined;
}

const projectRepository = new DrizzleProjectRepository();

const projectMetricsQuerySchema = z
  .object({
    projectIds: z
      .string({
        invalid_type_error: "projectIds must be a string.",
      })
      .trim()
      .max(10_000, "projectIds is too long.")
      .optional(),
  })
  .strict();

function parseProjectIds(value: string | undefined) {
  if (!value) return [];
  const unique = new Set<string>();
  for (const candidate of value.split(",")) {
    const trimmed = candidate.trim();
    if (!trimmed || trimmed.length > 255) continue;
    unique.add(trimmed);
    if (unique.size >= 100) break;
  }
  return Array.from(unique);
}

projectsRouter.get("/", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const query = parseWithSchema(projectListQueryParamsSchema, req.query);
  const result = await projectService.listProjects(query, viewerLocale);

  return sendSuccess(res, result.items, {
    meta: {
      count: result.items.length,
      filters: {
        hasDeliverables: query.hasDeliverables ?? null,
        paymentStatus: query.paymentStatus ?? null,
        search: query.search ?? null,
      },
      pagination: result.pagination,
      sorting: {
        field: query.sort,
        order: query.order,
      },
    },
  });
}));

projectsRouter.post("/", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const input = parseWithSchema(projectMutationSchema, req.body);
  const data = await projectService.createProject(input, {
    sourceLocale: requestLocale,
    viewerLocale: requestLocale,
  });

  return sendSuccess(res, data, { status: 201 });
}));

projectsRouter.get("/metrics", asyncHandler(async (req, res) => {
  const query = parseWithSchema(projectMetricsQuerySchema, req.query);
  const projectIdentifiers = parseProjectIds(query.projectIds);

  if (projectIdentifiers.length === 0) {
    return sendSuccess(res, []);
  }

  const resolvedProjects = await Promise.all(
    projectIdentifiers.map(async (identifier) => ({
      identifier,
      project: await projectRepository.findByIdentifier(identifier),
    })),
  );
  const projectIds = Array.from(
    new Set(
      resolvedProjects
        .map(({ project }) => project?.id ?? null)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (projectIds.length === 0) {
    return sendSuccess(res, []);
  }

  const rows = await db
    .select({
      projectId: files.projectId,
      total: sql<number>`cast(count(distinct ${files.id}) as int)`,
      totalSizeBytes: sql<number>`cast(coalesce(sum(coalesce(${fileVersions.sizeBytes}, ${files.sizeBytes})), 0) as bigint)`,
    })
    .from(files)
    .leftJoin(
      fileVersions,
      and(eq(fileVersions.fileId, files.id), isNull(fileVersions.deletedAt)),
    )
    .where(and(isNull(files.deletedAt), inArray(files.projectId, projectIds)))
    .groupBy(files.projectId);

  return sendSuccess(
    res,
    rows
      .filter((row) => row.projectId != null)
      .map((row) => ({
        projectId: row.projectId as string,
        totalDeliverablesCount: Number(row.total ?? 0),
        totalSizeBytes: Number(row.totalSizeBytes ?? 0),
      })),
  );
}));

projectsRouter.get("/reviews", asyncHandler(async (_req, res) => {
  const projectsWithReviews = await projectService.getPaidProjectsWithReviews();

  return res.json({
    items: projectsWithReviews.map(({ project, review }) => ({
      clientEmail: project.clientEmail,
      clientName: project.clientName,
      createdAt: project.createdAt.toISOString(),
      id: project.id,
      projectReviewId: review.id,
      rating: review.rating,
      reviewText: review.reviewText,
      sourceLocale: review.sourceLocale,
      submittedAt: review.submittedAt.toISOString(),
      title: project.title,
    })),
  });
}));

projectsRouter.get("/:id", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const data = await projectService.getProjectById(params.id, viewerLocale);
  return sendSuccess(res, data);
}));

projectsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const input = parseWithSchema(projectMutationSchema, req.body);
  const data = await projectService.updateProject(params.id, input, {
    sourceLocale: requestLocale,
    viewerLocale: requestLocale,
  });
  return sendSuccess(res, data);
}));

projectsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const data = await projectService.deleteProject(params.id);
  return sendSuccess(res, data);
}));

projectsRouter.get("/:id/edit-locks", asyncHandler(async (req, res) => {
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const result = await projectService.getProjectEditLocks(params.id);
  return sendSuccess(res, result);
}));

projectsRouter.get("/:id/review", asyncHandler(async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const data = await projectService.getProjectClientReviewByProjectId(id);
  return sendSuccess(res, data);
}));

projectsRouter.get("/:id/share", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor();
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const baseUrl = getClientAppBaseUrl(req);
  const data = await projectService.getProjectShareComposer(params.id, {
    baseUrl,
    expiryDays: actor.clientShareLinkExpiryDays,
    viewerLocale,
  });
  return sendSuccess(res, data);
}));

projectsRouter.post("/:id/share", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor();
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const input = parseWithSchema(projectShareLinkMutationSchema, req.body);
  const baseUrl = getClientAppBaseUrl(req);
  const data = await projectService.mutateProjectShare(params.id, input, {
    baseUrl,
    expiryDays: actor.clientShareLinkExpiryDays,
    viewerLocale,
  });
  return sendSuccess(res, data);
}));

projectsRouter.patch("/:id/share", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const input = parseWithSchema(projectShareEmailMutationSchema, req.body);
  const data = await projectService.saveProjectShareClientEmail(
    params.id,
    input.shareClientEmail,
    viewerLocale,
  );
  return sendSuccess(res, data);
}));

projectsRouter.delete("/:id/share", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectIdParamsSchema, req.params);
  const data = await projectService.clearProjectShareClientEmail(
    params.id,
    viewerLocale,
  );
  return sendSuccess(res, data);
}));

projectsRouter.get("/:id/files/:fileId/review", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectFileReviewParamsSchema, req.params);
  const result = await fileService.getFileReview({
    fileId: params.fileId,
    projectId: params.id,
    viewerLocale,
  });
  return sendSuccess(res, result);
}));

projectsRouter.get("/:id/files/:fileId/thumbnail", asyncHandler(async (req, res) => {
  const params = parseWithSchema(projectFileReviewParamsSchema, req.params);
  const width = req.query.w ? Number(req.query.w) : undefined;
  const height = req.query.h ? Number(req.query.h) : undefined;

  const result = await fileService.getFileThumbnail(params.fileId, {
    projectId: params.id,
    width,
    height,
  });

  if (req.headers["if-none-match"] === result.etag) {
    return res.status(304).end();
  }

  res.setHeader("Content-Type", result.contentType);
  res.setHeader("Content-Length", String(result.buffer.length));
  res.setHeader("ETag", result.etag);
  res.setHeader("Cache-Control", "private, no-cache");
  res.setHeader("Vary", "Cookie, Authorization, Origin");

  return res.send(result.buffer);
}));

projectsRouter.get("/:id/files/:fileId/content", asyncHandler(async (req, res) => {
  const params = parseWithSchema(projectFileReviewParamsSchema, req.params);
  const result = await fileService.getFileContent(params.fileId, {
    projectId: params.id,
  });

  res.setHeader("Content-Type", result.contentType);
  if (result.contentLength != null) {
    res.setHeader("Content-Length", String(result.contentLength));
  }
  if (result.etag) {
    res.setHeader("ETag", result.etag);
  }
  res.setHeader("Cache-Control", "private, no-cache");
  res.setHeader("Vary", "Cookie, Authorization, Origin");

  if (result.body instanceof Readable) {
    return result.body.pipe(res);
  } else if (result.body && typeof (result.body as any).getReader === "function") {
    return Readable.fromWeb(result.body as any).pipe(res);
  } else if (Buffer.isBuffer(result.body) || result.body instanceof Uint8Array) {
    return res.send(Buffer.from(result.body));
  } else {
    return res.send(result.body);
  }
}));

projectsRouter.post("/:id/files/:fileId/final-draft-report", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(projectFileReviewParamsSchema, req.params);
  const input = parseWithSchema(finalDraftReportBodySchema, req.body);
  const data = await fileService.reportFinalDraft({
    fileId: params.fileId,
    message: input.message,
    projectId: params.id,
    reason: input.reason,
    sourceLocale: requestLocale,
  });
  return sendSuccess(res, data, { status: 201 });
}));

projectsRouter.post("/:id/files/:fileId/versions/commit", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(projectFileReviewParamsSchema, req.params);
  const input = parseWithSchema(commitProjectFileVersionBodySchema, req.body);
  const idempotencyKeyBase = `commit:project:${params.id}:file:${params.fileId}:${input.files.map((f) => f.localFileId).join("|")}`;

  const data = await fileService.commitUploadedFileVersion(
    {
      allowLargeUploads: input.allowLargeUploads,
      fileId: params.fileId,
      files: input.files,
      isFinalDraft: input.isFinalDraft,
      useSoftWatermark: input.useSoftWatermark,
      projectId: params.id,
      revisionDescription: input.revisionDescription,
      sourceLocale: requestLocale,
      viewerLocale: requestLocale,
    },
    { idempotencyKeyBase },
  );

  return sendSuccess(res, data);
}));

projectsRouter.delete("/:id/files/:fileId/versions/:versionId", asyncHandler(async (req, res) => {
  const params = parseWithSchema(projectFileVersionParamsSchema, req.params);
  const data = await fileService.deleteFileVersion({
    fileId: params.fileId,
    projectId: params.id,
    versionId: params.versionId,
  });
  return sendSuccess(res, data);
}));

projectsRouter.post("/:id/files/:fileId/versions/:versionId/report", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(projectFileVersionParamsSchema, req.params);
  const input = parseWithSchema(fileVersionReportBodySchema, req.body);
  const data = await fileService.reportFileVersion({
    fileId: params.fileId,
    message: input.message,
    projectId: params.id,
    reason: input.reason,
    sourceLocale: requestLocale,
    versionId: params.versionId,
  });
  return sendSuccess(res, data, { status: 201 });
}));
