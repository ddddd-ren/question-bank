import { ApiError } from "@/lib/api-error"
import { bookLink, child, descendants, type BookArchive } from "./parser-archive"
import { headingLevel, MAX_TEXTBOOK_CHAPTERS, TextbookBody } from "./parser-common"
import type { TextbookHeading } from "./types"

type TocLink = { file: string; fragment: string; title: string; level: number }

function readToc(doc: Document, path: string, ncx: boolean) {
  const links: TocLink[] = []
  const toc = ncx ? descendants(doc, "navMap")[0] : descendants(doc, "nav").find(el =>
    (el.getAttributeNS("http://www.idpf.org/2007/ops", "type") || el.getAttribute("epub:type") || "").split(/\s+/u).includes("toc")
    || el.getAttribute("role") === "doc-toc")
  if (!toc) return links
  for (const item of descendants(toc, ncx ? "navPoint" : "li")) {
    const label = ncx ? child(item, "navLabel") : child(item, "a") || child(item, "span")
    // EPUB 允许只有文字的分组标题，其起点取第一个子项的目标。
    const anchor = ncx ? child(item, "content") : label?.localName === "a" ? label : descendants(item, "a")[0]
    const target = bookLink(path, anchor?.getAttribute(ncx ? "src" : "href") || "")
    if (!target || !label?.textContent?.trim()) continue
    let depth = ncx ? 1 : 0
    for (let parent = item.parentNode; parent && parent !== toc; parent = parent.parentNode) {
      if ((parent as Element).localName === (ncx ? "navPoint" : "ol")) depth++
    }
    links.push({ ...target, title: label.textContent.trim(), level: Math.max(1, depth) })
    if (links.length > MAX_TEXTBOOK_CHAPTERS) throw new ApiError(422, "教材目录超过 3000 项，请拆分后导入")
  }
  return links
}

const blocks = new Set("body section article aside div p li ul ol blockquote pre figure figcaption hgroup h1 h2 h3 h4 h5 h6 table tr td th dl dt dd address text".split(" "))
const ignored = new Set("script style head nav title defs desc iframe object audio video template rt rp".split(" "))

function readContent(root: Element, body: TextbookBody, targets: TocLink[]) {
  const wanted = new Set(targets.map(link => link.fragment))
  const anchors = new Map<string, number>()
  const headings: TextbookHeading[] = []
  let parts: string[] = []
  let currentHeading = 0
  function flush() {
    const text = parts.join("").trim()
    parts = []
    if (!text) return
    body.addSegment(text)
    const level = currentHeading || headingLevel(text)
    if (level) headings.push({ title: text, start: body.segments.length, level })
    if (headings.length > MAX_TEXTBOOK_CHAPTERS) throw new ApiError(422, "教材标题过多，请拆分后导入")
  }
  function walk(el: Element, preformatted: boolean) {
    const tag = el.localName.toLowerCase()
    if (ignored.has(tag) || el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return
    const block = blocks.has(tag)
    if (block) flush()
    const id = el.getAttribute("id") || el.getAttribute("xml:id") || el.getAttribute("name")
    if (id && wanted.has(id) && !anchors.has(id)) anchors.set(id, body.segments.length + 1)
    const previous = currentHeading
    if (/^h[1-6]$/u.test(tag)) currentHeading = Number(tag[1])
    if (tag === "br") parts.push("\n")
    if (tag === "img") parts.push(el.getAttribute("alt") || "")
    const pre = preformatted || tag === "pre"
    for (let node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 1) walk(node as Element, pre)
      if (node.nodeType === 3 || node.nodeType === 4) {
        const value = node.nodeValue || ""
        parts.push(pre ? value : value.replace(/\s+/gu, " "))
      }
    }
    if (block) flush()
    currentHeading = previous
  }
  walk(root, false)
  flush()
  return { anchors, headings }
}

async function checkEncryption(archive: BookArchive) {
  if (!archive.has("META-INF/encryption.xml")) return
  const metadata = await archive.xml("META-INF/encryption.xml")
  for (const encrypted of descendants(metadata, "EncryptedData")) {
    const method = descendants(encrypted, "EncryptionMethod")[0]?.getAttribute("Algorithm")
    const uri = descendants(encrypted, "CipherReference")[0]?.getAttribute("URI") || ""
    const font = /\.(?:ttf|otf|ttc|woff2?)$/iu.test(bookLink("", uri)?.file || "")
    if (!font || !["http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC"].includes(method || "")) {
      throw new ApiError(422, "此 EPUB 含加密内容，请上传无 DRM 的教材")
    }
  }
}

