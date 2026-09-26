import { Router } from "express";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { asyncHandler, parseWithSchema, sendSuccess } from "@/lib/api/route";
import { assetService } from "@/lib/services/asset-service";
import {
  createAssetSchema,
  updateAssetSchema,
  assetGateSchema,
  assetPurchaseSchema,
  uploadAssetFilesSchema,
} from "@/lib/validation/assets";
import { Readable } from "node:stream";
import { r2Storage } from "@/lib/storage/r2";
import { AppError } from "@/lib/errors/app-error";

export const assetsRouter = Router();

// ── Creator Endpoints (Authenticated) ──────────────────────────────────────

// GET /api/assets - List creator's assets
assetsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const status = typeof req.query.status === "string" ? (req.query.status as any) : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const sort = typeof req.query.sort === "string" ? (req.query.sort as any) : undefined;

    const data = await assetService.listUserAssets(actor.id, {
      status,
      search,
      sort,
    });
    return sendSuccess(res, data);
  })
);

// POST /api/assets - Create new asset
assetsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const parsed = parseWithSchema(createAssetSchema, req.body);

    const created = await assetService.createAsset(actor.id, parsed);
    return sendSuccess(res, created, { status: 201 });
  })
);

// POST /api/assets/preview-upload - Upload a single preview image or video
assetsRouter.post(
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
      const assetId = req.query.assetId || req.query.assetShareId || req.body.assetId || req.body.assetShareId;
      const storageKey = assetId
        ? `users/${actor.id}/assets/${assetId}/previews/${Date.now()}-${sanitizedBase}`
        : `users/${actor.id}/assets/previews/${Date.now()}-${sanitizedBase}`;

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

// GET /api/assets/:id - Get asset details (Creator view)
assetsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const data = await assetService.getAssetById(id, actor.id);
    return sendSuccess(res, data);
  })
);

// PATCH /api/assets/:id - Update asset
assetsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const parsed = parseWithSchema(updateAssetSchema, req.body);
    const updated = await assetService.updateAsset(id, actor.id, parsed);
    return sendSuccess(res, updated);
  })
);

// POST /api/assets/:id/publish - Publish asset
assetsRouter.post(
  "/:id/publish",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const published = await assetService.publishAsset(id, actor.id);
    return sendSuccess(res, published);
  })
);

// POST /api/assets/:id/regenerate - Regenerate share token/link
assetsRouter.post(
  "/:id/regenerate",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const updated = await assetService.regenerateShareToken(id, actor.id);
    return sendSuccess(res, updated);
  })
);

// DELETE /api/assets/:id - Soft delete asset
assetsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const result = await assetService.deleteAsset(id, actor.id);
    return sendSuccess(res, result);
  })
);

// POST /api/assets/:id/upload - Direct upload single file
assetsRouter.post(
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

    const staged = await assetService.uploadStagedDownloadableFile(
      id,
      actor.id,
      filename,
      buffer,
      mimeType
    );

    return sendSuccess(res, { stagedFile: staged, file: staged }, { status: 201 });
  })
);

// POST /api/assets/:id/cleanup-staged - Discard an uncommitted staged file from R2
assetsRouter.post(
  "/:id/cleanup-staged",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const storageKey = req.body?.storageKey;

    if (!storageKey || typeof storageKey !== "string") {
      throw new AppError("Storage key is required for cleanup.", 400, "missing_storage_key");
    }

    const result = await assetService.cleanupStagedDownloadableFile(id, actor.id, storageKey);
    return sendSuccess(res, result);
  })
);

// POST /api/assets/:id/files - Upload downloadable files
assetsRouter.post(
  "/:id/files",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const parsed = parseWithSchema(uploadAssetFilesSchema, req.body);

    const result = await assetService.addDownloadableFiles(id, actor.id, parsed.files);
    return sendSuccess(res, { files: result }, { status: 201 });
  })
);

// DELETE /api/assets/:id/files/:fileId - Soft delete a downloadable file
assetsRouter.delete(
  "/:id/files/:fileId",
  asyncHandler(async (req, res) => {
    const actor = await resolveActiveActor(req);
    const id = req.params.id as string;
    const fileId = req.params.fileId as string;

    const result = await assetService.deleteDownloadableFile(id, fileId, actor.id);
    return sendSuccess(res, result);
  })
);

// ── Public Visitor & Buyer Endpoints ───────────────────────────────────────

// GET /api/assets/public/:token - Public asset state check
assetsRouter.get(
  "/public/:token",
  asyncHandler(async (req, res) => {
    const token = req.params.token as string;
    const email = typeof req.query.email === "string" ? req.query.email : null;

    const state = await assetService.getPublicAssetState(token, email);
    return sendSuccess(res, state);
  })
);

