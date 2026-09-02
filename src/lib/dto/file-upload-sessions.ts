import type { FileProcessingStatus } from "@/lib/db/schema/files";
import type { ApiErrorDetails, ApiErrorParams } from "@/lib/dto/api";
import type { MultipartUploadPartDTO } from "@/lib/dto/file-multipart";
import type { FileDTO } from "@/lib/dto/files";

export const UPLOAD_SESSION_MODES = ["single", "multipart"] as const;

export type UploadSessionMode = (typeof UPLOAD_SESSION_MODES)[number];

export const UploadSessionMode = {
  Multipart: UPLOAD_SESSION_MODES[1],
  Single: UPLOAD_SESSION_MODES[0],
} as const satisfies Record<string, UploadSessionMode>;

export type UploadSessionDTO = {
  allowLargeUploads: boolean;
  bucket: string;
  fileId: string;
  isFinalDraft: boolean;
  localFileId: string;
  mode: UploadSessionMode;
  multipartThresholdBytes: number;
  partSizeBytes: number;
  storageKey: string;
  totalParts: number;
  uploadId: string | null;
  uploadSessionId: string;
};

export type UploadedObjectDTO = {
  bucket: string;
  storageKey: string;
  uploadId: string | null;
};

export const UPLOAD_CLIENT_SESSION_STATUSES = [
  "initiated",
  "uploading",
  "ready",
  "failed",
  "canceled",
] as const;

export type UploadClientSessionStatus =
  (typeof UPLOAD_CLIENT_SESSION_STATUSES)[number];

export const UploadClientSessionStatus = {
  Canceled: UPLOAD_CLIENT_SESSION_STATUSES[4],
  Failed: UPLOAD_CLIENT_SESSION_STATUSES[3],
  Initiated: UPLOAD_CLIENT_SESSION_STATUSES[0],
  Ready: UPLOAD_CLIENT_SESSION_STATUSES[2],
  Uploading: UPLOAD_CLIENT_SESSION_STATUSES[1],
} as const satisfies Record<string, UploadClientSessionStatus>;

export type UploadClientSession = UploadSessionDTO & {
  status: UploadClientSessionStatus;
  uploadedParts: MultipartUploadPartDTO[];
};

export type WatermarkCreditInputDTO = {
  durationMinutes?: number;
  mediaType: "image" | "pdf" | "video";
  pageCount?: number;
  priorityProcessing?: boolean;
  resolutionClass?: "720p" | "1080p" | "4k";
};

export type CommitUploadedFileInput = {
  bucket: string;
  extension: string;
  fileId: string;
  localFileId: string;
  mimeType: string;
  name: string;
  originalName: string;
  sizeBytes: number;
  storageKey: string;
  watermarkCreditInput?: WatermarkCreditInputDTO | null;
  watermarkEnabled?: boolean;
};

export type CommitUploadedFilesInput = {
  allowLargeUploads: boolean;
  files: CommitUploadedFileInput[];
  projectId: string;
  revisionDescription?: string | null;
  useSoftWatermark?: boolean;
};

export type CommittedUploadedFileDTO = {
  file: FileDTO;
  localFileId: string;
  fileVersionId?: string | null;
  processingErrorCode?: string | null;
  processingErrorMessage?: string | null;
  processingJobId?: string | null;
  processingStatus?: FileProcessingStatus | null;
};

export type CommitUploadedFileFailureDTO = {
  code: string;
  details?: ApiErrorDetails | null;
  localFileId: string;
  message: string;
  messageKey?: string;
  params?: ApiErrorParams;
  requestId?: string;
};

export type CommitUploadedFilesResultDTO = {
  committed: CommittedUploadedFileDTO[];
  failed: CommitUploadedFileFailureDTO[];
};

export const UPLOADED_OBJECT_CLEANUP_REASONS = ["canceled", "failed"] as const;

export type UploadedObjectCleanupReason =
  (typeof UPLOADED_OBJECT_CLEANUP_REASONS)[number];

export const UploadedObjectCleanupReason = {
  Canceled: UPLOADED_OBJECT_CLEANUP_REASONS[0],
  Failed: UPLOADED_OBJECT_CLEANUP_REASONS[1],
} as const satisfies Record<string, UploadedObjectCleanupReason>;

export type UploadedObjectCleanupResultDTO = {
  aborted: boolean;
  bucket: string;
  reason: UploadedObjectCleanupReason;
  storageKey: string;
  uploadId: string;
};

export type UploadedObjectDeleteResultDTO = {
  bucket: string;
  deleted: boolean;
  storageKey: string;
  uploadId: string | null;
};

export type OrphanedUploadCleanupItemDTO = {
  action: "abort_multipart" | "delete_object" | "keep" | "skip";
  error?: string;
  kind: "multipart" | "object";
  lastModified: string | null;
  storageKey: string;
  uploadId: string | null;
};

export type OrphanedUploadCleanupResultDTO = {
  abortedMultipartUploads: number;
  checkedMultipartUploads: number;
  checkedObjects: number;
  deletedObjects: number;
  dryRun: boolean;
  items: OrphanedUploadCleanupItemDTO[];
  olderThanHours: number;
};