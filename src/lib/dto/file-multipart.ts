import type { FileUploadStatus } from "@/lib/dto/file-contracts";

export const MULTIPART_UPLOAD_ABORT_REASONS = [
  "canceled",
  "failed",
] as const;

export type MultipartUploadAbortReason =
  (typeof MULTIPART_UPLOAD_ABORT_REASONS)[number];

export const MultipartUploadAbortReason = {
  Canceled: MULTIPART_UPLOAD_ABORT_REASONS[0],
  Failed: MULTIPART_UPLOAD_ABORT_REASONS[1],
} as const satisfies Record<string, MultipartUploadAbortReason>;

export type MultipartUploadPartDTO = {
  etag: string;
  partNumber: number;
};

export type MultipartUploadSessionDTO = {
  bucket: string;
  fileId: string;
  storageKey: string;
  multipartThresholdBytes: number;
  partSizeBytes: number;
  totalParts: number;
  uploadId: string;
};

export const MULTIPART_UPLOAD_CLIENT_SESSION_STATUSES = [
  "initiated",
  "uploading",
  "uploaded",
  "failed",
  "canceled",
] as const;

export type MultipartUploadClientSessionStatus =
  (typeof MULTIPART_UPLOAD_CLIENT_SESSION_STATUSES)[number];

export const MultipartUploadClientSessionStatus = {
  Canceled: MULTIPART_UPLOAD_CLIENT_SESSION_STATUSES[4],
  Failed: MULTIPART_UPLOAD_CLIENT_SESSION_STATUSES[3],
  Initiated: MULTIPART_UPLOAD_CLIENT_SESSION_STATUSES[0],
  Uploaded: MULTIPART_UPLOAD_CLIENT_SESSION_STATUSES[2],
  Uploading: MULTIPART_UPLOAD_CLIENT_SESSION_STATUSES[1],
} as const satisfies Record<string, MultipartUploadClientSessionStatus>;

export type MultipartUploadClientSession = {
  bucket: string;
  fileId: string;
  partSizeBytes: number;
  status: MultipartUploadClientSessionStatus;
  storageKey: string;
  uploadId: string;
  uploadedParts: MultipartUploadPartDTO[];
};

export type MultipartUploadAbortDTO = {
  aborted: boolean;
  bucket: string;
  fileId: string;
  storageKey: string;
  uploadId: string;
  uploadStatus: FileUploadStatus;
};
