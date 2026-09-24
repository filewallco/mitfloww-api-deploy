import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  type PgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  FileUploadStatus,
  FileUploadStatusDb,
  fromFileUploadStatusDbValue,
  toFileUploadStatusDbValue,
} from "@/lib/dto/file-contracts";

export {
  FileUploadStatus,
  FileUploadStatusDb,
  fromFileUploadStatusDbValue,
  toFileUploadStatusDbValue,
};
import type { createProjectTables } from "@/lib/db/schema/projects";

export const FILE_PROCESSING_STATUSES = [
  "queued",
  "processing",
  "uploading",
  "completed",
  "retrying",
  "failed",
  "corrupt",
  "skipped",
  "cancelled",
] as const;

export type FileProcessingStatus = (typeof FILE_PROCESSING_STATUSES)[number];

export const FileProcessingStatus = {
  Queued: "queued",
  Processing: "processing",
  Uploading: "uploading",
  Completed: "completed",
  Retrying: "retrying",
  Failed: "failed",
  Corrupt: "corrupt",
  Skipped: "skipped",
  Cancelled: "cancelled",
} as const satisfies Record<string, FileProcessingStatus>;

export const FILE_PROCESSING_STATUS_DB_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export type FileProcessingStatusDbValue = (typeof FILE_PROCESSING_STATUS_DB_VALUES)[number];
export const FileProcessingStatusDb = {
  Queued: 0,
  Processing: 1,
  Uploading: 2,
  Completed: 3,
  Retrying: 4,
  Failed: 5,
  Corrupt: 6,
  Skipped: 7,
  Cancelled: 8,
} as const;

export function toFileProcessingStatusDbValue(status: unknown): FileProcessingStatusDbValue {
  if (status === FileProcessingStatus.Queued || status === 0 || status === "queued") return FileProcessingStatusDb.Queued;
  if (status === FileProcessingStatus.Processing || status === 1 || status === "processing") return FileProcessingStatusDb.Processing;
  if (status === FileProcessingStatus.Uploading || status === 2 || status === "uploading") return FileProcessingStatusDb.Uploading;
  if (status === FileProcessingStatus.Completed || status === 3 || status === "completed") return FileProcessingStatusDb.Completed;
  if (status === FileProcessingStatus.Retrying || status === 4 || status === "retrying") return FileProcessingStatusDb.Retrying;
  if (status === FileProcessingStatus.Failed || status === 5 || status === "failed") return FileProcessingStatusDb.Failed;
  if (status === FileProcessingStatus.Corrupt || status === 6 || status === "corrupt") return FileProcessingStatusDb.Corrupt;
  if (status === FileProcessingStatus.Skipped || status === 7 || status === "skipped") return FileProcessingStatusDb.Skipped;
  if (status === FileProcessingStatus.Cancelled || status === 8 || status === "cancelled") return FileProcessingStatusDb.Cancelled;
  return FileProcessingStatusDb.Queued;
}

export function fromFileProcessingStatusDbValue(value: unknown): FileProcessingStatus {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case FileProcessingStatusDb.Queued:
      return FileProcessingStatus.Queued;
    case FileProcessingStatusDb.Processing:
      return FileProcessingStatus.Processing;
    case FileProcessingStatusDb.Uploading:
      return FileProcessingStatus.Uploading;
    case FileProcessingStatusDb.Completed:
      return FileProcessingStatus.Completed;
    case FileProcessingStatusDb.Retrying:
      return FileProcessingStatus.Retrying;
    case FileProcessingStatusDb.Failed:
      return FileProcessingStatus.Failed;
    case FileProcessingStatusDb.Corrupt:
      return FileProcessingStatus.Corrupt;
    case FileProcessingStatusDb.Skipped:
      return FileProcessingStatus.Skipped;
    case FileProcessingStatusDb.Cancelled:
      return FileProcessingStatus.Cancelled;
    default:
      return FileProcessingStatus.Queued;
  }
}

export const FILE_PROCESSING_CALLBACK_STATUSES = [
  FileProcessingStatus.Completed,
  FileProcessingStatus.Failed,
  FileProcessingStatus.Corrupt,
] as const;

export type FileProcessingCallbackStatus =
  (typeof FILE_PROCESSING_CALLBACK_STATUSES)[number];

export const FILE_APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;

export type FileApprovalStatus = (typeof FILE_APPROVAL_STATUSES)[number];

export const FileApprovalStatus = {
  Pending: FILE_APPROVAL_STATUSES[0],
  Approved: FILE_APPROVAL_STATUSES[1],
  Rejected: FILE_APPROVAL_STATUSES[2],
} as const satisfies Record<string, FileApprovalStatus>;

export const FILE_APPROVAL_STATUS_DB_VALUES = [0, 1, 2] as const;
export type FileApprovalStatusDbValue = (typeof FILE_APPROVAL_STATUS_DB_VALUES)[number];
export const FileApprovalStatusDb = {
  Pending: 0,
  Approved: 1,
  Rejected: 2,
} as const;

