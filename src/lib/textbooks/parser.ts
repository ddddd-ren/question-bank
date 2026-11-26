import { extname } from "node:path"
import { ApiError } from "@/lib/api-error"
import { openBookArchive } from "./parser-archive"
import { MAX_TEXTBOOK_BYTES, TextbookBody } from "./parser-common"
import { parseDocx } from "./parser-docx"
import { parseEpub } from "./parser-epub"
import { parsePdf } from "./parser-pdf"

export async function parseTextbook(filename: string, bytes: Buffer) {
  if (!bytes.length) throw new ApiError(400, "教材文件为空")
  if (bytes.length > MAX_TEXTBOOK_BYTES) throw new ApiError(413, "教材文件不能超过 64 MiB")
  const format = extname(filename).slice(1).toLowerCase()
  if (format !== "pdf" && format !== "epub" && format !== "docx") throw new ApiError(415, "教材仅支持 PDF、EPUB 和 DOCX")
  const body = new TextbookBody(format)
  try {
    if (format === "pdf") await parsePdf(bytes, body)
    else {
      const archive = await openBookArchive(bytes)
      if (format === "epub") await parseEpub(archive, body)
      else await parseDocx(archive, body)
    }
    return body.finish()
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof Error && error.name === "PasswordException") throw new ApiError(422, "此 PDF 需要密码，请上传可直接打开的教材")
    throw new ApiError(422, "无法读取教材，请确认文件格式正确、未加密且可以正常打开")
  }
}
