import { Router } from "express";
import { Readable } from "node:stream";
import { getRequestLocale } from "@/middleware/locale";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { fileService } from "@/lib/services/file-service";
import { fileRevisionNoteService } from "@/lib/services/file-revision-note-service";
import {
  fileQueryParamsSchema,
  createFileSchema,
  fileIdParamsSchema,
  updateFileSchema,
  cancelFileUploadSchema,
  multipartUploadPartParamsSchema,
  multipartUploadPartQuerySchema,
  multipartUploadCompleteSchema,
  multipartUploadAbortSchema,
} from "@/lib/validation/files";
import {
  fileRevisionNotesParamsSchema,
  fileRevisionNotesQuerySchema,
  fileRevisionNoteMutationQuerySchema,
  fileRevisionNoteReplyParamsSchema,
  fileRevisionNoteItemParamsSchema,
  fileRevisionNoteMarkerParamsSchema,
  fileRevisionNoteReportBodySchema,
  replyToFileRevisionNoteBodySchema,
  updateFileRevisionNoteItemCompletionBodySchema,
  upsertFileRevisionNoteBodySchema,
} from "@/lib/validation/file-revision-notes";
import { ValidationAppError } from "@/lib/errors/app-error";
import { sendSuccess, parseWithSchema, asyncHandler } from "@/lib/api/route";

export const filesRouter = Router();

filesRouter.get("/", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const query = parseWithSchema(fileQueryParamsSchema, req.query);
  const result = await fileService.listFiles(query, { viewerLocale });

  return sendSuccess(res, result.items, {
    meta: {
      count: result.items.length,
      filters: {
        fileType: query.fileType ?? null,
        projectId: query.projectId ?? null,
        search: query.search ?? null,
        uploadStatus: query.uploadStatus ?? null,
      },
      pagination: result.pagination,
      sorting: {
        field: query.sort,
        order: query.order,
      },
    },
  });
}));

filesRouter.post("/", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const input = parseWithSchema(createFileSchema, req.body);
  const data = await fileService.createFile(input, {
    sourceLocale: requestLocale,
    viewerLocale: requestLocale,
  });

  return sendSuccess(res, data, { status: 201 });
}));

filesRouter.get("/:id", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(fileIdParamsSchema, req.params);
  const data = await fileService.getFileById(params.id, viewerLocale);
  return sendSuccess(res, data);
}));

filesRouter.patch("/:id", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(fileIdParamsSchema, req.params);
  const input = parseWithSchema(updateFileSchema, req.body);
  const data = await fileService.updateFile(params.id, input, {
    sourceLocale: requestLocale,
    viewerLocale: requestLocale,
  });
  return sendSuccess(res, data);
}));

filesRouter.delete("/:id", asyncHandler(async (req, res) => {
  const params = parseWithSchema(fileIdParamsSchema, req.params);
  const data = await fileService.deleteFile(params.id);
  return sendSuccess(res, data);
}));

filesRouter.post("/:id/cancel", asyncHandler(async (req, res) => {
  const params = parseWithSchema(fileIdParamsSchema, req.params);
  const input = parseWithSchema(cancelFileUploadSchema, req.body);
  const viewerLocale = getRequestLocale(req);
  const data = await fileService.cancelFileUpload(params.id, input, viewerLocale);
  return sendSuccess(res, data);
}));