export function toFileApprovalStatusDbValue(status: unknown): FileApprovalStatusDbValue {
  if (status === FileApprovalStatus.Pending || status === 0 || status === "pending") return FileApprovalStatusDb.Pending;
  if (status === FileApprovalStatus.Approved || status === 1 || status === "approved") return FileApprovalStatusDb.Approved;
  if (status === FileApprovalStatus.Rejected || status === 2 || status === "rejected") return FileApprovalStatusDb.Rejected;
  return FileApprovalStatusDb.Pending;
}

export function fromFileApprovalStatusDbValue(value: unknown): FileApprovalStatus {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case FileApprovalStatusDb.Pending:
      return FileApprovalStatus.Pending;
    case FileApprovalStatusDb.Approved:
      return FileApprovalStatus.Approved;
    case FileApprovalStatusDb.Rejected:
      return FileApprovalStatus.Rejected;
    default:
      return FileApprovalStatus.Pending;
  }
}

export const FILE_FINAL_DRAFT_REPORT_STATUSES = [
  "none",
  "reported",
  "under_review",
  "resolved",
  "dismissed",
] as const;

export type FileFinalDraftReportStatus =
  (typeof FILE_FINAL_DRAFT_REPORT_STATUSES)[number];

export const FileFinalDraftReportStatus = {
  None: FILE_FINAL_DRAFT_REPORT_STATUSES[0],
  Reported: FILE_FINAL_DRAFT_REPORT_STATUSES[1],
  UnderReview: FILE_FINAL_DRAFT_REPORT_STATUSES[2],
  Resolved: FILE_FINAL_DRAFT_REPORT_STATUSES[3],
  Dismissed: FILE_FINAL_DRAFT_REPORT_STATUSES[4],
} as const satisfies Record<string, FileFinalDraftReportStatus>;

export const FILE_FINAL_DRAFT_REPORT_STATUS_DB_VALUES = [0, 1, 2, 3, 4] as const;
export type FileFinalDraftReportStatusDbValue = (typeof FILE_FINAL_DRAFT_REPORT_STATUS_DB_VALUES)[number];
export const FileFinalDraftReportStatusDb = {
  None: 0,
  Reported: 1,
  UnderReview: 2,
  Resolved: 3,
  Dismissed: 4,
} as const;

export function toFileFinalDraftReportStatusDbValue(status: unknown): FileFinalDraftReportStatusDbValue {
  if (status === FileFinalDraftReportStatus.None || status === 0 || status === "none") return FileFinalDraftReportStatusDb.None;
  if (status === FileFinalDraftReportStatus.Reported || status === 1 || status === "reported") return FileFinalDraftReportStatusDb.Reported;
  if (status === FileFinalDraftReportStatus.UnderReview || status === 2 || status === "under_review") return FileFinalDraftReportStatusDb.UnderReview;
  if (status === FileFinalDraftReportStatus.Resolved || status === 3 || status === "resolved") return FileFinalDraftReportStatusDb.Resolved;
  if (status === FileFinalDraftReportStatus.Dismissed || status === 4 || status === "dismissed") return FileFinalDraftReportStatusDb.Dismissed;
  return FileFinalDraftReportStatusDb.None;
}

export function fromFileFinalDraftReportStatusDbValue(value: unknown): FileFinalDraftReportStatus {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case FileFinalDraftReportStatusDb.None:
      return FileFinalDraftReportStatus.None;
    case FileFinalDraftReportStatusDb.Reported:
      return FileFinalDraftReportStatus.Reported;
    case FileFinalDraftReportStatusDb.UnderReview:
      return FileFinalDraftReportStatus.UnderReview;
    case FileFinalDraftReportStatusDb.Resolved:
      return FileFinalDraftReportStatus.Resolved;
    case FileFinalDraftReportStatusDb.Dismissed:
      return FileFinalDraftReportStatus.Dismissed;
    default:
      return FileFinalDraftReportStatus.None;
  }
}

export const FILE_VERSION_REPORT_STATUSES = [
  "reported",
  "under_review",
  "resolved",
  "dismissed",
] as const;

export type FileVersionReportStatus =
  (typeof FILE_VERSION_REPORT_STATUSES)[number];

export const FileVersionReportStatus = {
  Reported: FILE_VERSION_REPORT_STATUSES[0],
  UnderReview: FILE_VERSION_REPORT_STATUSES[1],
  Resolved: FILE_VERSION_REPORT_STATUSES[2],
  Dismissed: FILE_VERSION_REPORT_STATUSES[3],
} as const satisfies Record<string, FileVersionReportStatus>;

export const FILE_VERSION_REPORT_STATUS_DB_VALUES = [0, 1, 2, 3] as const;
export type FileVersionReportStatusDbValue = (typeof FILE_VERSION_REPORT_STATUS_DB_VALUES)[number];
export const FileVersionReportStatusDb = {
  Reported: 0,
  UnderReview: 1,
  Resolved: 2,
  Dismissed: 3,
} as const;

