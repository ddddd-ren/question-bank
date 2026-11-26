import { posix } from "node:path"
import { DOMParser } from "@xmldom/xmldom"
import JSZip from "jszip"
import { ApiError } from "@/lib/api-error"

export const descendants = (node: Document | Element, name: string) =>
  Array.from(node.getElementsByTagNameNS("*", name))

export function child(node: Element | undefined, name: string) {
  for (let item = node?.firstChild; item; item = item.nextSibling) {
    if (item.nodeType === 1 && (item as Element).localName === name) return item as Element
  }
}

export function bookLink(source: string, href: string) {
  if (!href) return null
  try {
    const hash = href.indexOf("#")
    const path = decodeURIComponent((hash < 0 ? href : href.slice(0, hash)).split("?")[0])
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)|[\\\u0000]/iu.test(path)) return null
    const file = path ? posix.normalize(path.startsWith("/") ? path.slice(1) : posix.join(posix.dirname(source), path)) : source
    if (!file || file === ".." || file.startsWith("../")) return null
    return { file, fragment: hash < 0 ? "" : decodeURIComponent(href.slice(hash + 1)) }
  } catch { return null }
}

export async function openBookArchive(bytes: Buffer) {
  // JSZip 会在返回之前构造整个中央目录，因此先限制目录自身的大小和条目数。
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]))
  if (end < 0 || end + 22 > bytes.length) throw new ApiError(422, "文件不是完整的 EPUB 或 DOCX")
  const directorySize = bytes.readUInt32LE(end + 12)
  if (bytes.readUInt16LE(end + 10) > 8000 || directorySize > 2 * 1024 ** 2) {
    throw new ApiError(422, "教材内部文件过多，请拆分后导入")
  }
  if (bytes.readUInt32LE(end + 16) + directorySize !== end) throw new ApiError(422, "教材压缩包目录损坏")
  const zip = await JSZip.loadAsync(bytes)
  const files = Object.values(zip.files)
  if (files.length > 8000 || files.some(file => file.unsafeOriginalName && file.unsafeOriginalName !== file.name)) {
    throw new ApiError(422, "教材内部文件过多或路径无效")
  }
  let total = 0
  return {
    has: (name: string) => Boolean(zip.file(name)),
    async xml(name: string, html = false) {
      const file = zip.file(name)
      if (!file) throw new ApiError(422, "教材缺少正文或目录文件，请确认文件完整")
      const chunks: Buffer[] = []
      let size = 0
      const stream = file.nodeStream("nodebuffer")
      await new Promise<void>((resolve, reject) => {
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length
          total += chunk.length
          if (size > 16 * 1024 ** 2 || total > 64 * 1024 ** 2) {
            stream.pause()
            reject(new ApiError(422, "教材正文解压后过大，请拆分后导入"))
          } else chunks.push(chunk)
        }).on("error", reject).on("end", resolve)
      })
      const data = Buffer.concat(chunks, size)
      const signature = data.length >= 2 ? data.readUInt16BE(0) : 0
      const encoding = signature === 0xfeff || signature === 0x003c ? "utf-16be"
        : signature === 0xfffe || signature === 0x3c00 ? "utf-16le" : "utf-8"
      let source = new TextDecoder(encoding, { fatal: true }).decode(data)
      if (/<!ENTITY\b|<!DOCTYPE\b[^>]*\[/iu.test(source)) throw new ApiError(422, "教材包含不支持的 XML 实体声明")
      // 旧版 EPUB 通常声明 XHTML、NCX 的外部 DTD；解析正文时无需加载它。
      source = source.replace(/<!DOCTYPE\b[^<>]*>/giu, "")
      let depth = 0, tags = 0
      for (const match of source.matchAll(/<([^<>]+)>/gu)) {
        const tag = match[1]
        if (tag.startsWith("/")) depth--
        else if (!/^[!?]/u.test(tag) && !tag.endsWith("/")) depth++
        if (depth > 100 || ++tags > 450_000) throw new ApiError(422, "教材标记过于复杂，请拆分后导入")
      }
      const invalid = () => { throw new ApiError(422, "教材中的 XML 格式有误，请确认原文件可以正常打开") }
      return new DOMParser({ errorHandler: { warning: invalid, error: invalid, fatalError: invalid } })
        .parseFromString(source, html ? "text/html" : "application/xml")
    },
  }
}

export type BookArchive = Awaited<ReturnType<typeof openBookArchive>>
