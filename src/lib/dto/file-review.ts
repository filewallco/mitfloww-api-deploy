import type {
  FileApprovalStatus,
  FileFinalDraftReportStatus,
  FileProcessingStatus,
  FileVersionReportStatus,
} from "@/lib/db/schema/files";
import type {
  FileUploadStatus,
} from "@/lib/dto/file-contracts";
import type { FileVersionDeleteBlockReason } from "@/lib/dto/files";
import type { ProjectPaymentStatus } from "@/lib/dto/projects";
import type { TranslatedTextDTO } from "@/lib/dto/translated-text";

export const FILE_REVIEW_UPLOAD_MODES = [
  "normal",
  "locked_after_final_draft",
  "final_draft_replacement_only",
] as const;

export type FileReviewUploadMode = (typeof FILE_REVIEW_UPLOAD_MODES)[number];

export type FileReviewAssetKind =
  | "archive"
  | "audio"
  | "document"
  | "image"
  | "other"
  | "pdf"
  | "video";

export type FileReviewPreviewKind =
  | "audio"
  | "image"
  | "pdf"
  | "unsupported"
  | "video";

export type FileReviewPreviewSourceDTO = {
  filename: string;
  height?: number | null;
  label: string;
  quality?: string | null;
  type: "audio" | "dash" | "hls" | "image" | "mp4" | "pdf";
  url: string;
  width?: number | null;
};

export type FileReviewPreviewDTO = {
  filename: string;
  kind: FileReviewPreviewKind;
  mimeType: string;
  posterUrl: string | null;
  sources: FileReviewPreviewSourceDTO[];
  url: string | null;
};

export type FileReviewVersionDTO = {
  commentCount: number;
  createdAt: string;
  deleteBlockReason: FileVersionDeleteBlockReason | null;
  downloadUrl: string | null;
  extension: string;
  fileId: string;
  finalDraftDownloadCount: number;
  finalDraftDownloadedAt: string | null;
  hasComments: boolean;
  hasUnresolvedReports: boolean;
  id: string;
  isApproved: boolean;
  isCurrent: boolean;
  isFinalDraft: boolean;
  latestReportStatus: FileVersionReportStatus | null;
  mimeType: string;
  originalName: string;
  isSoftWatermarked?: boolean;
  preview: FileReviewPreviewDTO;
  previewPurgedAt: string | null;
  previewRetentionUntil: string | null;
  processedAvailable: boolean;
  processedExtension: string | null;
  processedMimeType: string | null;
  processedSizeBytes: number | null;
  processedStorageBucket: string | null;
  processedStorageKey: string | null;
  processingErrorCode: string | null;
  processingErrorMessage: string | null;
  processingStatus: FileProcessingStatus;
  revisionDescription: string | null;
  revisionDescriptionSourceLocale: string | null;
  revisionNumber: number;
  sizeBytes: number;
  storageBucket: string;
  storageKey: string;
  unresolvedReportCount: number;
  updatedAt: string;
  uploadedBy: string | null;
};

export type FileReviewFileDTO = {
  approvalStatus: FileApprovalStatus;
  approvedVersionId: string | null;
  createdAt: string;
  currentVersionId: string | null;
  extension: string;
  finalDraftVersionId: string | null;
  finalDraftReportMessage: string | null;
  finalDraftReportMessageText: TranslatedTextDTO | null;
  finalDraftReportReason: string | null;
  finalDraftReportStatus: FileFinalDraftReportStatus;
  finalDraftReportedAt: string | null;
  id: string;
  mimeType: string;
  name: string;
  nameText: TranslatedTextDTO;
  originalName: string;
  processingJobId: string | null;
  processingStatus: FileProcessingStatus | null;
  projectId: string;
  sizeBytes: number;
  updatedAt: string;
  uploadedBy: string | null;
  uploadStatus: FileUploadStatus;
  uploadMode: FileReviewUploadMode;
};

export type FileReviewProjectDTO = {
  advancePaymentEnabled: boolean;
  advanceAmountCents: number;
  advancePaymentStatus: ProjectPaymentStatus;
  amountCents: number;
  allFilesHaveFinalDrafts: boolean;
  currency: string;
  extraRevisionAmountCents: number;
  extraRevisionCostCents: number;
  extraRevisionCount: number;
  freeRevisionCount: number;
  id: string;
  includedRevisionCount: number;
  pendingFinalDraftFileCount: number;
  paymentStatus: ProjectPaymentStatus;
  revisionLimit: number;
  title: string;
  titleText: TranslatedTextDTO;
  totalRevisionCount: number;
  watermarkEnabled: boolean;
  canPayAndUnlockProject?: boolean;
  unlockBlockedReason?: string | null;
  paymentUnlockState?: string | null;
  creatorName?: string | null;
  creatorAvatarUrl?: string | null;
  averageRating?: number | null;
  reviewCount?: number | null;
};

export type FileReviewProjectFileNavDTO = {
  approvalStatus: FileApprovalStatus;
  displayName: string;
  extension: string;
  id: string;
  updatedAt: string;
};

export type FileReviewDTO = {
  file: FileReviewFileDTO;
  project: FileReviewProjectDTO;
  projectFiles: FileReviewProjectFileNavDTO[];
  versions: FileReviewVersionDTO[];
};
