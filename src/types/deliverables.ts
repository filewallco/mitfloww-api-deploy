import type { FileUploadStatus } from "@/lib/dto/file-contracts";
import type { FileDeleteBlockReason } from "@/lib/dto/files";

export type Deliverable = {
  activeVersionCount: number;
  createdAt: string;
  deleteBlockReason: FileDeleteBlockReason | null;
  deleteRequiresWarning: boolean;
  displayName: string;
  extension: string;
  hasRevisions: boolean;
  id: string;
  name: string;
  sizeLabel: string;
  sizeBytes: number;
  dateLabel: string;
  mimeType: string;
  uploadStatus: FileUploadStatus;
  unresolvedVersionReportCount: number;
  updatedAt: string;
  previewUrl: string;
  thumbnailUrl?: string | null;
};
