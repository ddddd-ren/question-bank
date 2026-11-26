import JSZip from "jszip"
import { DOMParser, XMLSerializer } from "@xmldom/xmldom"
import { posix } from "node:path"

export const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
export const elements = (node: Document | Element, name: string) =>
  Array.from(node.getElementsByTagNameNS(W, name))
export const val = (node: Element | undefined, name = "val") => node?.getAttributeNS(W, name) ?? ""

export async function openTemplate(bytes: Buffer) {
  if (!bytes.length || bytes.length > 20 * 1024 ** 2) throw Error("Word 模板须小于等于 20 MiB")
  const zip = await JSZip.loadAsync(bytes).catch(() => { throw Error("无法读取 DOCX，请选择未加密且未损坏的 Word 文档") })
  const files = Object.values(zip.files)
  if (files.length > 300) throw Error("Word 模板的内部文件过多")
  const docs = new Map<string, Document>()
  let total = 0
  for (const entry of files) {
    if (entry.dir) continue
    // 缩略图可能包含样卷旧答案；未绑定正文的自定义 XML 不参与排版。
    if (/^(?:customXml\/|docProps\/thumbnail\.)/i.test(entry.name)) {
      zip.remove(entry.name)
      continue
    }
    if ((entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name) ||
        !/^(?:\[Content_Types\]\.xml|_rels\/\.rels|docProps\/(?:app|core|custom)\.xml|word\/(?:document|styles(?:WithEffects)?|numbering|settings|webSettings|fontTable|footnotes|endnotes|header\d+|footer\d+)\.xml|word\/(?:_rels\/(?:document|header\d+|footer\d+)\.xml\.rels|theme\/theme\d+\.xml|media\/[\w.-]+\.(?:png|jpe?g|gif)))$/i.test(entry.name))
      throw Error("模板含暂不支持的附件、批注或其他部件，请另存为普通 DOCX")
    const xml = !entry.name.startsWith("word/media/")
    const chunks: Buffer[] = []
    let size = 0
    // 实际解压时计数，避免只相信 ZIP 中可伪造的原始大小。
    await new Promise<void>((resolve, reject) => {
      const stream = entry.nodeStream("nodebuffer")
      stream.on("data", (chunk: Buffer) => {
        total += chunk.length
        size += chunk.length
        if (total > 24 * 1024 ** 2 || (xml && size > 4 * 1024 ** 2)) {
          stream.pause()
          reject(Error("Word 模板解压后过大"))
        } else if (xml) chunks.push(chunk)
      }).on("error", reject).on("end", resolve)
    })
    if (!xml) continue
    const source = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw Error("模板不能包含 XML 实体声明")
    let depth = 0, nodes = 0
    for (const match of source.matchAll(/<([^<>]+)>/g)) {
      const tag = match[1]
      if (tag.startsWith("/")) depth--
      else if (!/^[!?]/.test(tag) && !tag.endsWith("/")) depth++
      if (depth > 100 || ++nodes > 120000) throw Error("模板 XML 结构过于复杂")
    }
    const invalid = () => { throw Error("模板中的 XML 格式错误") }
    const doc = new DOMParser({ errorHandler: { warning: invalid, error: invalid, fatalError: invalid } }).parseFromString(source, "application/xml")
    if (/^word\/(foot|end)notes\.xml$/.test(entry.name)) {
      const notes = elements(doc,entry.name.includes("foot") ? "footnote" : "endnote")
      if (notes.some(n => !["separator","continuationSeparator"].includes(val(n,"type"))) ||
          elements(doc,"t").some(t => t.textContent?.trim()))
        throw Error("模板含脚注或尾注正文，请先整理为普通段落")
    }
    if (entry.name.endsWith(".rels")) {
      for (const rel of Array.from(doc.getElementsByTagNameNS("*", "Relationship"))) {
        const target = rel.getAttribute("Target") || ""
        if (rel.getAttribute("TargetMode")?.toLowerCase() === "external" || /^(?:[a-z]+:|\/\/|\\)/i.test(target))
          throw Error("请先移除模板中的外部链接或外部资源")
        const resolved = posix.resolve("/",entry.name.split("_rels/")[0],target).slice(1)
        if (/^(?:customXml\/|docProps\/thumbnail\.)/i.test(resolved)) {
          rel.parentNode?.removeChild(rel)
          zip.file(entry.name,new XMLSerializer().serializeToString(doc))
        }
      }
    }
    if (entry.name === "[Content_Types].xml") {
      for (const override of Array.from(doc.getElementsByTagNameNS("*","Override"))) {
        if (/^\/(?:customXml\/|docProps\/thumbnail\.)/i.test(override.getAttribute("PartName") || "")) {
          override.parentNode?.removeChild(override)
          zip.file(entry.name,new XMLSerializer().serializeToString(doc))
        }
      }
    }
    if (/macroEnabled|vbaProject/i.test(source)) throw Error("不支持含宏的模板")
    if (/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(entry.name)) {
      const body = entry.name === "word/document.xml"
      for (const el of Array.from(doc.getElementsByTagName("*"))) {
        if (/^(?:altChunk|sdt|ins|del|moveFrom|moveTo|txbxContent|object|pict|AlternateContent|sectPrChange|pPrChange|rPrChange|customXml|subDoc|vanish|webHidden|commentRangeStart|footnoteReference|endnoteReference)$/.test(el.localName) ||
          (body && /^(?:instrText|fldSimple|fldChar)$/.test(el.localName)))
          throw Error("模板含修订、域、图片题或复杂控件，请先转成普通段落")
        if (!body && (el.localName === "instrText" || el.localName === "fldSimple") &&
          !/^\s*(?:PAGE|NUMPAGES|SECTIONPAGES)\s*(?:\\\*\s*(?:MERGEFORMAT|Arabic))?\s*$/i.test(el.localName === "fldSimple" ? val(el, "instr") : el.textContent || ""))
          throw Error("页眉页脚仅支持普通页码域")
      }
    }
    docs.set(entry.name, doc)
  }
  const doc = docs.get("word/document.xml")
  if (!doc || !docs.has("[Content_Types].xml") || !docs.has("_rels/.rels") || !elements(doc, "body")[0])
    throw Error("缺少 Word 主文档，请选择有效的 DOCX")
  const main = Array.from(docs.get("_rels/.rels")!.getElementsByTagNameNS("*","Relationship"))
    .filter(rel => rel.getAttribute("Type")?.endsWith("/officeDocument"))
  const overrides = Array.from(docs.get("[Content_Types].xml")!.getElementsByTagNameNS("*","Override"))
  if (main.length !== 1 || posix.resolve("/",main[0].getAttribute("Target") || "") !== "/word/document.xml" ||
      !overrides.some(e => e.getAttribute("PartName") === "/word/document.xml" && e.getAttribute("ContentType") === "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"))
    throw Error("模板没有指向标准 DOCX 的主文档，请另存为 Word 文档")
  return { zip, doc, docs }
}
