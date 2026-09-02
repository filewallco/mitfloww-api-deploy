import { Router } from "express";
import { fileService } from "@/lib/services/file-service";
import {
  uploadSessionInitSchema,
  uploadObjectContentQuerySchema,
  commitUploadedFilesSchema,
  deleteUploadedObjectSchema,
  multipartUploadPartParamsSchema,
  uploadSessionMultipartPartQuerySchema,
  uploadSessionMultipartCompleteSchema,
  uploadSessionMultipartAbortSchema,
} from "@/lib/validation/files";
import { NotFoundAppError, ValidationAppError } from "@/lib/errors/app-error";
import { sendSuccess, parseWithSchema, asyncHandler } from "@/lib/api/route";

export const fileUploadsRouter = Router();

fileUploadsRouter.post("/sessions", asyncHandler(async (req, res) => {
  const input = parseWithSchema(uploadSessionInitSchema, req.body);
  const data = await fileService.initiateUploadSession(input);
  return sendSuccess(res, data, { status: 201 });
}));

fileUploadsRouter.get("/content", asyncHandler(async (req, res) => {
  const query = parseWithSchema(uploadObjectContentQuerySchema, req.query);
  const data = await fileService.getPresignedPutUrl({
    allowLargeUploads: query.allowLargeUploads,
    bucket: query.bucket,
    storageKey: query.storageKey,
    contentType: query.contentType,
    isFinalDraft: query.isFinalDraft,
    sizeBytes: query.sizeBytes,
  });
  return sendSuccess(res, data);
}));

fileUploadsRouter.put("/content", asyncHandler(async (req, res) => {
  const query = parseWithSchema(uploadObjectContentQuerySchema, req.query);
  let body: Buffer;
  if (Buffer.isBuffer(req.body)) {
    body = req.body;
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    body = Buffer.concat(chunks);
  }

  if (body.byteLength <= 0) {
    throw new ValidationAppError("Request body is required.");
  }

  const contentTypeHeader = (req.headers["content-type"] || "").trim();
  const contentType = contentTypeHeader && contentTypeHeader.length > 0
    ? contentTypeHeader
    : "application/octet-stream";

  const data = await fileService.uploadUploadedObjectContent({
    allowLargeUploads: query.allowLargeUploads,
    body,
    bucket: query.bucket,
    contentLength: body.byteLength,
    contentType,
    isFinalDraft: query.isFinalDraft,
    sizeBytes: query.sizeBytes,
    storageKey: query.storageKey,
  });

  return sendSuccess(res, data);
}));

fileUploadsRouter.post("/commit", asyncHandler(async (req, res) => {
  const input = parseWithSchema(commitUploadedFilesSchema, req.body);
  const idempotencyKeyBase = `commit:${input.projectId}:${input.files.map((f) => f.localFileId).join("|")}`;

  const data = await fileService.commitUploadedFiles(input, {
    sourceLocale: req.locale || "en",
    viewerLocale: req.locale || "en",
    idempotencyKeyBase,
  });

  return sendSuccess(res, data);
}));

fileUploadsRouter.delete("/object", asyncHandler(async (req, res) => {
  const input = parseWithSchema(deleteUploadedObjectSchema, req.body);
  const data = await fileService.deleteUploadedObject(input);
  return sendSuccess(res, data);
}));

fileUploadsRouter.get("/multipart/parts", asyncHandler(async (_req, _res) => {
  throw new NotFoundAppError("Not found.");
}));

fileUploadsRouter.get("/multipart/parts/:partNumber", asyncHandler(async (req, res) => {
  const params = parseWithSchema(
    multipartUploadPartParamsSchema.omit({ id: true }),
    req.params,
  );
  const query = parseWithSchema(uploadSessionMultipartPartQuerySchema, req.query);
  const data = await fileService.getPresignedMultipartPartUrl({
    allowLargeUploads: query.allowLargeUploads,
    bucket: query.bucket,
    isFinalDraft: query.isFinalDraft,
    sizeBytes: query.sizeBytes,
    storageKey: query.storageKey,
    uploadId: query.uploadId,
    partNumber: params.partNumber,
  });

  return sendSuccess(res, { partNumber: params.partNumber, ...data });
}));

fileUploadsRouter.put("/multipart/parts/:partNumber", asyncHandler(async (req, res) => {
  const params = parseWithSchema(
    multipartUploadPartParamsSchema.omit({ id: true }),
    req.params,
  );
  const query = parseWithSchema(uploadSessionMultipartPartQuerySchema, req.query);

  let body: Buffer;
  if (Buffer.isBuffer(req.body)) {
    body = req.body;
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    body = Buffer.concat(chunks);
  }

  if (body.byteLength <= 0) {
    throw new ValidationAppError("Request body is required.");
  }

  const data = await fileService.uploadUploadSessionMultipartPart({
    allowLargeUploads: query.allowLargeUploads,
    body,
    bucket: query.bucket,
    contentLength: body.byteLength,
    isFinalDraft: query.isFinalDraft,
    partNumber: params.partNumber,
    sizeBytes: query.sizeBytes,
    storageKey: query.storageKey,
    uploadId: query.uploadId,
  });

  return sendSuccess(res, data);
}));

fileUploadsRouter.post("/multipart/complete", asyncHandler(async (req, res) => {
  const input = parseWithSchema(uploadSessionMultipartCompleteSchema, req.body);
  const data = await fileService.completeUploadSessionMultipart({
    allowLargeUploads: input.allowLargeUploads,
    bucket: input.bucket,
    isFinalDraft: input.isFinalDraft,
    parts: input.parts,
    sizeBytes: input.sizeBytes,
    storageKey: input.storageKey,
    uploadId: input.uploadId,
  });
  return sendSuccess(res, data);
}));

fileUploadsRouter.post("/multipart/abort", asyncHandler(async (req, res) => {
  const input = parseWithSchema(uploadSessionMultipartAbortSchema, req.body);
  const data = await fileService.abortUploadSessionMultipart(input);
  return sendSuccess(res, data);
}));
