import type { TranslatedTextDTO } from "@/lib/dto/translated-text";

export const FILE_REVISION_NOTE_REPORT_STATUSES = [
  "reported",
  "under_review",
  "resolved",
  "dismissed",
] as const;

export type FileRevisionNoteReportStatus =
  (typeof FILE_REVISION_NOTE_REPORT_STATUSES)[number];

export const FileRevisionNoteReportStatus = {
  Reported: FILE_REVISION_NOTE_REPORT_STATUSES[0],
  UnderReview: FILE_REVISION_NOTE_REPORT_STATUSES[1],
  Resolved: FILE_REVISION_NOTE_REPORT_STATUSES[2],
  Dismissed: FILE_REVISION_NOTE_REPORT_STATUSES[3],
} as const satisfies Record<string, FileRevisionNoteReportStatus>;

export const FILE_REVISION_REPLY_EMAIL_STATUSES = [
  "not_configured",
  "queued",
  "sent",
  "failed",
] as const;

export type FileRevisionReplyEmailStatus =
  (typeof FILE_REVISION_REPLY_EMAIL_STATUSES)[number];

export const FileRevisionReplyEmailStatus = {
  Failed: FILE_REVISION_REPLY_EMAIL_STATUSES[3],
  NotConfigured: FILE_REVISION_REPLY_EMAIL_STATUSES[0],
  Queued: FILE_REVISION_REPLY_EMAIL_STATUSES[1],
  Sent: FILE_REVISION_REPLY_EMAIL_STATUSES[2],
} as const satisfies Record<string, FileRevisionReplyEmailStatus>;

export const FILE_REVISION_NOTE_STATUSES = ["pending", "resolved"] as const;

export type FileRevisionNoteStatus =
  (typeof FILE_REVISION_NOTE_STATUSES)[number];

export const FileRevisionNoteStatus = {
  Pending: FILE_REVISION_NOTE_STATUSES[0],
  Resolved: FILE_REVISION_NOTE_STATUSES[1],
} as const satisfies Record<string, FileRevisionNoteStatus>;

export type FileRevisionNoteMarkerDTO = {
  createdAt: string;
  height: number;
  id: string;
  labelNumber: number;
  pageNumber: number | null;
  updatedAt: string;
  width: number;
  x: number;
  y: number;
};

export type FileRevisionNoteItemDTO = {
  body: string;
  bodyText: TranslatedTextDTO;
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
  createdAt: string;
  id: string;
  labelNumber: number;
  markerId: string;
  updatedAt: string;
};

export type FileRevisionNoteReplyDTO = {
  body: string;
  bodyText: TranslatedTextDTO;
  createdAt: string;
  createdBy: string | null;
  id: string;
  latestReportStatus: FileRevisionNoteReportStatus | null;
  reportedByCurrentUser: boolean;
  updatedAt: string;
};

export type FileRevisionNoteDTO = {
  body: string;
  bodyText: TranslatedTextDTO;
  createdAt: string;
  createdBy: string | null;
  fileId: string;
  fileVersionId: string;
  id: string;
  markers: FileRevisionNoteMarkerDTO[];
  items: FileRevisionNoteItemDTO[];
  latestReportStatus: FileRevisionNoteReportStatus | null;
  projectId: string;
  reply: FileRevisionNoteReplyDTO | null;
  reportedByCurrentUser: boolean;
  status: FileRevisionNoteStatus;
  updatedAt: string;
};

export type FileRevisionNoteMutationResultDTO = {
  note: FileRevisionNoteDTO;
};

export type FileRevisionNoteReplyResultDTO = FileRevisionNoteMutationResultDTO & {
  emailStatus: FileRevisionReplyEmailStatus;
};