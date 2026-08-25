import type { PaginationMeta } from "./response";

export interface PaginationQuery {
  page?: string | number;
  limit?: string | number;
  sort?: string;
  order?: string;
}

export interface ParsedPagination {
  page: number;
  limit: number;
  offset: number;
  order: [string, "ASC" | "DESC"][] | undefined;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function parsePagination(
  query: PaginationQuery,
  allowedSortFields: readonly string[],
  defaultSortField = "createdAt"
): ParsedPagination {
  const page = Math.max(DEFAULT_PAGE, Number(query.page) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(query.limit) || DEFAULT_LIMIT)
  );
  const offset = (page - 1) * limit;

  const sortField = allowedSortFields.includes(String(query.sort))
    ? String(query.sort)
    : defaultSortField;
  const sortOrder =
    String(query.order).toUpperCase() === "ASC" ? "ASC" : "DESC";

  return { page, limit, offset, order: [[sortField, sortOrder]] };
}

export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
