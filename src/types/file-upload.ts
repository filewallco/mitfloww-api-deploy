import type {
  UploadClientSession,
  WatermarkCreditInputDTO,
} from "@/lib/dto/file-upload-sessions";

export const UploadLifecycleStatus = {
  Queued: "queued",
  Uploading: "uploading",
  Canceling: "canceling",
  Ready: "ready",
  Failed: "failed",
  Canceled: "canceled",
} as const;

export type UploadLifecycleStatus =
(typeof UploadLifecycleStatus)[keyof typeof UploadLifecycleStatus];

export type UploadFile = {
  errorMessage?: string | null;
  id: string;
  file: File;
  name: string;
  watermarkCreditInput?: WatermarkCreditInputDTO | null;
  watermarkEnabled: boolean;
  size: number;
  progress: number;
  status: UploadLifecycleStatus;
  uploadSession?: UploadClientSession | null;
};

export type UploadBatchSummary = {
  canceledCount: number;
  failedCount: number;
  queuedCount: number;
  readyCount: number;
  totalCount: number;
  uploadingCount: number;
};

export type UploadSubmission = {
  allowLargeUploads: boolean;
  useSoftWatermark?: boolean;
  files: UploadFile[];
  isFinalDraft: boolean;
  revisionDescription?: string | null;
};

export default UploadFile;