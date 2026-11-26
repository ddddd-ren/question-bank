import { posix } from "node:path"
import { ApiError } from "@/lib/api-error"
import { bookLink, child, descendants, type BookArchive } from "./parser-archive"
import { headingLevel, TextbookBody } from "./parser-common"

const wordValue = (element: Element | undefined, key = "val") =>
  element?.getAttributeNS(element.namespaceURI, key) || ""

function outline(properties: Element | undefined) {
  const raw = wordValue(child(properties, "outlineLvl"))
  if (!/^[0-9]$/u.test(raw)) return undefined
  return raw === "9" ? 0 : Math.min(6, Number(raw) + 1)
}

function namedLevel(name: string) {
  const match = /^(?:heading|标题|標題)[\s_-]*([1-9])$/iu.exec(name)
  return match ? Math.min(6, Number(match[1])) : undefined
}

function paragraphStyles(styles?: Document) {
  const definitions = new Map<string, { level: number | undefined; parent: string }>()
  const memo = new Map<string, number | undefined>()
  if (styles) for (const style of descendants(styles, "style")) {
    const type = wordValue(style, "type")
    if (type && type !== "paragraph") continue
    const id = wordValue(style, "styleId")
    const level = outline(child(style, "pPr")) ?? namedLevel(wordValue(child(style, "name"))) ?? namedLevel(id)
    definitions.set(id, { level, parent: wordValue(child(style, "basedOn")) })
  }
  return (id: string) => {
    if (memo.has(id)) return memo.get(id)
    let current = id, level: number | undefined
    const seen = new Set<string>()
    while (current && !seen.has(current) && seen.size < 100) {
      seen.add(current)
      const definition = definitions.get(current)
      level = definition?.level ?? namedLevel(current)
      if (level !== undefined) break
      current = definition?.parent || ""
    }
    memo.set(id, level)
    return level
  }
}

export async function parseDocx(archive: BookArchive, body: TextbookBody) {
  const rootRels = await archive.xml("_rels/.rels")
  const main = descendants(rootRels, "Relationship").find(rel =>
    rel.getAttribute("Type")?.endsWith("/officeDocument") && rel.getAttribute("TargetMode") !== "External")
  const file = bookLink("", main?.getAttribute("Target") || "")?.file
  const types = await archive.xml("[Content_Types].xml")
  if (!file || !descendants(types, "Override").some(part =>
    part.getAttribute("PartName") === "/" + file && part.getAttribute("ContentType") === "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml")) {
    throw new ApiError(422, "文件中没有标准的 Word 教材正文")
  }
  const doc = await archive.xml(file)
  const root = doc.documentElement
  const word = root.namespaceURI
  const documentBody = child(root, "body")
  if (root.localName !== "document" || !word?.endsWith("/wordprocessingml/2006/main") && !word?.endsWith("/wordprocessingml/main") || !documentBody) {
    throw new ApiError(422, "Word 教材缺少正文")
  }
  const directory = posix.dirname(file)
  const relPath = posix.join(directory, "_rels", posix.basename(file) + ".rels")
  let stylesPath = posix.join(directory, "styles.xml")
  if (archive.has(relPath)) {
    const rels = await archive.xml(relPath)
    const style = descendants(rels, "Relationship").find(rel =>
      rel.getAttribute("Type")?.endsWith("/styles") && rel.getAttribute("TargetMode") !== "External")
    stylesPath = bookLink(file, style?.getAttribute("Target") || "")?.file || stylesPath
  }
  const styleLevel = paragraphStyles(archive.has(stylesPath) ? await archive.xml(stylesPath) : undefined)

  function visit(element: Element, parts?: string[]) {
    if (element.namespaceURI === word) {
      if (["del", "moveFrom", "drawing", "pict", "object", "instrText"].includes(element.localName)) return
      if (element.localName === "p") {
        const textParts: string[] = []
        visitChildren(element, textParts)
        const text = textParts.join("").trim()
        if (!text) return
        body.addSegment(text)
        const properties = child(element, "pPr")
        const level = outline(properties) ?? styleLevel(wordValue(child(properties, "pStyle"))) ?? headingLevel(text)
        if (level) body.addChapter(text, level, body.segments.length)
        return
      }
      if (element.localName === "t") { parts?.push(element.textContent || ""); return }
      if (element.localName === "tab") { parts?.push("\t"); return }
      if (element.localName === "br" || element.localName === "cr") { parts?.push("\n"); return }
    }
    visitChildren(element, parts)
  }
  function visitChildren(parent: Element, parts?: string[]) {
    for (let node = parent.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 1) visit(node as Element, parts)
    }
  }
  visit(documentBody)
}
