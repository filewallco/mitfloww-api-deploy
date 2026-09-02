import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { AppError } from "@/lib/errors/app-error";
import type {
  AbortMultipartUploadRequest,
  AbortMultipartUploadResult,
  CompleteMultipartUploadRequest,
  CompleteMultipartUploadResult,
  CreateMultipartUploadRequest,
  CreateMultipartUploadResult,
  DeleteFileRequest,
  DeleteFileResult,
  FileStorage,
  GetFileHeaderBytesRequest,
  GetFileHeaderBytesResult,
  GetFileRequest,
  GetFileResult,
  GetSignedUrlRequest,
  GetSignedUrlResult,
  HeadFileRequest,
  HeadFileResult,
  ListFilesRequest,
  ListFilesResult,
  ListMultipartUploadsRequest,
  ListMultipartUploadsResult,
  UploadFileRequest,
  UploadFileResult,
  UploadMultipartPartRequest,
  UploadMultipartPartResult,
} from "./types";
import { env } from "node:process";

export function verifyLocalSignature(url: URL): boolean {
  const secret = env.PROJECT_SHARE_SIGNING_SECRET || "local-storage-secret";
  const action = url.pathname.split("/").pop();
  const bucket = url.searchParams.get("bucket");
  const key = url.searchParams.get("key");
  const expiresAt = url.searchParams.get("expiresAt");
  const signature = url.searchParams.get("signature");

  if (!action || !bucket || !key || !expiresAt || !signature) {
    return false;
  }

  if (Date.now() / 1000 > parseInt(expiresAt, 10)) {
    return false;
  }

  const payload = `${action}:${bucket}:${key}:${expiresAt}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return signature === expected;
}

export class LocalStorage implements FileStorage {
  private basePath: string;
  private secret: string;
  private baseUrl: string;

  constructor() {
    const rawBasePath = env.LOCAL_STORAGE_PATH || "/storage";
    this.basePath = path.resolve(process.cwd(), rawBasePath);
    this.secret = env.PROJECT_SHARE_SIGNING_SECRET || "local-storage-secret";
    this.baseUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  }

  private getFilePath(bucket: string, key: string): string {
    return path.join(this.basePath, bucket, key);
  }

  private getMultipartTempPath(bucket: string, uploadId: string, partNumber?: number): string {
    const dir = path.join(this.basePath, "temp", bucket, uploadId);
    if (partNumber !== undefined) {
      return path.join(dir, `part-${partNumber}`);
    }
    return dir;
  }

  private generateSignature(payload: string): string {
    return crypto.createHmac("sha256", this.secret).update(payload).digest("hex");
  }

  private createAuthenticatedUrl(action: string, bucket: string, key: string, expiresInSeconds: number = 3600, extraParams: Record<string, string> = {}) {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const url = new URL(`/api/storage/${action}`, this.baseUrl);
    url.searchParams.set("bucket", bucket);
    url.searchParams.set("key", key);
    url.searchParams.set("expiresAt", expiresAt.toString());
    
    for (const [k, v] of Object.entries(extraParams)) {
      url.searchParams.set(k, v);
    }

    const signaturePayload = `${action}:${bucket}:${key}:${expiresAt}`;
    const signature = this.generateSignature(signaturePayload);
    url.searchParams.set("signature", signature);

    return url.toString();
  }

  getDefaultBucket(): string {
    return env.R2_BUCKET_NAME || "local-bucket";
  }

  async headFile(input: HeadFileRequest): Promise<HeadFileResult> {
    const bucket = input.bucket || this.getDefaultBucket();
    const filePath = this.getFilePath(bucket, input.key);

    try {
      const stats = await fs.stat(filePath);
      return {
        bucket,
        contentLength: stats.size,
        contentType: null, // FS doesn't store content type natively
        etag: null,
        exists: true,
        key: input.key,
      };
    } catch {
      return {
        bucket,
        contentLength: null,
        contentType: null,
        etag: null,
        exists: false,
        key: input.key,
      };
    }
  }

  async getFile(input: GetFileRequest): Promise<GetFileResult> {
    const bucket = input.bucket || this.getDefaultBucket();
    const filePath = this.getFilePath(bucket, input.key);

    try {
      const stats = await fs.stat(filePath);
      const stream = createReadStream(filePath);
      return {
        bucket,
        body: stream as unknown as Readable, // Node.js stream vs standard stream mismatch is common
        contentLength: stats.size,
        contentType: null,
        etag: null,
        key: input.key,
      };
    } catch (e: any) {
      throw new AppError(`File not found: ${input.key}`, 404, "not_found");
    }
  }

  async getFileHeaderBytes(input: GetFileHeaderBytesRequest): Promise<GetFileHeaderBytesResult> {
    const bucket = input.bucket || this.getDefaultBucket();
    const filePath = this.getFilePath(bucket, input.key);
    const maxBytes = input.maxBytes || 8192;

    try {
      const fd = await fs.open(filePath, "r");
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await fd.read(buffer, 0, maxBytes, 0);
      await fd.close();

      return {
        bucket,
        bytes: new Uint8Array(buffer.subarray(0, bytesRead)),
        key: input.key,
      };
    } catch (e: any) {
      throw new AppError(`Failed to read header bytes: ${input.key}`, 500, "storage_error");
    }
  }

  async deleteFile(input: DeleteFileRequest): Promise<DeleteFileResult> {
    const bucket = input.bucket || this.getDefaultBucket();
    const filePath = this.getFilePath(bucket, input.key);

    try {
      await fs.unlink(filePath);
      return { bucket, deleted: true, key: input.key, skipped: false };
    } catch {
      return { bucket, deleted: false, key: input.key, skipped: true };
    }
  }

  async uploadFile(input: UploadFileRequest): Promise<UploadFileResult> {
    const bucket = input.bucket || this.getDefaultBucket();
    const filePath = this.getFilePath(bucket, input.key);

    await fs.mkdir(path.dirname(filePath), { recursive: true });

    if (Buffer.isBuffer(input.body) || input.body instanceof Uint8Array) {
      await fs.writeFile(filePath, input.body);
    } else if (input.body instanceof ReadableStream || typeof (input.body as any).pipe === "function") {
      // It's a stream
      const writeStream = (await import("node:fs")).createWriteStream(filePath);
      
      if (typeof (input.body as any).pipe === "function") {
        (input.body as any).pipe(writeStream);
        await new Promise((resolve, reject) => {
          writeStream.on("finish", () => resolve(undefined));
          writeStream.on("error", reject);
        });
      } else {
        // web stream
        const reader = (input.body as unknown as ReadableStream<Uint8Array>).getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            writeStream.write(value);
          }
          writeStream.end();
          await new Promise((resolve, reject) => {
            writeStream.on("finish", () => resolve(undefined));
            writeStream.on("error", reject);
          });
        } finally {
          reader.releaseLock();
        }
      }
    } else {
      // Convert ArrayBuffer to Buffer
      await fs.writeFile(filePath, Buffer.from(input.body as ArrayBuffer));
    }

    return { bucket, etag: null, key: input.key };
  }

  async copyFile(input: {
    sourceBucket?: string;
    sourceKey: string;
    destinationBucket?: string;
    destinationKey: string;
  }): Promise<{ bucket: string; key: string; etag: string | null }> {
    const sourceBucket = input.sourceBucket || this.getDefaultBucket();
    const destBucket = input.destinationBucket || this.getDefaultBucket();
    const sourcePath = this.getFilePath(sourceBucket, input.sourceKey);
    const destPath = this.getFilePath(destBucket, input.destinationKey);

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(sourcePath, destPath);

    return { bucket: destBucket, key: input.destinationKey, etag: null };
  }

  // URLs
  async getSignedUrl(input: GetSignedUrlRequest): Promise<GetSignedUrlResult> {
    const bucket = input.bucket || this.getDefaultBucket();
    const url = this.createAuthenticatedUrl("download", bucket, input.key, input.expiresInSeconds, {
      disposition: input.disposition || "inline",
      ...(input.filename ? { filename: input.filename } : {}),
    });

    return {
      bucket,
      expiresAt: null, // the URL handles it
      key: input.key,
      publicUrl: false,
      url,
    };
  }

  async getPresignedPutObjectUrl(input: {
    bucket?: string;
    key: string;
    contentType?: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string; expiresAt: string | null }> {
    const bucket = input.bucket || this.getDefaultBucket();
    const url = this.createAuthenticatedUrl("upload", bucket, input.key, input.expiresInSeconds);
    return { url, expiresAt: null };
  }

  async getPresignedGetObjectUrl(input: {
    bucket?: string;
    disposition?: "attachment" | "inline";
    expiresInSeconds?: number;
    filename?: string;
    key: string;
  }): Promise<{ url: string; expiresAt: string | null }> {
    const bucket = input.bucket || this.getDefaultBucket();
    const url = this.createAuthenticatedUrl("download", bucket, input.key, input.expiresInSeconds, {
      disposition: input.disposition || "inline",
      ...(input.filename ? { filename: input.filename } : {}),
    });
    return { url, expiresAt: null };
  }

  async getPresignedMultipartPartUrl(input: {
    bucket?: string;
    key: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds?: number;
  }): Promise<{ url: string; expiresAt: string | null }> {
    const bucket = input.bucket || this.getDefaultBucket();
    const url = this.createAuthenticatedUrl("upload-part", bucket, input.key, input.expiresInSeconds, {
      uploadId: input.uploadId,
      partNumber: input.partNumber.toString(),
    });
    return { url, expiresAt: null };
  }

  // Multipart Uploads (Faked on Local FS)
  async createMultipartUpload(input: CreateMultipartUploadRequest): Promise<CreateMultipartUploadResult> {
    const bucket = input.bucket || this.getDefaultBucket();
    const uploadId = crypto.randomUUID();
    const dir = this.getMultipartTempPath(bucket, uploadId);
    await fs.mkdir(dir, { recursive: true });
    return { bucket, key: input.key, uploadId };
  }

  async uploadMultipartPart(input: UploadMultipartPartRequest): Promise<UploadMultipartPartResult> {
    const bucket = input.bucket || this.getDefaultBucket();
    const partPath = this.getMultipartTempPath(bucket, input.uploadId, input.partNumber);
    await fs.writeFile(partPath, Buffer.from(input.body as any));
    return {
      bucket,
      etag: input.partNumber.toString(), // fake etag
      key: input.key,
      partNumber: input.partNumber,
      uploadId: input.uploadId,
    };
  }

  async completeMultipartUpload(input: CompleteMultipartUploadRequest): Promise<CompleteMultipartUploadResult> {
    const bucket = input.bucket || this.getDefaultBucket();
    const finalPath = this.getFilePath(bucket, input.key);
    await fs.mkdir(path.dirname(finalPath), { recursive: true });
    
    const writeStream = (await import("node:fs")).createWriteStream(finalPath);
    
    // Sort parts to ensure order
    const sortedParts = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);
    
    for (const part of sortedParts) {
      const partPath = this.getMultipartTempPath(bucket, input.uploadId, part.partNumber);
      const data = await fs.readFile(partPath);
      writeStream.write(data);
    }
    
    writeStream.end();
    await new Promise((resolve, reject) => {
      writeStream.on("finish", () => resolve(undefined));
      writeStream.on("error", reject);
    });

    // Cleanup temp
    await fs.rm(this.getMultipartTempPath(bucket, input.uploadId), { recursive: true, force: true });

    return { bucket, etag: null, key: input.key, uploadId: input.uploadId };
  }

  async abortMultipartUpload(input: AbortMultipartUploadRequest): Promise<AbortMultipartUploadResult> {
    const bucket = input.bucket || this.getDefaultBucket();
    await fs.rm(this.getMultipartTempPath(bucket, input.uploadId), { recursive: true, force: true });
    return { aborted: true, bucket, key: input.key, skipped: false, uploadId: input.uploadId };
  }

  // Listings (Not frequently used in frontend, mainly worker/admin, returning empty for simplicity unless needed)
  async listFiles(input: ListFilesRequest): Promise<ListFilesResult> {
    // Basic implementation
    return { bucket: input.bucket || this.getDefaultBucket(), nextContinuationToken: null, objects: [] };
  }

  async listMultipartUploads(input: ListMultipartUploadsRequest): Promise<ListMultipartUploadsResult> {
    return { bucket: input.bucket || this.getDefaultBucket(), nextKeyMarker: null, nextUploadIdMarker: null, uploads: [] };
  }
}
