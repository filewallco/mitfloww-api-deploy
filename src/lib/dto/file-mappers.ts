import type { FileRecord, FileVersionRecord } from "@/lib/db/schema/files";
import { FileUploadStatus } from "@/lib/dto/file-contracts";
import type { DeletedFileDTO, FileDTO, FileVersionDTO } from "@/lib/dto/files";
import { createTranslatedTextDTO } from "@/lib/translation/create-translated-text";

type FileDTORecord = Pick<
  FileRecord,
  | "approvalStatus"
  | "approvedVersionId"
  | "createdAt"
  | "currentVersionId"
  | "deletedAt"
  | "extension"
  | "finalDraftVersionId"
  | "finalDraftReportMessage"
  | "finalDraftReportReason"
  | "finalDraftReportStatus"
  | "finalDraftReportedAt"
  | "id"
  | "mimeType"
  | "name"
  | "nameSourceLocale"
  | "originalName"
  | "projectId"
  | "sizeBytes"
  | "updatedAt"
  | "uploadedBy"
  | "uploadStatus"
  | "finalDraftReportSourceLocale"
>;

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toFileVersionDTO(version: FileVersionRecord): FileVersionDTO {
  return {
    id: version.id,
    fileId: version.fileId,
    revisionNumber: version.revisionNumber,

    originalName: version.originalName,
    mimeType: version.mimeType,
    extension: version.extension,
    sizeBytes: version.sizeBytes,

    storageBucket: version.storageBucket,
    storageKey: version.storageKey,

    processedStorageBucket: version.processedStorageBucket,
    processedStorageKey: version.processedStorageKey,
    processedMimeType: version.processedMimeType,
    processedExtension: version.processedExtension,
    processedSizeBytes: version.processedSizeBytes,
    previewStorageBucket: version.previewStorageBucket,
    previewStorageKey: version.previewStorageKey,
    previewRetentionUntil: toIsoString(version.previewRetentionUntil),
    previewPurgedAt: toIsoString(version.previewPurgedAt),

    processingStatus: version.processingStatus,
    processingJobId: version.processingJobId,
    processingErrorCode: version.processingErrorCode,
    processingErrorMessage: version.processingErrorMessage,
    processingAttempts: version.processingAttempts,

    queuedAt: toIsoString(version.queuedAt),
    processingStartedAt: toIsoString(version.processingStartedAt),
    processingCompletedAt: toIsoString(version.processingCompletedAt),
    isFinalDraft: version.isFinalDraft,
    finalDraftDownloadedAt: toIsoString(version.finalDraftDownloadedAt),
    finalDraftDownloadCount: version.finalDraftDownloadCount,
    deletedAt: toIsoString(version.deletedAt),
    deletedBy: version.deletedBy,
    deleteReason: version.deleteReason,

    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
  };
}

export function toFileDTO<T extends FileDTORecord>(
  record: T,
  currentVersion?: FileVersionRecord | null,
): FileDTO {
  const versionDTO = currentVersion ? toFileVersionDTO(currentVersion) : null;

  return {
    approvalStatus: record.approvalStatus,
    approvedVersionId: record.approvedVersionId,
    createdAt: record.createdAt.toISOString(),
    currentVersion: versionDTO,
    currentVersionId: record.currentVersionId ?? currentVersion?.id ?? null,
    deletedAt: toIsoString(record.deletedAt),

    extension: currentVersion?.extension ?? record.extension,
    finalDraftReportMessage: record.finalDraftReportMessage,
    finalDraftReportMessageText: record.finalDraftReportMessage
      ? createTranslatedTextDTO({
          originalText: record.finalDraftReportMessage,
          sourceLocale: record.finalDraftReportSourceLocale,
        })
      : null,
    finalDraftReportReason: record.finalDraftReportReason,
    finalDraftReportStatus: record.finalDraftReportStatus,
    finalDraftReportedAt: toIsoString(record.finalDraftReportedAt),
    id: record.id,
    mimeType: currentVersion?.mimeType ?? record.mimeType,
    name: record.name,
    nameText: createTranslatedTextDTO({
      originalText: record.name,
      sourceLocale: record.nameSourceLocale,
    }),
    originalName: currentVersion?.originalName ?? record.originalName,
    projectId: record.projectId,
    sizeBytes: currentVersion?.sizeBytes ?? record.sizeBytes,
    updatedAt: record.updatedAt.toISOString(),
    uploadedBy: record.uploadedBy,
    uploadStatus: record.uploadStatus,
    finalDraftVersionId: record.finalDraftVersionId,

    processingStatus: currentVersion?.processingStatus ?? null,
    processingJobId: currentVersion?.processingJobId ?? null,
    activeVersionCount: 1,
    hasRevisions: false,
    unresolvedVersionReportCount: 0,
    deleteBlockReason: null,
    deleteRequiresWarning: false,
  };
}

export function toDeletedFileDTO(
  record: Pick<FileRecord, "id">,
  deletedAt: Date,
): DeletedFileDTO {
  return {
    deletedAt: deletedAt.toISOString(),
    id: record.id,
    uploadStatus: FileUploadStatus.Deleted,
  };
}
