export function shouldUseFullTextSearch(search: string): boolean {
  return search.trim().length >= 3
}

export function toFtsPhrase(search: string): string {
  const escaped = search.trim().replace(/"/g, '""')
  return `"${escaped}"`
}
