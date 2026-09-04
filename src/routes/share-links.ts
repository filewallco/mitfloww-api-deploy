import { Router } from "express";
import { getRequestLocale } from "@/middleware/locale";
import { projectService } from "@/lib/services/project-service";
import { fileService } from "@/lib/services/file-service";
import { fileRevisionNoteService } from "@/lib/services/file-revision-note-service";
import { getProjectShareSessionCookieName } from "@/lib/security/project-share-session";
import { requireAuthorizedShareProject } from "@/lib/api/client-share";
import { z } from "zod";
import {
  projectShareTokenParamsSchema,
  projectSharePasswordValidationSchema,
} from "@/lib/validation/projects";
import {
  clientShareFileParamsSchema,
  clientShareFilesQuerySchema,
  clientShareReviewBodySchema,
  clientShareReportBodySchema,
  clientShareVersionParamsSchema,
  clientShareRevisionNotesQuerySchema,
  clientShareRevisionNoteBodySchema,
  clientShareRevisionNoteMutationParamsSchema,
  clientShareReplyToFileRevisionNoteBodySchema,
  clientShareRevisionNoteMarkerParamsSchema,
} from "@/lib/validation/client-share";
import {
  updateFileRevisionNoteItemCompletionBodySchema,
  fileRevisionNoteMutationQuerySchema,
  fileRevisionNoteReportBodySchema,
} from "@/lib/validation/file-revision-notes";
import { sendSuccess, parseWithSchema, asyncHandler } from "@/lib/api/route";

export const shareLinksRouter = Router();

const clientShareRevisionNoteItemParamsSchema = z
  .object({
    fileId: z.string().uuid("fileId must be a valid UUID."),
    itemId: z.string().uuid("itemId must be a valid UUID."),
    noteId: z.string().uuid("noteId must be a valid UUID."),
    token: z.string().min(1, "token is required."),
  })
  .strict();

shareLinksRouter.get("/:token", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectShareTokenParamsSchema, req.params);
  const cookieName = getProjectShareSessionCookieName();
  const sessionCookie = req.cookies?.[cookieName] ?? null;

  const data = await projectService.getProjectShareClientState(
    params.token,
    sessionCookie,
    viewerLocale,
  );

  return sendSuccess(res, data);
}));

shareLinksRouter.post("/:token", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(projectShareTokenParamsSchema, req.params);
  const input = parseWithSchema(projectSharePasswordValidationSchema, req.body);
  const data = await projectService.createProjectShareAccessSession({
    email: input.email,
    password: input.password,
    shareToken: params.token,
    viewerLocale: requestLocale,
  });

  const expiresAt = new Date(data.state.expiresAt);
  res.cookie(getProjectShareSessionCookieName(), data.sessionToken, {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return sendSuccess(res, data.state);
}));

shareLinksRouter.get("/:token/files", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectShareTokenParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const query = parseWithSchema(clientShareFilesQuerySchema, req.query);

  const result = await fileService.getClientShareDeliverables({
    projectId: project.id,
    query,
    shareToken: params.token,
    viewerLocale,
  });

  return sendSuccess(
    res,
    {
      items: result.items,
      project: result.project,
    },
    {
      meta: result.pagination
        ? {
            pagination: result.pagination,
          }
        : undefined,
    },
  );
}));

shareLinksRouter.get("/:token/downloads/archive", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectShareTokenParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const result = await fileService.getClientShareFinalArchive({
    projectId: project.id,
    shareToken: params.token,
    viewerLocale,
  });

  res.setHeader("Content-Disposition", `attachment; filename="${result.filename.replace(/"/g, "")}"`);
  res.setHeader("Content-Type", "application/zip");
  return res.send(Buffer.from(result.body as any));
}));

shareLinksRouter.post("/:token/advance-payment/complete", asyncHandler(async (req, res) => {
  const params = parseWithSchema(projectShareTokenParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const result = await fileService.completeClientShareAdvancePayment({
    projectId: project.id,
  });
  return sendSuccess(res, result);
}));

shareLinksRouter.get("/:token/post-payment", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectShareTokenParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const result = await fileService.getClientSharePostPaymentSummary({
    projectId: project.id,
    shareToken: params.token,
    viewerLocale,
  });
  return sendSuccess(res, result);
}));

shareLinksRouter.post("/:token/post-payment/complete", asyncHandler(async (req, res) => {
  const params = parseWithSchema(projectShareTokenParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const result = await fileService.completeClientShareProjectPayment({
    projectId: project.id,
  });
  return sendSuccess(res, result);
}));

shareLinksRouter.post("/:token/post-payment/review", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(projectShareTokenParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const body = parseWithSchema(clientShareReviewBodySchema, req.body);
  const result = await fileService.submitClientShareProjectReview({
    projectId: project.id,
    rating: body.rating,
    reviewText: body.reviewText,
    sourceLocale: viewerLocale,
  });
  return sendSuccess(res, result);
}));

