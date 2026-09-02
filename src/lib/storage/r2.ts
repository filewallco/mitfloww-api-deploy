import { AppError, isAppError } from "@/lib/errors/app-error";
/*
  Cloudflare R2 CORS requirements for direct browser uploads (recommended):

  [
    {
      "AllowedOrigins": [
        "http://localhost:3000",
        "https://MY_PRODUCTION_DOMAIN"
      ],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]

  Notes:
  - Ensure `ETag` is exposed so clients can read it after part uploads.
  - Allow necessary request headers and methods for your upload flows.
  - Keep presigned URLs expiry reasonably short (e.g. 1 hour).
*/
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { lookup as dnsLookup } from "node:dns";
import { Agent as HttpsAgent } from "node:https";
import { isIP } from "node:net";
import { Readable } from "stream";

type R2RequestContext = {
  bucket?: string;
  key?: string;
  partNumber?: number;
  uploadId?: string;
};

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
  ListedFileObject,
  ListedMultipartUpload,
  ListFilesRequest,
  ListFilesResult,
  ListMultipartUploadsRequest,
  ListMultipartUploadsResult,
  MultipartUploadPart,
  UploadBody,
  UploadFileRequest,
  UploadFileResult,
  UploadMultipartPartRequest,
  UploadMultipartPartResult,
} from "./types";

type R2Config = {
  accessKeyId?: string;
  accountId?: string;
  bucketName?: string;
  connectTimeoutMs?: number;
  endpoint?: string;
  endpointIpOverride?: string;
  jurisdiction?: string;
  maxAttempts?: number;
  publicBaseUrl?: string;
  requestTimeoutMs?: number;
  secretAccessKey?: string;
};

function normalizeConfigValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePositiveInt(value?: string) {
  const normalized = normalizeConfigValue(value);

  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseInt(normalized, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function buildR2Endpoint(config: Pick<R2Config, "accountId" | "endpoint" | "jurisdiction">) {
  const customEndpoint = normalizeBaseUrl(config.endpoint);

  if (customEndpoint) {
    return customEndpoint;
  }

  const accountId = normalizeConfigValue(config.accountId);

  if (!accountId) {
    return undefined;
  }

  const jurisdiction = normalizeConfigValue(config.jurisdiction);
  const jurisdictionSegment = jurisdiction ? `.${jurisdiction}` : "";

  return `https://${accountId}${jurisdictionSegment}.r2.cloudflarestorage.com`;
}

function getR2Config(): R2Config {
  return {
    accessKeyId: normalizeConfigValue(process.env.R2_ACCESS_KEY_ID),
    accountId: normalizeConfigValue(process.env.R2_ACCOUNT_ID),
    bucketName: normalizeConfigValue(process.env.R2_BUCKET_NAME),
    connectTimeoutMs: parsePositiveInt(process.env.R2_CONNECT_TIMEOUT_MS),
    endpoint: normalizeBaseUrl(process.env.R2_S3_ENDPOINT),
    endpointIpOverride: normalizeConfigValue(process.env.R2_ENDPOINT_IP_OVERRIDE),
    jurisdiction: normalizeConfigValue(process.env.R2_JURISDICTION),
    maxAttempts: parsePositiveInt(process.env.R2_MAX_ATTEMPTS),
    publicBaseUrl: normalizeConfigValue(process.env.R2_PUBLIC_BASE_URL),
    requestTimeoutMs: parsePositiveInt(process.env.R2_REQUEST_TIMEOUT_MS),
    secretAccessKey: normalizeConfigValue(process.env.R2_SECRET_ACCESS_KEY),
  };
}

function createR2HttpsAgent(endpoint: string, ipOverride?: string) {
  const normalizedIpOverride = normalizeConfigValue(ipOverride);

  if (!normalizedIpOverride) {
    return undefined;
  }

  const ipVersion = isIP(normalizedIpOverride);

  if (!ipVersion) {
    return undefined;
  }

  const endpointHostname = new URL(endpoint).hostname;

  return new HttpsAgent({
    keepAlive: true,
    lookup(hostname, options, callback) {
      if (hostname === endpointHostname) {
        if (typeof options === "object" && "all" in options && options.all) {
          callback(null, [{ address: normalizedIpOverride, family: ipVersion }]);
          return;
        }

        callback(null, normalizedIpOverride, ipVersion);
        return;
      }

      dnsLookup(hostname, options, callback);
    },
  });
}

function encodeStorageKey(key: string) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function normalizeBaseUrl(value?: string) {
  if (!value) {
    return undefined;
  }

  return value.replace(/\/+$/, "");
}

function normalizePublicBaseUrl(value?: string) {
  const normalized = normalizeBaseUrl(normalizeConfigValue(value));

  if (!normalized) {
    return undefined;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (normalized.startsWith("//")) {
    return `https:${normalized}`;
  }

  if (
    /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/.*)?$/i.test(
      normalized,
    )
  ) {
    return `http://${normalized}`;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/.*)?$/i.test(normalized)) {
    return `https://${normalized}`;
  }

  return undefined;
}

function hasR2Credentials(config: R2Config) {
  return Boolean(
    buildR2Endpoint(config) &&
    config.accessKeyId &&
    config.secretAccessKey &&
    config.bucketName,
  );
}

function toStorageBody(body: UploadBody | ArrayBuffer | Uint8Array) {
  return body instanceof ArrayBuffer ? new Uint8Array(body) : body;
}

function isMissingMultipartUploadError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if ("name" in error && (error as { name?: string }).name === "NoSuchUpload") {
    return true;
  }

  return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404;
}

