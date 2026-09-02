export const STORAGE_SCOPE_TYPES = ["personal", "workspace"] as const;

export type StorageScopeType = (typeof STORAGE_SCOPE_TYPES)[number];

export const STORAGE_MUTATION_OPERATIONS = [
  "commit",
  "release",
  "adjustment",
] as const;

export type StorageMutationOperation =
  (typeof STORAGE_MUTATION_OPERATIONS)[number];

export type StorageLedgerMetadata = Record<
  string,
  boolean | number | string | null
>;

import { Readable } from "stream";

export type UploadBody = ArrayBuffer | Uint8Array | Readable;

export type UploadFileRequest = {
  abortSignal?: AbortSignal;
  body: UploadBody;
  bucket?: string;
  contentLength?: number;
  contentType: string;
  key: string;
};

export type UploadFileResult = {
  bucket: string;
  etag: string | null;
  key: string;
};

export type CreateMultipartUploadRequest = {
  bucket?: string;
  contentType: string;
  key: string;
};

export type CreateMultipartUploadResult = {
  bucket: string;
  key: string;
  uploadId: string;
};

export type MultipartUploadPart = {
  etag: string;
  partNumber: number;
};

export type UploadMultipartPartRequest = {
  abortSignal?: AbortSignal;
  body: ArrayBuffer | Uint8Array;
  bucket?: string;
  contentLength: number;
  key: string;
  partNumber: number;
  uploadId: string;
};

export type UploadMultipartPartResult = {
  bucket: string;
  etag: string;
  key: string;
  partNumber: number;
  uploadId: string;
};

export type CompleteMultipartUploadRequest = {
  abortSignal?: AbortSignal;
  bucket?: string;
  key: string;
  parts: MultipartUploadPart[];
  uploadId: string;
};

export type CompleteMultipartUploadResult = {
  bucket: string;
  etag: string | null;
  key: string;
  uploadId: string;
};

export type AbortMultipartUploadRequest = {
  bucket?: string;
  key: string;
  uploadId: string;
};

export type AbortMultipartUploadResult = {
  aborted: boolean;
  bucket: string;
  key: string;
  skipped: boolean;
  uploadId: string;
};

export type DeleteFileRequest = {
  bucket?: string;
  key: string;
};

export type DeleteFileResult = {
  bucket: string;
  deleted: boolean;
  key: string;
  skipped: boolean;
};

export type GetFileRequest = {
  bucket?: string;
  key: string;
};

export type HeadFileRequest = {
  bucket?: string;
  key: string;
};

export type HeadFileResult = {
  bucket: string;
  contentLength: number | null;
  contentType: string | null;
  etag: string | null;
  exists: boolean;
  key: string;
};

export type GetFileResult = {
  bucket: string;
  body: Readable | ReadableStream<Uint8Array>;
  contentLength: number | null;
  contentType: string | null;
  etag: string | null;
  key: string;
};

export type GetFileHeaderBytesRequest = {
  bucket?: string;
  key: string;
  maxBytes?: number;
};

export type GetFileHeaderBytesResult = {
  bucket: string;
  bytes: Uint8Array;
  key: string;
};

export type GetSignedUrlRequest = {
  bucket?: string;
  disposition?: "attachment" | "inline";
  expiresInSeconds?: number;
  filename?: string;
  key: string;
};

export type GetSignedUrlResult = {
  bucket: string;
  expiresAt: string | null;
  key: string;
  publicUrl: boolean;
  url: string | null;
};

export type ListFilesRequest = {
  bucket?: string;
  continuationToken?: string;
  maxKeys?: number;
  prefix?: string;
};

export type ListedFileObject = {
  key: string;
  lastModified: Date | null;
  sizeBytes: number | null;
};

export type ListFilesResult = {
  bucket: string;
  nextContinuationToken: string | null;
  objects: ListedFileObject[];
};

export type ListMultipartUploadsRequest = {
  bucket?: string;
  keyMarker?: string;
  maxUploads?: number;
  prefix?: string;
  uploadIdMarker?: string;
};

export type ListedMultipartUpload = {
  initiatedAt: Date | null;
  key: string;
  uploadId: string;
};

export type ListMultipartUploadsResult = {
  bucket: string;
  nextKeyMarker: string | null;
  nextUploadIdMarker: string | null;
  uploads: ListedMultipartUpload[];
};

export interface FileStorage {
  abortMultipartUpload(input: AbortMultipartUploadRequest): Promise<AbortMultipartUploadResult>;
  completeMultipartUpload(
    input: CompleteMultipartUploadRequest,
  ): Promise<CompleteMultipartUploadResult>;
  createMultipartUpload(input: CreateMultipartUploadRequest): Promise<CreateMultipartUploadResult>;
  deleteFile(input: DeleteFileRequest): Promise<DeleteFileResult>;
  getDefaultBucket(): string;
  getFile(input: GetFileRequest): Promise<GetFileResult>;
  getFileHeaderBytes(input: GetFileHeaderBytesRequest): Promise<GetFileHeaderBytesResult>;
  headFile(input: HeadFileRequest): Promise<HeadFileResult>;
  getSignedUrl(input: GetSignedUrlRequest): Promise<GetSignedUrlResult>;
  getPresignedPutObjectUrl?(input: {
    bucket?: string;
    key: string;
    contentType?: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string; expiresAt: string | null }>;
  getPresignedMultipartPartUrl?(input: {
    bucket?: string;
    key: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds?: number;
  }): Promise<{ url: string; expiresAt: string | null }>;
  listFiles(input: ListFilesRequest): Promise<ListFilesResult>;
  listMultipartUploads(input: ListMultipartUploadsRequest): Promise<ListMultipartUploadsResult>;
  uploadFile(input: UploadFileRequest): Promise<UploadFileResult>;
  uploadMultipartPart(input: UploadMultipartPartRequest): Promise<UploadMultipartPartResult>;
  getPresignedGetObjectUrl?(input: {
    bucket?: string;
    disposition?: "attachment" | "inline";
    expiresInSeconds?: number;
    filename?: string;
    key: string;
  }): Promise<{ url: string; expiresAt: string | null }>;
  copyFile(input: {
    sourceBucket?: string;
    sourceKey: string;
    destinationBucket?: string;
    destinationKey: string;
  }): Promise<{ bucket: string; key: string; etag: string | null }>;
}
