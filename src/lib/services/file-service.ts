import { Readable } from "stream";
import {
  isWorkerSupportedUploadExtension,
  standardUploadMaxSizeBytes,
  uploadConfig,
} from "@/config/upload";
import { trimFileTitle } from "@/config/input-limits";
import { defaultLocale } from "@/i18n/config";
import { detectDynamicTextLocale } from "@/lib/i18n/dynamic-locale";
import { FileUploadStatus } from "@/lib/dto/file-contracts";
import { toDeletedFileDTO, toFileDTO } from "@/lib/dto/file-mappers";
import type {
  CommitUploadedFileInput,
  CommitUploadedFilesInput as CommitUploadedFilesPayload,
  CommitUploadedFilesResultDTO,
  OrphanedUploadCleanupResultDTO,
  UploadedObjectCleanupResultDTO,
  UploadedObjectDeleteResultDTO,
  UploadedObjectDTO,
  UploadSessionDTO,
  WatermarkCreditInputDTO,
} from "@/lib/dto/file-upload-sessions";
import type {
  MultipartUploadAbortDTO,
  MultipartUploadAbortReason,
} from "@/lib/dto/file-multipart";
import type {
  DeletedFileDTO,
  DeletedFileVersionDTO,
  FileDTO,
  FileDeleteBlockReason,
  FileVersionDeleteBlockReason,
} from "@/lib/dto/files";
import type {
  ClientShareDeliverableDTO,
  ClientShareFinalDeliverableDTO,
  ClientSharePaymentCompletionResultDTO,
  ClientSharePostPaymentSummaryDTO,
  ClientShareReviewSubmissionResultDTO,
  ClientShareReportReason,
  ClientShareReviewDTO,
} from "@/lib/dto/client-share";
import type { TranslatedTextDTO } from "@/lib/dto/translated-text";
import { AppError, NotFoundAppError, isAppError } from "@/lib/errors/app-error";
import { describeSafeError } from "@/lib/errors/safe-error-response";
import { notificationService } from "@/lib/services/notification-service";
import {
  buildPaginationMeta,
  buildPaginationParams,
  type PaginatedResult,
} from "@/lib/query/pagination";
import {
  DrizzleFileRepository,
  type FileSafetySummary,
  type FileWithVersionsRecord,
  type FileRepository,
} from "@/lib/repositories/file-repository";
import {
  DrizzleProjectRepository,
  type ProjectRepository,
} from "@/lib/repositories/project-repository";
import { type FileStorage, storage } from "@/lib/storage";
import {
  buildManagedUploadStorageKey,
  getRevisionStoragePrefixFromKey,
  isManagedUploadStorageKey,
  MANAGED_UPLOAD_OWNER,
  MANAGED_UPLOAD_STORAGE_KEY_PREFIX,
} from "@/lib/uploads/final-storage-keys";
import {
  getMultipartPartCount,
  getMultipartPartRange,
  resolveMultipartPartSizeBytes,
  shouldUseMultipartUpload,
} from "@/lib/uploads/multipart";
import {
  getStoredUploadValidationHeaderByteCount,
  validateStoredUploadObject,
} from "@/lib/uploads/upload-object-validation";
import type {
  CommitUploadedFilesInput,
  CreateFileInput,
  FileQueryParams,
  OrphanedUploadCleanupInput,
  UpdateFileInput,
  UploadMetadataInput,
  UploadSessionInitInput,
} from "@/lib/validation/files";
import { createHash, randomUUID } from "crypto";
import {
  FileApprovalStatus,
  type FileRecord,
  type FileProcessingCallbackStatus,
  FileFinalDraftReportStatus,
  FileProcessingStatus,
  type ProjectRecord,
  FileVersionReportStatus,
  FileVersionRecord,
} from "@/lib/db/schema";
import {
  buildProcessedStorageKey,
  buildProcessingLogStorageKey,
} from "@/lib/uploads/final-storage-keys";
import { enqueueProcessingJob, getWorkerJobStatus } from "@/lib/processing/worker-client";
import { enMessages } from "@/i18n/messages/en";
import { fileRevisionNoteService } from "@/lib/services/file-revision-note-service";
import type {
  FileReviewAssetKind,
  FileReviewDTO,
  FileReviewPreviewDTO,
  FileReviewPreviewKind,
  FileReviewPreviewSourceDTO,
  FileReviewUploadMode,
  FileReviewVersionDTO,
} from "@/lib/dto/file-review";
import type { CommitProjectFileVersionBody } from "@/lib/validation/file-review";
import { ProjectPaymentStatus, ProjectStatus } from "@/lib/dto/projects";
import { createTranslatedTextDTO } from "@/lib/translation/create-translated-text";
import { UNKNOWN_TRANSLATION_LOCALE } from "@/lib/translation/locales";
import type { CreditFeatureCostParams } from "@/lib/credits";
import { creditService } from "@/lib/services/credit-service";
import { storageService } from "@/lib/services/storage-service";
import { normalizeNullableUuid } from "@/lib/utils";
import { createStoredZip } from "@/lib/utils/zip";
import { resolveActiveActor } from "@/lib/auth/active-actor";

function normalizeProjectId(projectId: string | null | undefined) {
  return normalizeNullableUuid(projectId);
}

function exceedsStandardUploadLimit(sizeBytes: number) {
  return sizeBytes > standardUploadMaxSizeBytes;
}

/**
* Builds a permanent managed-upload key for a new original file record.
*
* The path uses stable project and file IDs instead of editable names, which
* keeps Cloudflare R2 identity stable across renames and future workspace
* storage ownership changes.
*/
function buildStorageKey(
  input: UploadMetadataInput,
  projectId: string | null,
  fileId: string,
  userEmail?: string | null,
) {
  return buildManagedUploadStorageKey({
    extension: input.extension,
    fileId,
    originalName: input.originalName,
    projectId: projectId ?? "unassigned",
    userEmail,
  });
}

function resolveAbortStatus(reason: MultipartUploadAbortReason) {
  return reason === "failed"
    ? FileUploadStatus.Failed
    : FileUploadStatus.Pending;
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError")
  );
}

function isPendingLikeStatus(status: FileDTO["uploadStatus"]) {
  return (
    status === FileUploadStatus.Pending || status === FileUploadStatus.Failed
  );
}

function toWorkerProcessingFailure(error: unknown) {
  const unavailable = isAppError(error) && error.code === "worker_unavailable";
  return {
    code: unavailable ? "worker_unavailable" : "worker_enqueue_failed",
    message: enMessages.filesPage.uploadSavedProcessingFailedDescription,
  };
}

// Converts worker/internal processing failures into safe UI text only.
function getSafeProcessingFailureMessage(errorCode?: string | null) {
  switch (errorCode) {
    case "worker_enqueue_failed":
    case "worker_unavailable":
      return enMessages.filesPage.processingCouldNotStartDescription;
    default:
      return enMessages.filesPage.processingFailedDescription;
  }
}

// Converts orphan-upload cleanup failures into safe text for API consumers.
function getSafeCleanupFailureMessage(
  action: OrphanedUploadCleanupResultDTO["items"][number]["action"],
) {
  switch (action) {
    case "abort_multipart":
      return "Multipart abort failed.";
    case "delete_object":
      return "File cleanup failed.";
    default:
      return "Cleanup failed.";
  }
}

function getManagedUploadPrefix() {
  return `${MANAGED_UPLOAD_STORAGE_KEY_PREFIX}/`;
}

function shouldQueueVersionProcessing(input: {
  allowLargeUploads: boolean;
  extension: string;
  sizeBytes: number;
  watermarkEnabled: boolean;
  useSoftWatermark?: boolean;
}) {
  if (!isWorkerSupportedUploadExtension(input.extension)) {
    return false;
  }
  
  if (input.watermarkEnabled && input.useSoftWatermark) {
      return false;
  }

  if (input.watermarkEnabled && !input.useSoftWatermark) {
    return true;
  }

  return (
    input.allowLargeUploads
    // &&  input.sizeBytes > uploadConfig.largeFileProcessingThresholdBytes //TODO: Need to check if this is needed or not, if needed then we need to handle the watermarking scenario
  );
}

function determineFileProcessingPlan(input: {
  allowLargeUploads: boolean;
  extension: string;
  sizeBytes: number;
  watermarkEnabled: boolean;
  useSoftWatermark?: boolean;
  isFinalDraft?: boolean;
}) {
  const isFinalDraft = Boolean(input.isFinalDraft);

  const shouldQueue =
    shouldQueueVersionProcessing({
      allowLargeUploads: input.allowLargeUploads,
      extension: input.extension,
      sizeBytes: input.sizeBytes,
      watermarkEnabled: input.watermarkEnabled,
      useSoftWatermark: input.useSoftWatermark,
    }) || isFinalDraft;

  return {
    shouldQueueProcessing: shouldQueue,
    willChargeWatermarkCredits: Boolean(input.watermarkEnabled && !isFinalDraft),
    willChargeLargeUploadCredits: Boolean(
      input.allowLargeUploads && exceedsStandardUploadLimit(input.sizeBytes),
    ),
  };
}

type PendingCreditCharge = {
  credits: number;
  fileId?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, boolean | number | string | null>;
  projectId?: string | null;
  versionId?: string | null;
};

function hashCreditOperationValue(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function buildCreditOperationId(
  prefix: string,
  values: Array<boolean | number | string | null | undefined>,
) {
  return `${prefix}:${hashCreditOperationValue(
    values
      .filter((value) => value !== null && value !== undefined && `${value}`.length > 0)
      .join("|"),
  )}`;
}

/**
* Builds a stable storage-account idempotency key for one upload/delete action.
*
* The key is scope-agnostic at the callsite because `storageService` resolves
* the active personal/workspace scope centrally before mutating usage.
*/
function buildStorageOperationId(
  prefix: string,
  values: Array<boolean | number | string | null | undefined>,
) {
  return `${prefix}:${hashCreditOperationValue(
    values
      .filter((value) => value !== null && value !== undefined && `${value}`.length > 0)
      .join("|"),
  )}`;
}

/**
* Sums stored original-version bytes for storage accounting.
*
* Storage accounts currently bill the original uploaded files and revisions
* only, so processed previews/logs are intentionally excluded here.
*/
function sumVersionStorageBytes(versions: Array<Pick<FileVersionRecord, "sizeBytes">>) {
  return versions.reduce((total, version) => total + version.sizeBytes, 0);
}

function toWatermarkFeatureParams(input: {
  projectCurrency: string;
  watermarkCreditInput: WatermarkCreditInputDTO | null | undefined;
  isSoftWatermark?: boolean;
}): CreditFeatureCostParams {
  const watermarkCreditInput = input.watermarkCreditInput;

  if (!watermarkCreditInput) {
    throw new AppError(
      "Watermark credit metadata is required.",
      400,
      "watermark_credit_metadata_missing",
    );
  }

  return {
    currency: input.projectCurrency,
    durationMinutes: watermarkCreditInput.durationMinutes,
    featureKey: "watermark",
    mediaType: watermarkCreditInput.mediaType,
    pageCount: watermarkCreditInput.pageCount,
    priorityProcessing: watermarkCreditInput.priorityProcessing,
    resolutionClass: watermarkCreditInput.resolutionClass,
    isSoftWatermark: input.isSoftWatermark,
  };
}

async function chargeCreditActions(
  actions: Array<{
    featureParams: CreditFeatureCostParams;
    fileId?: string | null;
    idempotencyKey: string;
    metadata?: Record<string, boolean | number | string | null>;
    projectId?: string | null;
    versionId?: string | null;
  }>,
) {
  const chargedActions: PendingCreditCharge[] = [];

  for (const action of actions) {
    const { deduction, quote } =
      await creditService.calculateAndDeductFeatureCredits({
        featureParams: action.featureParams,
        fileId: action.fileId,
        idempotencyKey: action.idempotencyKey,
        metadata: action.metadata,
        projectId: action.projectId,
        versionId: action.versionId,
      });

    if (deduction && !deduction.idempotentReplay) {
      chargedActions.push({
        credits: quote.requiredCredits,
        fileId: action.fileId,
        idempotencyKey: action.idempotencyKey,
        metadata: action.metadata,
        projectId: action.projectId,
        versionId: action.versionId,
      });
    }
  }

  return chargedActions;
}

async function refundCreditActions(charges: PendingCreditCharge[]) {
  await Promise.all(
    charges.map((charge) =>
      creditService.refundCredits({
        credits: charge.credits,
        fileId: charge.fileId,
        idempotencyKey: `refund:${charge.idempotencyKey}`,
        metadata: {
          ...(charge.metadata ?? {}),
          refundReason: "upload_commit_failed",
        },
        projectId: charge.projectId,
        versionId: charge.versionId,
      }),
    ),
  );
}

const PREVIEW_RETENTION_WINDOW_DAYS = 7;

function createPreviewRetentionDate(from = new Date()) {
  return new Date(
    from.getTime() + PREVIEW_RETENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
}

function isUnresolvedFinalDraftReportStatus(
  status: FileFinalDraftReportStatus,
) {
  return (
    status === FileFinalDraftReportStatus.Reported ||
    status === FileFinalDraftReportStatus.UnderReview
  );
}

function isUnresolvedVersionReportStatus(
  status: FileVersionReportStatus | null | undefined,
) {
  return (
    status === FileVersionReportStatus.Reported ||
    status === FileVersionReportStatus.UnderReview
  );
}

function getFileReviewUploadMode(input: {
  finalDraftReportStatus: FileFinalDraftReportStatus;
  hasFinalDraft: boolean;
}): FileReviewUploadMode {
  if (
    input.hasFinalDraft &&
    isUnresolvedFinalDraftReportStatus(input.finalDraftReportStatus)
  ) {
    return "final_draft_replacement_only";
  }

  if (input.hasFinalDraft) {
    return "locked_after_final_draft";
  }

  return "normal";
}

function canDeleteFinalDraftVersion(input: {
  finalDraftDownloadCount: number;
  finalDraftDownloadedAt: Date | null;
  paymentStatus: string;
}) {
  return (
    input.paymentStatus === ProjectPaymentStatus.Paid &&
    input.finalDraftDownloadedAt != null &&
    input.finalDraftDownloadCount > 0
  );
}

/**
* Checks whether active file history must be preserved for deliverable deletion.
*
* This is internal-only deliverable delete eligibility logic. It does not log
* raw errors, does not mutate the DB or storage, does not delete any R2
* prefixes, and only decides whether the main file can cascade-delete a clean
* revision safely.
*/
function hasProtectedRevisionHistory(input: {
  activeVersionCount: number;
  approvalStatus: FileRecord["approvalStatus"];
  approvedVersionId: string | null;
  finalDraftReportStatus: FileFinalDraftReportStatus;
  finalDraftVersionId: string | null;
  safetySummary: Pick<
    FileSafetySummary,
    "activeVersionCommentCount" | "activeVersionReportCount"
  > | null;
  versions: Array<Pick<FileVersionRecord, "isFinalDraft">>;
}) {
  if (
    input.approvalStatus === FileApprovalStatus.Approved ||
    input.approvedVersionId != null
  ) {
    return true;
  }

  if (
    input.finalDraftReportStatus !== FileFinalDraftReportStatus.None ||
    (input.activeVersionCount > 1 &&
      (input.finalDraftVersionId != null ||
        input.versions.some((version) => version.isFinalDraft)))
  ) {
    return true;
  }

  return (
    (input.safetySummary?.activeVersionCommentCount ?? 0) > 0 ||
    (input.safetySummary?.activeVersionReportCount ?? 0) > 0
  );
}

function getFileDeleteBlockReason(input: {
  activeVersionCount: number;
  finalDraftVersion: FileVersionRecord | null;
  hasProtectedRevisionHistory: boolean;
  hasUnresolvedFinalDraftReport: boolean;
  paymentStatus: string;
  unresolvedVersionReportCount: number;
}): FileDeleteBlockReason | null {
  if (
    input.unresolvedVersionReportCount > 0 ||
    input.hasUnresolvedFinalDraftReport
  ) {
    return "version_under_review";
  }

  if (
    input.finalDraftVersion &&
    !canDeleteFinalDraftVersion({
      finalDraftDownloadCount: input.finalDraftVersion.finalDraftDownloadCount,
      finalDraftDownloadedAt: input.finalDraftVersion.finalDraftDownloadedAt,
      paymentStatus: input.paymentStatus,
    })
  ) {
    return "final_draft_locked";
  }

  if (input.activeVersionCount <= 1) {
    return input.hasProtectedRevisionHistory
      ? "protected_revisions_exist"
      : null;
  }

  if (input.activeVersionCount === 2 && !input.hasProtectedRevisionHistory) {
    return null;
  }

  if (input.hasProtectedRevisionHistory) {
    return "protected_revisions_exist";
  }

  if (input.activeVersionCount > 1) {
    return "revisions_exist";
  }

  return null;
}

function getVersionDeleteBlockReason(input: {
  activeVersionCount: number;
  hasUnresolvedFinalDraftReport?: boolean;
  hasUnresolvedReports: boolean;
  paymentStatus: string;
  version: FileVersionRecord;
}): FileVersionDeleteBlockReason | null {
  if (input.activeVersionCount <= 1) {
    return "last_remaining_version";
  }

  if (input.hasUnresolvedReports) {
    return "version_under_review";
  }

  if (input.version.isFinalDraft && input.hasUnresolvedFinalDraftReport) {
    return "version_under_review";
  }

  if (
    input.version.isFinalDraft &&
    !canDeleteFinalDraftVersion({
      finalDraftDownloadCount: input.version.finalDraftDownloadCount,
      finalDraftDownloadedAt: input.version.finalDraftDownloadedAt,
      paymentStatus: input.paymentStatus,
    })
  ) {
    return "final_draft_locked";
  }

  return null;
}

type StoredObjectTarget = {
  bucket: string;
  key: string;
};

function getStoredObjectTargets(input: {
  file: {
    storageBucket: string;
    storageKey: string;
  };
  versions: Array<{
    previewStorageBucket: string | null;
    previewStorageKey: string | null;
    processedStorageBucket: string | null;
    processedStorageKey: string | null;
    storageBucket: string;
    storageKey: string;
  }>;
}) {
  const seen = new Set<string>();
  const targets: StoredObjectTarget[] = [];

  const pushTarget = (bucket: string | null | undefined, key: string | null | undefined) => {
    if (!bucket || !key) {
      return;
    }

    const targetKey = `${bucket}:${key}`;

    if (seen.has(targetKey)) {
      return;
    }

    seen.add(targetKey);
    targets.push({ bucket, key });
  };

  pushTarget(input.file.storageBucket, input.file.storageKey);

  for (const version of input.versions) {
    pushTarget(version.storageBucket, version.storageKey);
    pushTarget(version.processedStorageBucket, version.processedStorageKey);
    pushTarget(version.previewStorageBucket, version.previewStorageKey);
  }

  return targets;
}

/**
* Collects the concrete stored objects attached to one file version.
*
* Revision deletion uses this as a fallback for any object that is not covered
* by the canonical `revisions/rNNN/` prefix, including older legacy keys.
*/
function getVersionStoredObjectTargets(version: {
  previewStorageBucket: string | null;
  previewStorageKey: string | null;
  processedStorageBucket: string | null;
  processedStorageKey: string | null;
  storageBucket: string;
  storageKey: string;
}) {
  return getStoredObjectTargets({
    file: {
      storageBucket: "",
      storageKey: "",
    },
    versions: [version],
  });
}

function getAssetKind(input: {
  extension: string;
  mimeType: string;
}): FileReviewAssetKind {
  const mimeType = input.mimeType.toLowerCase();
  const extension = input.extension.toLowerCase();

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf" || extension === ".pdf") return "pdf";

  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-7z-compressed" ||
    mimeType === "application/x-rar-compressed" ||
    mimeType === "application/gzip" ||
    mimeType === "application/x-tar"
  ) {
    return "archive";
  }

  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("document") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation")
  ) {
    return "document";
  }

  return "other";
}

function canPreviewAsset(kind: FileReviewAssetKind) {
  return kind === "image" || kind === "video" || kind === "pdf" || kind === "audio";
}

async function readStreamToBytes(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const result = await reader.read();

    if (result.done) {
      break;
    }

    chunks.push(result.value);
    totalLength += result.value.byteLength;
  }

  const bytes = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

function toPreviewKind(kind: FileReviewAssetKind): FileReviewPreviewKind {
  switch (kind) {
    case "audio":
    case "image":
    case "pdf":
    case "video":
      return kind;
    default:
      return "unsupported";
  }
}

function buildClientShareFilePreviewUrl(shareToken: string, fileId: string) {
  return `/api/share-links/${encodeURIComponent(shareToken)}/files/${encodeURIComponent(fileId)}/preview`;
}

function buildClientShareFinalDownloadUrl(shareToken: string, fileId: string) {
  return `/api/share-links/${encodeURIComponent(shareToken)}/files/${encodeURIComponent(fileId)}/download`;
}

function buildClientShareVersionPreviewUrl(input: {
  fileId: string;
  shareToken: string;
  versionId: string;
}) {
  return `/api/share-links/${encodeURIComponent(input.shareToken)}/files/${encodeURIComponent(input.fileId)}/versions/${encodeURIComponent(input.versionId)}/preview`;
}

function resolveDisplayStorageLocation(version: FileVersionRecord) {
  const retainedPreviewBucket =
    version.previewStorageBucket ?? version.processedStorageBucket;
  const retainedPreviewKey =
    version.previewStorageKey ?? version.processedStorageKey;
  const hasProcessedObject = Boolean(retainedPreviewBucket && retainedPreviewKey);

  const previewBucket = hasProcessedObject
    ? retainedPreviewBucket!
    : version.storageBucket;
  const previewKey = hasProcessedObject
    ? retainedPreviewKey!
    : version.storageKey;
  const previewMimeType = hasProcessedObject && version.processedMimeType
    ? version.processedMimeType
    : version.mimeType;
  const previewExtension = hasProcessedObject && version.processedExtension
    ? version.processedExtension
    : version.extension;
  const previewKind = toPreviewKind(
    getAssetKind({
      extension: previewExtension,
      mimeType: previewMimeType,
    }),
  );

  return {
    previewBucket,
    previewExtension,
    previewKey,
    previewKind,
    previewMimeType,
    hasProcessedObject,
  };
}

