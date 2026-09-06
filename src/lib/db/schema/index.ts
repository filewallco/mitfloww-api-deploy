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

export const fw = pgSchema("mitfloww");

export const { projectClientReviews, projects } = createProjectTables(fw);
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
export const { users, companies } = createUserTables(fw);
export const { invoiceSettings } = createInvoiceTables(fw, { users });

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
  AppNotificationCategory,
  NewNotificationRecord,
  NotificationMetadata,
  NotificationRecord,
} from "./notifications";
export type {
  NewProjectClientReviewRecord,
  NewProjectRecord,
  ProjectClientReviewRecord,
  ProjectRecord,
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
} from "./users";
export type {
  InvoiceSettingsRecord,
  NewInvoiceSettingsRecord,
} from "./invoices";

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
  FileFinalDraftReportStatus,
  FileRevisionCommentStatus,
  FileRevisionCommentReportStatus,
  FileProcessingStatus,
  FileRevisionNoteReplyEmailStatus,
  FileVersionReportStatus,
  RevisionCommentMarkerType,
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