export function toFileVersionReportStatusDbValue(status: unknown): FileVersionReportStatusDbValue {
  if (status === FileVersionReportStatus.Reported || status === 0 || status === "reported") return FileVersionReportStatusDb.Reported;
  if (status === FileVersionReportStatus.UnderReview || status === 1 || status === "under_review") return FileVersionReportStatusDb.UnderReview;
  if (status === FileVersionReportStatus.Resolved || status === 2 || status === "resolved") return FileVersionReportStatusDb.Resolved;
  if (status === FileVersionReportStatus.Dismissed || status === 3 || status === "dismissed") return FileVersionReportStatusDb.Dismissed;
  return FileVersionReportStatusDb.Reported;
}

export function fromFileVersionReportStatusDbValue(value: unknown): FileVersionReportStatus {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case FileVersionReportStatusDb.Reported:
      return FileVersionReportStatus.Reported;
    case FileVersionReportStatusDb.UnderReview:
      return FileVersionReportStatus.UnderReview;
    case FileVersionReportStatusDb.Resolved:
      return FileVersionReportStatus.Resolved;
    case FileVersionReportStatusDb.Dismissed:
      return FileVersionReportStatus.Dismissed;
    default:
      return FileVersionReportStatus.Reported;
  }
}

export const FILE_REVISION_NOTE_REPLY_EMAIL_STATUSES = [
  "not_configured",
  "queued",
  "sent",
  "failed",
] as const;

export const FILE_REVISION_COMMENT_REPORT_STATUSES = [
  "reported",
  "under_review",
  "resolved",
  "dismissed",
] as const;

export type FileRevisionCommentReportStatus =
  (typeof FILE_REVISION_COMMENT_REPORT_STATUSES)[number];

export const FileRevisionCommentReportStatus = {
  Reported: FILE_REVISION_COMMENT_REPORT_STATUSES[0],
  UnderReview: FILE_REVISION_COMMENT_REPORT_STATUSES[1],
  Resolved: FILE_REVISION_COMMENT_REPORT_STATUSES[2],
  Dismissed: FILE_REVISION_COMMENT_REPORT_STATUSES[3],
} as const satisfies Record<string, FileRevisionCommentReportStatus>;

export const FILE_REVISION_COMMENT_REPORT_STATUS_DB_VALUES = [0, 1, 2, 3] as const;
export type FileRevisionCommentReportStatusDbValue = (typeof FILE_REVISION_COMMENT_REPORT_STATUS_DB_VALUES)[number];
export const FileRevisionCommentReportStatusDb = {
  Reported: 0,
  UnderReview: 1,
  Resolved: 2,
  Dismissed: 3,
} as const;

export function toFileRevisionCommentReportStatusDbValue(status: unknown): FileRevisionCommentReportStatusDbValue {
  if (status === FileRevisionCommentReportStatus.Reported || status === 0 || status === "reported") return FileRevisionCommentReportStatusDb.Reported;
  if (status === FileRevisionCommentReportStatus.UnderReview || status === 1 || status === "under_review") return FileRevisionCommentReportStatusDb.UnderReview;
  if (status === FileRevisionCommentReportStatus.Resolved || status === 2 || status === "resolved") return FileRevisionCommentReportStatusDb.Resolved;
  if (status === FileRevisionCommentReportStatus.Dismissed || status === 3 || status === "dismissed") return FileRevisionCommentReportStatusDb.Dismissed;
  return FileRevisionCommentReportStatusDb.Reported;
}

export function fromFileRevisionCommentReportStatusDbValue(value: unknown): FileRevisionCommentReportStatus {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case FileRevisionCommentReportStatusDb.Reported:
      return FileRevisionCommentReportStatus.Reported;
    case FileRevisionCommentReportStatusDb.UnderReview:
      return FileRevisionCommentReportStatus.UnderReview;
    case FileRevisionCommentReportStatusDb.Resolved:
      return FileRevisionCommentReportStatus.Resolved;
    case FileRevisionCommentReportStatusDb.Dismissed:
      return FileRevisionCommentReportStatus.Dismissed;
    default:
      return FileRevisionCommentReportStatus.Reported;
  }
}

export const FILE_REVISION_COMMENT_STATUSES = [
  "pending",
  "resolved",
] as const;

export type FileRevisionCommentStatus =
  (typeof FILE_REVISION_COMMENT_STATUSES)[number];

export const FileRevisionCommentStatus = {
  Pending: FILE_REVISION_COMMENT_STATUSES[0],
  Resolved: FILE_REVISION_COMMENT_STATUSES[1],
} as const satisfies Record<string, FileRevisionCommentStatus>;

export const FILE_REVISION_COMMENT_STATUS_DB_VALUES = [0, 1] as const;
export type FileRevisionCommentStatusDbValue = (typeof FILE_REVISION_COMMENT_STATUS_DB_VALUES)[number];
export const FileRevisionCommentStatusDb = {
  Pending: 0,
  Resolved: 1,
} as const;