function hasClientSafePreview(version: FileVersionRecord) {
  const { previewBucket, previewKey, previewKind } =
    resolveDisplayStorageLocation(version);

  return (
    version.processingStatus === FileProcessingStatus.Completed &&
    Boolean(previewBucket && previewKey) &&
    previewKind !== "unsupported"
  );
}

type FileTranslationRecord = {
  extension: string;
  finalDraftReportMessage: string | null;
  finalDraftReportSourceLocale: string;
  id: string;
  name: string;
  nameSourceLocale: string;
};

type FileDTORecordInput = Pick<
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

type ProjectTitleRecord = Pick<ProjectRecord, "id" | "title" | "titleSourceLocale">;

type ResolvedFileText = {
  finalDraftReportMessageText: TranslatedTextDTO | null;
  nameText: TranslatedTextDTO;
};

function toFileReviewVersionDTO(input: {
  approvedVersionId: string | null;
  commentCount: number;
  currentVersionId: string | null;
  deleteBlockReason: FileVersionDeleteBlockReason | null;
  downloadUrl: string | null;
  finalDraftVersionId: string | null;
  latestReportStatus: FileVersionReportStatus | null;
  preview: FileReviewPreviewDTO;
  unresolvedReportCount: number;
  version: FileVersionRecord;
  finalDraftReportStatus?: FileFinalDraftReportStatus;
}): FileReviewVersionDTO {
  const {
    approvedVersionId,
    commentCount,
    currentVersionId,
    deleteBlockReason,
    downloadUrl,
    finalDraftVersionId,
    latestReportStatus,
    preview,
    unresolvedReportCount,
    version,
  } = input;

  return {
    commentCount,
    createdAt: version.createdAt.toISOString(),
    deleteBlockReason,
    downloadUrl,
    extension: version.extension,
    fileId: version.fileId,
    finalDraftDownloadCount: version.finalDraftDownloadCount,
    finalDraftDownloadedAt: version.finalDraftDownloadedAt?.toISOString() ?? null,
    hasComments: commentCount > 0,
    hasUnresolvedReports: unresolvedReportCount > 0,
    id: version.id,
    isApproved: approvedVersionId === version.id,
    isCurrent: currentVersionId === version.id,
    isFinalDraft:
      finalDraftVersionId === version.id &&
      !isUnresolvedFinalDraftReportStatus(
        input.finalDraftReportStatus ?? FileFinalDraftReportStatus.None,
      ),
    latestReportStatus,
    mimeType: version.mimeType,
    originalName: version.originalName,
    isSoftWatermarked: version.useSoftWatermark,
    preview,
    previewPurgedAt: version.previewPurgedAt?.toISOString() ?? null,
    previewRetentionUntil: version.previewRetentionUntil?.toISOString() ?? null,
    processedAvailable: Boolean(version.processedStorageBucket && version.processedStorageKey),
    processedExtension: version.processedExtension,
    processedMimeType: version.processedMimeType,
    processedSizeBytes: version.processedSizeBytes,
    processedStorageBucket: version.processedStorageBucket,
    processedStorageKey: version.processedStorageKey,
    processingErrorCode: version.processingErrorCode,
    processingErrorMessage: version.processingErrorMessage,
    processingStatus: version.processingStatus,
    revisionDescription: version.revisionDescription ?? null,
    revisionDescriptionSourceLocale: version.revisionDescriptionSourceLocale ?? null,
    revisionNumber: version.revisionNumber,
    sizeBytes: version.sizeBytes,
    storageBucket: version.storageBucket,
    storageKey: version.storageKey,
    unresolvedReportCount,
    updatedAt: version.updatedAt.toISOString(),
    uploadedBy: version.uploadedBy,
  };
}

export class FileService {
  constructor(
    private readonly repository: FileRepository,
    private readonly storage: FileStorage,
    private readonly projectRepository: ProjectRepository,
  ) { }

  async createFile(
    input: CreateFileInput,
    options: {
      sourceLocale: string;
      viewerLocale: string;
    },
  ): Promise<FileDTO> {
    const projectIdentifier = normalizeProjectId(input.projectId);

    if (!projectIdentifier) {
      throw new AppError("projectId is required.", 400, "validation_error");
    }

    const project = await this.getRequiredProject(projectIdentifier);
    this.assertProjectIsActive(project.status);
    await storageService.assertCanAllocateStorage({
      requiredBytes: input.sizeBytes,
    });
    const fileId = randomUUID();
    const storageKey = buildStorageKey(input, project.id, fileId);
    const name = trimFileTitle(input.name);

    const record = await this.repository.create({
      extension: input.extension,
      id: fileId,
      mimeType: input.mimeType,
      name,
      nameSourceLocale: defaultLocale,
      originalName: input.originalName.trim(),
      projectId: project.id,
      sizeBytes: input.sizeBytes,
      storageBucket: this.storage.getDefaultBucket(),
      storageKey,
      uploadedBy: MANAGED_UPLOAD_OWNER,
      uploadStatus: input.uploadStatus,
    });

    try {
      await storageService.commitStorageUsage({
        bytes: input.sizeBytes,
        fileId: record.id,
        idempotencyKey: buildStorageOperationId("storage-commit-create-file", [
          project.id,
          record.id,
          storageKey,
          input.sizeBytes,
        ]),
        metadata: {
          storageKey,
          storageReason: "legacy_file_create",
        },
        projectId: project.id,
      });
    } catch (error) {
      await this.repository.hardDeleteWithVersions(record.id);
      throw error;
    }

    return this.buildFileDTO(record, options.viewerLocale);
  }

  async deleteFile(id: string): Promise<DeletedFileDTO> {
    const existingRecord = await this.repository.findWithVersionsById(id, {
      includeDeletedVersions: true,
    });

    if (!existingRecord) {
      throw new NotFoundAppError("File not found.");
    }

    const project = await this.getRequiredProject(existingRecord.file.projectId);
    this.assertProjectIsActive(project.status);
    this.assertFileIsNotApproved(existingRecord.file.approvalStatus);
    const activeVersions = existingRecord.versions.filter(
      (version) => version.deletedAt == null,
    );

    void (async () => {
      try {
        for (const version of existingRecord.versions) {
          await this.deleteRevisionStorageObjects(version);
        }

        const versionStorageKeys = new Set(
          existingRecord.versions.map((version) => version.storageKey),
        );

        if (
          !versionStorageKeys.has(existingRecord.file.storageKey) &&
          existingRecord.file.storageKey
        ) {
          await this.storage.deleteFile({
            bucket: existingRecord.file.storageBucket,
            key: existingRecord.file.storageKey,
          });
        }
      } catch (error) {
        console.error("[file-service] R2 deletion failed during deleteFile. DB deletion will proceed to prevent orphaned records.", {
          fileId: id,
          error,
        });
      }
    })();

    const releasableBytes =
      activeVersions.length > 0
        ? sumVersionStorageBytes(activeVersions)
        : existingRecord.file.sizeBytes;

    if (releasableBytes > 0) {
      await storageService.releaseStorageUsage({
        bytes: releasableBytes,
        fileId: existingRecord.file.id,
        idempotencyKey: buildStorageOperationId("storage-release-file", [
          existingRecord.file.id,
          existingRecord.file.storageKey,
          releasableBytes,
        ]),
        metadata: {
          storageKey: existingRecord.file.storageKey,
          storageReason: "file_delete",
        },
        projectId: existingRecord.file.projectId,
      });
    }

    const deletedAt = new Date();
    const record = await this.repository.softDeleteWithVersions(id, deletedAt);

    if (!record) {
      throw new NotFoundAppError("File not found.");
    }

    return toDeletedFileDTO(record, deletedAt);
  }

  async deleteFileVersion(input: {
    deletedBy?: string | null;
    fileId: string;
    projectId: string;
    versionId: string;
  }): Promise<DeletedFileVersionDTO> {
    const project = await this.getRequiredProject(input.projectId);
    const fileWithVersions = await this.repository.findWithVersionsById(
      input.fileId,
      {
        includeDeletedVersions: true,
      },
    );

    if (!fileWithVersions || fileWithVersions.file.projectId !== project.id) {
      throw new NotFoundAppError("File not found.");
    }

    const activeVersions = fileWithVersions.versions
      .filter((version) => version.deletedAt == null)
      .sort((left, right) => left.revisionNumber - right.revisionNumber);
    const targetVersion = activeVersions.find(
      (version) => version.id === input.versionId,
    );

    if (!targetVersion) {
      throw new NotFoundAppError("File version not found.");
    }

    const safetySummaries = await this.repository.findVersionSafetySummaries(
      input.fileId,
    );
    const safetySummary = safetySummaries.find(
      (summary) => summary.fileVersionId === targetVersion.id,
    );
    const effectiveTargetVersion =
      fileWithVersions.file.finalDraftVersionId === targetVersion.id
        ? {
          ...targetVersion,
          isFinalDraft: true,
        }
        : targetVersion;
    const deleteBlockReason = getVersionDeleteBlockReason({
      activeVersionCount: activeVersions.length,
      hasUnresolvedFinalDraftReport:
        fileWithVersions.file.finalDraftVersionId === targetVersion.id &&
        isUnresolvedFinalDraftReportStatus(
          fileWithVersions.file.finalDraftReportStatus,
        ),
      hasUnresolvedReports:
        (safetySummary?.unresolvedReportCount ?? 0) > 0 ||
        isUnresolvedVersionReportStatus(safetySummary?.latestReportStatus),
      paymentStatus: project.paymentStatus,
      version: effectiveTargetVersion,
    });

    if (deleteBlockReason === "last_remaining_version") {
      throw new AppError(
        "The last remaining version cannot be deleted.",
        409,
        "file_version_last_remaining",
      );
    }

    const remainingVersions = activeVersions.filter(
      (version) => version.id !== targetVersion.id,
    );
    const nextCurrentVersion =
      remainingVersions[remainingVersions.length - 1] ?? null;
    const nextSelectedVersionId =
      remainingVersions.length === 0
        ? null
        : remainingVersions.reduce((closest, candidate) => {
          if (!closest) {
            return candidate;
          }

          const closestDistance = Math.abs(
            closest.revisionNumber - targetVersion.revisionNumber,
          );
          const candidateDistance = Math.abs(
            candidate.revisionNumber - targetVersion.revisionNumber,
          );

          if (candidateDistance < closestDistance) {
            return candidate;
          }

          if (
            candidateDistance === closestDistance &&
            candidate.revisionNumber > closest.revisionNumber
          ) {
            return candidate;
          }

          return closest;
        }, null as FileVersionRecord | null)?.id ?? null;
    const nextApprovedVersionId =
      fileWithVersions.file.approvedVersionId === targetVersion.id
        ? nextCurrentVersion?.id ?? null
        : fileWithVersions.file.approvedVersionId;
    const nextFinalDraftVersionId =
      fileWithVersions.file.finalDraftVersionId === targetVersion.id
        ? null
        : fileWithVersions.file.finalDraftVersionId;
    const shouldReplaceCurrentVersion =
      fileWithVersions.file.currentVersionId === targetVersion.id ||
      fileWithVersions.file.storageKey === targetVersion.storageKey;
    const mirrorVersion =
      shouldReplaceCurrentVersion && nextCurrentVersion
        ? nextCurrentVersion
        : null;
    const deletedAt = new Date();

    void (async () => {
      try {
        await this.deleteRevisionStorageObjects(targetVersion);
      } catch (error) {
        console.error("[file-service] R2 deletion failed during deleteFileVersion. DB deletion will proceed to prevent orphaned records.", {
          fileId: input.fileId,
          versionId: targetVersion.id,
          error,
        });
      }
    })();
    await storageService.releaseStorageUsage({
      bytes: targetVersion.sizeBytes,
      fileId: input.fileId,
      idempotencyKey: buildStorageOperationId("storage-release-revision", [
        input.fileId,
        targetVersion.id,
        targetVersion.storageKey,
        targetVersion.sizeBytes,
      ]),
      metadata: {
        storageKey: targetVersion.storageKey,
        storageReason: effectiveTargetVersion.isFinalDraft
          ? "final_draft_delete"
          : "revision_delete",
      },
      projectId: project.id,
      versionId: targetVersion.id,
    });

    const deleted = await this.repository.softDeleteVersion({
      fileId: input.fileId,
      fileUpdate: {
        approvalStatus: nextApprovedVersionId
          ? FileApprovalStatus.Approved
          : FileApprovalStatus.Pending,
        approvedVersionId: nextApprovedVersionId,
        currentVersionId: shouldReplaceCurrentVersion
          ? nextCurrentVersion?.id ?? null
          : fileWithVersions.file.currentVersionId,
        extension: mirrorVersion?.extension,
        finalDraftVersionId: nextFinalDraftVersionId,
        finalDraftReportMessage:
          nextFinalDraftVersionId == null
            ? null
            : fileWithVersions.file.finalDraftReportMessage,
        finalDraftReportSourceLocale:
          nextFinalDraftVersionId == null
            ? UNKNOWN_TRANSLATION_LOCALE
            : fileWithVersions.file.finalDraftReportSourceLocale,
        finalDraftReportReason:
          nextFinalDraftVersionId == null
            ? null
            : fileWithVersions.file.finalDraftReportReason,
        finalDraftReportStatus:
          nextFinalDraftVersionId == null
            ? FileFinalDraftReportStatus.None
            : fileWithVersions.file.finalDraftReportStatus,
        finalDraftReportedAt:
          nextFinalDraftVersionId == null
            ? null
            : fileWithVersions.file.finalDraftReportedAt,
        mimeType: mirrorVersion?.mimeType,
        originalName: mirrorVersion?.originalName,
        sizeBytes: mirrorVersion?.sizeBytes,
        storageBucket: mirrorVersion?.storageBucket,
        storageKey: mirrorVersion?.storageKey,
        updatedAt: deletedAt,
        uploadedBy: mirrorVersion?.uploadedBy,
        uploadStatus: FileUploadStatus.Uploaded,
      },
      versionId: input.versionId,
      versionUpdate: {
        deleteReason: "user_requested",
        deletedAt,
        deletedBy: input.deletedBy ?? MANAGED_UPLOAD_OWNER,
        updatedAt: deletedAt,
      },
    });

    if (!deleted) {
      throw new NotFoundAppError("File version not found.");
    }

    return {
      deletedAt: deletedAt.toISOString(),
      fileId: input.fileId,
      nextSelectedVersionId,
      versionId: input.versionId,
    };
  }

  async reportFileVersion(input: {
    fileId: string;
    message?: string | null;
    projectId: string;
    reason: string;
    sourceLocale: string;
    versionId: string;
  }) {
    const project = await this.getRequiredProject(input.projectId);
    this.assertProjectIsActive(project.status);
    const fileWithVersions = await this.repository.findWithVersionsById(
      input.fileId,
      {
        includeDeletedVersions: true,
      },
    );

    if (!fileWithVersions || fileWithVersions.file.projectId !== project.id) {
      throw new NotFoundAppError("File not found.");
    }

    this.assertFileIsNotApproved(fileWithVersions.file.approvalStatus);

    const version = fileWithVersions.versions.find(
      (candidate) => candidate.id === input.versionId,
    );

    if (!version || version.deletedAt != null) {
      throw new NotFoundAppError("File version not found.");
    }
    const message = input.message?.trim() || null;

    const report = await this.repository.createVersionReport({
      fileId: input.fileId,
      fileVersionId: input.versionId,
      message,
      projectId: project.id,
      reason: input.reason.trim(),
      sourceLocale: detectDynamicTextLocale(message ?? ""),
      status: FileVersionReportStatus.Reported,
    });

    return {
      createdAt: report.createdAt.toISOString(),
      fileId: report.fileId,
      id: report.id,
      status: report.status,
      updatedAt: report.updatedAt.toISOString(),
      versionId: report.fileVersionId,
    };
  }

  async reportFinalDraft(input: {
    fileId: string;
    message?: string | null;
    projectId: string;
    reason: string;
    sourceLocale: string;
  }) {
    const project = await this.getRequiredProject(input.projectId);
    this.assertProjectIsActive(project.status);
    const fileWithVersions = await this.repository.findWithVersionsById(
      input.fileId,
      {
        includeDeletedVersions: true,
      },
    );

    if (!fileWithVersions || fileWithVersions.file.projectId !== project.id) {
      throw new NotFoundAppError("File not found.");
    }

    const finalDraftVersion = fileWithVersions.versions.find(
      (version) =>
        version.deletedAt == null &&
        (version.id === fileWithVersions.file.finalDraftVersionId ||
          version.isFinalDraft),
    );

    if (!finalDraftVersion) {
      // Return a safe typed error when a final draft is not available.
      throw new AppError(
        "Final draft not available.",
        409,
        "FINAL_DRAFT_NOT_AVAILABLE",
      );
    }

    const reportedAt = new Date();
    const message = input.message?.trim() || null;
    const file = await this.repository.update(fileWithVersions.file.id, {
      finalDraftReportMessage: message,
      finalDraftReportSourceLocale: detectDynamicTextLocale(message ?? ""),
      finalDraftReportReason: input.reason.trim(),
      finalDraftReportStatus: FileFinalDraftReportStatus.Reported,
      finalDraftReportedAt: reportedAt,
      updatedAt: reportedAt,
    });

    if (!file) {
      throw new NotFoundAppError("File not found.");
    }

    // Create a version-level report entry so the reported final-draft is tracked
    // as a version report in addition to the file-level finalDraftReport fields.
    try {
      await this.repository.createVersionReport({
        fileId: file.id,
        fileVersionId: finalDraftVersion.id,
        message,
        projectId: project.id,
        reason: input.reason,
        sourceLocale: input.sourceLocale,
        status: FileVersionReportStatus.Reported,
      });
    } catch {
      // Best-effort: version report creation should not block the main flow.
    }

    return {
      fileId: file.id,
      finalDraftVersionId: finalDraftVersion.id,
      reportedAt: reportedAt.toISOString(),
      status: file.finalDraftReportStatus,
    };
  }

  async reportClientShareVersion(input: {
    fileId: string;
    message?: string | null;
    projectId: string;
    reason: ClientShareReportReason;
    sourceLocale: string;
    versionId: string;
  }) {
    const fileWithVersions = await this.repository.findWithVersionsById(
      input.fileId,
      {
        includeDeletedVersions: true,
      },
    );

    if (!fileWithVersions || fileWithVersions.file.projectId !== input.projectId) {
      throw new NotFoundAppError("File not found.");
    }

    const version = fileWithVersions.versions.find(
      (candidate) => candidate.id === input.versionId,
    );

    if (!version || version.deletedAt != null) {
      throw new NotFoundAppError("File version not found.");
    }

    const safetySummaries = await this.repository.findVersionSafetySummaries(
      input.fileId,
    );
    const versionSafety = safetySummaries.find(
      (candidate) => candidate.fileVersionId === input.versionId,
    );

    if ((versionSafety?.unresolvedReportCount ?? 0) > 0) {
      throw new AppError(
        "A report for this revision is already under review.",
        409,
        "client_report_already_open",
      );
    }

    const result = await this.reportFileVersion({
      fileId: input.fileId,
      message: input.message,
      projectId: input.projectId,
      reason: input.reason,
      sourceLocale: input.sourceLocale,
      versionId: input.versionId,
    });

    await this.createClientActionNotification({
      descriptionKey: "notification.clientRevisionReportedDescription",
      fileId: result.fileId,
      projectId: input.projectId,
      titleKey: "notification.clientRevisionReportedTitle",
    });

    return result;
  }

  async reportClientShareFinalDraft(input: {
    fileId: string;
    message?: string | null;
    projectId: string;
    reason: ClientShareReportReason;
    sourceLocale: string;
  }) {
    const fileWithVersions = await this.repository.findWithVersionsById(
      input.fileId,
      {
        includeDeletedVersions: true,
      },
    );

    if (!fileWithVersions || fileWithVersions.file.projectId !== input.projectId) {
      throw new NotFoundAppError("File not found.");
    }

    if (
      isUnresolvedFinalDraftReportStatus(
        fileWithVersions.file.finalDraftReportStatus,
      )
    ) {
      throw new AppError(
        "A report for this final draft is already under review.",
        409,
        "client_report_already_open",
      );
    }

    const result = await this.reportFinalDraft({
      fileId: input.fileId,
      message: input.message,
      projectId: input.projectId,
      reason: input.reason,
      sourceLocale: input.sourceLocale,
    });

    await this.createClientActionNotification({
      descriptionKey: "notification.clientFinalDraftReportedDescription",
      fileId: result.fileId,
      projectId: input.projectId,
      titleKey: "notification.clientFinalDraftReportedTitle",
    });

    return result;
  }

  async getFileById(id: string, viewerLocale: string): Promise<FileDTO> {
    const record = await this.repository.findById(id);

    if (!record) {
      throw new NotFoundAppError("File not found.");
    }

    return this.buildFileDTO(record, viewerLocale);
  }