filesRouter.get("/:id/content", asyncHandler(async (req, res) => {
  const params = parseWithSchema(fileIdParamsSchema, req.params);
  const result = await fileService.getFileContent(params.id);

  res.setHeader("Content-Type", result.contentType);
  if (result.contentLength != null) {
    res.setHeader("Content-Length", String(result.contentLength));
  }
  if (result.etag) {
    res.setHeader("ETag", result.etag);
  }
  res.setHeader("Cache-Control", "private, max-age=300");

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

filesRouter.get("/:id/thumbnail", asyncHandler(async (req, res) => {
  const params = parseWithSchema(fileIdParamsSchema, req.params);
  const width = req.query.w ? Number(req.query.w) : undefined;
  const height = req.query.h ? Number(req.query.h) : undefined;

  const result = await fileService.getFileThumbnail(params.id, { width, height });

  if (req.headers["if-none-match"] === result.etag) {
    return res.status(304).end();
  }

  res.setHeader("Content-Type", result.contentType);
  res.setHeader("Content-Length", String(result.buffer.length));
  res.setHeader("ETag", result.etag);
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");

  return res.send(result.buffer);
}));

filesRouter.put("/:id/content", asyncHandler(async (req, res) => {
  const params = parseWithSchema(fileIdParamsSchema, req.params);
  const contentTypeHeader = (req.headers["content-type"] || "").trim();
  const contentType = contentTypeHeader && contentTypeHeader.length > 0 ? contentTypeHeader : undefined;
  const contentLengthHeader = req.headers["content-length"];
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;

  const viewerLocale = getRequestLocale(req);
  let body: Readable;
  if (Buffer.isBuffer(req.body)) {
    body = Readable.from(req.body);
  } else {
    body = req;
  }

  const data = await fileService.uploadFileContent(params.id, {
    body,
    contentLength,
    contentType,
  }, viewerLocale);

  return sendSuccess(res, data);
}));

filesRouter.post("/:id/multipart", asyncHandler(async (req, res) => {
  const params = parseWithSchema(fileIdParamsSchema, req.params);
  const data = await fileService.initiateMultipartUpload(params.id);
  return sendSuccess(res, data, { status: 201 });
}));

filesRouter.put("/:id/multipart/parts/:partNumber", asyncHandler(async (req, res) => {
  const params = parseWithSchema(multipartUploadPartParamsSchema, req.params);
  const query = parseWithSchema(multipartUploadPartQuerySchema, req.query);

  let buffer: Buffer;
  if (Buffer.isBuffer(req.body)) {
    buffer = req.body;
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    buffer = Buffer.concat(chunks);
  }

  if (buffer.byteLength <= 0) {
    throw new ValidationAppError("Request body is required.");
  }

  const data = await fileService.uploadMultipartPart(params.id, {
    body: buffer,
    contentLength: buffer.byteLength,
    partNumber: params.partNumber,
    uploadId: query.uploadId,
  });
  return sendSuccess(res, data);
}));

filesRouter.post("/:id/multipart/complete", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(fileIdParamsSchema, req.params);
  const input = parseWithSchema(multipartUploadCompleteSchema, req.body);
  const data = await fileService.completeMultipartUpload(params.id, input, viewerLocale);
  return sendSuccess(res, data);
}));

filesRouter.post("/:id/multipart/abort", asyncHandler(async (req, res) => {
  const params = parseWithSchema(fileIdParamsSchema, req.params);
  const input = parseWithSchema(multipartUploadAbortSchema, req.body);
  const data = await fileService.abortMultipartUpload(params.id, input);
  return sendSuccess(res, data);
}));

filesRouter.get("/:id/revision-notes", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(fileRevisionNotesParamsSchema, req.params);
  const query = parseWithSchema(fileRevisionNotesQuerySchema, req.query);
  const actor = await resolveActiveActor();
  const data = await fileRevisionNoteService.listFileRevisionNotes({
    fileId: params.id,
    fileVersionId: query.fileVersionId,
    viewerId: actor.id,
    viewerLocale,
  });
  return sendSuccess(res, data);
}));

filesRouter.post("/:id/revision-notes", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(fileRevisionNotesParamsSchema, req.params);
  const input = parseWithSchema(upsertFileRevisionNoteBodySchema, req.body);
  const data = await fileRevisionNoteService.createFileRevisionNote({
    fileId: params.id,
    fileVersionId: input.fileVersionId,
    items: input.items,
    markers: input.markers,
    note: input.note,
    sourceLocale: requestLocale,
    viewerLocale: requestLocale,
  });
  return sendSuccess(res, data);
}));

filesRouter.patch("/:id/revision-notes/:noteId", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(fileRevisionNoteReplyParamsSchema, req.params);
  const input = parseWithSchema(upsertFileRevisionNoteBodySchema, req.body);
  const data = await fileRevisionNoteService.updateFileRevisionNote({
    fileId: params.id,
    fileVersionId: input.fileVersionId,
    note: input.note,
    noteId: params.noteId,
    sourceLocale: requestLocale,
    viewerLocale: requestLocale,
  });
  return sendSuccess(res, data);
}));

