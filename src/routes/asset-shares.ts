import { Router } from "express";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { asyncHandler, parseWithSchema, sendSuccess } from "@/lib/api/route";
import { assetShareService } from "@/lib/services/asset-share-service";
import {
  createAssetShareSchema,
  updateAssetShareSchema,
  assetShareGateSchema,
  assetSharePurchaseSchema,
  uploadAssetShareFilesSchema,
} from "@/lib/validation/asset-shares";
import { r2Storage } from "@/lib/storage/r2";
import { AppError } from "@/lib/errors/app-error";

export const assetSharesRouter = Router();

// ── Creator Endpoints (Authenticated) ──────────────────────────────────────

// GET /api/asset-shares - List creator's asset shares
assetSharesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const status = typeof req.query.status === "string" ? (req.query.status as any) : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const sort = typeof req.query.sort === "string" ? (req.query.sort as any) : undefined;

    const data = await assetShareService.listUserAssetShares(actor.id, {
      status,
      search,
      sort,
    });
    return sendSuccess(res, data);
  })
);

// POST /api/asset-shares - Create new asset share
assetSharesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const parsed = parseWithSchema(createAssetShareSchema, req.body);

    const created = await assetShareService.createAssetShare(actor.id, parsed);
    return sendSuccess(res, created, { status: 201 });
  })
);

// POST /api/asset-shares/preview-upload - Upload a single preview image or video
assetSharesRouter.post(
  "/preview-upload",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);

    if (req.body?.bufferBase64 && req.body?.filename && req.body?.mimeType) {
      const buffer = Buffer.from(req.body.bufferBase64, "base64");
      const mimeType = req.body.mimeType.toLowerCase();
      const isImage = mimeType.startsWith("image/");
      const isVideo = mimeType.startsWith("video/");

      if (!isImage && !isVideo) {
        throw new AppError("Preview files must be images or videos.", 400, "invalid_preview_format");
      }

      if (isImage && buffer.length > 1 * 1024 * 1024) {
        throw new AppError("Preview image exceeds 1 MB limit.", 400, "preview_image_too_large");
      }
      if (isVideo && buffer.length > 10 * 1024 * 1024) {
        throw new AppError("Preview video exceeds 10 MB limit.", 400, "preview_video_too_large");
      }

      const sanitizedBase = req.body.filename.replace(/[^a-zA-Z0-9.-]/g, "_");
      const assetShareId = req.query.assetShareId || req.body.assetShareId;
      const storageKey = assetShareId
        ? `users/${actor.id}/asset-shares/${assetShareId}/previews/${Date.now()}-${sanitizedBase}`
        : `users/${actor.id}/asset-shares/previews/${Date.now()}-${sanitizedBase}`;

      await r2Storage.uploadFile({
        key: storageKey,
        body: buffer,
        contentType: mimeType,
      });

      const publicBase = process.env.R2_PUBLIC_BASE_URL;
      const previewUrl = publicBase
        ? `${publicBase.replace(/\/+$/, "")}/${storageKey}`
        : `/api/profile/media?key=${encodeURIComponent(storageKey)}`;

      return sendSuccess(res, {
        name: req.body.filename,
        mimeType,
        sizeBytes: buffer.length,
        storageKey,
        previewUrl,
      });
    }

    throw new AppError("No file payload provided.", 400, "missing_file_payload");
  })
);

// GET /api/asset-shares/:id - Get asset share details (Creator view)
assetSharesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const data = await assetShareService.getAssetShareById(id, actor.id);
    return sendSuccess(res, data);
  })
);

// PATCH /api/asset-shares/:id - Update asset share
assetSharesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const parsed = parseWithSchema(updateAssetShareSchema, req.body);
    const updated = await assetShareService.updateAssetShare(id, actor.id, parsed);
    return sendSuccess(res, updated);
  })
);

// DELETE /api/asset-shares/:id - Soft delete asset share
assetSharesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const result = await assetShareService.deleteAssetShare(id, actor.id);
    return sendSuccess(res, result);
  })
);

