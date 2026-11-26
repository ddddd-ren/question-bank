export interface PaginatedQuery {
  page: number
  pageSize: number
  type?: string
  search?: string
}

export function createPaginatedKey(basePath: string, query: PaginatedQuery): string {
  const params = new URLSearchParams()
  params.set("page", String(query.page))
  params.set("pageSize", String(query.pageSize))
  if (query.type && query.type !== "all") params.set("type", query.type)
  const search = query.search?.trim()
  if (search) params.set("search", search)
  return `${basePath}?${params.toString()}`
}