shareLinksRouter.get("/:token/files/:fileId/review", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(clientShareFileParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const result = await fileService.getClientShareFileReview({
    fileId: params.fileId,
    projectId: project.id,
    shareToken: params.token,
    viewerLocale,
  });
  return sendSuccess(res, result);
}));

shareLinksRouter.get("/:token/files/:fileId/preview", asyncHandler(async (req, res) => {
  const params = parseWithSchema(clientShareFileParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const result = await fileService.getClientSharePreviewContent({
    fileId: params.fileId,
    projectId: project.id,
  });
  return res.redirect(307, result.redirectUrl);
}));

shareLinksRouter.get("/:token/files/:fileId/thumbnail", asyncHandler(async (req, res) => {
  const params = parseWithSchema(clientShareFileParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const width = req.query.w ? Number(req.query.w) : undefined;
  const height = req.query.h ? Number(req.query.h) : undefined;

  const result = await fileService.getClientShareFileThumbnail({
    fileId: params.fileId,
    projectId: project.id,
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

shareLinksRouter.get("/:token/files/:fileId/download", asyncHandler(async (req, res) => {
  const params = parseWithSchema(clientShareFileParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const result = await fileService.getClientShareFinalFileContent({
    fileId: params.fileId,
    projectId: project.id,
  });

  res.setHeader("Content-Disposition", `attachment; filename="${result.filename.replace(/"/g, "")}"`);
  res.setHeader("Content-Type", result.contentType);
  if (result.contentLength != null) {
    res.setHeader("Content-Length", String(result.contentLength));
  }
  if (result.etag) {
    res.setHeader("ETag", result.etag);
  }

  return res.send(Buffer.from(result.body as any));
}));

shareLinksRouter.delete("/:token/files/:fileId/approval", asyncHandler(async (req, res) => {
  const params = parseWithSchema(clientShareFileParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const result = await fileService.cancelClientShareApproval({
    fileId: params.fileId,
    projectId: project.id,
  });
  return sendSuccess(res, result);
}));

shareLinksRouter.post("/:token/files/:fileId/final-draft-report", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(clientShareFileParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const input = parseWithSchema(clientShareReportBodySchema, req.body);
  const result = await fileService.reportClientShareFinalDraft({
    fileId: params.fileId,
    message: input.message,
    projectId: project.id,
    reason: input.reason,
    sourceLocale: requestLocale,
  });
  return sendSuccess(res, result, { status: 201 });
}));

shareLinksRouter.post("/:token/files/:fileId/final-draft/payment", asyncHandler(async (req, res) => {
  const params = parseWithSchema(clientShareFileParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const result = await fileService.createClientSharePaymentPlaceholder({
    fileId: params.fileId,
    projectId: project.id,
  });
  return sendSuccess(res, result);
}));

shareLinksRouter.get("/:token/files/:fileId/revision-notes", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(clientShareFileParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const query = parseWithSchema(clientShareRevisionNotesQuerySchema, req.query);
  const notes = await fileRevisionNoteService.listFileRevisionNotes({
    fileId: params.fileId,
    fileVersionId: query.fileVersionId,
    viewerId: null,
    viewerLocale,
  });

  return sendSuccess(res, notes.filter((note) => note.projectId === project.id));
}));

shareLinksRouter.post("/:token/files/:fileId/revision-notes", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(clientShareFileParamsSchema, req.params);
  await requireAuthorizedShareProject(req, params.token);
  const input = parseWithSchema(clientShareRevisionNoteBodySchema, req.body);
  const note = await fileRevisionNoteService.createClientFileRevisionNote({
    fileId: params.fileId,
    fileVersionId: input.fileVersionId,
    items: input.items,
    markers: input.markers,
    note: input.note,
    sourceLocale: requestLocale,
    viewerLocale: requestLocale,
  });

  return sendSuccess(res, note, { status: 201 });
}));

shareLinksRouter.patch("/:token/files/:fileId/revision-notes/:noteId", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(clientShareRevisionNoteMutationParamsSchema, req.params);
  await requireAuthorizedShareProject(req, params.token);
  const input = parseWithSchema(clientShareRevisionNoteBodySchema, req.body);
  const note = await fileRevisionNoteService.updateFileRevisionNote({
    fileId: params.fileId,
    fileVersionId: input.fileVersionId,
    note: input.note,
    noteId: params.noteId,
    sourceLocale: requestLocale,
    viewerLocale: requestLocale,
  });
  return sendSuccess(res, note);
}));

shareLinksRouter.delete("/:token/files/:fileId/revision-notes/:noteId", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(clientShareRevisionNoteMutationParamsSchema, req.params);
  await requireAuthorizedShareProject(req, params.token);
  const query = parseWithSchema(fileRevisionNoteMutationQuerySchema, req.query);
  const note = await fileRevisionNoteService.deleteFileRevisionNote({
    fileId: params.fileId,
    fileVersionId: query.fileVersionId,
    noteId: params.noteId,
    viewerLocale,
  });
  return sendSuccess(res, note);
}));

shareLinksRouter.patch("/:token/files/:fileId/revision-notes/:noteId/items/:itemId", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(clientShareRevisionNoteItemParamsSchema, req.params);
  await requireAuthorizedShareProject(req, params.token);
  const input = parseWithSchema(updateFileRevisionNoteItemCompletionBodySchema, req.body);
  const data = await fileRevisionNoteService.updateClientFileRevisionNoteItemCompletion({
    completed: input.completed,
    fileId: params.fileId,
    fileVersionId: input.fileVersionId,
    itemId: params.itemId,
    noteId: params.noteId,
    viewerLocale,
  });
  return sendSuccess(res, data);
}));