function getErrorStringProperty(error: unknown, property: "code" | "Code" | "name") {
  return typeof error === "object" &&
    error !== null &&
    property in error &&
    typeof (error as Record<string, unknown>)[property] === "string"
    ? (error as Record<string, string>)[property]
    : undefined;
}

function getStorageErrorCode(error: unknown) {
  return getErrorStringProperty(error, "code") ?? getErrorStringProperty(error, "Code");
}

function getStorageErrorName(error: unknown) {
  return error instanceof Error ? error.name : getErrorStringProperty(error, "name");
}

function getStorageStatusCode(error: unknown) {
  return typeof error === "object" && error !== null && "$metadata" in error
    ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    : undefined;
}

function getStorageAttempts(error: unknown) {
  return typeof error === "object" && error !== null && "$metadata" in error
    ? (error as { $metadata?: { attempts?: number } }).$metadata?.attempts
    : undefined;
}

function compactDetails(details: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  );
}

function isNetworkStorageError(error: unknown) {
  const code = getStorageErrorCode(error);
  const name = getStorageErrorName(error);
  const statusCode = getStorageStatusCode(error);

  if (statusCode != null) {
    return false;
  }

  return (
    name === "TimeoutError" ||
    name === "NetworkingError" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    code === "ENETUNREACH" ||
    code === "EHOSTUNREACH" ||
    code === "ECONNREFUSED" ||
    code === "EPIPE"
  );
}

async function readStorageBodyToBytes(body: unknown): Promise<Uint8Array> {
  if (body == null) {
    return new Uint8Array();
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "transformToByteArray" in body &&
    typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function"
  ) {
    const bytes = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];

    for await (const chunk of body) {
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk));
        continue;
      }

      chunks.push(Buffer.from(chunk));
    }

    return new Uint8Array(Buffer.concat(chunks));
  }

  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      chunks.push(value);
      totalLength += value.length;
    }

    const combined = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return combined;
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }

  throw new AppError("File content is unavailable.", 500, "file_stream_unavailable");
}

export class R2Storage implements FileStorage {
  private readonly config: R2Config;
  private client: S3Client | null = null;

  constructor(config: R2Config = getR2Config()) {
    this.config = config;
  }

  getDefaultBucket(): string {
    return this.config.bucketName ?? "files";
  }

  async uploadFile(input: UploadFileRequest): Promise<UploadFileResult> {
    const bucket = input.bucket ?? this.getDefaultBucket();
    const result = await this.sendStorageCommand(
      "put_object",
      (client) =>
        client.send(
          new PutObjectCommand({
            Body: toStorageBody(input.body),
            Bucket: bucket,
            ContentLength: input.contentLength,
            ContentType: input.contentType,
            Key: input.key,
          }),
          {
            abortSignal: input.abortSignal,
          },
        ),
      { bucket, key: input.key },
    );

    return {
      bucket,
      etag: result.ETag ?? null,
      key: input.key,
    };
  }

