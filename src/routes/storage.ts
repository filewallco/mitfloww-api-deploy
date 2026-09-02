import { Router } from "express";
import mime from "mime-types";
import { storage } from "@/lib/storage";
import { verifyLocalSignature } from "@/lib/storage/local";
import { storageService } from "@/lib/services/storage-service";
import { sendSuccess, asyncHandler } from "@/lib/api/route";
import { Readable } from "node:stream";

export const storageRouter = Router();

storageRouter.get("/balance", asyncHandler(async (_req, res) => {
  const data = await storageService.getStorageBalance();
  return sendSuccess(res, data);
}));

storageRouter.get("/:action", asyncHandler(async (req, res) => {
  const { action } = req.params;
  if (process.env.STORAGE_PROVIDER !== "local") {
    return res.status(404).json({ error: "Storage API not available." });
  }

  // Construct URL for signature verification
  const fullUrl = new URL(req.originalUrl || req.url, `http://${req.headers.host || "localhost"}`);
  if (!verifyLocalSignature(fullUrl)) {
    return res.status(403).json({ error: "Unauthorized or expired URL." });
  }

  const bucket = req.query.bucket as string;
  const key = req.query.key as string;
  const disposition = (req.query.disposition as string) || "inline";
  const filename = req.query.filename as string;

  if (!bucket || !key) {
    return res.status(400).json({ error: "Missing bucket or key." });
  }

  if (action !== "download") {
    return res.status(400).json({ error: "Invalid action for GET." });
  }

  try {
    const fileResult = await storage.getFile({ bucket, key });

    if (fileResult.contentLength) {
      res.setHeader("Content-Length", fileResult.contentLength.toString());
    }

    let contentDisposition = disposition;
    if (filename) {
      contentDisposition += `; filename="${encodeURIComponent(filename)}"`;
    }
    res.setHeader("Content-Disposition", contentDisposition);

    const inferredContentType = mime.lookup(filename || key) || "application/octet-stream";
    res.setHeader("Content-Type", inferredContentType);

    if (fileResult.body instanceof Readable) {
      return fileResult.body.pipe(res);
    } else if (Buffer.isBuffer(fileResult.body) || fileResult.body instanceof Uint8Array) {
      return res.send(Buffer.from(fileResult.body));
    } else {
      return res.send(fileResult.body);
    }
  } catch (err: any) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: "Not found." });
    }
    console.error("Storage download error:", err);
    return res.status(500).json({ error: "Internal error." });
  }
}));

storageRouter.put("/:action", asyncHandler(async (req, res) => {
  const { action } = req.params;
  if (process.env.STORAGE_PROVIDER !== "local") {
    return res.status(404).json({ error: "Storage API not available." });
  }

  const fullUrl = new URL(req.originalUrl || req.url, `http://${req.headers.host || "localhost"}`);
  if (!verifyLocalSignature(fullUrl)) {
    return res.status(403).json({ error: "Unauthorized or expired URL." });
  }

  const bucket = req.query.bucket as string;
  const key = req.query.key as string;

  if (!bucket || !key) {
    return res.status(400).json({ error: "Missing bucket or key." });
  }

  if (action === "upload") {
    try {
      const contentType = req.headers["content-type"] || "application/octet-stream";
      // Body can be buffer or stream
      const body = Buffer.isBuffer(req.body) ? req.body : req;
      await storage.uploadFile({
        bucket,
        key,
        contentType,
        body: body as any,
      });

      return res.status(200).end();
    } catch (err) {
      console.error("Local storage upload error:", err);
      return res.status(500).json({ error: "Internal error." });
    }
  }

  if (action === "upload-part") {
    try {
      const uploadId = req.query.uploadId as string;
      const partNumber = parseInt((req.query.partNumber as string) || "", 10);

      if (!uploadId || isNaN(partNumber)) {
        return res.status(400).json({ error: "Missing multipart params." });
      }

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

      const result = await storage.uploadMultipartPart({
        bucket,
        key,
        uploadId,
        partNumber,
        body: buffer,
        contentLength: buffer.byteLength,
      });

      res.setHeader("ETag", `"${result.etag}"`);
      return res.status(200).end();
    } catch (err) {
      console.error("Local storage multipart part error:", err);
      return res.status(500).json({ error: "Internal error." });
    }
  }

  return res.status(400).json({ error: "Invalid action for PUT." });
}));
