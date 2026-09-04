import type { FileUploadStatus } from "@/lib/dto/file-contracts";
import type {
  FileApprovalStatus,
  FileFinalDraftReportStatus,
  FileProcessingStatus,
} from "@/lib/db/schema/files";
import type { TranslatedTextDTO } from "@/lib/dto/translated-text";

export const FILE_DELETE_BLOCK_REASONS = [
  "revisions_exist",
  "protected_revisions_exist",
  "version_under_review",
  "final_draft_locked",
  "processing_active",
] as const;

export type FileDeleteBlockReason =
  (typeof FILE_DELETE_BLOCK_REASONS)[number];

export const FILE_VERSION_DELETE_BLOCK_REASONS = [
  "last_remaining_version",
  "version_under_review",
  "final_draft_locked",
  "processing_active",
] as const;

export type FileVersionDeleteBlockReason =
  (typeof FILE_VERSION_DELETE_BLOCK_REASONS)[number];

export type FileVersionDTO = {
  id: string;
  fileId: string;
  revisionNumber: number;

  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;

  storageBucket: string;
  storageKey: string;

  processedStorageBucket: string | null;
  processedStorageKey: string | null;
  processedMimeType: string | null;
  processedExtension: string | null;
  processedSizeBytes: number | null;
  previewStorageBucket: string | null;
  previewStorageKey: string | null;
  previewRetentionUntil: string | null;
  previewPurgedAt: string | null;

  processingStatus: FileProcessingStatus;
  processingJobId: string | null;
  processingErrorCode: string | null;
  processingErrorMessage: string | null;
  processingAttempts: number;

  queuedAt: string | null;
  processingStartedAt: string | null;
  processingCompletedAt: string | null;
  isFinalDraft: boolean;
  finalDraftDownloadedAt: string | null;
  finalDraftDownloadCount: number;
  deletedAt: string | null;
  deletedBy: string | null;
  deleteReason: string | null;

  createdAt: string;
  updatedAt: string;
};

export type FileDTO = {
  createdAt: string;
  deletedAt: string | null;
  extension: string;
  id: string;
  mimeType: string;
  name: string;
  nameText: TranslatedTextDTO;
  originalName: string;
  projectId: string;
  sizeBytes: number;
  updatedAt: string;
  uploadedBy: string | null;
  uploadStatus: FileUploadStatus;

  currentVersionId: string | null;
  approvalStatus: FileApprovalStatus;
  approvedVersionId: string | null;
  currentVersion: FileVersionDTO | null;
  finalDraftVersionId: string | null;
  finalDraftReportStatus: FileFinalDraftReportStatus;
  finalDraftReportedAt: string | null;
  finalDraftReportReason: string | null;
  finalDraftReportMessage: string | null;
  finalDraftReportMessageText: TranslatedTextDTO | null;

  processingStatus: FileProcessingStatus | null;
  processingJobId: string | null;
  activeVersionCount: number;
  hasRevisions: boolean;
  unresolvedVersionReportCount: number;
  deleteBlockReason: FileDeleteBlockReason | null;
  deleteRequiresWarning: boolean;
};

export type DeletedFileDTO = {
  deletedAt: string;
  id: string;
  uploadStatus: "deleted";
};

export type DeletedFileVersionDTO = {
  deletedAt: string;
  fileId: string;
  nextSelectedVersionId: string | null;
  versionId: string;
};
