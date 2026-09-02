export const FILE_UPLOAD_STATUSES = [
  "pending",
  "uploaded",
  "failed",
  "deleted",
] as const;

export const CREATABLE_FILE_UPLOAD_STATUSES = ["pending"] as const;

export const UPDATABLE_FILE_UPLOAD_STATUSES = [
  "pending",
  "uploaded",
  "failed",
] as const;

export type FileUploadStatus = (typeof FILE_UPLOAD_STATUSES)[number];

export type CreatableFileUploadStatus = (typeof CREATABLE_FILE_UPLOAD_STATUSES)[number];

export type UpdatableFileUploadStatus = (typeof UPDATABLE_FILE_UPLOAD_STATUSES)[number];

export const FileUploadStatus = {
  Pending: FILE_UPLOAD_STATUSES[0],
  Uploaded: FILE_UPLOAD_STATUSES[1],
  Failed: FILE_UPLOAD_STATUSES[2],
  Deleted: FILE_UPLOAD_STATUSES[3],
} as const;

/**
 * DB integer enum values for storing file statuses.
 *
 * Keep these stable and only append new values at the end if needed.
 */
export const FILE_UPLOAD_STATUS_DB_VALUES = [0, 1, 2, 3] as const;
export type FileUploadStatusDbValue = (typeof FILE_UPLOAD_STATUS_DB_VALUES)[number];
export const FileUploadStatusDb = {
  Pending: FILE_UPLOAD_STATUS_DB_VALUES[0],
  Uploaded: FILE_UPLOAD_STATUS_DB_VALUES[1],
  Failed: FILE_UPLOAD_STATUS_DB_VALUES[2],
  Deleted: FILE_UPLOAD_STATUS_DB_VALUES[3],
} as const;

export function toFileUploadStatusDbValue(status: FileUploadStatus): FileUploadStatusDbValue {
  switch (status) {
    case FileUploadStatus.Pending:
      return FileUploadStatusDb.Pending;
    case FileUploadStatus.Uploaded:
      return FileUploadStatusDb.Uploaded;
    case FileUploadStatus.Failed:
      return FileUploadStatusDb.Failed;
    case FileUploadStatus.Deleted:
      return FileUploadStatusDb.Deleted;
  }
}

export function fromFileUploadStatusDbValue(value: unknown): FileUploadStatus {
  if (value == null) {
    throw new Error(`Unknown file upload status db value: ${String(value)}`);
  }

  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    throw new Error(`Unknown file upload status db value: ${String(value)}`);
  }

  switch (numeric) {
    case FileUploadStatusDb.Pending:
      return FileUploadStatus.Pending;
    case FileUploadStatusDb.Uploaded:
      return FileUploadStatus.Uploaded;
    case FileUploadStatusDb.Failed:
      return FileUploadStatus.Failed;
    case FileUploadStatusDb.Deleted:
      return FileUploadStatus.Deleted;
    default:
      throw new Error(`Unknown file upload status db value: ${String(value)}`);
  }
}