filesRouter.delete("/:id/revision-notes/:noteId", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(fileRevisionNoteReplyParamsSchema, req.params);
  const query = parseWithSchema(fileRevisionNoteMutationQuerySchema, req.query);
  const data = await fileRevisionNoteService.deleteFileRevisionNote({
    fileId: params.id,
    fileVersionId: query.fileVersionId,
    noteId: params.noteId,
    viewerLocale,
  });
  return sendSuccess(res, data);
}));

filesRouter.patch("/:id/revision-notes/:noteId/items/:itemId", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(fileRevisionNoteItemParamsSchema, req.params);
  const input = parseWithSchema(updateFileRevisionNoteItemCompletionBodySchema, req.body);
  const data = await fileRevisionNoteService.updateFileRevisionNoteItemCompletion({
    completed: input.completed,
    fileId: params.id,
    fileVersionId: input.fileVersionId,
    itemId: params.itemId,
    noteId: params.noteId,
    viewerLocale,
  });
  return sendSuccess(res, data);
}));

filesRouter.delete("/:id/revision-notes/:noteId/markers/:markerId", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(fileRevisionNoteMarkerParamsSchema, req.params);
  const query = parseWithSchema(fileRevisionNoteMutationQuerySchema, req.query);
  const data = await fileRevisionNoteService.deleteFileRevisionNoteMarker({
    fileId: params.id,
    fileVersionId: query.fileVersionId,
    markerId: params.markerId,
    noteId: params.noteId,
    viewerLocale,
  });
  return sendSuccess(res, data);
}));

filesRouter.post("/:id/revision-notes/:noteId/reply", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(fileRevisionNoteReplyParamsSchema, req.params);
  const input = parseWithSchema(replyToFileRevisionNoteBodySchema, req.body);
  const data = await fileRevisionNoteService.replyToFileRevisionNote({
    fileId: params.id,
    fileVersionId: input.fileVersionId,
    noteId: params.noteId,
    reply: input.reply,
    sourceLocale: requestLocale,
    viewerLocale: requestLocale,
  });
  return sendSuccess(res, data);
}));

filesRouter.patch("/:id/revision-notes/:noteId/reply", asyncHandler(async (req, res) => {
  const requestLocale = getRequestLocale(req);
  const params = parseWithSchema(fileRevisionNoteReplyParamsSchema, req.params);
  const input = parseWithSchema(replyToFileRevisionNoteBodySchema, req.body);
  const data = await fileRevisionNoteService.updateFileRevisionNoteReply({
    fileId: params.id,
    fileVersionId: input.fileVersionId,
    noteId: params.noteId,
    reply: input.reply,
    sourceLocale: requestLocale,
    viewerLocale: requestLocale,
  });
  return sendSuccess(res, data);
}));

filesRouter.delete("/:id/revision-notes/:noteId/reply", asyncHandler(async (req, res) => {
  const viewerLocale = getRequestLocale(req);
  const params = parseWithSchema(fileRevisionNoteReplyParamsSchema, req.params);
  const query = parseWithSchema(fileRevisionNoteMutationQuerySchema, req.query);
  const data = await fileRevisionNoteService.deleteFileRevisionNoteReply({
    fileId: params.id,
    fileVersionId: query.fileVersionId,
    noteId: params.noteId,
    viewerLocale,
  });
  return sendSuccess(res, data);
}));

filesRouter.post("/:id/revision-notes/:noteId/report", asyncHandler(async (req, res) => {
  const params = parseWithSchema(fileRevisionNoteReplyParamsSchema, req.params);
  const input = parseWithSchema(fileRevisionNoteReportBodySchema, req.body);
  const actor = await resolveActiveActor();

  await fileRevisionNoteService.reportRevisionNote({
    commentId: input.replyId ? undefined : params.noteId,
    fileId: params.id,
    fileVersionId: input.fileVersionId,
    message: input.message,
    reason: input.reason,
    replyId: input.replyId,
    reporterId: actor.id,
  });

  return sendSuccess(res, { success: true });
}));
