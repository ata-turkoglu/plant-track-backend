export function parsePaginationQuery(query, { defaultPage = 1, defaultPageSize = 25, maxPageSize = 100 } = {}) {
  const rawPage = Number(query.page);
  const rawPageSize = Number(query.pageSize ?? query.page_size);

  const enabled = query.page !== undefined || query.pageSize !== undefined || query.page_size !== undefined;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : defaultPage;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0
    ? Math.min(maxPageSize, Math.floor(rawPageSize))
    : defaultPageSize;

  return {
    enabled,
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

export function buildPaginationMeta(totalCount, page, pageSize) {
  const safeTotalCount = Math.max(0, Number(totalCount) || 0);
  const totalPages = safeTotalCount === 0 ? 0 : Math.ceil(safeTotalCount / pageSize);

  return {
    page,
    pageSize,
    totalCount: safeTotalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1 && totalPages > 0
  };
}