// POST /api/asset-shares/:id/upload - Direct upload single file
assetSharesRouter.post(
  "/:id/upload",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const filename =
      (typeof req.query.filename === "string" ? req.query.filename : req.body?.filename) || "file";

    let buffer: Buffer;
    let mimeType = req.headers["x-mime-type"]
      ? decodeURIComponent(req.headers["x-mime-type"] as string)
      : (req.headers["content-type"] || "application/octet-stream");

    if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
    } else if (req.body?.bufferBase64) {
      buffer = Buffer.from(req.body.bufferBase64, "base64");
      if (req.body.mimeType) mimeType = req.body.mimeType;
    } else if (typeof req.body === "string") {
      buffer = Buffer.from(req.body);
    } else {
      throw new AppError("No file body received.", 400, "missing_file_body");
    }

    const staged = await assetShareService.uploadStagedDownloadableFile(
      id,
      actor.id,
      filename,
      buffer,
      mimeType
    );

    return sendSuccess(res, { stagedFile: staged, file: staged }, { status: 201 });
  })
);

// POST /api/asset-shares/:id/cleanup-staged - Discard an uncommitted staged file from R2
assetSharesRouter.post(
  "/:id/cleanup-staged",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const storageKey = req.body?.storageKey;

    if (!storageKey || typeof storageKey !== "string") {
      throw new AppError("Storage key is required for cleanup.", 400, "missing_storage_key");
    }

    const result = await assetShareService.cleanupStagedDownloadableFile(id, actor.id, storageKey);
    return sendSuccess(res, result);
  })
);

// POST /api/asset-shares/:id/files - Upload downloadable files
assetSharesRouter.post(
  "/:id/files",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const parsed = parseWithSchema(uploadAssetShareFilesSchema, req.body);

    const result = await assetShareService.addDownloadableFiles(id, actor.id, parsed.files);
    return sendSuccess(res, { files: result }, { status: 201 });
  })
);

// DELETE /api/asset-shares/:id/files/:fileId - Soft delete a downloadable file
assetSharesRouter.delete(
  "/:id/files/:fileId",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const fileId = req.params.fileId as string;

    const result = await assetShareService.deleteDownloadableFile(id, fileId, actor.id);
    return sendSuccess(res, result);
  })
);

// ── Public Visitor & Buyer Endpoints ───────────────────────────────────────

// GET /api/asset-shares/public/:token - Public asset share state check
assetSharesRouter.get(
  "/public/:token",
  asyncHandler(async (req, res) => {
    const token = req.params.token as string;
    const email = typeof req.query.email === "string" ? req.query.email : null;

    const state = await assetShareService.getPublicAssetShareState(token, email);
    return sendSuccess(res, state);
  })
);

// POST /api/asset-shares/public/:token/gate - Visitor email submission / access check
assetSharesRouter.post(
  "/public/:token/gate",
  asyncHandler(async (req, res) => {
    const token = req.params.token as string;
    const parsed = parseWithSchema(assetShareGateSchema, req.body);

    const state = await assetShareService.getPublicAssetShareState(token, parsed.email);
    return sendSuccess(res, state);
  })
);

// POST /api/asset-shares/public/:token/purchase - Pay & Unlock purchase execution
assetSharesRouter.post(
  "/public/:token/purchase",
  asyncHandler(async (req, res) => {
    const token = req.params.token as string;
    const parsed = parseWithSchema(assetSharePurchaseSchema, req.body);

    const result = await assetShareService.processPurchase(token, parsed.email);
    return sendSuccess(res, result);
  })
);

// GET /api/asset-shares/public/:token/download/:fileId - Download single file
assetSharesRouter.get(
  "/public/:token/download/:fileId",
  asyncHandler(async (req, res) => {
    const token = req.params.token as string;
    const fileId = req.params.fileId as string;
    const email = typeof req.query.email === "string" ? req.query.email : null;

    // Verify access
    const state = await assetShareService.getPublicAssetShareState(token, email);
    if (state.accessState !== "purchased") {
      throw new AppError("Purchase required to download asset files.", 403, "purchase_required");
    }

    const file = state.files?.find((f: any) => f.id === fileId);
    if (!file) {
      throw new AppError("File not found.", 404, "file_not_found");
    }

    // Direct download or presigned URL
    const publicBase = process.env.R2_PUBLIC_BASE_URL;
    if (publicBase) {
      return res.redirect(`${publicBase.replace(/\/+$/, "")}/${file.storageKey}`);
    }

    // Proxy through media stream
    return res.redirect(`/api/profile/media?key=${encodeURIComponent(file.storageKey)}`);
  })
);
