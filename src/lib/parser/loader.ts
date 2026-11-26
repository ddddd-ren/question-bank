import { ApiError } from "@/lib/api-error"

export type ParserKind = "json" | "csv" | "word" | "pdf" | "powerpoint"

export function getParserKind(fileName: string): ParserKind {
  const normalized = fileName.toLowerCase()
  if (normalized.endsWith(".json")) return "json"
  if (normalized.endsWith(".csv")) return "csv"
  if (normalized.endsWith(".docx")) return "word"
  if (normalized.endsWith(".pdf")) return "pdf"
  if (normalized.endsWith(".ppt") || normalized.endsWith(".pptx") || normalized.endsWith(".pptm")) {
    return "powerpoint"
  }
  throw new ApiError(400, "不支持的文件格式")
}