export async function parseEpub(archive: BookArchive, body: TextbookBody) {
  await checkEncryption(archive)
  const container = await archive.xml("META-INF/container.xml")
  const roots = descendants(container, "rootfile")
  const root = roots.find(el => el.getAttribute("media-type") === "application/oebps-package+xml") || roots[0]
  const rootPath = root?.getAttribute("full-path") || ""
  const opf = archive.has(rootPath) ? rootPath : bookLink("", rootPath)?.file
  if (!opf) throw new ApiError(422, "EPUB 缺少有效的书籍包")
  const packageDoc = await archive.xml(opf)
  const manifest = child(packageDoc.documentElement, "manifest")
  const spine = child(packageDoc.documentElement, "spine")
  if (!manifest || !spine) throw new ApiError(422, "EPUB 缺少正文阅读顺序")
  const items = new Map(descendants(manifest, "item").map(item => [item.getAttribute("id"), item]))
  const nav = Array.from(items.values()).find(item => item.getAttribute("properties")?.split(/\s+/u).includes("nav"))
  const ncx = items.get(spine.getAttribute("toc")) || Array.from(items.values()).find(item => item.getAttribute("media-type") === "application/x-dtbncx+xml")
  let toc: TocLink[] = []
  for (const item of [nav, ncx]) {
    const file = bookLink(opf, item?.getAttribute("href") || "")?.file
    if (!file || !archive.has(file)) continue
    toc = readToc(await archive.xml(file, item === nav), file, item === ncx)
    if (toc.length) break
  }
  const links = new Map<string, TocLink[]>()
  for (const link of toc) {
    const group = links.get(link.file) || []
    group.push(link)
    links.set(link.file, group)
  }
  let spineNumber = 0, mapped = 0, skipped = 0
  const visited = new Set<string>()
  const order = descendants(spine, "itemref")
  if (order.length > 8000) throw new ApiError(422, "EPUB 阅读顺序过长，请拆分后导入")
  for (const ref of order) {
    let item = items.get(ref.getAttribute("idref"))
    const fallbacks = new Set<Element>()
    while (item && !/^(?:application\/xhtml\+xml|text\/html|image\/svg\+xml)$/iu.test(item.getAttribute("media-type") || "")) {
      if (fallbacks.has(item) || fallbacks.size >= 32) { item = undefined; break }
      fallbacks.add(item)
      item = items.get(item.getAttribute("fallback"))
    }
    const path = bookLink(opf, item?.getAttribute("href") || "")?.file
    if (!path) { skipped++; continue }
    if (visited.has(path)) continue
    visited.add(path)
    const svg = item?.getAttribute("media-type") === "image/svg+xml"
    const doc = await archive.xml(path, !svg)
    const content = svg ? doc.documentElement : descendants(doc, "body")[0]
    if (!content) { skipped++; continue }
    const start = body.segments.length + 1
    const targets = links.get(path) || []
    const { anchors, headings } = readContent(content, body, targets)
    if (body.segments.length < start) continue
    spineNumber++
    const indexed = new Set<number>()
    for (const link of targets) {
      const at = link.fragment ? anchors.get(link.fragment) : start
      if (at === undefined || at > body.segments.length) continue
      body.addChapter(link.title, link.level, at)
      indexed.add(at)
      mapped++
    }
    for (const h of headings) if (!indexed.has(h.start)) body.addChapter(h.title, h.level, h.start)
    if (!toc.length && !headings.length) {
      body.addChapter(descendants(doc, "title")[0]?.textContent?.trim() || `第 ${spineNumber} 部分`, 1, start)
    }
  }
  if (!toc.length) body.warnings.push("EPUB 未提供可用目录，已按正文标题和阅读顺序划分，可手工校正。")
  else if (mapped < toc.length) body.warnings.push("部分 EPUB 目录目标没有对应正文段落，可按原书校正。")
  if (skipped) body.warnings.push(`阅读顺序中有 ${skipped} 个非文字或不支持的部件，已跳过。`)
}
