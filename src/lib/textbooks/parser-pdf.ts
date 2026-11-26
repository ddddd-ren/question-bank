import { ApiError } from "@/lib/api-error"
import { withPdfDocument } from "@/lib/parser/pdf-document"
import type { PDFDocumentProxy as Pdf } from "pdfjs-dist"
import { headingLevel, MAX_TEXTBOOK_CHAPTERS, MAX_TEXTBOOK_CHARS, TextbookBody } from "./parser-common"

type Page = Awaited<ReturnType<Pdf["getPage"]>>

async function readBookmarks(pdf: Pdf, body: TextbookBody) {
  let visited = 0
  async function walk(nodes: Awaited<ReturnType<Pdf["getOutline"]>>, level: number) {
    for (const node of nodes) {
      if (++visited > MAX_TEXTBOOK_CHAPTERS || level > 100) throw new ApiError(422, "PDF 书签过多或层级过深，请拆分后导入")
      const destination = typeof node.dest === "string" ? await pdf.getDestination(node.dest).catch(() => null) : node.dest
      const ref = destination?.[0]
      const index = Number.isInteger(ref) ? Number(ref)
        : ref && typeof ref === "object" ? await pdf.getPageIndex(ref).catch(() => -1) : -1
      if (index >= 0 && index < pdf.numPages) body.addChapter(node.title, level, index + 1)
      if (node.items?.length) await walk(node.items, level + 1)
    }
  }
  const outline = await pdf.getOutline().catch(() => null)
  if (outline) await walk(outline, 1)
}

async function readPage(page: Page, remaining: number) {
  const reader = page.streamTextContent().getReader()
  const lines: { text: string; size: number }[] = []
  let parts: string[] = [], size = 0, characters = 0, items = 0
  function flush() {
    lines.push({ text: parts.join(""), size })
    parts = []
    size = 0
  }
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const chunk: Awaited<ReturnType<Page["getTextContent"]>> = value
      for (const item of chunk.items) {
        if (!("str" in item)) continue
        characters += item.str.length + Number(item.hasEOL)
        if (++items > 200_000 || characters > remaining) throw new ApiError(422, "PDF 正文过长，请拆分为分册后导入")
        parts.push(item.str)
        if (item.str.trim()) size = Math.max(size, item.height)
        if (item.hasEOL) flush()
      }
    }
    if (parts.length) flush()
    return lines
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
    page.cleanup()
  }
}

function pageHeadings(body: TextbookBody, lines: Awaited<ReturnType<typeof readPage>>, seen: Map<string, number>) {
  const printed = lines.map(line => ({ ...line, text: line.text.trim() })).filter(line => line.text)
  if (printed.slice(0, 6).some(line => /^(?:目\s*[录錄]|(?:table of )?contents)$/iu.test(line.text))) return
  const weights = new Map<number, number>()
  for (const line of printed) {
    const size = Math.round(line.size)
    weights.set(size, (weights.get(size) || 0) + line.text.length)
  }
  const normalSize = Array.from(weights).sort((a, b) => b[1] - a[1])[0]?.[0] || 0
  for (const [index, line] of printed.entries()) {
    const largerTitle = index < 4 && normalSize > 0 && line.size >= normalSize * 1.4 &&
      line.text.length <= 80 && /\p{L}/u.test(line.text) && !/[。！？；;.]$/u.test(line.text)
    const level = headingLevel(line.text) || (largerTitle ? 1 : 0)
    if (!level) continue
    const page = body.segments.length
    const previous = seen.get(line.text)
    seen.set(line.text, page)
    if (previous === undefined || page - previous > 2) body.addChapter(line.text, level, page)
  }
}

export async function parsePdf(bytes: Buffer, body: TextbookBody) {
  if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new ApiError(422, "文件缺少 PDF 标识，请确认文件格式")
  await withPdfDocument(bytes, async pdf => {
    if (pdf.numPages > 4000) throw new ApiError(422, "单册 PDF 最多支持 4000 页，请拆分后导入")
    await readBookmarks(pdf, body)
    const bookmarks = body.chapters.length > 0
    const seen = new Map<string, number>()
    let empty = 0
    for (let p = 1; p <= pdf.numPages; p++) {
      const lines = await readPage(await pdf.getPage(p), MAX_TEXTBOOK_CHARS - body.characters)
      const text = lines.map(line => line.text).join("\n").trim()
      body.addSegment(text)
      if (!text) empty++
      else if (!bookmarks) pageHeadings(body, lines, seen)
    }
    if (empty === pdf.numPages) body.warnings.push("此 PDF 没有提取到文字，可能是图片页或字体缺少字符映射。已保留实际页码，可对照原件手工划分章节。")
    else if (empty) body.warnings.push(`PDF 有 ${empty} 页没有可读取的文字，已保留原页码。`)
  })
}
