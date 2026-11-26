export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024
export const MAX_IMPORT_QUESTIONS = 10_000
export const MAX_IMPORT_TEXT_LENGTH = 20_000

export function isImportFileSizeAllowed(size: number): boolean {
  return Number.isFinite(size) && size >= 0 && size <= MAX_IMPORT_FILE_BYTES
}