export function toFileRevisionCommentStatusDbValue(status: unknown): FileRevisionCommentStatusDbValue {
  if (status === FileRevisionCommentStatus.Pending || status === 0 || status === "pending") return FileRevisionCommentStatusDb.Pending;
  if (status === FileRevisionCommentStatus.Resolved || status === 1 || status === "resolved") return FileRevisionCommentStatusDb.Resolved;
  return FileRevisionCommentStatusDb.Pending;
}

export function fromFileRevisionCommentStatusDbValue(value: unknown): FileRevisionCommentStatus {
  const numeric = typeof value === "number" ? value : Number(value);
  switch (numeric) {
    case FileRevisionCommentStatusDb.Pending:
      return FileRevisionCommentStatus.Pending;
    case FileRevisionCommentStatusDb.Resolved:
      return FileRevisionCommentStatus.Resolved;
    default:
      return FileRevisionCommentStatus.Pending;
  }
}

export type FileRevisionNoteReplyEmailStatus =
  (typeof FILE_REVISION_NOTE_REPLY_EMAIL_STATUSES)[number];

export const REVISION_COMMENT_MARKER_TYPES = ["region"] as const;

export type RevisionCommentMarkerType =
  (typeof REVISION_COMMENT_MARKER_TYPES)[number];

export const RevisionCommentMarkerType = {
  Region: REVISION_COMMENT_MARKER_TYPES[0],
} as const satisfies Record<string, RevisionCommentMarkerType>;

export const REVISION_COMMENT_MARKER_TYPE_DB_VALUES = [0] as const;
export type RevisionCommentMarkerTypeDbValue = (typeof REVISION_COMMENT_MARKER_TYPE_DB_VALUES)[number];
export const RevisionCommentMarkerTypeDb = {
  Region: 0,
} as const;

export function toRevisionCommentMarkerTypeDbValue(type: unknown): RevisionCommentMarkerTypeDbValue {
  return RevisionCommentMarkerTypeDb.Region;
}

export function fromRevisionCommentMarkerTypeDbValue(value: unknown): RevisionCommentMarkerType {
  return RevisionCommentMarkerType.Region;
}

export const FileRevisionNoteReplyEmailStatus = {
  Failed: FILE_REVISION_NOTE_REPLY_EMAIL_STATUSES[3],
  NotConfigured: FILE_REVISION_NOTE_REPLY_EMAIL_STATUSES[0],
  Queued: FILE_REVISION_NOTE_REPLY_EMAIL_STATUSES[1],
  Sent: FILE_REVISION_NOTE_REPLY_EMAIL_STATUSES[2],
} as const satisfies Record<string, FileRevisionNoteReplyEmailStatus>;

const fileUploadStatus = customType<{
  data: (typeof FileUploadStatus)[keyof typeof FileUploadStatus];
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toFileUploadStatusDbValue(value);
  },
  fromDriver(value) {
    return fromFileUploadStatusDbValue(value);
  },
});

const fileApprovalStatus = customType<{
  data: FileApprovalStatus;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toFileApprovalStatusDbValue(value);
  },
  fromDriver(value) {
    return fromFileApprovalStatusDbValue(value);
  },
});

const fileFinalDraftReportStatus = customType<{
  data: FileFinalDraftReportStatus;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toFileFinalDraftReportStatusDbValue(value);
  },
  fromDriver(value) {
    return fromFileFinalDraftReportStatusDbValue(value);
  },
});

const fileProcessingStatus = customType<{
  data: FileProcessingStatus;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toFileProcessingStatusDbValue(value);
  },
  fromDriver(value) {
    return fromFileProcessingStatusDbValue(value);
  },
});

const fileVersionReportStatus = customType<{
  data: FileVersionReportStatus;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toFileVersionReportStatusDbValue(value);
  },
  fromDriver(value) {
    return fromFileVersionReportStatusDbValue(value);
  },
});

const fileRevisionCommentStatus = customType<{
  data: FileRevisionCommentStatus;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toFileRevisionCommentStatusDbValue(value);
  },
  fromDriver(value) {
    return fromFileRevisionCommentStatusDbValue(value);
  },
});

const fileRevisionCommentReportStatus = customType<{
  data: FileRevisionCommentReportStatus;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toFileRevisionCommentReportStatusDbValue(value);
  },
  fromDriver(value) {
    return fromFileRevisionCommentReportStatusDbValue(value);
  },
});

const revisionCommentMarkerType = customType<{
  data: RevisionCommentMarkerType;
  driverData: number;
  notNull: true;
  default: true;
}>({
  dataType() {
    return "smallint";
  },
  toDriver(value) {
    return toRevisionCommentMarkerTypeDbValue(value);
  },
  fromDriver(value) {
    return fromRevisionCommentMarkerTypeDbValue(value);
  },
});

const DEFAULT_FILE_UPLOAD_STATUS =
  toFileUploadStatusDbValue(FileUploadStatus.Pending) as unknown as
    (typeof FileUploadStatus)[keyof typeof FileUploadStatus];