// POST /api/assets/public/:token/gate - Visitor email submission / access check
assetsRouter.post(
  "/public/:token/gate",
  asyncHandler(async (req, res) => {
    const token = req.params.token as string;
    const parsed = parseWithSchema(assetGateSchema, req.body);

    const state = await assetService.getPublicAssetState(token, parsed.email);
    return sendSuccess(res, state);
  })
);

// POST /api/assets/public/:token/purchase - Pay & Unlock purchase execution
assetsRouter.post(
  "/public/:token/purchase",
  asyncHandler(async (req, res) => {
    const token = req.params.token as string;
    const parsed = parseWithSchema(assetPurchaseSchema, req.body);

    const result = await assetService.processPurchase(token, parsed.email);
    return sendSuccess(res, result);
  })
);

// GET /api/assets/media - Stream asset media directly
assetsRouter.get(
  "/media",
  asyncHandler(async (req, res) => {
    const storageKey = req.query.key as string;
    if (!storageKey) {
      return res.status(400).json({ error: "Missing key query parameter." });
    }

    const result = await r2Storage.getFile({ key: storageKey });
    if (!result || !result.body) {
      return res.status(404).json({ error: "Media not found." });
    }

    if (result.contentType) {
      res.setHeader("Content-Type", result.contentType);
    }
    if (result.contentLength != null) {
      res.setHeader("Content-Length", String(result.contentLength));
    }
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");

    if (typeof (result.body as any)?.pipe === "function") {
      return (result.body as any).pipe(res);
    } else if (Buffer.isBuffer(result.body) || result.body instanceof Uint8Array) {
      return res.send(Buffer.from(result.body));
    } else {
      return res.send(result.body);
    }
  })
);

// GET /api/assets/public/:token/download/:fileId - Download single file
assetsRouter.get(
  "/public/:token/download/:fileId",
  asyncHandler(async (req, res) => {
    const token = req.params.token as string;
    const fileId = req.params.fileId as string;
    const email = typeof req.query.email === "string" ? req.query.email : null;

    const file = await assetService.getPublicAssetDownloadFile(token, fileId, email);

    // Fast path: Redirect directly to Cloudflare R2 presigned download URL
    // Saves 100% server RAM and network bandwidth
    if (file.storageKey) {
      try {
        const presigned = await r2Storage.getPresignedGetObjectUrl({
          key: file.storageKey,
          filename: file.filename,
          disposition: "attachment",
          expiresInSeconds: 900,
        });
        if (presigned?.url) {
          return res.redirect(302, presigned.url);
        }
      } catch {
        // Fall back to direct stream if presigning not available
      }
    }

    res.setHeader("Content-Disposition", `attachment; filename="${file.filename.replace(/"/g, "")}"`);
    res.setHeader("Content-Type", file.mimeType);
    if (file.contentLength != null) {
      res.setHeader("Content-Length", String(file.contentLength));
    }

    if (typeof (file.body as any)?.pipe === "function") {
      return (file.body as any).pipe(res);
    } else if (file.body && typeof (file.body as any).getReader === "function") {
      return Readable.fromWeb(file.body as any).pipe(res);
    } else if (Buffer.isBuffer(file.body) || file.body instanceof Uint8Array) {
      return res.send(Buffer.from(file.body));
    } else {
      return res.send(file.body);
    }
  })
);

// POST /api/assets/public/:token/download-zip - Bundle files into a ZIP archive
assetsRouter.post(
  "/public/:token/download-zip",
  asyncHandler(async (req, res) => {
    const token = req.params.token as string;
    const email = typeof req.body?.email === "string" ? req.body.email : (typeof req.query?.email === "string" ? req.query.email : null);
    const fileIds = Array.isArray(req.body?.fileIds) ? req.body.fileIds : undefined;

    const result = await assetService.getPublicAssetZipArchive(token, email, fileIds);

    res.setHeader("Content-Disposition", `attachment; filename="${result.filename.replace(/"/g, "")}"`);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Length", String(result.body.length));
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.send(Buffer.from(result.body as any));
  })
);

// GET /api/assets/public/:token/download-zip - Direct GET download for ZIP archive
assetsRouter.get(
  "/public/:token/download-zip",
  asyncHandler(async (req, res) => {
    const token = req.params.token as string;
    const email = typeof req.query.email === "string" ? req.query.email : null;
    const fileIdsParam = typeof req.query.fileIds === "string" ? req.query.fileIds : undefined;
    const fileIds = fileIdsParam ? fileIdsParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

    const result = await assetService.getPublicAssetZipArchive(token, email, fileIds);

    res.setHeader("Content-Disposition", `attachment; filename="${result.filename.replace(/"/g, "")}"`);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Length", String(result.body.length));
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.send(Buffer.from(result.body as any));
  })
);

export const assetSharesRouter = assetsRouter;