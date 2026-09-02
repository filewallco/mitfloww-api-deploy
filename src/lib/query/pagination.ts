export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type PaginationInput = {
  limit: number;
  page: number;
};

export type PaginationParams = PaginationInput & {
  offset: number;
};

export type PaginationMeta = PaginationInput & {
  total: number;
  totalPages: number;
};

export type PaginatedResult<T> = {
  items: T[];
  pagination: PaginationMeta | null;
};

export function buildPaginationParams(input: PaginationInput): PaginationParams {
  return {
    ...input,
    offset: (input.page - 1) * input.limit,
  };
}

export function buildPaginationMeta(
  input: PaginationInput & { total: number },
): PaginationMeta {
  return {
    limit: input.limit,
    page: input.page,
    total: input.total,
    totalPages: input.total === 0 ? 0 : Math.ceil(input.total / input.limit),
  };
}
