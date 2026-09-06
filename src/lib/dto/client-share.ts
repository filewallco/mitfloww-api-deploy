import type { FileApprovalStatus } from "@/lib/db/schema";
import type {
  FileReviewPreviewKind,
} from "@/lib/dto/file-review";
import type { FileReviewDTO } from "@/lib/dto/file-review";
import type { FileUploadStatus } from "@/lib/dto/file-contracts";
import type { ProjectPaymentStatus } from "@/lib/dto/projects";
import type { TranslatedTextDTO } from "@/lib/dto/translated-text";

export const CLIENT_SHARE_REPORT_REASONS = [
  "illegal_sharing",
  "final_version_mismatch",
] as const;

export type ClientShareReportReason =
  (typeof CLIENT_SHARE_REPORT_REASONS)[number];

export const ClientShareReportReason = {
  FinalVersionMismatch: CLIENT_SHARE_REPORT_REASONS[1],
  IllegalSharing: CLIENT_SHARE_REPORT_REASONS[0],
} as const satisfies Record<string, ClientShareReportReason>;

export type ClientShareDeliverableDTO = {
  approvalStatus: FileApprovalStatus;
  createdAt: string;
  extension: string;
  id: string;
  mimeType: string;
  name: string;
  nameText: TranslatedTextDTO;
  previewUrl: string | null;
  sizeBytes: number;
  thumbnailUrl: string | null;
  updatedAt: string;
  uploadStatus: FileUploadStatus;
};

export type ClientShareProjectSummaryDTO = {
  fileCount: number;
  title: string;
  titleText: TranslatedTextDTO;
};

export type ClientShareDeliverablesPageDTO = {
  items: ClientShareDeliverableDTO[];
  project: ClientShareProjectSummaryDTO;
};

export type ClientShareReviewDTO = FileReviewDTO;

export type ClientShareAccessMutationResultDTO = {
  accessGranted: true;
};

export type ClientShareApproveRevisionResultDTO = {
  approvedVersionId: string;
  fileId: string;
  status: "approved";
};

export type ClientShareCancelApprovalResultDTO = {
  approvedVersionId: null;
  fileId: string;
  status: "pending";
};

export type ClientSharePaymentPlaceholderResultDTO = {
  fileId: string;
  status: "payment_pending_manual";
};

export type ClientShareReportResultDTO = {
  createdAt: string;
  fileId: string;
  id: string | null;
  status: string;
  versionId: string | null;
};

export type ClientSharePostPaymentReviewDTO = {
  rating: number;
  reviewText: string;
  submittedAt: string;
};

export type ClientShareFinalDeliverableDTO = ClientShareDeliverableDTO & {
  downloadUrl: string;
  previewKind: FileReviewPreviewKind;
  previewVersionId: string;
};

export type ClientSharePostPaymentProjectDTO = {
  advancePaymentEnabled: boolean;
  advanceAmountCents: number;
  advancePaymentStatus: ProjectPaymentStatus;
  amountCents: number;
  creatorName: string | null;
  creatorAvatarUrl?: string | null;
  completedProjectsCount: number;
  currency: string;
  deliveryDate: string | null;
  extraRevisionAmountCents: number;
  extraRevisionCount: number;
  fileCount: number;
  includedRevisionCount: number;
  paymentCompletedAt: string | null;
  paymentReference: string | null;
  paymentStatus: ProjectPaymentStatus;
  startedAt: string;
  title: string;
  titleText: TranslatedTextDTO;
  totalSizeBytes: number;
  usedRevisionCount: number;
  clientEmail?: string | null;
  averageRating?: number | null;
  reviewCount?: number | null;
};

export type ClientSharePostPaymentSummaryDTO = {
  files: ClientShareFinalDeliverableDTO[];
  project: ClientSharePostPaymentProjectDTO;
  review: ClientSharePostPaymentReviewDTO | null;
  freelancerAverageRating: number;
  freelancerReviewCount: number;
};

export type ClientSharePaymentCompletionResultDTO = {
  paymentCompletedAt: string;
  paymentReference: string;
  status: "paid";
};

export type ClientShareReviewSubmissionResultDTO =
  ClientSharePostPaymentReviewDTO;