  async listFiles(
    params: FileQueryParams,
    options?: { viewerLocale: string },
  ): Promise<PaginatedResult<FileDTO>> {
    let resolvedProjectId = params.projectId;

    if (params.projectId !== undefined) {
      const project = await this.projectRepository.findByIdentifier(
        params.projectId,
      );

      if (!project) {
        const pagination = buildPaginationParams({
          limit: params.limit,
          page: params.page,
        });

        return {
          items: [],
          pagination:
            params.includeTotal === false
              ? null
              : buildPaginationMeta({
                limit: pagination.limit,
                page: pagination.page,
                total: 0,
              }),
        };
      }

      resolvedProjectId = project.id;
    }

    const pagination = buildPaginationParams({
      limit: params.limit,
      page: params.page,
    });
    const result = await this.repository.findMany({
      ...params,
      projectId: resolvedProjectId,
      ...pagination,
    });
    const items = await this.buildFileDTOs(
      result.records.map((record) => ({ record })),
      options?.viewerLocale ?? "en",
    );
    const fileIds = items.map((item) => item.id);
    const safetySummaries = new Map(
      (
        await this.repository.findFileSafetySummaries(fileIds)
      ).map((summary) => [summary.fileId, summary]),
    );
    const projectIds = Array.from(
      new Set(result.records.map((record) => record.projectId)),
    );
    const projects = await Promise.all(
      projectIds.map((projectId) => this.projectRepository.findById(projectId)),
    );
    const paymentStatusByProjectId = new Map(
      projects
        .filter((project): project is NonNullable<typeof project> => Boolean(project))
        .map((project) => [project.id, project.paymentStatus]),
    );
    const finalDraftVersionIds = items
      .map((item) => item.finalDraftVersionId)
      .filter((id): id is string => Boolean(id));
    const finalDraftVersions = new Map(
      (
        await this.repository.findVersionsByIds(finalDraftVersionIds)
      ).map((version) => [version.id, version]),
    );
    const enrichedItems = items.map((item) => {
      const safetySummary = safetySummaries.get(item.id);
      const activeVersionCount = safetySummary?.activeVersionCount ?? 1;
      const unresolvedVersionReportCount =
        safetySummary?.unresolvedVersionReportCount ?? 0;
      const finalDraftVersion = item.finalDraftVersionId
        ? finalDraftVersions.get(item.finalDraftVersionId) ?? null
        : null;
      const deleteBlockReason = getFileDeleteBlockReason({
        activeVersionCount,
        finalDraftVersion:
          finalDraftVersion && finalDraftVersion.deletedAt == null
            ? finalDraftVersion
            : null,
        hasProtectedRevisionHistory: hasProtectedRevisionHistory({
          activeVersionCount,
          approvalStatus: item.approvalStatus,
          approvedVersionId: item.approvedVersionId,
          finalDraftReportStatus: item.finalDraftReportStatus,
          finalDraftVersionId: item.finalDraftVersionId,
          safetySummary: safetySummary ?? null,
          versions: finalDraftVersion ? [finalDraftVersion] : [],
        }),
        hasUnresolvedFinalDraftReport: isUnresolvedFinalDraftReportStatus(
          item.finalDraftReportStatus,
        ),
        paymentStatus:
          paymentStatusByProjectId.get(item.projectId) ??
          ProjectPaymentStatus.Pending,
        unresolvedVersionReportCount,
      });

      return {
        ...item,
        activeVersionCount,
        deleteBlockReason,
        deleteRequiresWarning:
          deleteBlockReason == null &&
          activeVersionCount === 1 &&
          finalDraftVersion != null &&
          finalDraftVersion.deletedAt == null,
        hasRevisions: activeVersionCount > 1,
        unresolvedVersionReportCount,
      };
    });

    return {
      items: enrichedItems,
      pagination:
        result.total == null
          ? null
          : buildPaginationMeta({
            limit: pagination.limit,
            page: pagination.page,
            total: result.total,
          }),
    };
  }

  async updateFile(
    id: string,
    input: UpdateFileInput,
    options: {
      sourceLocale: string;
      viewerLocale: string;
    },
  ): Promise<FileDTO> {
    const existing = await this.repository.findById(id);

    if (!existing) {
      throw new NotFoundAppError("File not found.");
    }

    const updatedAt = new Date();
    const nextProjectIdentifier =
      input.projectId === undefined
        ? undefined
        : normalizeProjectId(input.projectId);
    const nextProject =
      nextProjectIdentifier == null
        ? undefined
        : await this.getRequiredProject(nextProjectIdentifier);
    const name = input.name === undefined ? undefined : trimFileTitle(input.name);

    const record = await this.repository.update(id, {
      ...input,
      name,
      nameSourceLocale:
        name === undefined ? undefined : defaultLocale,
      projectId: nextProject?.id ?? undefined,
      updatedAt,
    });

    if (!record) {
      throw new NotFoundAppError("File not found.");
    }

    return this.buildFileDTO(record, options.viewerLocale);
  }

  async uploadFileContent(
    id: string,
    input: {
      abortSignal?: AbortSignal;
      body: Parameters<FileStorage["uploadFile"]>[0]["body"];
      contentLength?: number;
      contentType?: string;
    },
    viewerLocale: string,
  ): Promise<FileDTO> {
    const existingRecord = await this.getUploadableRecord(id);
    this.assertFileIsNotApproved(existingRecord.approvalStatus);
    this.assertFileIsNotAlreadyUploaded(existingRecord.uploadStatus);

    if (shouldUseMultipartUpload(existingRecord.sizeBytes)) {
      throw new AppError(
        "Large files must use multipart upload.",
        409,
        "multipart_upload_required",
        {
          multipartThresholdBytes: uploadConfig.multipartThresholdBytes,
          sizeBytes: existingRecord.sizeBytes,
        },
      );
    }

    if (
      input.contentLength != null &&
      input.contentLength !== existingRecord.sizeBytes
    ) {
      throw new AppError(
        "Uploaded file size does not match the file record.",
        400,
        "file_size_mismatch",
        {
          actualSizeBytes: input.contentLength,
          expectedSizeBytes: existingRecord.sizeBytes,
        },
      );
    }

    try {
      await this.storage.uploadFile({
        abortSignal: input.abortSignal,
        body: input.body,
        bucket: existingRecord.storageBucket,
        contentLength: input.contentLength,
        contentType: input.contentType ?? existingRecord.mimeType,
        key: existingRecord.storageKey,
      });
    } catch (error) {
      await this.safeDeleteStoredFile(
        existingRecord.storageBucket,
        existingRecord.storageKey,
      );

      if (!input.abortSignal?.aborted && !isAbortError(error)) {
        await this.setUploadStatus(id, FileUploadStatus.Failed);
      }

      throw error;
    }

    const record = await this.repository.update(id, {
      uploadStatus: FileUploadStatus.Uploaded,
      updatedAt: new Date(),
    });

    if (!record) {
      throw new NotFoundAppError("File not found.");
    }

    return this.buildFileDTO(record, viewerLocale);
  }

  async initiateMultipartUpload(id: string): Promise<{
    bucket: string;
    fileId: string;
    multipartThresholdBytes: number;
    partSizeBytes: number;
    storageKey: string;
    totalParts: number;
    uploadId: string;
  }> {
    const existingRecord = await this.getUploadableRecord(id);
    this.assertFileIsNotApproved(existingRecord.approvalStatus);
    this.assertFileIsNotAlreadyUploaded(existingRecord.uploadStatus);

    if (!shouldUseMultipartUpload(existingRecord.sizeBytes)) {
      throw new AppError(
        "Small files should continue using the single-request upload path.",
        409,
        "simple_upload_preferred",
        {
          multipartThresholdBytes: uploadConfig.multipartThresholdBytes,
          sizeBytes: existingRecord.sizeBytes,
        },
      );
    }

    const session = await this.storage.createMultipartUpload({
      bucket: existingRecord.storageBucket,
      contentType: existingRecord.mimeType,
      key: existingRecord.storageKey,
    });
    const partSizeBytes = resolveMultipartPartSizeBytes(existingRecord.sizeBytes);

    // Per-part retry is not the same as true resumable upload after refresh.
    return {
      bucket: session.bucket,
      fileId: id,
      multipartThresholdBytes: uploadConfig.multipartThresholdBytes,
      partSizeBytes,
      storageKey: session.key,
      totalParts: getMultipartPartCount(existingRecord.sizeBytes, partSizeBytes),
      uploadId: session.uploadId,
    };
  }

  async uploadMultipartPart(
    id: string,
    input: {
      abortSignal?: AbortSignal;
      body: ArrayBuffer | Uint8Array;
      contentLength: number;
      partNumber: number;
      uploadId: string;
    },
  ) {
    const existingRecord = await this.getUploadableRecord(id);
    this.assertFileIsNotApproved(existingRecord.approvalStatus);
    this.assertFileCanBeUploaded(existingRecord.uploadStatus);

    if (!shouldUseMultipartUpload(existingRecord.sizeBytes)) {
      throw new AppError(
        "Multipart upload is only available for files above the configured threshold.",
        409,
        "multipart_upload_not_required",
        {
          multipartThresholdBytes: uploadConfig.multipartThresholdBytes,
          sizeBytes: existingRecord.sizeBytes,
        },
      );
    }

    const partRange = getMultipartPartRange(
      existingRecord.sizeBytes,
      input.partNumber,
    );

    if (!partRange) {
      throw new AppError(
        "partNumber is outside the expected multipart range.",
        400,
        "multipart_part_out_of_range",
        {
          partNumber: input.partNumber,
          totalParts: getMultipartPartCount(existingRecord.sizeBytes),
        },
      );
    }

    if (input.contentLength !== partRange.contentLength) {
      throw new AppError(
        "Multipart part size does not match the expected file slice.",
        400,
        "multipart_part_size_mismatch",
        {
          actualSizeBytes: input.contentLength,
          expectedSizeBytes: partRange.contentLength,
          partNumber: input.partNumber,
        },
      );
    }

    const result = await this.storage.uploadMultipartPart({
      abortSignal: input.abortSignal,
      body: input.body,
      bucket: existingRecord.storageBucket,
      contentLength: input.contentLength,
      key: existingRecord.storageKey,
      partNumber: input.partNumber,
      uploadId: input.uploadId,
    });

    return {
      etag: result.etag,
      partNumber: result.partNumber,
    };
  }

  async completeMultipartUpload(
    id: string,
    input: {
      abortSignal?: AbortSignal;
      parts: Array<{
        etag: string;
        partNumber: number;
      }>;
      uploadId: string;
    },
    viewerLocale: string,
  ): Promise<FileDTO> {
    const existingRecord = await this.getUploadableRecord(id);
    this.assertFileCanBeUploaded(existingRecord.uploadStatus);

    if (!shouldUseMultipartUpload(existingRecord.sizeBytes)) {
      throw new AppError(
        "Multipart upload is only available for files above the configured threshold.",
        409,
        "multipart_upload_not_required",
        {
          multipartThresholdBytes: uploadConfig.multipartThresholdBytes,
          sizeBytes: existingRecord.sizeBytes,
        },
      );
    }

    this.assertMultipartPartsComplete(existingRecord.sizeBytes, input.parts);

    try {
      await this.storage.completeMultipartUpload({
        abortSignal: input.abortSignal,
        bucket: existingRecord.storageBucket,
        key: existingRecord.storageKey,
        parts: input.parts,
        uploadId: input.uploadId,
      });
    } catch (error) {
      await this.safeAbortMultipartUpload(
        existingRecord.storageBucket,
        existingRecord.storageKey,
        input.uploadId,
      );

      if (!input.abortSignal?.aborted && !isAbortError(error)) {
        await this.setUploadStatus(id, FileUploadStatus.Failed);
      }

      throw error;
    }

    const record = await this.repository.update(id, {
      uploadStatus: FileUploadStatus.Uploaded,
      updatedAt: new Date(),
    });

    if (!record) {
      throw new NotFoundAppError("File not found.");
    }

    return this.buildFileDTO(record, viewerLocale);
  }

  async abortMultipartUpload(
    id: string,
    input: {
      reason: MultipartUploadAbortReason;
      uploadId: string;
    },
  ): Promise<MultipartUploadAbortDTO> {
    const existingRecord = await this.getUploadableRecord(id);

    if (existingRecord.uploadStatus === FileUploadStatus.Uploaded) {
      return {
        aborted: false,
        bucket: existingRecord.storageBucket,
        fileId: id,
        storageKey: existingRecord.storageKey,
        uploadId: input.uploadId,
        uploadStatus: existingRecord.uploadStatus,
      };
    }

    const abortResult = await this.storage.abortMultipartUpload({
      bucket: existingRecord.storageBucket,
      key: existingRecord.storageKey,
      uploadId: input.uploadId,
    });

    const nextStatus = resolveAbortStatus(input.reason);
    const record = await this.repository.update(id, {
      uploadStatus: nextStatus,
      updatedAt: new Date(),
    });

    if (!record) {
      throw new NotFoundAppError("File not found.");
    }

    return {
      aborted: abortResult.aborted,
      bucket: abortResult.bucket,
      fileId: id,
      storageKey: abortResult.key,
      uploadId: abortResult.uploadId,
      uploadStatus: record.uploadStatus,
    };
  }

  async cancelFileUpload(
    id: string,
    input?: {
      uploadId?: string;
    },
    viewerLocale = "en",
  ): Promise<FileDTO> {
    const existingRecord = await this.getUploadableRecord(id);

    if (existingRecord.uploadStatus === FileUploadStatus.Uploaded) {
      return this.buildFileDTO(existingRecord, viewerLocale);
    }

    if (input?.uploadId) {
      await this.safeAbortMultipartUpload(
        existingRecord.storageBucket,
        existingRecord.storageKey,
        input.uploadId,
      );
    }

    const record = await this.repository.update(id, {
      uploadStatus: FileUploadStatus.Pending,
      updatedAt: new Date(),
    });

    if (!record) {
      throw new NotFoundAppError("File not found.");
    }

    return this.buildFileDTO(record, viewerLocale);
  }

  async initiateUploadSession(
    input: UploadSessionInitInput,
  ): Promise<UploadSessionDTO> {
    this.assertUploadSizeAllowed({
      allowLargeUploads: input.allowLargeUploads,
      isFinalDraft: input.isFinalDraft,
      sizeBytes: input.sizeBytes,
    });

    const { fileId, projectId, revisionNumber } =
      await this.resolveManagedUploadSessionTarget(input);

    await storageService.assertCanAllocateStorage({
      requiredBytes: input.sizeBytes,
    });

    const actor = await resolveActiveActor();
    const storageKey = buildManagedUploadStorageKey({
      extension: input.extension,
      fileId,
      originalName: input.originalName,
      projectId,
      revisionNumber,
      userEmail: actor.email,
    });
    const bucket = this.storage.getDefaultBucket();
    const mode = shouldUseMultipartUpload(input.sizeBytes)
      ? "multipart"
      : "single";
    const partSizeBytes = resolveMultipartPartSizeBytes(input.sizeBytes);

    if (mode === "single") {
      return {
        allowLargeUploads: input.allowLargeUploads,
        bucket,
        fileId,
        isFinalDraft: input.isFinalDraft,
        localFileId: input.localFileId,
        mode,
        multipartThresholdBytes: uploadConfig.multipartThresholdBytes,
        partSizeBytes,
        storageKey,
        totalParts: 1,
        uploadId: null,
        uploadSessionId: input.sessionId,
      };
    }

    const session = await this.storage.createMultipartUpload({
      bucket,
      contentType: input.mimeType,
      key: storageKey,
    });

    // Per-part retry keeps one live session resilient, but refresh-resume still needs durable persistence.
    return {
      allowLargeUploads: input.allowLargeUploads,
      bucket: session.bucket,
      fileId,
      isFinalDraft: input.isFinalDraft,
      localFileId: input.localFileId,
      mode,
      multipartThresholdBytes: uploadConfig.multipartThresholdBytes,
      partSizeBytes,
      storageKey: session.key,
      totalParts: getMultipartPartCount(input.sizeBytes, partSizeBytes),
      uploadId: session.uploadId,
      uploadSessionId: input.sessionId,
    };
  }

  async getPresignedPutUrl(input: {
    allowLargeUploads: boolean;
    bucket: string;
    storageKey: string;
    contentType?: string;
    expiresInSeconds?: number;
    isFinalDraft: boolean;
    sizeBytes: number;
  }) {
    this.assertManagedStorageKey(input.storageKey);
    this.assertUploadSizeAllowed({
      allowLargeUploads: input.allowLargeUploads,
      isFinalDraft: input.isFinalDraft,
      sizeBytes: input.sizeBytes,
    });
    await storageService.assertCanAllocateStorage({
      requiredBytes: input.sizeBytes,
    });

    if (!this.storage.getPresignedPutObjectUrl) {
      throw new AppError(
        "Presigning is not supported by the configured storage.",
        503,
        "presign_unsupported",
      );
    }

    const { url, expiresAt } = await this.storage.getPresignedPutObjectUrl({
      bucket: input.bucket,
      key: input.storageKey,
      contentType: input.contentType,
      expiresInSeconds: input.expiresInSeconds,
    });

    return { url, expiresAt };
  }

  async getPresignedMultipartPartUrl(input: {
    allowLargeUploads: boolean;
    bucket: string;
    storageKey: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds?: number;
    isFinalDraft: boolean;
    sizeBytes: number;
  }) {
    this.assertManagedStorageKey(input.storageKey);
    this.assertUploadSizeAllowed({
      allowLargeUploads: input.allowLargeUploads,
      isFinalDraft: input.isFinalDraft,
      sizeBytes: input.sizeBytes,
    });
    await storageService.assertCanAllocateStorage({
      requiredBytes: input.sizeBytes,
    });

    if (!this.storage.getPresignedMultipartPartUrl) {
      throw new AppError(
        "Presigning is not supported by the configured storage.",
        503,
        "presign_unsupported",
      );
    }

    const { url, expiresAt } = await this.storage.getPresignedMultipartPartUrl({
      bucket: input.bucket,
      key: input.storageKey,
      uploadId: input.uploadId,
      partNumber: input.partNumber,
      expiresInSeconds: input.expiresInSeconds,
    });

    return { url, expiresAt };
  }

  async uploadUploadedObjectContent(input: {
    allowLargeUploads: boolean;
    abortSignal?: AbortSignal;
    body: ArrayBuffer | Uint8Array;
    bucket: string;
    contentLength: number;
    contentType: string;
    isFinalDraft: boolean;
    sizeBytes: number;
    storageKey: string;
  }): Promise<UploadedObjectDTO> {
    this.assertManagedStorageKey(input.storageKey);
    this.assertUploadSizeAllowed({
      allowLargeUploads: input.allowLargeUploads,
      isFinalDraft: input.isFinalDraft,
      sizeBytes: input.sizeBytes,
    });
    await storageService.assertCanAllocateStorage({
      requiredBytes: input.sizeBytes,
    });

    if (shouldUseMultipartUpload(input.sizeBytes)) {
      throw new AppError(
        "Large uploads must use multipart upload.",
        409,
        "multipart_upload_required",
        {
          multipartThresholdBytes: uploadConfig.multipartThresholdBytes,
          sizeBytes: input.sizeBytes,
        },
      );
    }

    if (input.contentLength !== input.sizeBytes) {
      throw new AppError(
        "Uploaded file size does not match the upload session.",
        400,
        "file_size_mismatch",
        {
          actualSizeBytes: input.contentLength,
          expectedSizeBytes: input.sizeBytes,
        },
      );
    }

    await this.storage.uploadFile({
      abortSignal: input.abortSignal,
      body: input.body,
      bucket: input.bucket,
      contentLength: input.contentLength,
      contentType: input.contentType,
      key: input.storageKey,
    });

    return {
      bucket: input.bucket,
      storageKey: input.storageKey,
      uploadId: null,
    };
  }

  async uploadUploadSessionMultipartPart(input: {
    allowLargeUploads: boolean;
    abortSignal?: AbortSignal;
    body: ArrayBuffer | Uint8Array;
    bucket: string;
    contentLength: number;
    isFinalDraft: boolean;
    partNumber: number;
    sizeBytes: number;
    storageKey: string;
    uploadId: string;
  }) {
    this.assertManagedStorageKey(input.storageKey);
    this.assertUploadSizeAllowed({
      allowLargeUploads: input.allowLargeUploads,
      isFinalDraft: input.isFinalDraft,
      sizeBytes: input.sizeBytes,
    });
    await storageService.assertCanAllocateStorage({
      requiredBytes: input.sizeBytes,
    });

    if (!shouldUseMultipartUpload(input.sizeBytes)) {
      throw new AppError(
        "Multipart upload is only available for files above the configured threshold.",
        409,
        "multipart_upload_not_required",
        {
          multipartThresholdBytes: uploadConfig.multipartThresholdBytes,
          sizeBytes: input.sizeBytes,
        },
      );
    }

    const partRange = getMultipartPartRange(input.sizeBytes, input.partNumber);

    if (!partRange) {
      throw new AppError(
        "partNumber is outside the expected multipart range.",
        400,
        "multipart_part_out_of_range",
        {
          partNumber: input.partNumber,
          totalParts: getMultipartPartCount(input.sizeBytes),
        },
      );
    }

    if (input.contentLength !== partRange.contentLength) {
      throw new AppError(
        "Multipart part size does not match the expected file slice.",
        400,
        "multipart_part_size_mismatch",
        {
          actualSizeBytes: input.contentLength,
          expectedSizeBytes: partRange.contentLength,
          partNumber: input.partNumber,
        },
      );
    }

    const result = await this.storage.uploadMultipartPart({
      abortSignal: input.abortSignal,
      body: input.body,
      bucket: input.bucket,
      contentLength: input.contentLength,
      key: input.storageKey,
      partNumber: input.partNumber,
      uploadId: input.uploadId,
    });

    return {
      etag: result.etag,
      partNumber: result.partNumber,
    };
  }

  async completeUploadSessionMultipart(input: {
    allowLargeUploads: boolean;
    abortSignal?: AbortSignal;
    bucket: string;
    isFinalDraft: boolean;
    parts: Array<{
      etag: string;
      partNumber: number;
    }>;
    sizeBytes: number;
    storageKey: string;
    uploadId: string;
  }): Promise<UploadedObjectDTO> {
    this.assertManagedStorageKey(input.storageKey);
    this.assertUploadSizeAllowed({
      allowLargeUploads: input.allowLargeUploads,
      isFinalDraft: input.isFinalDraft,
      sizeBytes: input.sizeBytes,
    });
    await storageService.assertCanAllocateStorage({
      requiredBytes: input.sizeBytes,
    });

    if (!shouldUseMultipartUpload(input.sizeBytes)) {
      throw new AppError(
        "Multipart upload is only available for files above the configured threshold.",
        409,
        "multipart_upload_not_required",
        {
          multipartThresholdBytes: uploadConfig.multipartThresholdBytes,
          sizeBytes: input.sizeBytes,
        },
      );
    }

    this.assertMultipartPartsComplete(input.sizeBytes, input.parts);

    try {
      await this.storage.completeMultipartUpload({
        abortSignal: input.abortSignal,
        bucket: input.bucket,
        key: input.storageKey,
        parts: input.parts,
        uploadId: input.uploadId,
      });
    } catch (error) {
      await this.safeAbortMultipartUpload(
        input.bucket,
        input.storageKey,
        input.uploadId,
      );
      throw error;
    }

    return {
      bucket: input.bucket,
      storageKey: input.storageKey,
      uploadId: input.uploadId,
    };
  }