const DEFAULT_FILE_APPROVAL_STATUS =
  toFileApprovalStatusDbValue(FileApprovalStatus.Pending) as unknown as FileApprovalStatus;

const DEFAULT_FILE_FINAL_DRAFT_REPORT_STATUS =
  toFileFinalDraftReportStatusDbValue(FileFinalDraftReportStatus.None) as unknown as FileFinalDraftReportStatus;

const DEFAULT_FILE_PROCESSING_STATUS =
  toFileProcessingStatusDbValue(FileProcessingStatus.Queued) as unknown as FileProcessingStatus;

const DEFAULT_FILE_VERSION_REPORT_STATUS =
  toFileVersionReportStatusDbValue(FileVersionReportStatus.Reported) as unknown as FileVersionReportStatus;

const DEFAULT_FILE_REVISION_COMMENT_STATUS =
  toFileRevisionCommentStatusDbValue(FileRevisionCommentStatus.Pending) as unknown as FileRevisionCommentStatus;

const DEFAULT_FILE_REVISION_COMMENT_REPORT_STATUS =
  toFileRevisionCommentReportStatusDbValue(FileRevisionCommentReportStatus.Reported) as unknown as FileRevisionCommentReportStatus;

const DEFAULT_REVISION_COMMENT_MARKER_TYPE =
  toRevisionCommentMarkerTypeDbValue(RevisionCommentMarkerType.Region) as unknown as RevisionCommentMarkerType;