shareLinksRouter.delete("/:token/files/:fileId/revision-notes/:noteId/markers/:markerId", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(clientShareRevisionNoteMarkerParamsSchema, req.params);
  await requireAuthorizedShareProject(req, params.token);
  const query = parseWithSchema(fileRevisionNoteMutationQuerySchema, req.query);
  const data = await fileRevisionNoteService.deleteClientFileRevisionNoteMarker({
    fileId: params.fileId,
    fileVersionId: query.fileVersionId,
    markerId: params.markerId,
    noteId: params.noteId,
    viewerLocale,
  });
  return sendSuccess(res, data);
}));

shareLinksRouter.post("/:token/files/:fileId/revision-notes/:noteId/reply", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(clientShareRevisionNoteMutationParamsSchema, req.params);
  await requireAuthorizedShareProject(req, params.token);
  const input = parseWithSchema(clientShareReplyToFileRevisionNoteBodySchema, req.body);
  const data = await fileRevisionNoteService.replyToFileRevisionNote({
    fileId: params.fileId,
    fileVersionId: input.fileVersionId,
    noteId: params.noteId,
    reply: input.reply,
    sourceLocale: requestLocale,
    viewerLocale: requestLocale,
  });
  return sendSuccess(res, data);
}));

shareLinksRouter.patch("/:token/files/:fileId/revision-notes/:noteId/reply", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(clientShareRevisionNoteMutationParamsSchema, req.params);
  await requireAuthorizedShareProject(req, params.token);
  const input = parseWithSchema(clientShareReplyToFileRevisionNoteBodySchema, req.body);
  const data = await fileRevisionNoteService.updateFileRevisionNoteReply({
    fileId: params.fileId,
    fileVersionId: input.fileVersionId,
    noteId: params.noteId,
    reply: input.reply,
    sourceLocale: requestLocale,
    viewerLocale: requestLocale,
  });
  return sendSuccess(res, data);
}));

shareLinksRouter.delete("/:token/files/:fileId/revision-notes/:noteId/reply", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(clientShareRevisionNoteMutationParamsSchema, req.params);
  await requireAuthorizedShareProject(req, params.token);
  const query = parseWithSchema(fileRevisionNoteMutationQuerySchema, req.query);
  const data = await fileRevisionNoteService.deleteFileRevisionNoteReply({
    fileId: params.fileId,
    fileVersionId: query.fileVersionId,
    noteId: params.noteId,
    viewerLocale,
  });
  return sendSuccess(res, data);
}));

shareLinksRouter.post("/:token/files/:fileId/revision-notes/:noteId/report", asyncHandler(async (req, res) => {
  const params = parseWithSchema(clientShareRevisionNoteMutationParamsSchema, req.params);
  await requireAuthorizedShareProject(req, params.token);
  const input = parseWithSchema(fileRevisionNoteReportBodySchema, req.body);
  await fileRevisionNoteService.reportRevisionNote({
    commentId: input.replyId ? undefined : params.noteId,
    fileId: params.fileId,
    fileVersionId: input.fileVersionId,
    message: input.message,
    reason: input.reason,
    replyId: input.replyId,
    reporterId: "client-share-" + params.token.slice(0, 8),
  });
  return sendSuccess(res, { success: true });
}));

shareLinksRouter.get("/:token/files/:fileId/versions/:versionId/preview", asyncHandler(async (req, res) => {
  const params = parseWithSchema(clientShareVersionParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const result = await fileService.getClientSharePreviewContent({
    fileId: params.fileId,
    projectId: project.id,
    versionId: params.versionId,
  });
  return res.redirect(302, result.redirectUrl);
}));

shareLinksRouter.post("/:token/files/:fileId/versions/:versionId/approve", asyncHandler(async (req, res) => {
  const params = parseWithSchema(clientShareVersionParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const result = await fileService.approveClientShareRevision({
    fileId: params.fileId,
    projectId: project.id,
    versionId: params.versionId,
  });
  return sendSuccess(res, result);
}));

shareLinksRouter.post("/:token/files/:fileId/versions/:versionId/report", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(clientShareVersionParamsSchema, req.params);
  const project = await requireAuthorizedShareProject(req, params.token);
  const input = parseWithSchema(clientShareReportBodySchema, req.body);
  const result = await fileService.reportClientShareVersion({
    fileId: params.fileId,
    message: input.message,
    projectId: project.id,
    reason: input.reason,
    sourceLocale: requestLocale,
    versionId: params.versionId,
  });
  return sendSuccess(res, result, { status: 201 });
}));
