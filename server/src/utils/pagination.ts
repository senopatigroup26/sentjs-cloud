export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export function parsePagination(query: any): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function buildMeta(total: number, page: number, limit: number): PaginationMeta {
  return {
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
  };
}
