import { pgSchema } from "drizzle-orm/pg-core";
import { createCreditTables } from "./credits";
import { createFileTables } from "./files";
import { createHealthTables } from "./health";
import { createInvoiceTables } from "./invoices";
import { createNotificationTables } from "./notifications";
import { createProjectTables } from "./projects";
import { createTestimonialTables } from "./testimonials";
import { createStorageTables } from "./storage";
import { createUserTables } from "./users";
import { createClientTables } from "./clients";
import { createTransactionTables } from "./transactions";
import { createAssetTables } from "./assets";
import { createAuthTables } from "./auth";

export const fw = pgSchema("mitfloww");

export const { projectClientReviews, projects, projectPaymentSnapshots, projectUnlockedFileVersions } = createProjectTables(fw);
export const {
  testimonialRevisions,
  testimonialTemplates,
  testimonials,
} = createTestimonialTables(fw, {
  projectClientReviews,
  projects,
});
export const {
  files,
  fileVersions,
  revisionComments,
  revisionCommentMarkers,
  revisionCommentItems,
  revisionCommentReplies,
  revisionCommentReports,
  fileVersionReports,
} =
  createFileTables(fw, projects);
export const {
  creditAccounts,
  creditLedgerEntries,
  creditReservations,
} = createCreditTables(fw, {
  fileVersions,
  files,
  projects,
});
export const {
  storageAccounts,
  storageAccountMutations,
} = createStorageTables(fw, {
  fileVersions,
  files,
  projects,
});
export const { notifications } = createNotificationTables(fw, {
  files,
  projects,
});
export const { healthChecks } = createHealthTables(fw);
export const { users, companies, creatorWorkProfiles } = createUserTables(fw);
export const { authIdentities, sessions, otpChallenges } = createAuthTables(fw, { users });
export const { invoiceSettings } = createInvoiceTables(fw, { users });
export const { clientMasters } = createClientTables(fw, { users });
export const { transactions } = createTransactionTables(fw, { users, projects });
export const {
  assets,
  assetPreviewFiles,
  assetFiles,
  assetPurchases,
} = createAssetTables(fw);

export type {
  CreditAccountRecord,
  CreditLedgerEntryRecord,
  CreditReservationRecord,
  NewCreditAccountRecord,
  NewCreditLedgerEntryRecord,
  NewCreditReservationRecord,
} from "./credits";
export type {
  NewStorageAccountMutationRecord,
  NewStorageAccountRecord,
  StorageAccountMutationRecord,
  StorageAccountRecord,
} from "./storage";
export type {
  FileRecord,
  FileVersionRecord,
  NewFileRecord,
  NewFileVersionRecord,
  NewFileVersionReportRecord,
  NewRevisionCommentRecord,
  NewRevisionCommentMarkerRecord,
  NewRevisionCommentItemRecord,
  NewRevisionCommentReplyRecord,
  RevisionCommentRecord,
  RevisionCommentMarkerRecord,
  RevisionCommentItemRecord,
  RevisionCommentReplyRecord,
  RevisionCommentReportRecord,
  FileVersionReportRecord,
} from "./files";
export type {
  NewNotificationRecord,
  NotificationMetadata,
  NotificationRecord,
} from "./notifications";
export type {
  NewProjectClientReviewRecord,
  NewProjectRecord,
  ProjectClientReviewRecord,
  ProjectRecord,
  ProjectPaymentSnapshotRecord,
  NewProjectPaymentSnapshotRecord,
  ProjectUnlockedFileVersionRecord,
  NewProjectUnlockedFileVersionRecord,
} from "./projects";
export type {
  NewTestimonialRecord,
  NewTestimonialRevisionRecord,
  NewTestimonialTemplateRecord,
  TestimonialRecord as TestimonialDbRecord,
  TestimonialRevisionRecord as TestimonialDbRevisionRecord,
  TestimonialTemplateRecord as TestimonialDbTemplateRecord,
} from "./testimonials";
export type {
  CompanyRecord,
  NewCompanyRecord,
  NewUserRecord,
  UserRecord,
  CreatorWorkProfileRecord,
  NewCreatorWorkProfileRecord,
} from "./users";
export type {
  TransactionRecord,
  NewTransactionRecord,
} from "./transactions";
export type {
  ClientMasterRecord,
  NewClientMasterRecord,
} from "./clients";
export type {
  InvoiceSettingsRecord,
  NewInvoiceSettingsRecord,
  CustomInvoiceTemplate,
} from "./invoices";
export type {
  AssetRecord,
  NewAssetRecord,
  AssetPreviewFileRecord,
  NewAssetPreviewFileRecord,
  AssetFileRecord,
  NewAssetFileRecord,
  AssetPurchaseRecord,
  NewAssetPurchaseRecord,
  AssetTemplateKey,
} from "./assets";
export type {
  AuthIdentityRecord,
  NewAuthIdentityRecord,
  SessionRecord,
  NewSessionRecord,
  OtpChallengeRecord,
  NewOtpChallengeRecord,
} from "./auth";

