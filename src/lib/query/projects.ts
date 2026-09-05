import type { ProjectPaymentStatus } from "@/lib/dto/projects";
import type { PaginationInput, PaginationParams } from "@/lib/query/pagination";
import type { SortOrder } from "@/lib/query/sorting";

export const PROJECT_SORT_FIELDS = [
  "updatedAt",
  "createdAt",
  "title",
  "clientName",
  "amountCents",
  "fileCount",
  "totalSizeBytes",
] as const;

export type ProjectSortField = (typeof PROJECT_SORT_FIELDS)[number];

export type ProjectPaymentFilter = ProjectPaymentStatus | "active";

export type ProjectListFilters = {
  hasDeliverables?: boolean;
  paymentStatus?: ProjectPaymentFilter;
  search?: string;
};

export type ProjectListQuery = PaginationInput &
  ProjectListFilters & {
    includeTotal?: boolean;
    order: SortOrder;
    sort: ProjectSortField;
  };

export type ProjectListRepositoryQuery = PaginationParams &
  ProjectListFilters & {
    includeTotal?: boolean;
    order: SortOrder;
    sort: ProjectSortField;
  };