export const createFileTables = (
  fw: PgSchema,
  projects: ReturnType<typeof createProjectTables>["projects"],
) => {
  const files = fw.table(
    "files",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      projectId: uuid("project_id")
        .notNull()
        .references(() => projects.id, { onDelete: "restrict" }),
      name: varchar("name", { length: 120 }).notNull(),
      nameSourceLocale: varchar("name_source_locale", { length: 16 })
        .notNull()
        .default("und"),

      // Compatibility mirror fields.
      // Keep these until all reads are moved to file_versions.
      originalName: varchar("original_name", { length: 255 }).notNull(),
      mimeType: varchar("mime_type", { length: 255 }).notNull(),
      extension: varchar("extension", { length: 16 }).notNull(),
      sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
      storageKey: text("storage_key").notNull(),
      storageBucket: varchar("storage_bucket", { length: 128 })
        .notNull()
        .default("files"),

      currentVersionId: uuid("current_version_id"),
      approvalStatus: fileApprovalStatus("approval_status")
        .notNull()
        .default(DEFAULT_FILE_APPROVAL_STATUS),
      approvedVersionId: uuid("approved_version_id"),
      finalDraftVersionId: uuid("final_draft_version_id"),
      finalDraftReportStatus: fileFinalDraftReportStatus("final_draft_report_status")
        .notNull()
        .default(DEFAULT_FILE_FINAL_DRAFT_REPORT_STATUS),
      finalDraftReportedAt: timestamp("final_draft_reported_at", {
        mode: "date",
        withTimezone: true,
      }),
      finalDraftReportReason: varchar("final_draft_report_reason", {
        length: 120,
      }),
      finalDraftReportMessage: text("final_draft_report_message"),
      finalDraftReportSourceLocale: varchar(
        "final_draft_report_source_locale",
        {
          length: 16,
        },
      )
        .notNull()
        .default("und"),

      uploadStatus: fileUploadStatus("upload_status")
        .notNull()
        .default(DEFAULT_FILE_UPLOAD_STATUS),
      uploadedBy: varchar("uploaded_by", { length: 255 }),
      deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("files_storage_key_unique_idx").on(table.storageKey),
      index("files_project_id_created_at_idx").on(
        table.projectId,
        table.createdAt,
      ),
      index("files_upload_status_created_at_idx").on(
        table.uploadStatus,
        table.createdAt,
      ),
      index("files_current_version_id_idx").on(table.currentVersionId),
      index("files_approved_version_id_idx").on(table.approvedVersionId),
      index("files_final_draft_version_id_idx").on(table.finalDraftVersionId),
      index("files_final_draft_report_status_idx").on(
        table.finalDraftReportStatus,
      ),
      index("files_deleted_at_idx").on(table.deletedAt),
      index("files_created_at_idx").on(table.createdAt),
      index("files_updated_at_idx").on(table.updatedAt),
      check(
        "files_upload_status_check",
        sql`${table.uploadStatus} >= 0 AND ${table.uploadStatus} <= 3`,
      ),
      check(
        "files_approval_status_check",
        sql`${table.approvalStatus} >= 0 AND ${table.approvalStatus} <= 2`,
      ),
      check(
        "files_final_draft_report_status_check",
        sql`${table.finalDraftReportStatus} >= 0 AND ${table.finalDraftReportStatus} <= 4`,
      ),
    ],
  );

  const fileVersions = fw.table(
    "file_versions",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      fileId: uuid("file_id")
        .notNull()
        .references(() => files.id, { onDelete: "cascade" }),
      revisionNumber: integer("revision_number").notNull(),
      revisionDescription: text("revision_description"),
      revisionDescriptionSourceLocale: varchar("revision_description_source_locale", {
        length: 16,
      }),

      originalName: varchar("original_name", { length: 255 }).notNull(),
      mimeType: varchar("mime_type", { length: 255 }).notNull(),
      extension: varchar("extension", { length: 16 }).notNull(),
      sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),

      storageBucket: varchar("storage_bucket", { length: 128 }).notNull(),
      storageKey: text("storage_key").notNull(),

      processedStorageBucket: varchar("processed_storage_bucket", {
        length: 128,
      }),
      processedStorageKey: text("processed_storage_key"),
      processedMimeType: varchar("processed_mime_type", { length: 255 }),
      processedExtension: varchar("processed_extension", { length: 16 }),
      processedSizeBytes: bigint("processed_size_bytes", { mode: "number" }),
      watermarkEnabled: boolean("watermark_enabled").notNull().default(false),
      useSoftWatermark: boolean("use_soft_watermark").notNull().default(false),
      isFinalDraft: boolean("is_final_draft").notNull().default(false),
      finalDraftDownloadedAt: timestamp("final_draft_downloaded_at", {
        mode: "date",
        withTimezone: true,
      }),
      finalDraftDownloadCount: integer("final_draft_download_count")
        .notNull()
        .default(0),
      previewRetentionUntil: timestamp("preview_retention_until", {
        mode: "date",
        withTimezone: true,
      }),
      previewPurgedAt: timestamp("preview_purged_at", {
        mode: "date",
        withTimezone: true,
      }),
      previewStorageBucket: varchar("preview_storage_bucket", {
        length: 128,
      }),
      previewStorageKey: text("preview_storage_key"),
      deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
      deletedBy: varchar("deleted_by", { length: 255 }),
      deleteReason: text("delete_reason"),

      processingStatus: fileProcessingStatus("processing_status")
        .notNull()
        .default(DEFAULT_FILE_PROCESSING_STATUS),
      processingJobId: varchar("processing_job_id", { length: 128 }),
      processingErrorCode: varchar("processing_error_code", { length: 128 }),
      processingErrorMessage: text("processing_error_message"),
      processingAttempts: integer("processing_attempts").notNull().default(0),

      queuedAt: timestamp("queued_at", { mode: "date", withTimezone: true }),
      processingStartedAt: timestamp("processing_started_at", {
        mode: "date",
        withTimezone: true,
      }),
      processingCompletedAt: timestamp("processing_completed_at", {
        mode: "date",
        withTimezone: true,
      }),

      uploadedBy: varchar("uploaded_by", { length: 255 }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("file_versions_file_revision_unique").on(
        table.fileId,
        table.revisionNumber,
      ),
      uniqueIndex("file_versions_storage_key_unique").on(table.storageKey),
      uniqueIndex("file_versions_processed_storage_key_unique").on(
        table.processedStorageKey,
      ),
      index("file_versions_file_id_idx").on(table.fileId),
      index("file_versions_processing_job_id_idx").on(table.processingJobId),
      index("file_versions_processing_status_idx").on(table.processingStatus),
      index("file_versions_deleted_at_idx").on(table.deletedAt),
      index("file_versions_preview_retention_until_idx").on(
        table.previewRetentionUntil,
      ),
      check(
        "file_versions_revision_number_check",
        sql`${table.revisionNumber} >= 1`,
      ),
      check(
        "file_versions_final_draft_download_count_check",
        sql`${table.finalDraftDownloadCount} >= 0`,
      ),
      check(
        "file_versions_processing_status_check",
        sql`${table.processingStatus} >= 0 AND ${table.processingStatus} <= 8`,
      ),
    ],
  );

  const revisionComments = fw.table(
    "revision_comments",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      fileId: uuid("file_id")
        .notNull()
        .references(() => files.id, { onDelete: "cascade" }),
      fileVersionId: uuid("file_version_id")
        .notNull()
        .references(() => fileVersions.id, { onDelete: "cascade" }),
      projectId: uuid("project_id")
        .notNull()
        .references(() => projects.id, { onDelete: "restrict" }),
      body: text("body").notNull(),
      sourceLocale: varchar("source_locale", { length: 16 })
        .notNull()
        .default("und"),
      status: fileRevisionCommentStatus("status")
        .notNull()
        .default(DEFAULT_FILE_REVISION_COMMENT_STATUS),
      createdBy: varchar("created_by", { length: 255 }),
      updatedBy: varchar("updated_by", { length: 255 }),
      deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index("revision_comments_file_version_created_at_idx").on(
        table.fileId,
        table.fileVersionId,
        table.createdAt,
      ),
      index("revision_comments_project_id_idx").on(table.projectId),
      index("revision_comments_status_idx").on(table.status),
      index("revision_comments_created_at_idx").on(table.createdAt),
      check(
        "revision_comments_status_check",
        sql`${table.status} >= 0 AND ${table.status} <= 1`,
      ),
    ],
  );

  const revisionCommentMarkers = fw.table(
    "revision_comment_markers",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      commentId: uuid("comment_id")
        .notNull()
        .references(() => revisionComments.id, { onDelete: "cascade" }),
      fileId: uuid("file_id")
        .notNull()
        .references(() => files.id, { onDelete: "cascade" }),
      fileVersionId: uuid("file_version_id")
        .notNull()
        .references(() => fileVersions.id, { onDelete: "cascade" }),
      projectId: uuid("project_id")
        .notNull()
        .references(() => projects.id, { onDelete: "restrict" }),
      type: revisionCommentMarkerType("type")
        .notNull()
        .default(DEFAULT_REVISION_COMMENT_MARKER_TYPE),
      labelNumber: integer("label_number").notNull(),
      pageNumber: integer("page_number"),
      xBp: integer("x_bp").notNull(),
      yBp: integer("y_bp").notNull(),
      widthBp: integer("width_bp").notNull(),
      heightBp: integer("height_bp").notNull(),
      deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index("revision_comment_markers_comment_id_idx").on(table.commentId),
      index("revision_comment_markers_file_version_idx").on(
        table.fileId,
        table.fileVersionId,
      ),
      index("revision_comment_markers_project_id_idx").on(table.projectId),
      index("revision_comment_markers_deleted_at_idx").on(table.deletedAt),
      check(
        "revision_comment_markers_type_check",
        sql`${table.type} >= 0`,
      ),
      check(
        "revision_comment_markers_label_number_check",
        sql`${table.labelNumber} >= 1`,
      ),
      check(
        "revision_comment_markers_page_number_check",
        sql`${table.pageNumber} IS NULL OR ${table.pageNumber} >= 1`,
      ),
      check(
        "revision_comment_markers_x_bp_check",
        sql`${table.xBp} >= 0 AND ${table.xBp} <= 10000`,
      ),
      check(
        "revision_comment_markers_y_bp_check",
        sql`${table.yBp} >= 0 AND ${table.yBp} <= 10000`,
      ),
      check(
        "revision_comment_markers_width_bp_check",
        sql`${table.widthBp} >= 1 AND ${table.widthBp} <= 10000`,
      ),
      check(
        "revision_comment_markers_height_bp_check",
        sql`${table.heightBp} >= 1 AND ${table.heightBp} <= 10000`,
      ),
    ],
  );

  const revisionCommentItems = fw.table(
    "revision_comment_items",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      commentId: uuid("comment_id")
        .notNull()
        .references(() => revisionComments.id, { onDelete: "cascade" }),
      markerId: uuid("marker_id")
        .notNull()
        .references(() => revisionCommentMarkers.id, { onDelete: "cascade" }),
      fileId: uuid("file_id")
        .notNull()
        .references(() => files.id, { onDelete: "cascade" }),
      fileVersionId: uuid("file_version_id")
        .notNull()
        .references(() => fileVersions.id, { onDelete: "cascade" }),
      projectId: uuid("project_id")
        .notNull()
        .references(() => projects.id, { onDelete: "restrict" }),
      labelNumber: integer("label_number").notNull(),
      body: text("body").notNull(),
      sourceLocale: varchar("source_locale", { length: 16 })
        .notNull()
        .default("und"),
      completed: boolean("completed").notNull().default(false),
      completedAt: timestamp("completed_at", { mode: "date", withTimezone: true }),
      completedBy: varchar("completed_by", { length: 255 }),
      deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("revision_comment_items_marker_id_unique").on(table.markerId),
      index("revision_comment_items_comment_id_idx").on(table.commentId),
      index("revision_comment_items_file_version_idx").on(
        table.fileId,
        table.fileVersionId,
      ),
      index("revision_comment_items_project_id_idx").on(table.projectId),
      index("revision_comment_items_completed_idx").on(table.completed),
      index("revision_comment_items_deleted_at_idx").on(table.deletedAt),
      check(
        "revision_comment_items_label_number_check",
        sql`${table.labelNumber} >= 1`,
      ),
    ],
  );

  const revisionCommentReplies = fw.table(
    "revision_comment_replies",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      commentId: uuid("comment_id")
        .notNull()
        .references(() => revisionComments.id, { onDelete: "cascade" }),
      body: text("body").notNull(),
      sourceLocale: varchar("source_locale", { length: 16 })
        .notNull()
        .default("und"),
      deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      uniqueIndex("revision_comment_replies_comment_id_unique").on(
        table.commentId,
      ),
      index("revision_comment_replies_comment_id_idx").on(table.commentId),
      index("revision_comment_replies_deleted_at_idx").on(table.deletedAt),
    ],
  );

  const fileVersionReports = fw.table(
    "file_version_reports",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      projectId: uuid("project_id")
        .notNull()
        .references(() => projects.id, { onDelete: "restrict" }),
      fileId: uuid("file_id")
        .notNull()
        .references(() => files.id, { onDelete: "cascade" }),
      fileVersionId: uuid("file_version_id")
        .notNull()
        .references(() => fileVersions.id, { onDelete: "cascade" }),
      reason: varchar("reason", { length: 120 }).notNull(),
      message: text("message"),
      sourceLocale: varchar("source_locale", { length: 16 })
        .notNull()
        .default("und"),
      status: fileVersionReportStatus("status")
        .notNull()
        .default(DEFAULT_FILE_VERSION_REPORT_STATUS),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index("file_version_reports_project_id_idx").on(table.projectId),
      index("file_version_reports_file_id_idx").on(table.fileId),
      index("file_version_reports_file_version_id_idx").on(table.fileVersionId),
      index("file_version_reports_status_idx").on(table.status),
      check(
        "file_version_reports_status_check",
        sql`${table.status} >= 0 AND ${table.status} <= 3`,
      ),
    ],
  );

  const revisionCommentReports = fw.table(
    "revision_comment_reports",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      projectId: uuid("project_id")
        .notNull()
        .references(() => projects.id, { onDelete: "restrict" }),
      fileVersionId: uuid("file_version_id")
        .notNull()
        .references(() => fileVersions.id, { onDelete: "cascade" }),
      commentId: uuid("comment_id").references(() => revisionComments.id, {
        onDelete: "cascade",
      }),
      replyId: uuid("reply_id").references(() => revisionCommentReplies.id, {
        onDelete: "cascade",
      }),
      reporterId: varchar("reporter_id", { length: 255 }).notNull(),
      reason: varchar("reason", { length: 120 }).notNull(),
      message: text("message"),
      sourceLocale: varchar("source_locale", { length: 16 })
        .notNull()
        .default("und"),
      status: fileRevisionCommentReportStatus("status")
        .notNull()
        .default(DEFAULT_FILE_REVISION_COMMENT_REPORT_STATUS),
      createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index("revision_comment_reports_project_id_idx").on(table.projectId),
      index("revision_comment_reports_comment_id_idx").on(table.commentId),
      index("revision_comment_reports_reply_id_idx").on(table.replyId),
      index("revision_comment_reports_reporter_id_idx").on(table.reporterId),
      index("revision_comment_reports_status_idx").on(table.status),
      check(
        "revision_comment_reports_target_check",
        sql`(${table.commentId} IS NOT NULL AND ${table.replyId} IS NULL) OR (${table.commentId} IS NULL AND ${table.replyId} IS NOT NULL)`,
      ),
      check(
        "revision_comment_reports_status_check",
        sql`${table.status} >= 0 AND ${table.status} <= 3`,
      ),
    ],
  );

  return {
    files,
    fileVersions,
    revisionComments,
    revisionCommentMarkers,
    revisionCommentItems,
    revisionCommentReplies,
    revisionCommentReports,
    fileVersionReports,
  };
};