export {
  FILE_APPROVAL_STATUSES,
  FILE_FINAL_DRAFT_REPORT_STATUSES,
  FILE_PROCESSING_CALLBACK_STATUSES,
  FILE_REVISION_COMMENT_STATUSES,
  FILE_REVISION_COMMENT_REPORT_STATUSES,
  FILE_PROCESSING_STATUSES,
  FILE_REVISION_NOTE_REPLY_EMAIL_STATUSES,
  FILE_VERSION_REPORT_STATUSES,
  REVISION_COMMENT_MARKER_TYPES,
  FileApprovalStatus,
  FileApprovalStatusDb,
  FileFinalDraftReportStatus,
  FileFinalDraftReportStatusDb,
  FileRevisionCommentStatus,
  FileRevisionCommentStatusDb,
  FileRevisionCommentReportStatus,
  FileRevisionCommentReportStatusDb,
  FileProcessingStatus,
  FileProcessingStatusDb,
  FileUploadStatus,
  FileUploadStatusDb,
  FileRevisionNoteReplyEmailStatus,
  FileVersionReportStatus,
  FileVersionReportStatusDb,
  RevisionCommentMarkerType,
  RevisionCommentMarkerTypeDb,
  type FileProcessingCallbackStatus,
  type FileProcessingCallbackStatus as FileProcessingCallbackStatusType,
  type FileApprovalStatus as FileApprovalStatusType,
  type FileFinalDraftReportStatus as FileFinalDraftReportStatusType,
  type FileRevisionCommentStatus as FileRevisionCommentStatusType,
  type FileRevisionCommentReportStatus as FileRevisionCommentReportStatusType,
  type FileProcessingStatus as FileProcessingStatusType,
  type FileRevisionNoteReplyEmailStatus as FileRevisionNoteReplyEmailStatusType,
  type FileVersionReportStatus as FileVersionReportStatusType,
  type RevisionCommentMarkerType as RevisionCommentMarkerTypeType,
} from "./files";

export { auditColumns, type BaseAuditEntity } from "./audit";
export {
  ASSET_STATUSES,
  ASSET_TEMPLATES,
  AssetStatus,
  AssetStatusDb,
} from "./assets";
export {
  ProjectStatus,
  ProjectStatusDb,
  ProjectShareStatus,
  ProjectShareStatusDb,
  ProjectPaymentSnapshotType,
  ProjectPaymentSnapshotTypeDb,
  ProjectPaymentSnapshotStatus,
  ProjectPaymentSnapshotStatusDb,
} from "@/lib/dto/projects";
export {
  TransactionPaymentStatus,
  TransactionPaymentStatusDb,
  TransactionPaymentType,
  TransactionPaymentTypeDb,
} from "./transactions";
export {
  UserStatus,
  UserStatusDb,
} from "./users";
export {
  OtpPurpose,
  OtpPurposeDb,
} from "./auth";
export {
  AppNotificationCategory,
  AppNotificationCategoryDb,
} from "./notifications";
export {
  StorageScopeType,
  StorageScopeTypeDb,
  StorageMutationOperation,
  StorageMutationOperationDb,
} from "@/lib/storage/types";
export {
  CreditLedgerType,
  CreditLedgerTypeDb,
  CreditLedgerSource,
  CreditLedgerSourceDb,
  CreditReservationStatus,
  CreditReservationStatusDb,
  CreditScopeType,
  CreditScopeTypeDb,
} from "@/lib/credits";
export {
  TestimonialStatus,
  TestimonialStatusDb,
  TestimonialTemplateScope,
  TestimonialTemplateScopeDb,
  TestimonialTemplateAccessLevel,
  TestimonialTemplateAccessLevelDb,
  TestimonialRevisionReason,
  TestimonialRevisionReasonDb,
} from "@/types/testimonials";