  async copyFile(input: {
    sourceBucket?: string;
    sourceKey: string;
    destinationBucket?: string;
    destinationKey: string;
  }): Promise<{ bucket: string; key: string; etag: string | null }> {
    const sourceBucket = input.sourceBucket ?? this.getDefaultBucket();
    const destBucket = input.destinationBucket ?? this.getDefaultBucket();
    const destKey = input.destinationKey;

    const copySource = `${sourceBucket}/${encodeStorageKey(input.sourceKey)}`;

    const result = await this.sendStorageCommand(
      "copy_object",
      (client) =>
        client.send(
          new CopyObjectCommand({
            Bucket: destBucket,
            Key: destKey,
            CopySource: copySource,
          }),
        ),
      { bucket: destBucket, key: destKey },
    );

    const copyResult = result as {
      ETag?: string | null;
      CopyObjectResult?: { ETag?: string | null } | null;
    };
    const etag = copyResult.ETag ?? copyResult.CopyObjectResult?.ETag ?? null;

    return {
      bucket: destBucket,
      key: destKey!,
      etag,
    };
  }

  async createMultipartUpload(
    input: CreateMultipartUploadRequest,
  ): Promise<CreateMultipartUploadResult> {
    const bucket = input.bucket ?? this.getDefaultBucket();
    const result = await this.sendStorageCommand(
      "create_multipart_upload",
      (client) =>
        client.send(
          new CreateMultipartUploadCommand({
            Bucket: bucket,
            ContentType: input.contentType,
            Key: input.key,
          }),
        ),
      { bucket, key: input.key },
    );

    if (!result.UploadId) {
      throw new AppError("Multipart upload could not be initiated.", 502, "multipart_upload_init_failed", {
        bucket,
        key: input.key,
      });
    }

    return {
      bucket,
      key: input.key,
      uploadId: result.UploadId,
    };
  }

  async uploadMultipartPart(
    input: UploadMultipartPartRequest,
  ): Promise<UploadMultipartPartResult> {
    const bucket = input.bucket ?? this.getDefaultBucket();
    const result = await this.sendStorageCommand(
      "upload_part",
      (client) =>
        client.send(
          new UploadPartCommand({
            Body: toStorageBody(input.body),
            Bucket: bucket,
            ContentLength: input.contentLength,
            Key: input.key,
            PartNumber: input.partNumber,
            UploadId: input.uploadId,
          }),
          {
            abortSignal: input.abortSignal,
          },
        ),
      {
        bucket,
        key: input.key,
        partNumber: input.partNumber,
        uploadId: input.uploadId,
      },
    );

    if (!result.ETag) {
      throw new AppError("Multipart upload part is missing an ETag.", 502, "multipart_upload_part_missing_etag", {
        bucket,
        key: input.key,
        partNumber: input.partNumber,
        uploadId: input.uploadId,
      });
    }

    return {
      bucket,
      etag: result.ETag,
      key: input.key,
      partNumber: input.partNumber,
      uploadId: input.uploadId,
    };
  }

  async completeMultipartUpload(
    input: CompleteMultipartUploadRequest,
  ): Promise<CompleteMultipartUploadResult> {
    const bucket = input.bucket ?? this.getDefaultBucket();
    const result = await this.sendStorageCommand(
      "complete_multipart_upload",
      (client) =>
        client.send(
          new CompleteMultipartUploadCommand({
            Bucket: bucket,
            Key: input.key,
            MultipartUpload: {
              Parts: [...input.parts]
                .sort((left, right) => left.partNumber - right.partNumber)
                .map((part) => ({
                  ETag: part.etag,
                  PartNumber: part.partNumber,
                })),
            },
            UploadId: input.uploadId,
          }),
          {
            abortSignal: input.abortSignal,
          },
        ),
      { bucket, key: input.key, uploadId: input.uploadId },
    );

    return {
      bucket,
      etag: result.ETag ?? null,
      key: input.key,
      uploadId: input.uploadId,
    };
  }

