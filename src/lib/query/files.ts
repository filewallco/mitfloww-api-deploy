import type { UpdatableFileUploadStatus } from "@/lib/dto/file-contracts";
import type { PaginationInput, PaginationParams } from "@/lib/query/pagination";
import type { SortOrder } from "@/lib/query/sorting";

export const FILE_TYPES = [
  "image",
  "video",
  "document",
  "archive",
] as const;

export const FILE_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "name",
  "sizeBytes",
] as const;

export type FileTypeFilter = (typeof FILE_TYPES)[number];
export type FileSortField = (typeof FILE_SORT_FIELDS)[number];

export type FileListFilters = {
  fileType?: FileTypeFilter;
  projectId?: string;
  search?: string;
  uploadStatus?: UpdatableFileUploadStatus;
};

export type FileListQuery = PaginationInput &
  FileListFilters & {
    includeTotal?: boolean;
    order: SortOrder;
    sort: FileSortField;
  };

export type FileListRepositoryQuery = PaginationParams &
  FileListFilters & {
    includeTotal?: boolean;
    order: SortOrder;
    sort: FileSortField;
  };
