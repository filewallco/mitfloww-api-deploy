export const STORAGE_SCOPE_TYPES = ["personal", "workspace"] as const;

export type StorageScopeType = (typeof STORAGE_SCOPE_TYPES)[number];

export const StorageScopeType = {
  Personal: STORAGE_SCOPE_TYPES[0],
  Workspace: STORAGE_SCOPE_TYPES[1],
} as const satisfies Record<string, StorageScopeType>;

export const STORAGE_SCOPE_TYPE_DB_VALUES = [0, 1] as const;
export type StorageScopeTypeDbValue = (typeof STORAGE_SCOPE_TYPE_DB_VALUES)[number];
export const StorageScopeTypeDb = {
  Personal: 0,
  Workspace: 1,
} as const;

export function toStorageScopeTypeDbValue(scope: unknown): StorageScopeTypeDbValue {
  if (scope === StorageScopeType.Personal || scope === 0 || scope === "personal") return StorageScopeTypeDb.Personal;
  if (scope === StorageScopeType.Workspace || scope === 1 || scope === "workspace") return StorageScopeTypeDb.Workspace;
  return StorageScopeTypeDb.Personal;
}

export function fromStorageScopeTypeDbValue(value: unknown): StorageScopeType {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case StorageScopeTypeDb.Personal:
      return StorageScopeType.Personal;
    case StorageScopeTypeDb.Workspace:
      return StorageScopeType.Workspace;
    default:
      return StorageScopeType.Personal;
  }
}

export const STORAGE_MUTATION_OPERATIONS = [
  "commit",
  "release",
  "adjustment",
] as const;

export type StorageMutationOperation =
  (typeof STORAGE_MUTATION_OPERATIONS)[number];

export const StorageMutationOperation = {
  Commit: STORAGE_MUTATION_OPERATIONS[0],
  Release: STORAGE_MUTATION_OPERATIONS[1],
  Adjustment: STORAGE_MUTATION_OPERATIONS[2],
} as const satisfies Record<string, StorageMutationOperation>;

export const STORAGE_MUTATION_OPERATION_DB_VALUES = [0, 1, 2] as const;
export type StorageMutationOperationDbValue = (typeof STORAGE_MUTATION_OPERATION_DB_VALUES)[number];
export const StorageMutationOperationDb = {
  Commit: 0,
  Release: 1,
  Adjustment: 2,
} as const;

export function toStorageMutationOperationDbValue(operation: unknown): StorageMutationOperationDbValue {
  if (operation === StorageMutationOperation.Commit || operation === 0 || operation === "commit") return StorageMutationOperationDb.Commit;
  if (operation === StorageMutationOperation.Release || operation === 1 || operation === "release") return StorageMutationOperationDb.Release;
  if (operation === StorageMutationOperation.Adjustment || operation === 2 || operation === "adjustment") return StorageMutationOperationDb.Adjustment;
  return StorageMutationOperationDb.Commit;
}

export function fromStorageMutationOperationDbValue(value: unknown): StorageMutationOperation {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case StorageMutationOperationDb.Commit:
      return StorageMutationOperation.Commit;
    case StorageMutationOperationDb.Release:
      return StorageMutationOperation.Release;
    case StorageMutationOperationDb.Adjustment:
      return StorageMutationOperation.Adjustment;
    default:
      return StorageMutationOperation.Commit;
  }
}

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