  async abortMultipartUpload(
    input: AbortMultipartUploadRequest,
  ): Promise<AbortMultipartUploadResult> {
    const client = this.getClient();
    const bucket = input.bucket ?? this.getDefaultBucket();

    try {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: input.key,
          UploadId: input.uploadId,
        }),
      );
    } catch (error) {
      if (isMissingMultipartUploadError(error)) {
        return {
          aborted: false,
          bucket,
          key: input.key,
          skipped: true,
          uploadId: input.uploadId,
        };
      }

      throw this.toStorageAppError("abort_multipart_upload", {
        bucket,
        key: input.key,
        uploadId: input.uploadId,
      }, error);
    }

    return {
      aborted: true,
      bucket,
      key: input.key,
      skipped: false,
      uploadId: input.uploadId,
    };
  }

  async getFile(input: GetFileRequest): Promise<GetFileResult> {
    const client = this.getClient();
    const bucket = input.bucket ?? this.getDefaultBucket();

    let result: GetObjectCommandOutput;
    try {
      result = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: input.key,
        }),
      );
    } catch (error) {
      const errorName =
        typeof error === "object" && error !== null && "name" in error
          ? (error as { name?: string }).name
          : undefined;
      const statusCode =
        typeof error === "object" && error !== null && "$metadata" in error
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
          : undefined;

      if (errorName === "NoSuchKey" || statusCode === 404) {
        throw new AppError("File not found.", 404, "file_not_found", {
          bucket,
          key: input.key,
        });
      }

      throw this.toStorageAppError("get_object", { bucket, key: input.key }, error);
    }

    const body = result.Body as GetFileResult["body"] | undefined;

    if (!body) {
      throw new AppError("File not found.", 404, "file_not_found", {
        bucket,
        key: input.key,
      });
    }

    return {
      bucket,
      body,
      contentLength: typeof result.ContentLength === "number" ? result.ContentLength : null,
      contentType: typeof result.ContentType === "string" ? result.ContentType : null,
      etag: typeof result.ETag === "string" ? result.ETag : null,
      key: input.key,
    };
  }

  async getFileHeaderBytes(
    input: GetFileHeaderBytesRequest,
  ): Promise<GetFileHeaderBytesResult> {
    const client = this.getClient();
    const bucket = input.bucket ?? this.getDefaultBucket();
    const maxBytes = Math.max(1, input.maxBytes ?? 4096);

    let result: GetObjectCommandOutput;
    try {
      result = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: input.key,
          Range: `bytes=0-${maxBytes - 1}`,
        }),
      );
    } catch (error) {
      const errorName =
        typeof error === "object" && error !== null && "name" in error
          ? (error as { name?: string }).name
          : undefined;
      const statusCode =
        typeof error === "object" && error !== null && "$metadata" in error
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
          : undefined;

      if (errorName === "NoSuchKey" || statusCode === 404) {
        throw new AppError("File not found.", 404, "file_not_found", {
          bucket,
          key: input.key,
        });
      }

      throw this.toStorageAppError("get_object", { bucket, key: input.key }, error);
    }

    return {
      bucket,
      bytes: await readStorageBodyToBytes(result.Body),
      key: input.key,
    };
  }

  async headFile(input: HeadFileRequest): Promise<HeadFileResult> {
    const client = this.getClient();
    const bucket = input.bucket ?? this.getDefaultBucket();

    try {
      const result = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: input.key,
        }),
      );

      return {
        bucket,
        contentLength: typeof result.ContentLength === "number" ? result.ContentLength : null,
        contentType: typeof result.ContentType === "string" ? result.ContentType : null,
        etag: typeof result.ETag === "string" ? result.ETag : null,
        exists: true,
        key: input.key,
      };
    } catch (error) {
      const errorName =
        typeof error === "object" && error !== null && "name" in error
          ? (error as { name?: string }).name
          : undefined;
      const statusCode =
        typeof error === "object" && error !== null && "$metadata" in error
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
          : undefined;

      if (errorName === "NoSuchKey" || statusCode === 404) {
        return {
          bucket,
          contentLength: null,
          contentType: null,
          etag: null,
          exists: false,
          key: input.key,
        };
      }

      throw this.toStorageAppError("head_object", { bucket, key: input.key }, error);
    }
  }

  async deleteFile(input: DeleteFileRequest): Promise<DeleteFileResult> {
    const bucket = input.bucket ?? this.getDefaultBucket();
    await this.sendStorageCommand(
      "delete_object",
      (client) =>
        client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: input.key,
          }),
        ),
      { bucket, key: input.key },
    );

    return {
      bucket,
      deleted: true,
      key: input.key,
      skipped: false,
    };
  }

  async listFiles(input: ListFilesRequest): Promise<ListFilesResult> {
    const bucket = input.bucket ?? this.getDefaultBucket();
    const result = await this.sendStorageCommand(
      "list_objects",
      (client) =>
        client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: input.continuationToken,
            MaxKeys: input.maxKeys,
            Prefix: input.prefix,
          }),
        ),
      { bucket },
    );

    return {
      bucket,
      nextContinuationToken: result.NextContinuationToken ?? null,
      objects: (result.Contents ?? [])
        .filter((item): item is NonNullable<typeof item> => Boolean(item?.Key))
        .map((item) => ({
          key: item.Key!,
          lastModified: item.LastModified ?? null,
          sizeBytes: typeof item.Size === "number" ? item.Size : null,
        })),
    };
  }

  async listMultipartUploads(
    input: ListMultipartUploadsRequest,
  ): Promise<ListMultipartUploadsResult> {
    const bucket = input.bucket ?? this.getDefaultBucket();
    const result = await this.sendStorageCommand(
      "list_multipart_uploads",
      (client) =>
        client.send(
          new ListMultipartUploadsCommand({
            Bucket: bucket,
            KeyMarker: input.keyMarker,
            MaxUploads: input.maxUploads,
            Prefix: input.prefix,
            UploadIdMarker: input.uploadIdMarker,
          }),
        ),
      { bucket },
    );

    return {
      bucket,
      nextKeyMarker: result.NextKeyMarker ?? null,
      nextUploadIdMarker: result.NextUploadIdMarker ?? null,
      uploads: (result.Uploads ?? [])
        .filter(
          (upload): upload is NonNullable<typeof upload> =>
            Boolean(upload?.Key && upload?.UploadId),
        )
        .map((upload) => ({
          initiatedAt: upload.Initiated ?? null,
          key: upload.Key!,
          uploadId: upload.UploadId!,
        })),
    };
  }

  async getSignedUrl(input: GetSignedUrlRequest): Promise<GetSignedUrlResult> {
    const bucket = input.bucket ?? this.getDefaultBucket();
    const baseUrl = normalizePublicBaseUrl(this.config.publicBaseUrl);

    if (!baseUrl) {
      return {
        bucket,
        expiresAt: null,
        key: input.key,
        publicUrl: false,
        url: null,
      };
    }

    return {
      bucket,
      expiresAt: null,
      key: input.key,
      publicUrl: true,
      url: `${baseUrl}/${encodeStorageKey(input.key)}`,
    };
  }

  async getPresignedPutObjectUrl(input: {
    bucket?: string;
    key: string;
    contentType?: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string; expiresAt: string | null }> {
    const bucket = input.bucket ?? this.getDefaultBucket();

    if (!hasR2Credentials(this.config)) {
      const baseUrl = normalizePublicBaseUrl(this.config.publicBaseUrl);
      if (baseUrl) {
        return { url: `${baseUrl}/${encodeStorageKey(input.key)}`, expiresAt: null };
      }

      throw new AppError("Cloudflare R2 is not configured for presigning.", 503, "storage_not_configured");
    }

    const client = this.getClient();
    const command = new PutObjectCommand({ Bucket: bucket, Key: input.key, ContentType: input.contentType });
    const expiresIn = input.expiresInSeconds ?? 3600;
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const url = await getSignedUrl(client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return { url, expiresAt };
  }

  async getPresignedGetObjectUrl(input: {
    bucket?: string;
    disposition?: "attachment" | "inline";
    expiresInSeconds?: number;
    filename?: string;
    key: string;
  }): Promise<{ url: string; expiresAt: string | null }> {
    const bucket = input.bucket ?? this.getDefaultBucket();

    const publicResult = await this.getSignedUrl({
      bucket,
      disposition: input.disposition,
      filename: input.filename,
      key: input.key,
    });

    if (publicResult.url) {
      return {
        url: publicResult.url,
        expiresAt: publicResult.expiresAt,
      };
    }

    if (!hasR2Credentials(this.config)) {
      throw new AppError(
        "Cloudflare R2 is not configured for signed downloads.",
        503,
        "storage_not_configured",
      );
    }

    const client = this.getClient();
    const expiresIn = input.expiresInSeconds ?? 900;

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: input.key,
      ResponseContentDisposition: input.filename
        ? `${input.disposition ?? "inline"}; filename="${input.filename.replace(/"/g, "")}"`
        : undefined,
    });

    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const url = await getSignedUrl(client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return {
      url,
      expiresAt,
    };
  }

  async getPresignedMultipartPartUrl(input: {
    bucket?: string;
    key: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds?: number;
  }): Promise<{ url: string; expiresAt: string | null }> {
    const bucket = input.bucket ?? this.getDefaultBucket();

    if (!hasR2Credentials(this.config)) {
      throw new AppError("Cloudflare R2 is not configured for presigning.", 503, "storage_not_configured");
    }

    const client = this.getClient();
    const command = new UploadPartCommand({ Bucket: bucket, Key: input.key, PartNumber: input.partNumber, UploadId: input.uploadId });
    const expiresIn = input.expiresInSeconds ?? 3600;
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const url = await getSignedUrl(client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return { url, expiresAt };
  }

  private getClient() {
    this.assertConfigured();

    if (!this.client) {
      const endpoint = buildR2Endpoint(this.config);

      if (!endpoint) {
        throw new AppError(
          "Cloudflare R2 endpoint is not configured.",
          503,
          "storage_not_configured",
        );
      }

      this.client = new S3Client({
        credentials: {
          accessKeyId: this.config.accessKeyId!,
          secretAccessKey: this.config.secretAccessKey!,
        },
        endpoint,
        forcePathStyle: true,
        maxAttempts: this.config.maxAttempts ?? 3,
        region: "auto",
        requestChecksumCalculation: "WHEN_REQUIRED",
        requestHandler: new NodeHttpHandler({
          connectionTimeout: this.config.connectTimeoutMs ?? 10_000,
          httpsAgent: createR2HttpsAgent(endpoint, this.config.endpointIpOverride),
          requestTimeout: this.config.requestTimeoutMs ?? 30_000,
        }),
        responseChecksumValidation: "WHEN_REQUIRED",
      });
    }

    return this.client;
  }

  private async sendStorageCommand<T>(
    action: string,
    execute: (client: S3Client) => Promise<T>,
    context: R2RequestContext,
  ) {
    try {
      return await execute(this.getClient());
    } catch (error) {
      throw this.toStorageAppError(action, context, error);
    }
  }

  private toStorageAppError(action: string, context: R2RequestContext, error: unknown) {
    if (isAppError(error)) {
      return error;
    }

    const endpoint = buildR2Endpoint(this.config);
    const endpointHost = endpoint ? new URL(endpoint).hostname : undefined;
    const errorCode = getStorageErrorCode(error);
    const errorName = getStorageErrorName(error);
    const statusCode = getStorageStatusCode(error);
    const attempts = getStorageAttempts(error);
    const details = compactDetails({
      action,
      attempts,
      bucket: context.bucket,
      endpointHost,
      errorCode,
      errorMessage: error instanceof Error ? error.message : undefined,
      errorName,
      key: context.key,
      partNumber: context.partNumber,
      requestTimeoutMs: this.config.requestTimeoutMs ?? 30_000,
      statusCode,
      uploadIdPresent: Boolean(context.uploadId),
    });

    if (isNetworkStorageError(error)) {
      return new AppError(
        "Cloudflare R2 did not return an HTTP response. Check R2 endpoint reachability, jurisdiction, DNS, proxy/VPN, or Cloudflare edge status.",
        502,
        "storage_network_error",
        details,
      );
    }

    if (statusCode === 403 || errorName === "AccessDenied") {
      return new AppError(
        "Cloudflare R2 denied the storage request. Check the bucket name, token permissions, account ID, and jurisdiction endpoint.",
        502,
        "storage_access_denied",
        details,
      );
    }

    if (statusCode != null) {
      return new AppError(
        "Cloudflare R2 rejected the storage request.",
        502,
        "storage_upstream_error",
        details,
      );
    }

    return error;
  }

  private assertConfigured() {
    if (!hasR2Credentials(this.config)) {
      throw new AppError(
        "Cloudflare R2 is not configured.",
        503,
        "storage_not_configured",
      );
    }
  }
}

export const r2Storage = new R2Storage();
