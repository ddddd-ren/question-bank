import { ApiError } from "@/lib/api-error"
import type { TextbookFormat, TextbookImportData } from "./types"

export const MAX_TEXTBOOK_BYTES = 64 * 1024 ** 2
export const MAX_TEXTBOOK_CHARS = 8_000_000
export const MAX_TEXTBOOK_CHAPTERS = 3000

export function headingLevel(text: string) {
  if (text.length > 100 || /(?:[.．·…]{2,}\s*\d+$|[。！？；;]$)/u.test(text)) return 0
  const chinese = /^第\s*[〇零一二两三四五六七八九十百千万\d０-９]+\s*(单元|單元|[编編篇卷部章节節讲講])/u.exec(text)
  if (chinese) return /[节節]/u.test(chinese[1]) ? 2 : 1
  if (/^(?:chapter|part|unit|section)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/iu.test(text)) {
    return /^section/i.test(text) ? 2 : 1
  }
  const decimal = /^(\d+(?:[.．]\d+){1,4})\s+\S/u.exec(text)
  return decimal ? decimal[1].split(/[.．]/u).length : 0
}

export class TextbookBody {
  readonly segments: string[] = []
  readonly chapters: TextbookImportData["chapters"] = []
  readonly warnings: string[] = []
  characters = 0

  constructor(readonly format: TextbookFormat) {}

  addSegment(text: string) {
    this.characters += text.length
    if (this.characters > MAX_TEXTBOOK_CHARS || this.segments.length >= 80_000) {
      throw new ApiError(422, "教材正文过长，请拆分为分册后导入")
    }
    this.segments.push(text)
  }

  addChapter(title: string, level: number, start: number) {
    const normalized = title.replace(/\s+/gu, " ").trim()
    const label = normalized.slice(0, 200)
    if (!label) return
    if (label.length < normalized.length && !this.warnings.includes("过长的目录标题已截至 200 字，正文保留完整。")) {
      this.warnings.push("过长的目录标题已截至 200 字，正文保留完整。")
    }
    if (this.chapters.length >= MAX_TEXTBOOK_CHAPTERS) throw new ApiError(422, "教材目录超过 3000 项，请拆分后导入")
    this.chapters.push({ title: label, level: Math.min(6, Math.max(1, level)), start })
  }

  finish(): TextbookImportData {
    if (!this.segments.length) throw new ApiError(422, "教材没有可读取的正文段落，请选择含文字的教材")
    if (!this.chapters.length) {
      this.addChapter("正文", 1, 1)
      this.warnings.push("未识别到章节标题，已建立“正文”，可按原书校正目录。")
    } else if (this.chapters.every(chapter => chapter.start > 1)) {
      this.addChapter("卷首", 1, 1)
    }
    this.chapters.sort((a, b) => a.start - b.start)
    return { format: this.format, segments: this.segments, chapters: this.chapters, warnings: this.warnings }
  }
}