  async abortUploadSessionMultipart(input: {
    bucket: string;
    reason: MultipartUploadAbortReason;
    storageKey: string;
    uploadId: string;
  }): Promise<UploadedObjectCleanupResultDTO> {
    this.assertManagedStorageKey(input.storageKey);

    try {
      const result = await this.storage.abortMultipartUpload({
        bucket: input.bucket,
        key: input.storageKey,
        uploadId: input.uploadId,
      });

      return {
        aborted: result.aborted,
        bucket: result.bucket,
        reason: input.reason,
        storageKey: result.key,
        uploadId: result.uploadId,
      };
    } catch (error) {
      this.logUploadCleanupFailure("abort_multipart_upload", input, error);
      throw error;
    }
  }

  async deleteUploadedObject(input: {
    bucket: string;
    storageKey: string;
    uploadId?: string | null;
  }): Promise<UploadedObjectDeleteResultDTO> {
    this.assertManagedStorageKey(input.storageKey);

    try {
      if (input.uploadId) {
        await this.safeAbortMultipartUpload(
          input.bucket,
          input.storageKey,
          input.uploadId,
        );
      }

      await this.storage.deleteFile({
        bucket: input.bucket,
        key: input.storageKey,
      });
    } catch (error) {
      this.logUploadCleanupFailure("delete_uploaded_object", input, error);
      throw error;
    }

    return {
      bucket: input.bucket,
      deleted: true,
      storageKey: input.storageKey,
      uploadId: input.uploadId ?? null,
    };
  }

  private getInitialVersionProcessingState(shouldProcessPreview: boolean) {
    const jobId = shouldProcessPreview ? randomUUID() : null;

    return {
      jobId,
      processingStatus: shouldProcessPreview
        ? FileProcessingStatus.Queued
        : FileProcessingStatus.Skipped,
      queuedAt: shouldProcessPreview ? new Date() : null,
    };
  }

  private async validateStoredUploadForCommit(input: {
    allowLargeUploads: boolean;
    file: Pick<
      CommitUploadedFileInput,
      | "bucket"
      | "extension"
      | "mimeType"
      | "originalName"
      | "sizeBytes"
      | "storageKey"
    >;
    isFinalDraft: boolean;
  }) {
    this.assertManagedStorageKey(input.file.storageKey);

    this.assertUploadSizeAllowed({
      allowLargeUploads: input.allowLargeUploads,
      isFinalDraft: input.isFinalDraft,
      sizeBytes: input.file.sizeBytes,
    });
  }

  private async enqueueVersionProcessingIfNeeded(input: {
    file: {
      id: string;
      name: string;
      projectId: string;
    };
    project: {
      title: string;
    };
    version: FileVersionRecord;
  }) {
    if (!input.version.processingJobId) {
      return input.version;
    }

    const processedKey = buildProcessedStorageKey({
      originalStorageKey: input.version.storageKey,
      originalName: input.version.originalName,
      processedExtension: input.version.extension,
      revisionNumber: input.version.revisionNumber,
    });

    const logKey = buildProcessingLogStorageKey({
      originalStorageKey: input.version.storageKey,
      jobId: input.version.processingJobId,
      revisionNumber: input.version.revisionNumber,
    });

    try {
      // TODO(credits): Reserve credits here before queueing worker-backed paid
      // processing features such as watermarking, large-upload overage work,
      // and future video preview/transcode jobs. Retries should reuse a stable
      // idempotency key and capture or release the same reservation.
      // Provide optional processing hints to the worker. For final drafts
      // we force preview generation and request a watermarked preview while
      // explicitly avoiding a watermark-credit deduction at enqueue time.
      await enqueueProcessingJob({
        jobId: input.version.processingJobId,
        fileId: input.file.id,
        fileVersionId: input.version.id,
        fileName: input.file.name,
        originalName: input.version.originalName,
        mimeType: input.version.mimeType,
        extension: input.version.extension,
        sizeBytes: input.version.sizeBytes,
        sourceBucket: input.version.storageBucket,
        sourceKey: input.version.storageKey,
        outputBucket: input.version.storageBucket,
        outputKey: processedKey,
        logKey,
        user: {
          id: MANAGED_UPLOAD_OWNER,
          email: MANAGED_UPLOAD_OWNER,
          name: MANAGED_UPLOAD_OWNER,
          tier: (await resolveActiveActor()).plan,
        },
        isLargeFile: exceedsStandardUploadLimit(input.version.sizeBytes),
        isFinalDraft: Boolean(input.version.isFinalDraft),
        forcePreviewGeneration: Boolean(input.version.isFinalDraft),
        applyPreviewWatermark: Boolean(
          input.version.isFinalDraft || input.version.watermarkEnabled,
        ),
        chargeWatermarkCredits: Boolean(!input.version.isFinalDraft && input.version.watermarkEnabled),
        watermarkReason: input.version.isFinalDraft ? "final_draft_preview" : null,
      });
    } catch (error) {
      const workerFailure = toWorkerProcessingFailure(error);
      const failedVersion = await this.repository.updateVersionProcessingResult(
        input.version.id,
        {
          processingStatus: FileProcessingStatus.Failed,
          processingJobId: input.version.processingJobId,
          processingErrorCode: workerFailure.code,
          processingErrorMessage: workerFailure.message,
          processingStartedAt: null,
          processingCompletedAt: null,
          updatedAt: new Date(),
        },
      );

      await creditService.refundCreditsForVersion(input.version.id, "worker_enqueue_failed");

      const finalVersion = failedVersion ?? input.version;

      await this.createFileProcessingNotification({
        category: "file_processing_failed",
        descriptionKey: "notification.fileProcessingStartFailedDescription",
        eventKey: `file-processing:${input.version.id}:${input.version.processingJobId}:${FileProcessingStatus.Failed}`,
        fileId: input.file.id,
        metadata: {
          jobId: input.version.processingJobId,
          reason: workerFailure.code,
          status: FileProcessingStatus.Failed,
        },
        projectId: input.file.projectId,
        titleKey: "notification.fileProcessingFailedTitle",
      });

      return finalVersion;
    }

    return input.version;
  }