export type FileRecord = InferSelectModel<
  ReturnType<typeof createFileTables>["files"]
>;
export type NewFileRecord = InferInsertModel<
  ReturnType<typeof createFileTables>["files"]
>;

export type FileVersionRecord = InferSelectModel<
  ReturnType<typeof createFileTables>["fileVersions"]
>;
export type NewFileVersionRecord = InferInsertModel<
  ReturnType<typeof createFileTables>["fileVersions"]
>;

export type RevisionCommentRecord = InferSelectModel<
  ReturnType<typeof createFileTables>["revisionComments"]
>;
export type NewRevisionCommentRecord = InferInsertModel<
  ReturnType<typeof createFileTables>["revisionComments"]
>;

export type RevisionCommentMarkerRecord = InferSelectModel<
  ReturnType<typeof createFileTables>["revisionCommentMarkers"]
>;
export type NewRevisionCommentMarkerRecord = InferInsertModel<
  ReturnType<typeof createFileTables>["revisionCommentMarkers"]
>;

export type RevisionCommentItemRecord = InferSelectModel<
  ReturnType<typeof createFileTables>["revisionCommentItems"]
>;
export type NewRevisionCommentItemRecord = InferInsertModel<
  ReturnType<typeof createFileTables>["revisionCommentItems"]
>;

export type RevisionCommentReplyRecord = InferSelectModel<
  ReturnType<typeof createFileTables>["revisionCommentReplies"]
>;
export type NewRevisionCommentReplyRecord = InferInsertModel<
  ReturnType<typeof createFileTables>["revisionCommentReplies"]
>;

export type FileVersionReportRecord = InferSelectModel<
  ReturnType<typeof createFileTables>["fileVersionReports"]
>;
export type NewFileVersionReportRecord = InferInsertModel<
  ReturnType<typeof createFileTables>["fileVersionReports"]
>;

export type RevisionCommentReportRecord = InferSelectModel<
  ReturnType<typeof createFileTables>["revisionCommentReports"]
>;
export type NewRevisionCommentReportRecord = InferInsertModel<
  ReturnType<typeof createFileTables>["revisionCommentReports"]
>;