  async commitUploadedFiles(
    input: CommitUploadedFilesInput | CommitUploadedFilesPayload,
    options: {
      sourceLocale: string;
      viewerLocale: string;
      idempotencyKeyBase?: string | null;
    },
  ): Promise<CommitUploadedFilesResultDTO> {
    const projectIdentifier = normalizeProjectId(input.projectId);

    if (!projectIdentifier) {
      throw new AppError("projectId is required.", 400, "validation_error");
    }

    const project = await this.getRequiredProject(projectIdentifier);
    const committed: CommitUploadedFilesResultDTO["committed"] = [];
    const failed: CommitUploadedFilesResultDTO["failed"] = [];

    // Resolve billing scope once so idempotency keys include stable scope info.
    const { scope } = await creditService.getOrCreateCreditAccountForScope();

    await Promise.all(
      input.files.map(async (file) => {
        try {
          await this.validateStoredUploadForCommit({
            allowLargeUploads: input.allowLargeUploads,
            file,
            isFinalDraft: false,
          });
        } catch (error) {
          const safeError = describeSafeError(error);
          const isSafeAppError = isAppError(error);
          failed.push({
            code: safeError.code,
            details: safeError.details ?? null,
            localFileId: file.localFileId,
            message: isSafeAppError ? error.message : "File verification failed.",
            messageKey: isSafeAppError ? undefined : safeError.messageKey,
            params: safeError.params,
            requestId: safeError.requestId,
          });
        }
      })
    );

    const validFiles = input.files.filter(f => !failed.some(fail => fail.localFileId === f.localFileId));

    const DB_CONCURRENCY = 15;
    let currentIndex = 0;

    const processNext = async () => {
      while (currentIndex < validFiles.length) {
        const file = validFiles[currentIndex++];
        let createdRecord: { fileId: string; versionId: string } | null = null;
        let persisted = false;
        let fileCreditCharges: PendingCreditCharge[] = [];

        try {
          const existingRecord = await this.repository.findFileWithVersionByStorageKey(
            file.storageKey,
            { includeDeleted: true },
          );

          if (existingRecord) {
            if (existingRecord.file.deletedAt) {
              throw new AppError(
                "Uploaded object already belongs to a deleted file record.",
                409,
                "uploaded_object_already_deleted",
                { storageKey: file.storageKey },
              );
            }

            if (existingRecord.file.id !== file.fileId) {
              throw new AppError(
                "Uploaded object already belongs to another file.",
                409,
                "uploaded_object_already_committed",
                { storageKey: file.storageKey },
              );
            }

            committed.push({
              file: await this.buildFileDTO(
                existingRecord.file,
                options.viewerLocale,
                existingRecord.version,
              ),
              fileVersionId: existingRecord.version?.id ?? null,
              localFileId: file.localFileId,
              processingErrorCode: existingRecord.version?.processingErrorCode ?? null,
              processingErrorMessage: existingRecord.version?.processingErrorMessage ?? null,
              processingJobId: existingRecord.version?.processingJobId ?? null,
              processingStatus: existingRecord.version?.processingStatus ?? null,
            });
            continue;
          }

          await storageService.assertCanAllocateStorage({
            requiredBytes: file.sizeBytes,
          });

          const watermarkEnabled = file.watermarkEnabled ?? project.watermarkEnabled;
          const useSoftWatermark = input.useSoftWatermark ?? false;
          const plan = determineFileProcessingPlan({
            allowLargeUploads: input.allowLargeUploads,
            extension: file.extension,
            sizeBytes: file.sizeBytes,
            watermarkEnabled,
            useSoftWatermark,
            isFinalDraft: false,
          });

          const creditActions: Parameters<typeof chargeCreditActions>[0] = [];

          if (plan.willChargeLargeUploadCredits) {
            creditActions.push({
              featureParams: {
                currency: project.currency,
                featureKey: "large_upload_overage",
                sizeBytes: file.sizeBytes,
              },
              fileId: file.fileId,
              idempotencyKey: `large_upload:${scope.scopeType}:${scope.scopeId}:${project.id}:${file.fileId}:${file.localFileId}`,
              metadata: {
                featureReason: "large_upload_overage",
                fileId: file.fileId,
                sizeBytes: file.sizeBytes,
              },
              projectId: project.id,
            });
          }

          if (plan.willChargeWatermarkCredits) {
            creditActions.push({
              featureParams: toWatermarkFeatureParams({
                projectCurrency: project.currency,
                watermarkCreditInput: file.watermarkCreditInput,
                isSoftWatermark: useSoftWatermark,
              }),
              fileId: file.fileId,
              idempotencyKey: buildCreditOperationId("watermark", [
                project.id,
                file.fileId,
                file.storageKey,
                file.originalName,
                options.idempotencyKeyBase,
                file.localFileId,
              ]),
              metadata: {
                featureReason: "watermark_upload_processing",
                fileId: file.fileId,
                mediaType: file.watermarkCreditInput?.mediaType ?? "unknown",
              },
              projectId: project.id,
            });
          }

          const processingState = this.getInitialVersionProcessingState(
            plan.shouldQueueProcessing,
          );
          const name = trimFileTitle(file.name);

          const record = await this.repository.createWithInitialVersion({
            file: {
              id: file.fileId,
              name,
              nameSourceLocale: defaultLocale,
              projectId: project.id,
              uploadedBy: MANAGED_UPLOAD_OWNER,
              uploadStatus: FileUploadStatus.Uploaded,
            },
            version: {
              extension: file.extension,
              originalName: file.originalName.trim(),
              mimeType: file.mimeType,
              sizeBytes: file.sizeBytes,
              storageBucket: file.bucket,
              storageKey: file.storageKey,
              uploadedBy: MANAGED_UPLOAD_OWNER,
              revisionNumber: 1,
              watermarkEnabled,
              useSoftWatermark,
              processingStatus: processingState.processingStatus,
              processingJobId: processingState.jobId,
              processingAttempts: 0,
              queuedAt: processingState.queuedAt,
            },
          });
          createdRecord = {
            fileId: record.file.id,
            versionId: record.version.id,
          };

          try {
            const effectiveActions = creditActions.map((a) => ({
              ...a,
              versionId: a.versionId ?? record.version.id,
            }));

            fileCreditCharges = await chargeCreditActions(effectiveActions);
          } catch (err) {
            throw err;
          }

          const storageCommitId = buildStorageOperationId("storage-commit-upload", [
            project.id,
            file.fileId,
            file.storageKey,
            file.sizeBytes,
            options.idempotencyKeyBase,
            file.localFileId,
          ]);

          await storageService.commitStorageUsage({
            bytes: file.sizeBytes,
            fileId: record.file.id,
            idempotencyKey: storageCommitId,
            metadata: {
              storageKey: file.storageKey,
              storageReason: "new_file_upload",
            },
            projectId: project.id,
            versionId: record.version.id,
          });

          persisted = true;

          let finalVersion = record.version;

          if (plan.shouldQueueProcessing) {
            finalVersion = await this.enqueueVersionProcessingIfNeeded({
              file: {
                id: record.file.id,
                name: record.file.name,
                projectId: record.file.projectId,
              },
              project: {
                title: project.title,
              },
              version: record.version,
            });
          } else {
            const updated = await this.repository.updateVersion(record.version.id, {
              processingStatus: FileProcessingStatus.Completed,
              processingStartedAt: new Date(),
              processingCompletedAt: new Date(),
              processingJobId: null,
              processingErrorCode: null,
              processingErrorMessage: null,
              updatedAt: new Date(),
            });
            finalVersion = updated ?? record.version;
          }

          committed.push({
            file: await this.buildFileDTO(
              record.file,
              options.viewerLocale,
              finalVersion,
            ),
            fileVersionId: record.version.id,
            localFileId: file.localFileId,
            processingErrorCode: finalVersion.processingErrorCode,
            processingErrorMessage: finalVersion.processingErrorMessage,
            processingJobId: finalVersion.processingJobId,
            processingStatus: finalVersion.processingStatus,
          });
        } catch (error) {
          if (!persisted && createdRecord) {
            await this.repository.hardDeleteWithVersions(createdRecord.fileId);
          }

          if (!persisted && fileCreditCharges.length > 0) {
            await refundCreditActions(fileCreditCharges);
          }

          const safeError = describeSafeError(error);
          const isSafeAppError = isAppError(error);
          
          failed.push({
            code: safeError.code,
            details: safeError.details ?? null,
            localFileId: file.localFileId,
            message: isSafeAppError ? error.message : "Upload failed. Please try again.",
            messageKey: isSafeAppError ? undefined : safeError.messageKey,
            params: safeError.params,
            requestId: safeError.requestId,
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(DB_CONCURRENCY, validFiles.length) }, () =>
        processNext()
      )
    );

    return {
      committed,
      failed,
    };
  }

  async commitUploadedFileVersion(
    input: {
      allowLargeUploads: boolean;
      fileId: string;
      files: CommitProjectFileVersionBody["files"];
      isFinalDraft: boolean;
      projectId: string;
      revisionDescription?: string | null;
      sourceLocale: string;
      useSoftWatermark?: boolean;
      viewerLocale: string;
    },
    options?: { idempotencyKeyBase?: string | null },
  ): Promise<CommitUploadedFilesResultDTO> {
    const projectIdentifier = normalizeProjectId(input.projectId);

    if (!projectIdentifier) {
      throw new AppError("projectId is required.", 400, "validation_error");
    }

    const project = await this.getRequiredProject(projectIdentifier);
    const fileWithVersions = await this.repository.findWithVersionsById(
      input.fileId,
    );

    if (!fileWithVersions || fileWithVersions.file.projectId !== project.id) {
      throw new NotFoundAppError("File not found.");
    }

    const hasFinalDraft = fileWithVersions.versions.some(
      (version) =>
        version.id === fileWithVersions.file.finalDraftVersionId ||
        version.isFinalDraft,
    );
    const uploadMode = getFileReviewUploadMode({
      finalDraftReportStatus: fileWithVersions.file.finalDraftReportStatus,
      hasFinalDraft,
    });

    const targetFile = input.files[0];

    if (!targetFile) {
      throw new AppError(
        "files must include exactly one ready upload.",
        400,
        "validation_error",
      );
    }

    if (targetFile.fileId !== input.fileId) {
      throw new AppError(
        "Uploaded object does not belong to the target file.",
        409,
        "uploaded_object_wrong_file",
        {
          expectedFileId: input.fileId,
          receivedFileId: targetFile.fileId,
        },
      );
    }

    if (input.isFinalDraft && input.allowLargeUploads) {
      throw new AppError(
        "Final draft uploads cannot enable the large upload path.",
        409,
        "final_draft_large_uploads_disabled",
      );
    }

    if (uploadMode === "locked_after_final_draft") {
      throw new AppError(
        "New revisions are locked after a final draft has been uploaded.",
        409,
        "file_final_draft_upload_locked",
      );
    }

    if (uploadMode === "final_draft_replacement_only" && !input.isFinalDraft) {
      throw new AppError(
        "This file can only accept a final draft replacement right now.",
        409,
        "final_draft_replacement_only",
      );
    }
    const isFinalDraftMismatchReplacement =
      input.isFinalDraft &&
      uploadMode === "final_draft_replacement_only";

    if (
      input.isFinalDraft &&
      !isFinalDraftMismatchReplacement &&
      !fileWithVersions.file.approvedVersionId
    ) {
      throw new AppError(
        "Approve a version before the final draft can be uploaded.",
        409,
        "file_final_draft_requires_approval",
      );
    }

    const committed: CommitUploadedFilesResultDTO["committed"] = [];
    const failed: CommitUploadedFilesResultDTO["failed"] = [];
    let createdVersion: { versionId: string } | null = null;
    let persisted = false;
    let versionCreditCharges: PendingCreditCharge[] = [];
    const revisionDescription = input.revisionDescription?.trim() ?? "";

    try {
      const existingRecord = await this.repository.findFileWithVersionByStorageKey(
        targetFile.storageKey,
        { includeDeleted: true },
      );

      if (existingRecord) {
        if (existingRecord.file.deletedAt) {
          throw new AppError(
            "Uploaded object already belongs to a deleted file record.",
            409,
            "uploaded_object_already_deleted",
            { storageKey: targetFile.storageKey },
          );
        }

        if (existingRecord.file.id !== input.fileId) {
          throw new AppError(
            "Uploaded object already belongs to another file.",
            409,
            "uploaded_object_already_committed",
            { storageKey: targetFile.storageKey },
          );
        }

        committed.push({
          file: await this.buildFileDTO(
            existingRecord.file,
            input.viewerLocale,
            existingRecord.version,
          ),
          fileVersionId: existingRecord.version?.id ?? null,
          localFileId: targetFile.localFileId,
          processingErrorCode:
            existingRecord.version?.processingErrorCode ?? null,
          processingErrorMessage:
            existingRecord.version?.processingErrorMessage ?? null,
          processingJobId: existingRecord.version?.processingJobId ?? null,
          processingStatus: existingRecord.version?.processingStatus ?? null,
        });

        return {
          committed,
          failed,
        };
      }

      await storageService.assertCanAllocateStorage({
        requiredBytes: targetFile.sizeBytes,
      });
      const watermarkEnabled =
        targetFile.watermarkEnabled ?? project.watermarkEnabled;
      const useSoftWatermark = input.useSoftWatermark ?? false;
      const plan = determineFileProcessingPlan({
        allowLargeUploads: input.allowLargeUploads,
        extension: targetFile.extension,
        sizeBytes: targetFile.sizeBytes,
        watermarkEnabled,
        useSoftWatermark,
        isFinalDraft: input.isFinalDraft,
      });

      const creditActions: Parameters<typeof chargeCreditActions>[0] = [];
      // Resolve the active credit billing scope so idempotency keys can
      // include scope type/id and be stable across retries.
      const { scope } = await creditService.getOrCreateCreditAccountForScope();

      if (plan.willChargeLargeUploadCredits) {
        creditActions.push({
          featureParams: {
            currency: project.currency,
            featureKey: "large_upload_overage",
            sizeBytes: targetFile.sizeBytes,
          },
          fileId: input.fileId,
          // Stable idempotency key including scope and upload session id.
          idempotencyKey: `large_upload:${scope.scopeType}:${scope.scopeId}:${project.id}:${input.fileId}:${targetFile.localFileId}`,
          metadata: {
            featureReason: "large_upload_overage",
            fileId: input.fileId,
            sizeBytes: targetFile.sizeBytes,
          },
          projectId: project.id,
        });
      }

      if (plan.willChargeWatermarkCredits) {
        creditActions.push({
          featureParams: toWatermarkFeatureParams({
            projectCurrency: project.currency,
            watermarkCreditInput: targetFile.watermarkCreditInput,
            isSoftWatermark: useSoftWatermark,
          }),
          fileId: input.fileId,
          idempotencyKey: buildCreditOperationId("watermark", [
            project.id,
            input.fileId,
            targetFile.storageKey,
            options?.idempotencyKeyBase,
            targetFile.localFileId,
          ]),
          metadata: {
            featureReason: "watermark_upload_processing",
            fileId: input.fileId,
            mediaType: targetFile.watermarkCreditInput?.mediaType ?? "unknown",
          },
          projectId: project.id,
        });
      }

      if (!input.isFinalDraft) {
        const totalBillableRevisions =
          await this.repository.countProjectBillableRevisions(project.id);
        const nextBillableRevisionCount = totalBillableRevisions + 1;

        if (nextBillableRevisionCount > project.revisionLimit) {
          creditActions.push({
            featureParams: {
              currency: project.currency,
              featureKey: "revision_add_on",
              revisionAddOnKey: "extra1Revision",
            },
            fileId: input.fileId,
            idempotencyKey: buildCreditOperationId("revision-add-on", [
              project.id,
              input.fileId,
              targetFile.storageKey,
              nextBillableRevisionCount,
            ]),
            metadata: {
              featureReason: "extra_revision_usage",
              fileId: input.fileId,
              revisionCount: nextBillableRevisionCount,
            },
            projectId: project.id,
          });
        }
      }

      if (isFinalDraftMismatchReplacement) {
        // Build a stable idempotency key for final-draft reuploads that
        // includes billing scope and the previously reported final-draft id.
        const reportedFinalDraftVersionId = fileWithVersions.file.finalDraftVersionId ?? "none";

        creditActions.push({
          featureParams: {
            currency: project.currency,
            featureKey: "final_draft_mismatch_reupload",
          },
          fileId: input.fileId,
          idempotencyKey: `final_draft_reupload:${scope.scopeType}:${scope.scopeId}:${project.id}:${input.fileId}:${reportedFinalDraftVersionId}:${targetFile.localFileId}`,
          metadata: {
            featureReason: "final_draft_mismatch_reupload",
            fileId: input.fileId,
            reportStatus: fileWithVersions.file.finalDraftReportStatus,
          },
          projectId: project.id,
        });
      }

      versionCreditCharges = await chargeCreditActions(creditActions);
      const processingState = this.getInitialVersionProcessingState(
        plan.shouldQueueProcessing,
      );
      const appended = await this.repository.appendVersion({
        fileId: input.fileId,
        markAsFinalDraft: input.isFinalDraft,
        version: {
          extension: targetFile.extension,
          isFinalDraft: input.isFinalDraft,
          mimeType: targetFile.mimeType,
          originalName: targetFile.originalName.trim(),
          revisionDescription: revisionDescription || null,
          revisionDescriptionSourceLocale: revisionDescription
            ? detectDynamicTextLocale(revisionDescription)
            : null,
          processingAttempts: 0,
          processingJobId: processingState.jobId,
          processingStatus: processingState.processingStatus,
          queuedAt: processingState.queuedAt,
          sizeBytes: targetFile.sizeBytes,
          storageBucket: targetFile.bucket,
          storageKey: targetFile.storageKey,
          uploadedBy: MANAGED_UPLOAD_OWNER,
          watermarkEnabled,
          useSoftWatermark,
        },
      });

      if (!appended) {
        throw new NotFoundAppError("File not found.");
      }
      createdVersion = {
        versionId: appended.version.id,
      };

      await storageService.commitStorageUsage({
        bytes: targetFile.sizeBytes,
        fileId: appended.file.id,
        idempotencyKey: buildStorageOperationId("storage-commit-revision", [
          project.id,
          input.fileId,
          appended.version.id,
          targetFile.storageKey,
          targetFile.sizeBytes,
          options?.idempotencyKeyBase,
          targetFile.localFileId,
        ]),
        metadata: {
          storageKey: targetFile.storageKey,
          storageReason: input.isFinalDraft ? "final_draft_upload" : "revision_upload",
        },
        projectId: project.id,
        versionId: appended.version.id,
      });
      persisted = true;

      const previousVersionIds = fileWithVersions.versions
        .map((version) => version.id)
        .filter((versionId) => versionId !== appended.version.id);

      if (previousVersionIds.length > 0) {
        await Promise.all(
          previousVersionIds.map((versionId) =>
            fileRevisionNoteService.resolveCommentsForFileVersion(versionId),
          ),
        );
      }

      if (
        input.isFinalDraft &&
        fileWithVersions.file.approvedVersionId &&
        fileWithVersions.file.approvedVersionId !== appended.version.id
      ) {
        await this.repository.updateVersion(fileWithVersions.file.approvedVersionId, {
          previewRetentionUntil: createPreviewRetentionDate(),
          updatedAt: new Date(),
        });
      }

      let processedVersion = appended.version;

      if (plan.shouldQueueProcessing) {
        processedVersion = await this.enqueueVersionProcessingIfNeeded({
          file: {
            id: appended.file.id,
            name: appended.file.name,
            projectId: appended.file.projectId,
          },
          project: {
            title: project.title,
          },
          version: appended.version,
        });
      } else {
        const updated = await this.repository.updateVersion(appended.version.id, {
          processingStatus: FileProcessingStatus.Completed,
          processingStartedAt: new Date(),
          processingCompletedAt: new Date(),
          processingJobId: null,
          processingErrorCode: null,
          processingErrorMessage: null,
          updatedAt: new Date(),
        });

        processedVersion = updated ?? appended.version;
      }
      const finalVersion =
        input.isFinalDraft || processedVersion.id === appended.file.approvedVersionId
          ? await this.repository.updateVersion(processedVersion.id, {
            previewRetentionUntil: createPreviewRetentionDate(),
            updatedAt: new Date(),
          }) ?? processedVersion
          : processedVersion;
      const finalFile = input.isFinalDraft
        ? await this.repository.update(appended.file.id, {
          finalDraftReportMessage: null,
          finalDraftReportReason: null,
          finalDraftReportSourceLocale: defaultLocale,
          finalDraftReportStatus: FileFinalDraftReportStatus.None,
          finalDraftReportedAt: null,
          finalDraftVersionId: finalVersion.id,
          updatedAt: new Date(),
        })
        : appended.file;

      committed.push({
        file: await this.buildFileDTO(
          finalFile ?? appended.file,
          input.viewerLocale,
          finalVersion,
        ),
        fileVersionId: finalVersion.id,
        localFileId: targetFile.localFileId,
        processingErrorCode: finalVersion.processingErrorCode,
        processingErrorMessage: finalVersion.processingErrorMessage,
        processingJobId: finalVersion.processingJobId,
        processingStatus: finalVersion.processingStatus,
      });
    } catch (error) {
      if (!persisted && createdVersion) {
        await this.repository.hardDeleteVersion({
          fileId: input.fileId,
          fileUpdate: {
            approvalStatus: fileWithVersions.file.approvalStatus,
            approvedVersionId: fileWithVersions.file.approvedVersionId,
            currentVersionId: fileWithVersions.file.currentVersionId,
            extension: fileWithVersions.file.extension,
            finalDraftReportMessage: fileWithVersions.file.finalDraftReportMessage,
            finalDraftReportReason: fileWithVersions.file.finalDraftReportReason,
            finalDraftReportSourceLocale:
              fileWithVersions.file.finalDraftReportSourceLocale,
            finalDraftReportStatus: fileWithVersions.file.finalDraftReportStatus,
            finalDraftReportedAt: fileWithVersions.file.finalDraftReportedAt,
            finalDraftVersionId: fileWithVersions.file.finalDraftVersionId,
            mimeType: fileWithVersions.file.mimeType,
            originalName: fileWithVersions.file.originalName,
            sizeBytes: fileWithVersions.file.sizeBytes,
            storageBucket: fileWithVersions.file.storageBucket,
            storageKey: fileWithVersions.file.storageKey,
            updatedAt: new Date(),
            uploadedBy: fileWithVersions.file.uploadedBy,
            uploadStatus:
              fileWithVersions.file.uploadStatus === FileUploadStatus.Deleted
                ? FileUploadStatus.Uploaded
                : fileWithVersions.file.uploadStatus,
          },
          versionId: createdVersion.versionId,
        });
      }

      if (!persisted && versionCreditCharges.length > 0) {
        await refundCreditActions(versionCreditCharges);
      }

      const safeError = describeSafeError(error);
      const isSafeAppError = isAppError(error);
      
      failed.push({
        code: safeError.code,
        details: safeError.details ?? null,
        localFileId: targetFile.localFileId,
        message: isSafeAppError ? error.message : "Upload failed. Please try again.",
        messageKey: isSafeAppError ? undefined : safeError.messageKey,
        params: safeError.params,
        requestId: safeError.requestId,
      });
    }

    return {
      committed,
      failed,
    };
  }

  async cleanupOrphanedUploads(
    input: OrphanedUploadCleanupInput,
  ): Promise<OrphanedUploadCleanupResultDTO> {
    const olderThanMs = input.olderThanHours * 60 * 60 * 1000;
    const threshold = Date.now() - olderThanMs;
    const prefix = getManagedUploadPrefix();
    const items: OrphanedUploadCleanupResultDTO["items"] = [];
    let checkedObjects = 0;
    let deletedObjects = 0;
    let checkedMultipartUploads = 0;
    let abortedMultipartUploads = 0;

    // TODO: Protect this admin cleanup endpoint with auth before production use.
    // TODO: Run this cleanup from scheduled infrastructure so orphaned uploads are pruned automatically.
    let continuationToken: string | undefined;
    do {
      const page = await this.storage.listFiles({
        continuationToken,
        prefix,
      });

      for (const object of page.objects) {
        checkedObjects += 1;

        if (!object.lastModified || object.lastModified.getTime() > threshold) {
          continue;
        }

        const existingRecord = await this.repository.findByStorageKey(
          object.key,
          {
            includeDeleted: true,
          },
        );

        if (existingRecord) {
          continue;
        }

        if (input.dryRun) {
          items.push({
            action: "delete_object",
            kind: "object",
            lastModified: object.lastModified.toISOString(),
            storageKey: object.key,
            uploadId: null,
          });
          continue;
        }

        try {
          await this.storage.deleteFile({
            bucket: page.bucket,
            key: object.key,
          });
          deletedObjects += 1;
          items.push({
            action: "delete_object",
            kind: "object",
            lastModified: object.lastModified.toISOString(),
            storageKey: object.key,
            uploadId: null,
          });
        } catch (error) {
          console.error("[cleanup-orphaned-uploads] Failed to delete object", error);
          items.push({
            action: "skip",
            error: getSafeCleanupFailureMessage("delete_object"),
            kind: "object",
            lastModified: object.lastModified.toISOString(),
            storageKey: object.key,
            uploadId: null,
          });
        }
      }

      continuationToken = page.nextContinuationToken ?? undefined;
    } while (continuationToken);

    let keyMarker: string | undefined;
    let uploadIdMarker: string | undefined;
    do {
      const page = await this.storage.listMultipartUploads({
        keyMarker,
        prefix,
        uploadIdMarker,
      });

      for (const upload of page.uploads) {
        checkedMultipartUploads += 1;

        if (!upload.initiatedAt || upload.initiatedAt.getTime() > threshold) {
          continue;
        }

        const existingRecord = await this.repository.findByStorageKey(
          upload.key,
          {
            includeDeleted: true,
          },
        );

        if (existingRecord) {
          continue;
        }

        if (input.dryRun) {
          items.push({
            action: "abort_multipart",
            kind: "multipart",
            lastModified: upload.initiatedAt.toISOString(),
            storageKey: upload.key,
            uploadId: upload.uploadId,
          });
          continue;
        }

        try {
          await this.storage.abortMultipartUpload({
            bucket: page.bucket,
            key: upload.key,
            uploadId: upload.uploadId,
          });
          abortedMultipartUploads += 1;
          items.push({
            action: "abort_multipart",
            kind: "multipart",
            lastModified: upload.initiatedAt.toISOString(),
            storageKey: upload.key,
            uploadId: upload.uploadId,
          });
        } catch (error) {
          console.error(
            "[cleanup-orphaned-uploads] Failed to abort multipart upload",
            error,
          );
          items.push({
            action: "skip",
            error: getSafeCleanupFailureMessage("abort_multipart"),
            kind: "multipart",
            lastModified: upload.initiatedAt.toISOString(),
            storageKey: upload.key,
            uploadId: upload.uploadId,
          });
        }
      }

      keyMarker = page.nextKeyMarker ?? undefined;
      uploadIdMarker = page.nextUploadIdMarker ?? undefined;
    } while (keyMarker || uploadIdMarker);

    return {
      abortedMultipartUploads,
      checkedMultipartUploads,
      checkedObjects,
      deletedObjects,
      dryRun: input.dryRun,
      items,
      olderThanHours: input.olderThanHours,
    };
  }

  async getFileContent(id: string): Promise<{
    body: ReadableStream<Uint8Array>;
    contentLength: number | null;
    contentType: string;
    etag: string | null;
    filename: string;
  }> {
    const fileWithVersions = await this.repository.findWithVersionsById(id);

    if (!fileWithVersions) {
      throw new NotFoundAppError("File not found.");
    }

    const existingRecord = fileWithVersions.file;

    if (existingRecord.uploadStatus !== FileUploadStatus.Uploaded) {
      throw new AppError(
        "File content is not available.",
        409,
        "file_not_ready",
        {
          uploadStatus: existingRecord.uploadStatus,
        },
      );
    }

    // Find the current version to read processed storage paths from
    const currentVersion = fileWithVersions.versions.find(
      (v) => v.id === existingRecord.currentVersionId && v.deletedAt == null,
    );

    // Resolve canonical storage logic:
    // previewStorageBucket ?? processedStorageBucket → fall back to original storageBucket
    let contentBucket = existingRecord.storageBucket;
    let contentKey = existingRecord.storageKey;
    let contentMimeType = existingRecord.mimeType;

    if (currentVersion) {
      const location = resolveDisplayStorageLocation(currentVersion);
      contentBucket = location.previewBucket;
      contentKey = location.previewKey;
      contentMimeType = location.previewMimeType;
    }

    const result = await this.storage.getFile({
      bucket: contentBucket,
      key: contentKey,
    });

    const body =
      result.body instanceof Readable
        ? (Readable.toWeb(result.body) as unknown as ReadableStream<Uint8Array>)
        : result.body;

    if (!(body instanceof ReadableStream)) {
      throw new AppError(
        "File content is unavailable.",
        500,
        "file_stream_unavailable",
      );
    }

    return {
      body,
      contentLength: result.contentLength,
      contentType:
        result.contentType ??
        contentMimeType ??
        "application/octet-stream",
      etag: result.etag,
      filename:
        existingRecord.originalName ||
        existingRecord.name ||
        `${existingRecord.id}${existingRecord.extension}`,
    };
  }

  async getClientSharePreviewContent(input: {
    fileId: string;
    projectId: string;
    versionId?: string;
  }): Promise<{
    redirectUrl: string;
    filename: string;
    mimeType: string;
  }> {
    const project = await this.getRequiredProject(input.projectId);
    const fileWithVersions = await this.repository.findWithVersionsById(
      input.fileId,
      {
        includeDeletedVersions: true,
      },
    );

    if (!fileWithVersions || fileWithVersions.file.projectId !== project.id) {
      throw new NotFoundAppError("File not found.");
    }

    const targetVersion =
      (input.versionId
        ? fileWithVersions.versions.find(
          (version) => version.id === input.versionId,
        )
        : fileWithVersions.versions.find(
          (version) =>
            version.deletedAt == null &&
            version.id === fileWithVersions.file.currentVersionId,
        )) ??
      null;

    if (!targetVersion || targetVersion.deletedAt != null) {
      throw new NotFoundAppError("File version not found.");
    }

    // Use canonical bucket/key resolution to ensure the processed/watermarked file is served when available.
    const {
      previewBucket,
      previewKey,
      previewMimeType,
      previewExtension,
    } = resolveDisplayStorageLocation(targetVersion);

    const kind = getAssetKind({ extension: previewExtension, mimeType: previewMimeType });
    const canPreview = canPreviewAsset(kind);

    if (!canPreview) {
      throw new AppError(
        "Preview is not ready yet.",
        409,
        "client_preview_unavailable",
      );
    }

    // Require processing to be complete (same check as hasClientSafePreview)
    if (targetVersion.processingStatus !== FileProcessingStatus.Completed) {
      throw new AppError(
        "Preview is not ready yet.",
        409,
        "client_preview_unavailable",
      );
    }

    // Generate a presigned URL exactly like buildReviewPreview does for the admin view
    const redirectUrl = await this.getReadableObjectUrl({
      bucket: previewBucket,
      disposition: "inline",
      filename: targetVersion.originalName,
      key: previewKey,
    });

    return {
      redirectUrl,
      filename: targetVersion.originalName,
      mimeType: previewMimeType,
    };
  }

  async approveClientShareRevision(input: {
    fileId: string;
    projectId: string;
    versionId: string;
  }) {
    const project = await this.getRequiredProject(input.projectId);
    const fileWithVersions = await this.repository.findWithVersionsById(
      input.fileId,
      {
        includeDeletedVersions: true,
      },
    );

    if (!fileWithVersions || fileWithVersions.file.projectId !== project.id) {
      throw new NotFoundAppError("File not found.");
    }

    const version = fileWithVersions.versions.find(
      (candidate) => candidate.id === input.versionId,
    );

    if (!version || version.deletedAt != null) {
      throw new NotFoundAppError("File version not found.");
    }

    this.assertClientRevisionCanBeApproved(fileWithVersions, version);

    const approvedAt = new Date();
    const updatedFile = await this.repository.update(fileWithVersions.file.id, {
      approvalStatus: FileApprovalStatus.Approved,
      approvedVersionId: version.id,
      updatedAt: approvedAt,
    });

    if (!updatedFile) {
      throw new NotFoundAppError("File not found.");
    }

    await this.repository.updateVersion(version.id, {
      previewRetentionUntil: createPreviewRetentionDate(approvedAt),
      updatedAt: approvedAt,
    });

    await this.createClientActionNotification({
      descriptionKey: "notification.clientRevisionApprovedDescription",
      fileId: updatedFile.id,
      projectId: project.id,
      titleKey: "notification.clientRevisionApprovedTitle",
    });

    return {
      approvedVersionId: version.id,
      fileId: updatedFile.id,
      status: FileApprovalStatus.Approved,
    };
  }

  async cancelClientShareApproval(input: {
    fileId: string;
    projectId: string;
  }) {
    const project = await this.getRequiredProject(input.projectId);
    const file = await this.repository.findById(input.fileId);

    if (!file || file.projectId !== project.id) {
      throw new NotFoundAppError("File not found.");
    }

    if (!file.approvedVersionId || file.approvalStatus !== FileApprovalStatus.Approved) {
      throw new AppError(
        "There is no approved revision to cancel.",
        409,
        "client_approval_missing",
      );
    }

    if (file.finalDraftVersionId) {
      throw new AppError(
        "Approval can no longer be canceled after the final draft is uploaded.",
        409,
        "client_approval_cancel_locked",
      );
    }

    const updatedAt = new Date();
    const updatedFile = await this.repository.update(file.id, {
      approvalStatus: FileApprovalStatus.Pending,
      approvedVersionId: null,
      updatedAt,
    });

    if (!updatedFile) {
      throw new NotFoundAppError("File not found.");
    }

    await this.createClientActionNotification({
      descriptionKey: "notification.clientApprovalCanceledDescription",
      fileId: updatedFile.id,
      projectId: project.id,
      titleKey: "notification.clientApprovalCanceledTitle",
    });

    return {
      approvedVersionId: null,
      fileId: updatedFile.id,
      status: FileApprovalStatus.Pending,
    };
  }

  async createClientSharePaymentPlaceholder(input: {
    fileId: string;
    projectId: string;
  }) {
    const project = await this.getRequiredProject(input.projectId);
    const workflowSummary =
      await this.repository.getProjectWorkflowSummary(project.id);
    const fileWithVersions = await this.repository.findWithVersionsById(
      input.fileId,
      {
        includeDeletedVersions: true,
      },
    );

    if (!fileWithVersions || fileWithVersions.file.projectId !== project.id) {
      throw new NotFoundAppError("File not found.");
    }

    const finalDraftVersion = fileWithVersions.versions.find(
      (version) =>
        version.deletedAt == null &&
        (version.id === fileWithVersions.file.finalDraftVersionId ||
          version.isFinalDraft),
    );

    if (!finalDraftVersion) {
      throw new AppError(
        "Final draft not found.",
        409,
        "final_draft_missing",
      );
    }

    if (!workflowSummary.allFilesHaveFinalDrafts) {
      throw new AppError(
        "Payment unlock is available after final drafts are added for all files.",
        409,
        "client_payment_final_drafts_missing",
      );
    }

    if ((workflowSummary.unresolvedFinalDraftReportCount ?? 0) > 0) {
      throw new AppError(
        "Payment unlock is blocked while one or more final drafts are under review.",
        409,
        "client_payment_final_drafts_unresolved",
      );
    }

    if ((workflowSummary.finalDraftProcessingIncompleteCount ?? 0) > 0) {
      throw new AppError(
        "Payment unlock is blocked while final draft previews are still processing.",
        409,
        "client_payment_final_drafts_processing_incomplete",
      );
    }

    // TODO: Replace this placeholder with the real project payment flow when it exists.
    return {
      fileId: fileWithVersions.file.id,
      status: "payment_pending_manual" as const,
    };
  }

  async recordFinalDraftDownload(versionId: string): Promise<FileVersionRecord> {
    const version = await this.repository.findVersionById(versionId);

    if (!version) {
      throw new NotFoundAppError("File version not found.");
    }

    if (!version.isFinalDraft) {
      throw new AppError(
        "Only final draft downloads are tracked.",
        409,
        "file_version_not_final_draft",
      );
    }

    const updatedVersion = await this.repository.markVersionDownloaded(
      versionId,
      new Date(),
    );

    if (!updatedVersion) {
      throw new NotFoundAppError("File version not found.");
    }

    return updatedVersion;
  }

  async completeClientShareProjectPayment(input: {
    projectId: string;
  }): Promise<ClientSharePaymentCompletionResultDTO> {
    const project = await this.getRequiredProject(input.projectId);
    const workflowSummary =
      await this.repository.getProjectWorkflowSummary(project.id);

    if (!workflowSummary.allFilesHaveFinalDrafts) {
      throw new AppError(
        "Payment unlock is available after final drafts are added for all files.",
        409,
        "client_payment_final_drafts_missing",
      );
    }

    if ((workflowSummary.unresolvedFinalDraftReportCount ?? 0) > 0) {
      throw new AppError(
        "Payment unlock is blocked while one or more final drafts are under review.",
        409,
        "client_payment_final_drafts_unresolved",
      );
    }

    if ((workflowSummary.finalDraftProcessingIncompleteCount ?? 0) > 0) {
      throw new AppError(
        "Payment unlock is blocked while final draft previews are still processing.",
        409,
        "client_payment_final_drafts_processing_incomplete",
      );
    }

    const completedAt = project.clientPaymentCompletedAt ?? new Date();
    const paymentReference =
      project.clientPaymentReference ??
      `INV-${completedAt.getFullYear()}-${project.publicId.slice(0, 8).toUpperCase()}`;

    if (project.paymentStatus !== ProjectPaymentStatus.Paid) {
      await this.projectRepository.update(project.id, {
        clientPaymentCompletedAt: completedAt,
        clientPaymentReference: paymentReference,
        paymentStatus: ProjectPaymentStatus.Paid,
        updatedAt: new Date(),
      });

      // Cleanup files on payment success:
      // 1. Delete all versions that are not final drafts and not reported.
      // 2. For final drafts, delete the processed/watermarked storage object (keep original).
      const files = await this.repository.findMany({
        includeTotal: false,
        limit: 500,
        offset: 0,
        order: "desc",
        page: 1,
        projectId: project.id,
        sort: "createdAt",
      });

      for (const record of files.records) {
        const fileWithVersions = await this.repository.findWithVersionsById(
          record.id,
          { includeDeletedVersions: false }
        );

        if (!fileWithVersions) continue;

        const safetySummaries = await this.repository.findVersionSafetySummaries(record.id);
        const safetyMap = new Map(safetySummaries.map(s => [s.fileVersionId, s.latestReportStatus]));

        for (const version of fileWithVersions.versions) {
          if (version.isFinalDraft || version.id === record.finalDraftVersionId) {
            // It's a final draft. Delete its processed file to save space, client owns original now.
            if (version.processedStorageBucket && version.processedStorageKey) {
              await this.storage.deleteFile({
                bucket: version.processedStorageBucket,
                key: version.processedStorageKey,
              }).catch(() => {});
              await this.repository.updateVersion(version.id, {
                previewStorageBucket: null,
                previewStorageKey: null,
                processedStorageBucket: null,
                processedStorageKey: null,
                processedExtension: null,
                processedMimeType: null,
                processedSizeBytes: null,
                updatedAt: new Date(),
              });
            }
          } else {
            // Older revision. Delete it if not reported.
            const reportStatus = safetyMap.get(version.id);
            if (reportStatus !== FileVersionReportStatus.Reported) {
              await this.deleteFileVersion({
                deletedBy: "system",
                fileId: record.id,
                projectId: project.id,
                versionId: version.id,
              }).catch(() => {});
            }
          }
        }
      }
    }

    // TODO: Replace this dummy payment completion with the real payment gateway callback.
    return {
      paymentCompletedAt: completedAt.toISOString(),
      paymentReference,
      status: "paid",
    };
  }

  async completeClientShareAdvancePayment(input: {
    projectId: string;
  }): Promise<{ success: boolean; advancePaymentStatus: ProjectPaymentStatus }> {
    const project = await this.getRequiredProject(input.projectId);

    if (!project.advancePaymentEnabled) {
      throw new AppError(
        "Advance payment is not enabled for this project.",
        400,
        "client_payment_advance_disabled",
      );
    }

    if (project.advancePaymentStatus === ProjectPaymentStatus.Paid) {
      return { success: true, advancePaymentStatus: project.advancePaymentStatus };
    }

    const completedAt = new Date();

    await this.projectRepository.update(project.id, {
      advancePaymentCompletedAt: completedAt,
      advancePaymentStatus: ProjectPaymentStatus.Paid,
      updatedAt: new Date(),
    });

    return { success: true, advancePaymentStatus: ProjectPaymentStatus.Paid };
  }

  async submitClientShareProjectReview(input: {
    projectId: string;
    rating: number;
    reviewText: string;
    sourceLocale: string;
  }): Promise<ClientShareReviewSubmissionResultDTO> {
    const project = await this.getRequiredProject(input.projectId);

    if (project.paymentStatus !== ProjectPaymentStatus.Paid) {
      throw new AppError(
        "Payment must be completed before leaving a review.",
        409,
        "client_review_payment_required",
      );
    }

    const submittedAt = new Date();
    const record = await this.projectRepository.upsertClientReview({
      projectId: project.id,
      rating: input.rating,
      reviewText: input.reviewText,
      sourceLocale: input.sourceLocale,
      submittedAt,
      updatedAt: submittedAt,
    });

    return {
      rating: record.rating,
      reviewText: record.reviewText,
      submittedAt: record.submittedAt.toISOString(),
    };
  }

  async getClientSharePostPaymentSummary(input: {
    projectId: string;
    shareToken: string;
    viewerLocale: string;
  }): Promise<ClientSharePostPaymentSummaryDTO> {
    const project = await this.getRequiredProject(input.projectId);
    const totalRevisionCount =
      await this.repository.countProjectAddedRevisions(project.id);
    const finalDeliverables = await this.getClientShareFinalDeliverablesInternal({
      projectId: project.id,
      shareToken: input.shareToken,
      viewerLocale: input.viewerLocale,
    });
    const review =
      await this.projectRepository.findClientReviewByProjectId(project.id);
    const projectTitleText = await this.resolveProjectTitleText(
      project,
      input.viewerLocale,
    );
    const usedRevisionCount = totalRevisionCount;
    const extraRevisionCount = Math.max(
      0,
      usedRevisionCount - project.revisionLimit,
    );
    const creatorName =
      finalDeliverables.find((file) => file.uploadedBy)?.uploadedBy ?? null;
    const totalSizeBytes = finalDeliverables.reduce(
      (total, file) => total + file.sizeBytes,
      0,
    );

    const completedProjectsCount = await this.projectRepository.countPaidProjects();
    const freelancerStats = await this.projectRepository.getFreelancerStats();

    return {
      files: finalDeliverables.map((file) => ({
        approvalStatus: file.approvalStatus,
        createdAt: file.createdAt,
        downloadUrl: file.downloadUrl,
        extension: file.extension,
        id: file.id,
        mimeType: file.mimeType,
        name: file.name,
        nameText: file.nameText,
        previewKind: file.previewKind,
        previewUrl: file.previewUrl,
        previewVersionId: file.previewVersionId,
        sizeBytes: file.sizeBytes,
        thumbnailUrl: file.thumbnailUrl,
        updatedAt: file.updatedAt,
        uploadStatus: file.uploadStatus,
      })),
      project: {
        advancePaymentEnabled: project.advancePaymentEnabled,
        advanceAmountCents: project.advanceAmountCents,
        advancePaymentStatus: project.advancePaymentStatus,
        amountCents: project.amountCents,
        creatorName,
        completedProjectsCount,
        currency: project.currency,
        deliveryDate:
          finalDeliverables[0]?.updatedAt ??
          project.clientPaymentCompletedAt?.toISOString() ??
          null,
        extraRevisionAmountCents:
          extraRevisionCount * project.extraRevisionCostCents,
        extraRevisionCount,
        fileCount: finalDeliverables.length,
        includedRevisionCount: project.revisionLimit,
        paymentCompletedAt:
          project.clientPaymentCompletedAt?.toISOString() ?? null,
        paymentReference: project.clientPaymentReference ?? null,
        paymentStatus: project.paymentStatus,
        startedAt: project.createdAt.toISOString(),
        title: project.title,
        titleText: projectTitleText,
        totalSizeBytes,
        usedRevisionCount,
      },
      review: review
        ? {
          rating: review.rating,
          reviewText: review.reviewText,
          submittedAt: review.submittedAt.toISOString(),
        }
        : null,
      freelancerAverageRating: freelancerStats.averageRating,
      freelancerReviewCount: freelancerStats.totalReviews,
    };
  }

  async getClientShareFinalDeliverables(input: {
    projectId: string;
    shareToken: string;
    viewerLocale: string;
  }): Promise<ClientShareFinalDeliverableDTO[]> {
    const files = await this.getClientShareFinalDeliverablesInternal(input);

    return files.map((file) => ({
      approvalStatus: file.approvalStatus,
      createdAt: file.createdAt,
      downloadUrl: file.downloadUrl,
      extension: file.extension,
      id: file.id,
      mimeType: file.mimeType,
      name: file.name,
      nameText: file.nameText,
      previewKind: file.previewKind,
      previewUrl: file.previewUrl,
      previewVersionId: file.previewVersionId,
      sizeBytes: file.sizeBytes,
      thumbnailUrl: file.thumbnailUrl,
      updatedAt: file.updatedAt,
      uploadStatus: file.uploadStatus,
    }));
  }

  async getClientShareFinalFileContent(input: {
    fileId: string;
    projectId: string;
  }): Promise<{
    body: ReadableStream<Uint8Array>;
    contentLength: number | null;
    contentType: string;
    etag: string | null;
    filename: string;
  }> {
    const fileWithVersions = await this.repository.findWithVersionsById(
      input.fileId,
      {
        includeDeletedVersions: true,
      },
    );

    if (!fileWithVersions || fileWithVersions.file.projectId !== input.projectId) {
      throw new NotFoundAppError("File not found.");
    }

    const finalDraftVersion = fileWithVersions.versions.find(
      (version) =>
        version.deletedAt == null &&
        (version.id === fileWithVersions.file.finalDraftVersionId ||
          version.isFinalDraft),
    );

    if (!finalDraftVersion) {
      throw new AppError(
        "Final draft not found.",
        404,
        "final_draft_missing",
      );
    }

    const result = await this.storage.getFile({
      bucket: finalDraftVersion.storageBucket,
      key: finalDraftVersion.storageKey,
    });
    const body =
      result.body instanceof Readable
        ? (Readable.toWeb(result.body) as unknown as ReadableStream<Uint8Array>)
        : result.body;

    if (!(body instanceof ReadableStream)) {
      throw new AppError(
        "File content is unavailable.",
        500,
        "file_stream_unavailable",
      );
    }

    await this.recordFinalDraftDownload(finalDraftVersion.id);

    return {
      body,
      contentLength: result.contentLength,
      contentType:
        result.contentType ??
        finalDraftVersion.mimeType ??
        "application/octet-stream",
      etag: result.etag,
      filename: finalDraftVersion.originalName,
    };
  }

  async getClientShareFinalArchive(input: {
    projectId: string;
    shareToken: string;
    viewerLocale: string;
  }): Promise<{
    body: Uint8Array;
    filename: string;
  }> {
    const project = await this.getRequiredProject(input.projectId);
    const deliverables = await this.getClientShareFinalDeliverablesInternal(input);

    if (deliverables.length === 0) {
      throw new AppError(
        "Final files are not available yet.",
        409,
        "client_final_files_unavailable",
      );
    }

    const entries = await Promise.all(
      deliverables.map(async (deliverable) => {
        const file = await this.getClientShareFinalFileContent({
          fileId: deliverable.id,
          projectId: project.id,
        });

        return {
          data: await readStreamToBytes(file.body),
          filename: file.filename,
        };
      }),
    );

    return {
      body: createStoredZip(entries),
      filename: `${project.publicId || project.title}-files.zip`,
    };
  }

  async purgeExpiredVersionPreviews(input?: { limit?: number }) {
    const now = new Date();
    const versions = await this.repository.findVersionsPendingPreviewPurge({
      limit: input?.limit,
      now,
    });
    const items: Array<{
      error?: string;
      previewStorageKey: string | null;
      purged: boolean;
      versionId: string;
    }> = [];

    for (const version of versions) {
      const previewStorageBucket =
        version.previewStorageBucket ?? version.processedStorageBucket;
      const previewStorageKey =
        version.previewStorageKey ?? version.processedStorageKey;

      if (!previewStorageBucket || !previewStorageKey) {
        await this.repository.updateVersion(version.id, {
          previewPurgedAt: now,
          previewStorageBucket: null,
          previewStorageKey: null,
          updatedAt: now,
        });
        items.push({
          previewStorageKey,
          purged: false,
          versionId: version.id,
        });
        continue;
      }

      try {
        await this.storage.deleteFile({
          bucket: previewStorageBucket,
          key: previewStorageKey,
        });

        await this.repository.updateVersion(version.id, {
          previewPurgedAt: now,
          previewStorageBucket: null,
          previewStorageKey: null,
          processedExtension:
            version.processedStorageKey === previewStorageKey
              ? null
              : version.processedExtension,
          processedMimeType:
            version.processedStorageKey === previewStorageKey
              ? null
              : version.processedMimeType,
          processedSizeBytes:
            version.processedStorageKey === previewStorageKey
              ? null
              : version.processedSizeBytes,
          processedStorageBucket:
            version.processedStorageKey === previewStorageKey
              ? null
              : version.processedStorageBucket,
          processedStorageKey:
            version.processedStorageKey === previewStorageKey
              ? null
              : version.processedStorageKey,
          updatedAt: now,
        });

        items.push({
          previewStorageKey,
          purged: true,
          versionId: version.id,
        });
      } catch (error) {
        items.push({
          error: error instanceof Error ? error.message : "Preview purge failed.",
          previewStorageKey,
          purged: false,
          versionId: version.id,
        });
      }
    }

    return {
      checked: versions.length,
      items,
      purgedCount: items.filter((item) => item.purged).length,
    };
  }

  private assertMultipartPartsComplete(
    sizeBytes: number,
    parts: Array<{
      etag: string;
      partNumber: number;
    }>,
  ) {
    const totalParts = getMultipartPartCount(sizeBytes);

    if (parts.length !== totalParts) {
      throw new AppError(
        "Multipart upload is missing one or more parts.",
        400,
        "multipart_parts_incomplete",
        {
          expectedPartCount: totalParts,
          receivedPartCount: parts.length,
        },
      );
    }

    const sortedParts = [...parts].sort(
      (left, right) => left.partNumber - right.partNumber,
    );

    for (const [index, part] of sortedParts.entries()) {
      const expectedPartNumber = index + 1;

      if (part.partNumber !== expectedPartNumber) {
        throw new AppError(
          "Multipart upload parts must be complete and sequential.",
          400,
          "multipart_parts_out_of_order",
          {
            expectedPartNumber,
            receivedPartNumber: part.partNumber,
          },
        );
      }
    }
  }

  private async getUploadableRecord(id: string) {
    const existingRecord = await this.repository.findById(id);

    if (!existingRecord) {
      throw new NotFoundAppError("File not found.");
    }

    if (existingRecord.uploadStatus === FileUploadStatus.Deleted) {
      throw new AppError("File has been deleted.", 409, "file_deleted");
    }

    return existingRecord;
  }

  private async getRequiredProject(projectId: string) {
    const project = await this.projectRepository.findByIdentifier(projectId);

    if (!project) {
      throw new NotFoundAppError("Project not found.");
    }

    return project;
  }

  /**
  * Resolves the stable project/file/revision target for a new upload session.
  *
  * This validates the project and, for revision/final-draft uploads, enforces
  * current file eligibility before any R2 upload session or presigned URL is
  * created. New files receive a fresh UUID so permanent storage keys can use
  * stable IDs from the first uploaded object onward.
  */
  private async resolveManagedUploadSessionTarget(
    input: UploadSessionInitInput,
  ): Promise<{
    fileId: string;
    projectId: string;
    revisionNumber: number;
  }> {
    const projectIdentifier = normalizeProjectId(input.projectId);

    if (!projectIdentifier) {
      throw new AppError("projectId is required.", 400, "validation_error");
    }

    const project = await this.getRequiredProject(projectIdentifier);
    this.assertProjectIsActive(project.status);

    if (!input.targetFileId) {
      return {
        fileId: randomUUID(),
        projectId: project.id,
        revisionNumber: 1,
      };
    }

    const fileWithVersions = await this.repository.findWithVersionsById(
      input.targetFileId,
      {
        includeDeletedVersions: true,
      },
    );

    if (!fileWithVersions || fileWithVersions.file.projectId !== project.id) {
      throw new NotFoundAppError("File not found.");
    }

    this.assertVersionUploadSessionAllowed({
      allowLargeUploads: input.allowLargeUploads,
      fileWithVersions,
      isFinalDraft: input.isFinalDraft,
    });

    const nextRevisionNumber =
      fileWithVersions.versions.reduce(
        (highestRevisionNumber, version) =>
          Math.max(highestRevisionNumber, version.revisionNumber),
        0,
      ) + 1;

    return {
      fileId: fileWithVersions.file.id,
      projectId: project.id,
      revisionNumber: nextRevisionNumber,
    };
  }

  /**
  * Enforces revision and final-draft upload eligibility before upload start.
  *
  * This mirrors the later commit-time checks so the API blocks invalid
  * revision/final-draft uploads before creating storage sessions or accepting
  * any multipart data.
  */
  private assertVersionUploadSessionAllowed(input: {
    allowLargeUploads: boolean;
    fileWithVersions: FileWithVersionsRecord;
    isFinalDraft: boolean;
  }) {
    if (!input.isFinalDraft) {
      this.assertFileIsNotApproved(input.fileWithVersions.file.approvalStatus);
    }
    const hasFinalDraft = input.fileWithVersions.versions.some(
      (version) =>
        version.id === input.fileWithVersions.file.finalDraftVersionId ||
        version.isFinalDraft,
    );
    const uploadMode = getFileReviewUploadMode({
      finalDraftReportStatus: input.fileWithVersions.file.finalDraftReportStatus,
      hasFinalDraft,
    });
    const isFinalDraftMismatchReplacement =
      input.isFinalDraft &&
      uploadMode === "final_draft_replacement_only";

    if (input.isFinalDraft && input.allowLargeUploads) {
      throw new AppError(
        "Final draft uploads cannot enable the large upload path.",
        409,
        "final_draft_large_uploads_disabled",
      );
    }

    if (uploadMode === "locked_after_final_draft") {
      throw new AppError(
        "New revisions are locked after a final draft has been uploaded.",
        409,
        "file_final_draft_upload_locked",
      );
    }

    if (uploadMode === "final_draft_replacement_only" && !input.isFinalDraft) {
      throw new AppError(
        "This file can only accept a final draft replacement right now.",
        409,
        "final_draft_replacement_only",
      );
    }

    if (
      input.isFinalDraft &&
      !isFinalDraftMismatchReplacement &&
      !input.fileWithVersions.file.approvedVersionId
    ) {
      throw new AppError(
        "Approve a version before the final draft can be uploaded.",
        409,
        "file_final_draft_requires_approval",
      );
    }
  }

  /**
  * Deletes every object stored under one revision prefix.
  *
  * Prefix deletion is intentionally limited to managed `revisions/rNNN/`
  * folders so removing a revision cannot widen to the full project or file
  * root. Failures are surfaced to callers and never silently ignored.
  */
  private async deleteManagedStoragePrefix(input: {
    bucket: string;
    prefix: string;
  }) {
    if (
      !input.prefix.endsWith("/") ||
      !isManagedUploadStorageKey(input.prefix.slice(0, -1)) ||
      !input.prefix.includes("/files/") ||
      !input.prefix.includes("/revisions/")
    ) {
      throw new AppError(
        "Refusing to delete an unsafe storage prefix.",
        400,
        "managed_storage_prefix_unsafe",
        {
          prefix: input.prefix,
        },
      );
    }

    const failures: Array<{ bucket: string; key: string; message: string }> = [];
    let continuationToken: string | undefined;

    do {
      const page = await this.storage.listFiles({
        bucket: input.bucket,
        continuationToken,
        prefix: input.prefix,
      });

      for (const object of page.objects) {
        try {
          await this.storage.deleteFile({
            bucket: page.bucket,
            key: object.key,
          });
        } catch (error) {
          failures.push({
            bucket: page.bucket,
            key: object.key,
            message:
              error instanceof Error ? error.message : "Storage delete failed.",
          });
        }
      }

      continuationToken = page.nextContinuationToken ?? undefined;
    } while (continuationToken);

    if (failures.length > 0) {
      throw new AppError(
        "The revision could not be fully removed from storage.",
        502,
        "file_delete_storage_failed",
        {
          failedObjects: failures,
          prefix: input.prefix,
        },
      );
    }
  }

  /**
  * Removes all stored artifacts for one revision.
  *
  * The preferred path deletes the entire canonical revision prefix. Legacy
  * keys or out-of-prefix artifacts fall back to explicit object deletion so
  * old records keep working until a full background migration exists.
  */
  private async deleteRevisionStorageObjects(version: Pick<
    FileVersionRecord,
    | "previewStorageBucket"
    | "previewStorageKey"
    | "processedStorageBucket"
    | "processedStorageKey"
    | "storageBucket"
    | "storageKey"
  >) {
    const revisionPrefix = getRevisionStoragePrefixFromKey(version.storageKey);
    const targets = getVersionStoredObjectTargets(version);
    const fallbacks =
      revisionPrefix == null
        ? targets
        : targets.filter((target) => !target.key.startsWith(revisionPrefix));

    if (revisionPrefix) {
      await this.deleteManagedStoragePrefix({
        bucket: version.storageBucket,
        prefix: revisionPrefix,
      });
    }

    const failures: Array<{ bucket: string; key: string; message: string }> = [];

    for (const target of fallbacks) {
      try {
        await this.storage.deleteFile({
          bucket: target.bucket,
          key: target.key,
        });
      } catch (error) {
        failures.push({
          bucket: target.bucket,
          key: target.key,
          message:
            error instanceof Error ? error.message : "Storage delete failed.",
        });
      }
    }

    if (failures.length > 0) {
      throw new AppError(
        "The revision could not be fully removed from storage.",
        502,
        "file_delete_storage_failed",
        {
          failedObjects: failures,
          storageKey: version.storageKey,
        },
      );
    }
  }

  private async createFileProcessingNotification(input: {
    category: "file_processing_failed" | "file_processing_succeeded";
    descriptionKey: string;
    eventKey: string;
    fileId: string;
    metadata: Record<string, boolean | number | string | null>;
    projectId: string;
    titleKey: string;
  }) {
    try {
      await notificationService.createNotification({
        category: input.category,
        descriptionKey: input.descriptionKey,
        eventKey: input.eventKey,
        fileId: input.fileId,
        metadata: input.metadata,
        projectId: input.projectId,
        titleKey: input.titleKey,
      });
    } catch {
      // Notifications should never block file operations.
    }
  }

  private toClientShareDeliverable(
    file: FileDTO,
    shareToken: string,
  ): ClientShareDeliverableDTO {
    const currentVersion = file.currentVersion;
    const previewKind = currentVersion
      ? toPreviewKind(
        getAssetKind({
          extension:
            currentVersion.processedExtension ?? currentVersion.extension,
          mimeType:
            currentVersion.processedMimeType ?? currentVersion.mimeType,
        }),
      )
      : "unsupported";
    const previewUrl =
      currentVersion &&
        currentVersion.processingStatus === FileProcessingStatus.Completed &&
        Boolean(
          (currentVersion.previewStorageBucket ??
            currentVersion.processedStorageBucket ??
            currentVersion.storageBucket) &&
          (currentVersion.previewStorageKey ?? 
            currentVersion.processedStorageKey ??
            currentVersion.storageKey),
        ) &&
        previewKind !== "unsupported"
        ? buildClientShareFilePreviewUrl(shareToken, file.id)
        : null;

    return {
      approvalStatus: file.approvalStatus,
      createdAt: file.createdAt,
      extension: file.extension,
      id: file.id,
      mimeType: file.mimeType,
      name: file.name,
      nameText: file.nameText,
      previewUrl,
      sizeBytes: file.sizeBytes,
      thumbnailUrl: previewKind === "image" ? previewUrl : null,
      updatedAt: file.updatedAt,
      uploadStatus: file.uploadStatus,
    };
  }

  private toClientShareReviewVersion(
    version: FileReviewVersionDTO,
    shareToken: string,
  ): FileReviewVersionDTO {
    const canPreview =
      version.processingStatus === FileProcessingStatus.Completed &&
      version.preview.kind !== "unsupported";
    const previewUrl = canPreview
      ? buildClientShareVersionPreviewUrl({
        fileId: version.fileId,
        shareToken,
        versionId: version.id,
      })
      : null;
    const fallbackSourceType: FileReviewPreviewSourceDTO["type"] =
      version.preview.kind === "video"
        ? "mp4"
        : version.preview.kind === "pdf"
          ? "pdf"
          : version.preview.kind === "image"
            ? "image"
            : "audio";
    const nextPreview =
      previewUrl
        ? {
          ...version.preview,
          posterUrl: null,
          sources:
            version.preview.sources.length > 0
              ? version.preview.sources.map((source) => ({
                ...source,
                url: previewUrl,
              }))
              : previewUrl
                ? [
                  {
                    filename: version.originalName,
                    label: version.preview.kind,
                    type: fallbackSourceType,
                    url: previewUrl,
                  },
                ]
                : [],
          url: previewUrl,
        }
        : {
          ...version.preview,
          posterUrl: null,
          sources: [],
          url: null,
        };

    return {
      ...version,
      downloadUrl: null,
      preview: nextPreview,
      processedStorageBucket: null,
      processedStorageKey: null,
      storageBucket: "",
      storageKey: "",
    };
  }

  private resolveClientPreviewTarget(version: FileVersionRecord) {
    if (!hasClientSafePreview(version)) {
      return null;
    }

    const {
      previewBucket,
      previewKey,
      previewMimeType,
    } = resolveDisplayStorageLocation(version);

    if (!previewBucket || !previewKey) {
      return null;
    }

    return {
      bucket: previewBucket,
      filename: version.originalName,
      key: previewKey,
      mimeType: previewMimeType,
    };
  }

  private assertClientRevisionCanBeApproved(
    fileWithVersions: {
      file: {
        approvedVersionId: string | null;
        currentVersionId: string | null;
        finalDraftVersionId: string | null;
      };
      versions: FileVersionRecord[];
    },
    version: FileVersionRecord,
  ) {
    if (version.id !== fileWithVersions.file.currentVersionId) {
      throw new AppError(
        "Only the latest revision can be approved.",
        409,
        "client_revision_not_latest",
      );
    }

    if (fileWithVersions.file.finalDraftVersionId || version.isFinalDraft) {
      throw new AppError(
        "This revision can no longer be approved.",
        409,
        "client_revision_not_approvable",
      );
    }

    if (fileWithVersions.file.approvedVersionId === version.id) {
      throw new AppError(
        "This revision is already approved.",
        409,
        "client_revision_already_approved",
      );
    }

    if (version.processingStatus !== FileProcessingStatus.Completed) {
      throw new AppError(
        "This revision is still processing.",
        409,
        "client_revision_processing",
      );
    }

    if (!this.resolveClientPreviewTarget(version)) {
      throw new AppError(
        "Preview is not ready yet.",
        409,
        "client_preview_unavailable",
      );
    }
  }

  private async createClientActionNotification(input: {
    descriptionKey: string;
    fileId: string;
    projectId: string;
    titleKey: string;
  }) {
    try {
      await notificationService.createNotification({
        category: "system",
        descriptionKey: input.descriptionKey,
        fileId: input.fileId,
        projectId: input.projectId,
        titleKey: input.titleKey,
      });
    } catch {
      // Notifications should never block client actions.
    }
  }

  private assertUploadSizeAllowed(input: {
    allowLargeUploads: boolean;
    isFinalDraft: boolean;
    sizeBytes: number;
  }) {
    if (input.sizeBytes > uploadConfig.maxTotalFileSizeBytes) {
      throw new AppError(
        "File exceeds the maximum upload size.",
        400,
        "upload_size_exceeds_absolute_limit",
        {
          maxSizeBytes: uploadConfig.maxTotalFileSizeBytes,
          sizeBytes: input.sizeBytes,
        },
      );
    }

    const shouldEnforceStandardFileSizeLimit =
      !input.allowLargeUploads && !input.isFinalDraft;

    if (
      shouldEnforceStandardFileSizeLimit &&
      exceedsStandardUploadLimit(input.sizeBytes)
    ) {
      throw new AppError(
        "File exceeds the standard upload size limit.",
        400,
        "upload_size_exceeds_standard_limit",
        {
          maxSizeBytes: standardUploadMaxSizeBytes,
          sizeBytes: input.sizeBytes,
        },
      );
    }
  }

  private assertFileCanBeUploaded(uploadStatus: FileDTO["uploadStatus"]) {
    if (!isPendingLikeStatus(uploadStatus)) {
      throw new AppError(
        "File cannot be uploaded in its current state.",
        409,
        "file_upload_locked",
        {
          uploadStatus,
        },
      );
    }
  }

  private assertFileIsNotAlreadyUploaded(
    uploadStatus: FileDTO["uploadStatus"],
  ) {
    if (uploadStatus === FileUploadStatus.Uploaded) {
      throw new AppError(
        "File has already been uploaded.",
        409,
        "file_already_uploaded",
      );
    }
  }

  private assertManagedStorageKey(storageKey: string) {
    if (!isManagedUploadStorageKey(storageKey)) {
      throw new AppError(
        "storageKey must reference a managed upload object.",
        400,
        "invalid_managed_storage_key",
        {
          expectedPrefix: getManagedUploadPrefix(),
          storageKey,
        },
      );
    }
  }

  private logUploadCleanupFailure(
    action: "abort_multipart_upload" | "delete_uploaded_object",
    input: {
      bucket: string;
      storageKey: string;
      uploadId?: string | null;
    },
    error: unknown,
  ) {
    const errorCode = isAppError(error)
      ? error.code
      : typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : typeof error === "object" &&
          error !== null &&
          "Code" in error &&
          typeof (error as { Code?: unknown }).Code === "string"
          ? (error as { Code: string }).Code
          : undefined;
    const errorName =
      error instanceof Error
        ? error.name
        : typeof error === "object" &&
          error !== null &&
          "name" in error &&
          typeof (error as { name?: unknown }).name === "string"
          ? (error as { name: string }).name
          : undefined;
    const statusCode = isAppError(error)
      ? error.statusCode
      : typeof error === "object" && error !== null && "$metadata" in error
        ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode
        : undefined;

    console.warn("Upload cleanup failed", {
      action,
      bucket: input.bucket,
      errorCode,
      errorName,
      statusCode,
      storageKey: input.storageKey,
      uploadIdPresent: Boolean(input.uploadId),
    });
  }

  private async safeAbortMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
  ) {
    try {
      await this.storage.abortMultipartUpload({
        bucket,
        key,
        uploadId,
      });
    } catch (error) {
      this.logUploadCleanupFailure(
        "abort_multipart_upload",
        {
          bucket,
          storageKey: key,
          uploadId,
        },
        error,
      );
      // Best-effort cleanup only. We still surface the original upload failure.
    }
  }

  private async safeDeleteStoredFile(bucket: string, key: string) {
    try {
      await this.storage.deleteFile({
        bucket,
        key,
      });
    } catch (error) {
      this.logUploadCleanupFailure(
        "delete_uploaded_object",
        {
          bucket,
          storageKey: key,
          uploadId: null,
        },
        error,
      );
      // Best-effort cleanup only. The original error should still win.
    }
  }

  /**
   * Deletes all R2 objects whose key starts with the given prefix.
   *
   * This is used after successful worker processing to remove the entire
   * `original/` subfolder for a revision when the processed output supersedes
   * the original file. Errors are swallowed — cleanup is best-effort.
   */
  private async safeDeleteStoredPrefix(bucket: string, prefix: string) {
    try {
      let continuationToken: string | undefined;

      do {
        const listResult = await this.storage.listFiles({
          bucket,
          prefix,
          maxKeys: 100,
          continuationToken,
        });

        for (const obj of listResult.objects) {
          await this.safeDeleteStoredFile(bucket, obj.key);
        }

        continuationToken = listResult.nextContinuationToken ?? undefined;
      } while (continuationToken);
    } catch (error) {
      console.warn("[storage] Prefix cleanup failed", {
        bucket,
        prefix,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async setUploadStatus(
    id: string,
    uploadStatus: Exclude<FileUploadStatus, "deleted">,
  ) {
    try {
      await this.repository.update(id, {
        uploadStatus,
        updatedAt: new Date(),
      });
    } catch {
      // Preserve the original storage error when status persistence also fails.
    }
  }

  async applyProcessingCallback(input: {
    jobId: string;
    fileId: string;
    fileVersionId: string;
    status: FileProcessingCallbackStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    processed?: {
      bucket: string;
      key: string;
      mimeType: string;
      extension: string;
      sizeBytes: number;
    } | null;
  }) {
    const status =
      input.status === FileProcessingStatus.Completed
        ? FileProcessingStatus.Completed
        : input.status === FileProcessingStatus.Corrupt
          ? FileProcessingStatus.Corrupt
          : FileProcessingStatus.Failed;

    if (
      status !== FileProcessingStatus.Completed &&
      typeof input.errorMessage === "string" &&
      input.errorMessage.trim().length > 0
    ) {
      console.error("[processing-callback] Worker processing failed", {
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage,
        fileId: input.fileId,
        fileVersionId: input.fileVersionId,
        jobId: input.jobId,
        status: input.status,
      });
    }

    const record = await this.repository.updateVersionProcessingResult(
      input.fileVersionId,
      {
        processingStatus: status,
        processingJobId: input.jobId,
        processingErrorCode: input.errorCode ?? null,
        processingErrorMessage:
          status === FileProcessingStatus.Completed
            ? null
            : getSafeProcessingFailureMessage(input.errorCode),
        processingCompletedAt: new Date(),

        processedStorageBucket: input.processed?.bucket ?? null,
        processedStorageKey: input.processed?.key ?? null,
        processedMimeType: input.processed?.mimeType ?? null,
        processedExtension: input.processed?.extension ?? null,
        processedSizeBytes: input.processed?.sizeBytes ?? null,

        updatedAt: new Date(),
      },
    );

    if (!record) {
      throw new NotFoundAppError("File version not found.");
    }

    if (status === FileProcessingStatus.Failed || status === FileProcessingStatus.Corrupt) {
      await creditService.refundCreditsForVersion(input.fileVersionId, "worker_processing_failed");
    }


    const file = await this.repository.findById(input.fileId);

    let resolvedRecord = record;

    if (status === FileProcessingStatus.Completed && input.processed) {
      const shouldRetainPreview =
        file?.finalDraftVersionId === record.id ||
        file?.approvedVersionId === record.id;
      const previewRecord = await this.repository.updateVersion(record.id, {
        previewPurgedAt: null,
        previewRetentionUntil: shouldRetainPreview
          ? createPreviewRetentionDate()
          : null,
        previewStorageBucket: input.processed.bucket,
        previewStorageKey: input.processed.key,
        updatedAt: new Date(),
      });

      if (previewRecord) {
        resolvedRecord = previewRecord;
      }

      // For normal revisions (not final drafts), if processing resulted in a new file
      // (due to watermark, large-file, or compression), the processed file completely
      // supersedes the original. We delete the original from R2 and overwrite the
      // database fields to point to the processed file.
      // Final-draft originals are intentionally kept for download by the client.
      const shouldReplaceOriginal =
        !record.isFinalDraft &&
        (record.storageKey !== input.processed.key ||
          record.storageBucket !== input.processed.bucket);

      if (shouldReplaceOriginal) {
        // Derive the `original/` folder prefix from the stored key.
        // e.g. "user@x.com/projects/p/files/f/revisions/r001/original/file.pdf"
        //   => "user@x.com/projects/p/files/f/revisions/r001/original/"
        const originalFolderPrefix = record.storageKey.includes("/original/")
          ? record.storageKey.slice(0, record.storageKey.indexOf("/original/") + "/original/".length)
          : null;

        if (originalFolderPrefix) {
          void this.safeDeleteStoredPrefix(
            record.storageBucket,
            originalFolderPrefix,
          );
        } else {
          // Fallback: delete the single object for unexpected key formats.
          void this.safeDeleteStoredFile(
            record.storageBucket,
            record.storageKey,
          );
        }

        // Replace the original file fields with the processed file fields,
        // and clear the processed fields.
        const replacedRecord = await this.repository.updateVersion(record.id, {
          storageBucket: input.processed.bucket,
          storageKey: input.processed.key,
          mimeType: input.processed.mimeType,
          extension: input.processed.extension,
          sizeBytes: input.processed.sizeBytes,
          processedStorageBucket: null,
          processedStorageKey: null,
          processedMimeType: null,
          processedExtension: null,
          processedSizeBytes: null,
          updatedAt: new Date(),
        });
        
        if (replacedRecord) {
          resolvedRecord = replacedRecord;
        }
      }
    }

    if (file) {
      const category =
        status === FileProcessingStatus.Completed
          ? "file_processing_succeeded"
          : "file_processing_failed";

      await this.createFileProcessingNotification({
        category,
        descriptionKey:
          status === FileProcessingStatus.Completed
            ? "notification.fileProcessingCompletedDescription"
            : "notification.fileProcessingFailedDescription",
        eventKey: `file-processing:${input.fileVersionId}:${input.jobId}:${input.status}`,
        fileId: file.id,
        metadata: {
          errorCode: input.errorCode ?? null,
          jobId: input.jobId,
          status: input.status,
        },
        projectId: file.projectId,
        titleKey:
          status === FileProcessingStatus.Completed
            ? "notification.fileProcessingCompletedTitle"
            : "notification.fileProcessingFailedTitle",
      });
    }

    return resolvedRecord;
  }

  async getProcessingJobByJobId(jobId: string) {
    const version = await this.repository.findVersionByProcessingJobId(jobId);

    if (!version) {
      throw new NotFoundAppError("Processing job not found.");
    }

    return {
      fileId: version.fileId,
      fileVersionId: version.id,
      jobId,
      revisionNumber: version.revisionNumber,
      status: version.processingStatus,
      errorCode: version.processingErrorCode,
      errorMessage: version.processingErrorMessage,
      processedStorageKey: version.processedStorageKey,
      updatedAt: version.updatedAt.toISOString(),
    };
  }

  async retryProcessingVersion(versionId: string) {
    const version = await this.repository.findVersionById(versionId);

    if (!version) {
      throw new NotFoundAppError("File version not found.");
    }

    const file = await this.repository.findById(version.fileId);

    if (!file) {
      throw new NotFoundAppError("File not found.");
    }

    if (version.processingAttempts >= 3) {
      const failedVersion = await this.repository.updateVersionProcessingResult(
        versionId,
        {
          processingStatus: FileProcessingStatus.Failed,
          processingJobId: version.processingJobId || randomUUID(),
          processingErrorCode: "retries_exhausted",
          processingErrorMessage:
            "File processing failed: maximum retry attempts exceeded.",
          processingCompletedAt: new Date(),
          updatedAt: new Date(),
        },
      );
      await creditService
        .refundCreditsForVersion(versionId, "worker_processing_failed")
        .catch(() => {});
      return {
        errorCode: "retries_exhausted",
        errorMessage:
          "File processing failed: maximum retry attempts exceeded.",
        fileId: file.id,
        fileVersionId: version.id,
        jobId: failedVersion?.processingJobId || version.processingJobId || "",
        processingStatus: FileProcessingStatus.Failed,
      };
    }

    const storedObject = await this.storage.headFile({
      bucket: version.storageBucket,
      key: version.storageKey,
    });

    if (!storedObject.exists) {
      throw new AppError(
        "The original uploaded object is missing from storage.",
        409,
        "uploaded_object_missing",
        {
          storageKey: version.storageKey,
        },
      );
    }

    const jobId = randomUUID();
    const now = new Date();
    const queuedVersion = await this.repository.updateVersionProcessingResult(
      versionId,
      {
        processingStatus: FileProcessingStatus.Retrying,
        processingJobId: jobId,
        processingAttempts: version.processingAttempts + 1,
        queuedAt: now,
        processingErrorCode: null,
        processingErrorMessage: null,
        processingStartedAt: null,
        processingCompletedAt: null,
        updatedAt: new Date(),
      },
    );

    if (!queuedVersion) {
      throw new NotFoundAppError("File version not found.");
    }

    const processedKey = buildProcessedStorageKey({
      originalStorageKey: version.storageKey,
      originalName: version.originalName,
      processedExtension: version.extension,
      revisionNumber: version.revisionNumber,
    });

    const logKey = buildProcessingLogStorageKey({
      originalStorageKey: version.storageKey,
      jobId,
      revisionNumber: version.revisionNumber,
    });

    try {
      await enqueueProcessingJob({
        jobId,
        fileId: file.id,
        fileVersionId: version.id,
        fileName: file.name,
        originalName: version.originalName,
        mimeType: version.mimeType,
        extension: version.extension,
        sizeBytes: version.sizeBytes,
        sourceBucket: version.storageBucket,
        sourceKey: version.storageKey,
        outputBucket: version.storageBucket,
        outputKey: processedKey,
        logKey,
        user: {
          id: MANAGED_UPLOAD_OWNER,
          email: MANAGED_UPLOAD_OWNER,
          name: MANAGED_UPLOAD_OWNER,
          tier: (await resolveActiveActor()).plan,
        },
        isLargeFile: exceedsStandardUploadLimit(version.sizeBytes),
      });
    } catch (error) {
      const workerFailure = toWorkerProcessingFailure(error);
      const failedVersion = await this.repository.updateVersionProcessingResult(
        versionId,
        {
          processingStatus: FileProcessingStatus.Failed,
          processingJobId: jobId,
          processingErrorCode: workerFailure.code,
          processingErrorMessage: workerFailure.message,
          processingStartedAt: null,
          processingCompletedAt: null,
          updatedAt: new Date(),
        },
      );

      await this.createFileProcessingNotification({
        category: "file_processing_failed",
        descriptionKey: "notification.fileProcessingStartFailedDescription",
        eventKey: `file-processing:${version.id}:${jobId}:${FileProcessingStatus.Failed}`,
        fileId: file.id,
        metadata: {
          jobId,
          reason: workerFailure.code,
          status: FileProcessingStatus.Failed,
        },
        projectId: file.projectId,
        titleKey: "notification.fileProcessingFailedTitle",
      });

      return {
        errorCode: failedVersion?.processingErrorCode ?? workerFailure.code,
        errorMessage:
          failedVersion?.processingErrorMessage ?? workerFailure.message,
        fileId: file.id,
        fileVersionId: version.id,
        jobId,
        processingStatus:
          failedVersion?.processingStatus ?? FileProcessingStatus.Failed,
      };
    }

    return {
      errorCode: null,
      errorMessage: null,
      fileId: file.id,
      fileVersionId: version.id,
      jobId,
      processingStatus: queuedVersion.processingStatus,
    };
  }

  async reconcileJobIfStale<
    T extends {
      fileId: string;
      fileVersionId: string;
      jobId: string;
      status: FileProcessingStatus;
      errorCode?: string | null;
      errorMessage?: string | null;
      revisionNumber?: number;
      processedStorageKey?: string | null;
      updatedAt?: string;
    },
  >(local: T, workerStatus?: any): Promise<T> {
    if (
      local.status === FileProcessingStatus.Completed ||
      local.status === FileProcessingStatus.Failed ||
      local.status === FileProcessingStatus.Corrupt ||
      local.status === FileProcessingStatus.Skipped
    ) {
      return local;
    }

    const version = await this.repository.findVersionById(local.fileVersionId);
    if (!version) return local;

    // Check if worker already reported a terminal outcome
    if (workerStatus) {
      if (workerStatus.status === "completed" && workerStatus.output) {
        await this.applyProcessingCallback({
          jobId: local.jobId,
          fileId: local.fileId,
          fileVersionId: local.fileVersionId,
          status: FileProcessingStatus.Completed,
          processed: workerStatus.output,
        }).catch(() => {});
        return (await this.getProcessingJobByJobId(local.jobId).catch(() => local)) as T;
      }

      if (workerStatus.status === "failed") {
        await this.applyProcessingCallback({
          jobId: local.jobId,
          fileId: local.fileId,
          fileVersionId: local.fileVersionId,
          status: FileProcessingStatus.Failed,
          errorCode: workerStatus.error?.code || "worker_failed",
          errorMessage: workerStatus.error?.message || "Worker processing failed.",
        }).catch(() => {});
        return (await this.getProcessingJobByJobId(local.jobId).catch(() => local)) as T;
      }
    }

    // Evaluate how long the job has been active
    const lastActiveTime = Math.max(
      version.processingStartedAt?.getTime() ?? 0,
      version.queuedAt?.getTime() ?? 0,
      version.updatedAt?.getTime() ?? 0,
    );
    const now = Date.now();
    const STALE_THRESHOLD_MS = Number(
      process.env.STALE_PROCESSING_JOB_THRESHOLD_MS || 180_000,
    ); // 3 minutes
    const isStale = lastActiveTime === 0 || now - lastActiveTime > STALE_THRESHOLD_MS;

    const workerNotFound =
      workerStatus?.status === "not_found" ||
      (workerStatus && !workerStatus.status);
    const workerHeartbeatStale =
      workerStatus?.heartbeatAt &&
      now - Number(workerStatus.heartbeatAt) > STALE_THRESHOLD_MS;
    const workerDown = !workerStatus;

    if (version.processingAttempts >= 3 && (isStale || workerNotFound || workerHeartbeatStale || workerDown)) {
      await this.repository.updateVersionProcessingResult(version.id, {
        processingStatus: FileProcessingStatus.Failed,
        processingJobId: local.jobId,
        processingErrorCode: "stale_recovery_exhausted",
        processingErrorMessage:
          "File processing timed out: worker stopped responding and retries exhausted.",
        processingCompletedAt: new Date(),
        updatedAt: new Date(),
      });
      await creditService
        .refundCreditsForVersion(version.id, "worker_processing_failed")
        .catch(() => {});
      return (await this.getProcessingJobByJobId(local.jobId).catch(() => ({
        ...local,
        status: FileProcessingStatus.Failed,
        errorCode: "stale_recovery_exhausted",
        errorMessage:
          "File processing timed out: worker stopped responding and retries exhausted.",
      }))) as T;
    }

    // Only recover if stale by time or worker definitely lost/stopped the job
    if (!isStale && !workerNotFound && !workerHeartbeatStale) {
      return local;
    }

    // If worker is temporarily down (e.g. 10s restart), give it the full stale grace period
    if (workerDown && !isStale) {
      return local;
    }

    console.warn("[stale-recovery] Reconciling stale processing version", {
      versionId: version.id,
      jobId: local.jobId,
      status: version.processingStatus,
      attempts: version.processingAttempts,
      workerStatus: workerStatus?.status || "unavailable",
      ageMs: now - lastActiveTime,
    });

    if (version.processingAttempts >= 3) {
      await this.repository.updateVersionProcessingResult(version.id, {
        processingStatus: FileProcessingStatus.Failed,
        processingJobId: local.jobId,
        processingErrorCode: "stale_recovery_exhausted",
        processingErrorMessage:
          "File processing timed out: worker stopped responding and retries exhausted.",
        processingCompletedAt: new Date(),
        updatedAt: new Date(),
      });
      await creditService
        .refundCreditsForVersion(version.id, "worker_processing_failed")
        .catch(() => {});
      return (await this.getProcessingJobByJobId(local.jobId).catch(() => ({
        ...local,
        status: FileProcessingStatus.Failed,
        errorCode: "stale_recovery_exhausted",
        errorMessage:
          "File processing timed out: worker stopped responding and retries exhausted.",
      }))) as T;
    }

    try {
      const retried = await this.retryProcessingVersion(version.id);
      return (await this.getProcessingJobByJobId(retried.jobId).catch(() => ({
        ...local,
        jobId: retried.jobId,
        status: retried.processingStatus,
        errorCode: retried.errorCode,
        errorMessage: retried.errorMessage,
      }))) as T;
    } catch (err) {
      console.error("[stale-recovery] Retry failed", {
        versionId: version.id,
        error: err,
      });
      return local;
    }
  }

  async reconcileStaleProcessingVersions() {
    const STALE_THRESHOLD_MS = Number(
      process.env.STALE_PROCESSING_JOB_THRESHOLD_MS || 180_000,
    );
    const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

    const staleVersions = await this.repository.findStaleProcessingVersions(staleCutoff);

    let reconciledCount = 0;
    for (const version of staleVersions) {
      try {
        let workerStatus: any = null;
        if (version.processingJobId) {
          workerStatus = await getWorkerJobStatus(version.processingJobId).catch(() => null);
        }
        await this.reconcileJobIfStale(
          {
            fileId: version.fileId,
            fileVersionId: version.id,
            jobId: version.processingJobId || "",
            status: version.processingStatus,
            errorCode: version.processingErrorCode,
            errorMessage: version.processingErrorMessage,
            updatedAt: version.updatedAt.toISOString(),
          },
          workerStatus,
        );
        reconciledCount++;
      } catch (err) {
        console.error("[stale-recovery] Error reconciling version", {
          versionId: version.id,
          error: err,
        });
      }
    }

    return { totalFound: staleVersions.length, reconciledCount };
  }

  async getFileReview(input: {
    fileId: string;
    projectId: string;
    viewerLocale: string;
  }): Promise<FileReviewDTO> {
    const project = await this.getRequiredProject(input.projectId);
    const workflowSummary =
      await this.repository.getProjectWorkflowSummary(project.id);
    const totalRevisionCount =
      await this.repository.countProjectAddedRevisions(project.id);
    const freeRevisionCount = Math.max(
      project.revisionLimit - totalRevisionCount,
      0,
    );
    const includedRevisionCount = freeRevisionCount;
    const extraRevisionCount = Math.max(
      0,
      totalRevisionCount - project.revisionLimit,
    );
    const extraRevisionAmountCents =
      extraRevisionCount * project.extraRevisionCostCents;

    const fileWithVersions = await this.repository.findWithVersionsById(
      input.fileId,
    );

    if (!fileWithVersions) {
      throw new NotFoundAppError("File not found.");
    }

    const { file, versions } = fileWithVersions;

    if (file.projectId !== project.id) {
      throw new NotFoundAppError("File not found.");
    }

    const versionSafetyById = new Map(
      (
        await this.repository.findVersionSafetySummaries(file.id)
      ).map((summary) => [summary.fileVersionId, summary]),
    );
    const uploadMode = getFileReviewUploadMode({
      finalDraftReportStatus: file.finalDraftReportStatus,
      hasFinalDraft: versions.some(
        (version) =>
          version.id === file.finalDraftVersionId || version.isFinalDraft,
      ),
    });

    const currentVersion =
      versions.find((version) => version.id === file.currentVersionId) ??
      versions[0] ??
      null;
    const versionPreviews = await Promise.all(
      versions.map(async (version) => ({
        reviewPreview: await this.buildReviewPreview(version),
        version,
      })),
    );
    const [fileText, projectFiles, projectTitleText] = await Promise.all([
      this.resolveFileText(file, input.viewerLocale),
      this.repository.findProjectFileNavigation(project.id),
      this.resolveProjectTitleText(project, input.viewerLocale),
    ]);

    return {
      file: {
        approvalStatus: file.approvalStatus,
        approvedVersionId: file.approvedVersionId,
        createdAt: file.createdAt.toISOString(),
        currentVersionId: file.currentVersionId,
        extension: currentVersion?.extension ?? file.extension,
        finalDraftVersionId: file.finalDraftVersionId,
        finalDraftReportMessage: file.finalDraftReportMessage,
        finalDraftReportMessageText: fileText.finalDraftReportMessageText,
        finalDraftReportReason: file.finalDraftReportReason,
        finalDraftReportStatus: file.finalDraftReportStatus,
        finalDraftReportedAt: file.finalDraftReportedAt?.toISOString() ?? null,
        id: file.id,
        mimeType: currentVersion?.mimeType ?? file.mimeType,
        name: file.name,
        nameText: fileText.nameText,
        originalName: currentVersion?.originalName ?? file.originalName,
        processingJobId: currentVersion?.processingJobId ?? null,
        processingStatus: currentVersion?.processingStatus ?? null,
        projectId: file.projectId,
        sizeBytes: currentVersion?.sizeBytes ?? file.sizeBytes,
        updatedAt: file.updatedAt.toISOString(),
        uploadedBy: file.uploadedBy,
        uploadStatus: file.uploadStatus,
        uploadMode,
      },
      project: {
        advancePaymentEnabled: project.advancePaymentEnabled,
        advanceAmountCents: project.advanceAmountCents,
        advancePaymentStatus: project.advancePaymentStatus,
        amountCents: project.amountCents,
        currency: project.currency,
        extraRevisionAmountCents,
        extraRevisionCostCents: project.extraRevisionCostCents,
        extraRevisionCount,
        freeRevisionCount,
        id: project.id,
        includedRevisionCount,
        allFilesHaveFinalDrafts: workflowSummary.allFilesHaveFinalDrafts,
        pendingFinalDraftFileCount: workflowSummary.filesMissingFinalDraftCount,
        paymentStatus: project.paymentStatus,
        revisionLimit: project.revisionLimit,
        title: project.title,
        titleText: projectTitleText,
        totalRevisionCount,
        watermarkEnabled: project.watermarkEnabled,
        // Unlock/payment readiness fields computed server-side so the UI
        // can decide whether project-level payment unlock is available.
        canPayAndUnlockProject:
          Boolean(workflowSummary.allFilesHaveFinalDrafts) &&
          (Number(workflowSummary.unresolvedFinalDraftReportCount ?? 0) === 0) &&
          (Number(workflowSummary.finalDraftProcessingIncompleteCount ?? 0) === 0),
        unlockBlockedReason: (() => {
          if (workflowSummary.activeFileCount === 0) return "no_files";
          if ((workflowSummary.filesMissingFinalDraftCount ?? 0) > 0)
            return "missing_final_drafts";
          if ((workflowSummary.unresolvedFinalDraftReportCount ?? 0) > 0)
            return "unresolved_final_drafts";
          if ((workflowSummary.finalDraftProcessingIncompleteCount ?? 0) > 0)
            return "final_draft_processing_incomplete";
          return null;
        })(),
        paymentUnlockState:
          Number(workflowSummary.activeFileCount ?? 0) === 0
            ? "no_files"
            : (Number(workflowSummary.filesMissingFinalDraftCount ?? 0) > 0
              ? "blocked_missing_final_drafts"
              : Number(workflowSummary.unresolvedFinalDraftReportCount ?? 0) > 0
                ? "blocked_unresolved_final_drafts"
                : Number(workflowSummary.finalDraftProcessingIncompleteCount ?? 0) > 0
                  ? "blocked_processing"
                  : "ready"),
      },
      projectFiles: projectFiles.map((projectFile) => ({
        approvalStatus: projectFile.approvalStatus,
        displayName: projectFile.name,
        extension: projectFile.extension,
        id: projectFile.id,
        updatedAt: projectFile.updatedAt.toISOString(),
      })),
      versions: versionPreviews.map(({ reviewPreview, version }) =>
        toFileReviewVersionDTO({
          approvedVersionId: file.approvedVersionId,
          commentCount:
            versionSafetyById.get(version.id)?.commentCount ?? 0,
          currentVersionId: file.currentVersionId,
          deleteBlockReason: getVersionDeleteBlockReason({
            activeVersionCount: versions.length,
            hasUnresolvedFinalDraftReport:
              file.finalDraftVersionId === version.id &&
              isUnresolvedFinalDraftReportStatus(
                file.finalDraftReportStatus,
              ),
            hasUnresolvedReports:
              (versionSafetyById.get(version.id)?.unresolvedReportCount ?? 0) > 0,
            paymentStatus: project.paymentStatus,
            version:
              file.finalDraftVersionId === version.id
                ? { ...version, isFinalDraft: true }
                : version,
          }),
          downloadUrl: reviewPreview.downloadUrl,
          finalDraftVersionId: file.finalDraftVersionId,
          finalDraftReportStatus: file.finalDraftReportStatus,
          latestReportStatus:
            versionSafetyById.get(version.id)?.latestReportStatus ?? null,
          preview: reviewPreview.preview,
          unresolvedReportCount:
            versionSafetyById.get(version.id)?.unresolvedReportCount ?? 0,
          version,
        }),
      ),
    };
  }

  async getClientShareDeliverables(input: {
    projectId: string;
    query: Omit<FileQueryParams, "projectId">;
    shareToken: string;
    viewerLocale: string;
  }): Promise<{
    items: ClientShareDeliverableDTO[];
    pagination: PaginatedResult<FileDTO>["pagination"];
    project: {
      fileCount: number;
      title: string;
      titleText: TranslatedTextDTO;
    };
  }> {
    const project = await this.getRequiredProject(input.projectId);
    const files = await this.listFiles({
      ...input.query,
      projectId: project.id,
    }, {
      viewerLocale: input.viewerLocale,
    });
    const fileCount = await this.repository.countActiveByProjectId(project.id);
    const projectTitleText = await this.resolveProjectTitleText(
      project,
      input.viewerLocale,
    );

    return {
      items: files.items.map((file) =>
        this.toClientShareDeliverable(file, input.shareToken),
      ),
      pagination: files.pagination,
      project: {
        fileCount,
        title: project.title,
        titleText: projectTitleText,
      },
    };
  }

  async getClientShareFileReview(input: {
    fileId: string;
    projectId: string;
    shareToken: string;
    viewerLocale: string;
  }): Promise<ClientShareReviewDTO> {
    const detail = await this.getFileReview({
      fileId: input.fileId,
      projectId: input.projectId,
      viewerLocale: input.viewerLocale,
    });

    return {
      ...detail,
      versions: detail.versions.map((version) =>
        this.toClientShareReviewVersion(version, input.shareToken),
      ),
    };
  }

  private async getClientShareFinalDeliverablesInternal(input: {
    projectId: string;
    shareToken: string;
    viewerLocale: string;
  }): Promise<Array<ClientShareFinalDeliverableDTO & { uploadedBy: string | null }>> {
    const files = await this.repository.findMany({
      includeTotal: false,
      limit: 500,
      offset: 0,
      order: "desc",
      page: 1,
      projectId: input.projectId,
      sort: "createdAt",
    });

    const mapped = await Promise.all(
      files.records.map(async (record) => {
        if (!record.finalDraftVersionId) {
          return null;
        }

        const fileWithVersions = await this.repository.findWithVersionsById(
          record.id,
          {
            includeDeletedVersions: true,
          },
        );
        const finalDraftVersion = fileWithVersions?.versions.find(
          (version) =>
            version.deletedAt == null &&
            version.id === record.finalDraftVersionId,
        );

        if (!fileWithVersions || !finalDraftVersion) {
          return null;
        }

        const fileText = await this.resolveFileText(record, input.viewerLocale);
        const preview = await this.buildReviewPreview(finalDraftVersion);
        const previewKind = preview.preview.kind;
        const previewUrl =
          previewKind !== "unsupported"
            ? buildClientShareVersionPreviewUrl({
              fileId: record.id,
              shareToken: input.shareToken,
              versionId: finalDraftVersion.id,
            })
            : null;

        return {
          approvalStatus: record.approvalStatus,
          createdAt: record.createdAt.toISOString(),
          downloadUrl: buildClientShareFinalDownloadUrl(
            input.shareToken,
            record.id,
          ),
          extension: finalDraftVersion.extension,
          id: record.id,
          mimeType: finalDraftVersion.mimeType,
          name: record.name,
          nameText: fileText.nameText,
          previewKind,
          previewUrl,
          previewVersionId: finalDraftVersion.id,
          sizeBytes: finalDraftVersion.sizeBytes,
          thumbnailUrl: previewKind === "image" ? previewUrl : null,
          updatedAt: finalDraftVersion.updatedAt.toISOString(),
          uploadStatus: record.uploadStatus,
          uploadedBy: finalDraftVersion.uploadedBy ?? record.uploadedBy,
        };
      }),
    );

    return mapped.filter(
      (
        item,
      ): item is ClientShareFinalDeliverableDTO & { uploadedBy: string | null } =>
        item != null,
    );
  }

  private async buildFileDTO(
    record: FileDTORecordInput,
    viewerLocale: string,
    currentVersion?: FileVersionRecord | null,
  ) {
    const [dto] = await this.buildFileDTOs(
      [{ currentVersion, record }],
      viewerLocale,
    );

    if (!dto) {
      throw new Error("File translation mapping failed.");
    }

    return dto;
  }

  private async buildFileDTOs(
    records: Array<{
      currentVersion?: FileVersionRecord | null;
      record: FileDTORecordInput;
    }>,
    viewerLocale: string,
  ) {
    const resolvedTextById = await this.resolveFileTextBatch(
      records.map(({ record }) => record),
      viewerLocale,
    );

    return records.map(({ currentVersion, record }) => {
      const dto = toFileDTO(record, currentVersion);
      const resolved = resolvedTextById.get(record.id);

      return {
        ...dto,
        finalDraftReportMessageText:
          resolved?.finalDraftReportMessageText ?? dto.finalDraftReportMessageText,
        nameText: resolved?.nameText ?? dto.nameText,
      };
    });
  }

  private async resolveFileText(
    record: FileTranslationRecord,
    viewerLocale: string,
  ) {
    const resolved = await this.resolveFileTextBatch([record], viewerLocale);

    return (
      resolved.get(record.id) ?? {
        finalDraftReportMessageText: record.finalDraftReportMessage
          ? createTranslatedTextDTO({
            originalText: record.finalDraftReportMessage,
            sourceLocale: record.finalDraftReportSourceLocale,
          })
          : null,
        nameText: createTranslatedTextDTO({
          originalText: record.name,
          sourceLocale: record.nameSourceLocale,
        }),
      }
    );
  }

  private async resolveFileTextBatch(
    records: FileTranslationRecord[],
    viewerLocale: string,
  ) {
    void viewerLocale;

    return new Map<string, ResolvedFileText>(
      records.map((record) => [
        record.id,
        {
          finalDraftReportMessageText: record.finalDraftReportMessage
            ? createTranslatedTextDTO({
              originalText: record.finalDraftReportMessage,
              sourceLocale: record.finalDraftReportSourceLocale,
            })
            : null,
          nameText: createTranslatedTextDTO({
            originalText: record.name,
            sourceLocale: record.nameSourceLocale,
          }),
        },
      ]),
    );
  }

  private async resolveProjectTitleText(
    record: ProjectTitleRecord,
    viewerLocale: string,
  ) {
    void viewerLocale;

    return createTranslatedTextDTO({
      originalText: record.title,
      sourceLocale: record.titleSourceLocale,
    });
  }

  private async buildReviewPreview(
    version: FileVersionRecord,
  ): Promise<{
    downloadUrl: string | null;
    preview: FileReviewPreviewDTO;
  }> {
    const {
      previewBucket,
      previewKey,
      previewMimeType,
      previewExtension,
      hasProcessedObject,
    } = resolveDisplayStorageLocation(version);

    const downloadBucket = hasProcessedObject ? previewBucket : version.storageBucket;
    const downloadKey = hasProcessedObject ? previewKey : version.storageKey;

    const kind = getAssetKind({
      extension: previewExtension,
      mimeType: previewMimeType,
    });
    const previewKind = toPreviewKind(kind);

    const canPreview = canPreviewAsset(kind);

    const previewUrl = canPreview
      ? await this.getReadableObjectUrl({
        bucket: previewBucket,
        disposition: "inline",
        filename: version.originalName,
        key: previewKey,
      })
      : null;

    const downloadUrl = await this.getReadableObjectUrl({
      bucket: downloadBucket,
      disposition: "attachment",
      filename: version.originalName,
      key: downloadKey,
    });

    // TODO: Populate HLS/DASH rendition sources or Cloudflare Stream playback
    // metadata here when the processing pipeline stores transcoded variants.
    const sources: FileReviewPreviewSourceDTO[] = previewUrl
      ? [
        {
          filename: version.originalName,
          label:
            previewKind === "video"
              ? "source"
              : previewKind === "pdf"
                ? "pdf"
                : previewKind === "image"
                  ? "image"
                  : previewKind === "audio"
                    ? "audio"
                    : "file",
          type:
            previewKind === "video"
              ? "mp4"
              : previewKind === "pdf"
                ? "pdf"
                : previewKind === "image"
                  ? "image"
                  : "audio",
          url: previewUrl,
        },
      ]
      : [];

    return {
      downloadUrl,
      preview: {
        filename: version.originalName,
        kind: canPreview ? previewKind : "unsupported",
        mimeType: previewMimeType,
        posterUrl: null,
        sources,
        url: previewUrl,
      },
    };
  }

  private async getReadableObjectUrl(input: {
    bucket: string;
    disposition: "attachment" | "inline";
    filename: string;
    key: string;
  }) {
    if (this.storage.getPresignedGetObjectUrl) {
      const result = await this.storage.getPresignedGetObjectUrl({
        bucket: input.bucket,
        disposition: input.disposition,
        expiresInSeconds: 900,
        filename: input.filename,
        key: input.key,
      });

      return result.url;
    }

    const result = await this.storage.getSignedUrl({
      bucket: input.bucket,
      disposition: input.disposition,
      filename: input.filename,
      key: input.key,
    });

    if (!result.url) {
      throw new AppError(
        "File URL could not be created.",
        503,
        "file_url_unavailable",
      );
    }

    return result.url;
  }

  private assertProjectIsActive(projectStatus: string) {
    if (projectStatus !== ProjectStatus.Active) {
      throw new AppError(
        "Action not allowed: Project is no longer active.",
        400,
        "project_inactive",
      );
    }
  }

  private assertFileIsNotApproved(approvalStatus: string) {
    if (approvalStatus === FileApprovalStatus.Approved) {
      throw new AppError(
        "Action not allowed: File has already been approved.",
        400,
        "file_approved",
      );
    }
  }
}

export const fileService = new FileService(
  new DrizzleFileRepository(),
  storage,
  new DrizzleProjectRepository(),
);
