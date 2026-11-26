import { XMLSerializer } from "@xmldom/xmldom"
import type { SerializedQuestion } from "../db/serialize"
import type { QuestionType } from "../types"
import type { TemplateSection, TemplateSlot } from "./template"
import { MAX_TEMPLATE_SLOTS } from "./template"
import { formatTemplateHeading } from "./template-docx-heading"
import { W, elements, openTemplate, val } from "./template-docx-package"

const types: Record<string, QuestionType> = {
  单项选择题: "single", 单选题: "single", 选择题: "single", 多项选择题: "multiple", 多选题: "multiple",
  不定项选择题: "multiple", 判断题: "truefalse", 填空题: "fill", 计算题: "calculation",
  名词解释: "essay", 名词解释题: "essay", 简答题: "essay", 问答题: "essay", 论述题: "essay", 分析题: "essay",
  编程题: "code", 程序设计题: "code",
}
const names = Object.keys(types).sort((a,b) => b.length-a.length).join("|")
const heading = new RegExp("^(?:(?:第?[一二三四五六七八九十百]+(?:大题)?|第\\d+大题)[、.．：:\\s]*|\\d+\\s*[.、．]\\s*)?(" + names + ")(?=$|[（(\\s：:，,、])")
const slotLabel = new RegExp("^\\s*(?:[【（(\\[](" + names + ")[】）)\\]]|(" + names + ")[：:])")
const questionNumber = /^\s*(?:[（(](\d{1,4})[）)]|(\d{1,4})\s*[.．、)）](?!\d)|第\s*(\d{1,4})\s*题[：:]?)\s*/
const score = /[（(【\[]\s*(?:本题\s*)?(\d+(?:\.\d+)?)\s*分\s*[）)】\]]/
const eachScore = /每(?:小)?题\s*(\d+(?:\.\d+)?)\s*分/
const scorePhrase = /(?:共\s*\d+\s*(?:小)?题|(?:每(?:小)?题|共|合计|总计|满分)\s*\d+(?:\.\d+)?\s*分)/.source
const scoreNote = new RegExp("^(?:(?:本大题|本部分|本节|本题)\\s*)?" + scorePhrase + "(?:[，,、；;。\\s]*" + scorePhrase + ")*[。.]?$")
const option = /^\s*[A-HＡ-Ｈ]\s*[.．、:：)）]\s*/i
const answerLine = /^(?:[【\[]?(?:参考答案|标准答案|正确答案|答案解析|答案|解析|解答|答)[】\]]?\s*[：:]|【(?:答案|解析)】)/
const answerHeading = /^(?:附[：:]?\s*)?[【（(\[]?(?:试[卷题]|样卷)?(?:参考答案|标准答案|答案)(?:[及和与、](?:答案)?(?:解析|评分标准))?[】）)\]]?\s*[：:]?\s*$/
const blank = /^(?:答\s*[：:]\s*)?[\s_＿—─]*$/
const isDocumentTitle = /(?:试卷|试题|考试卷|样卷|测试卷|练习卷)/
const totalClaim = /((?:满分|总分|全卷共|本卷共)\s*[：:]?\s*)\d+(?:\.\d+)?(\s*分)/g
const paraText = (p: Element) => elements(p,"t").map(t => t.textContent || "").join("").trim()
const displayedText = (p: Element) => Array.from(p.getElementsByTagNameNS(W,"*"))
  .map(e => e.localName === "t" ? e.textContent : e.localName === "tab" ? "\t" : e.localName === "br" ? "\n" : "").join("")
const optionMarkers = /[A-HＡ-Ｈ][.．、:：)）]\s*/gi
const rowShape = (p: Element) => {
  const text = displayedText(p)
  const markers = Array.from(text.matchAll(optionMarkers))
  const gap = markers.length > 1 ? text.slice(0,markers[1].index).match(/\s+$/)?.[0] : undefined
  return {width:Math.max(markers.length,1),gap:gap || "    "}
}
const at = (e: Element, name: string) => elements(e,name)[0]
const parent = (e: Element) => e.parentNode as Element

interface Position {
  spec: TemplateSlot
  stem: Element
  options: Element[]
  blanks: Element[]
  answers: Element[]
  inlineOptions: boolean
  prefix: string
}
interface Block { spec: TemplateSection; heading: Element; positions: Position[]; notes: Element[]; each?: string }

// 常见 Word 小题使用单层十进制列表；其他计数样式不能可靠映射到可编辑题号。
function automaticNumbers(numbering?: Document, styles?: Document) {
  const counts = new Map<string, number>()
  const styleById = new Map(styles && elements(styles,"style").map(s => [val(s,"styleId"),s]))
  const numById = new Map(numbering && elements(numbering,"num").map(n => [val(n,"numId"),n]))
  const abstractById = new Map(numbering && elements(numbering,"abstractNum").map(n => [val(n,"abstractNumId"),n]))
  return (p: Element) => {
    let props = at(p, "numPr")
    let styleId = val(at(p,"pStyle"))
    const visited = new Set<string>()
    while (!props && styleId && styles && !visited.has(styleId)) {
      visited.add(styleId)
      const style = styleById.get(styleId)
      if (!style) break
      props = at(style,"numPr")
      styleId = val(at(style,"basedOn"))
    }
    if (!props) return null
    const id = val(at(props,"numId"))
    if (id === "0") return null
    const level = val(at(props,"ilvl")) || "0"
    const num = numById.get(id)
    const abstract = num && abstractById.get(val(at(num,"abstractNumId")))
    const lvl = abstract && elements(abstract,"lvl").find(e => val(e,"ilvl") === level)
    const override = num && elements(num,"lvlOverride").find(e => val(e,"ilvl") === level)
    if (!lvl || level !== "0" || val(at(lvl,"numFmt")) !== "decimal" || (override && at(override,"lvl")))
      throw Error("仅支持一级十进制小题自动编号，请将复杂编号转换为文字")
    const current = counts.get(id) ?? Number((override && val(at(override,"startOverride"))) || val(at(lvl,"start")) || "1")
    const format = val(at(lvl,"lvlText"))
    if (!Number.isInteger(current) || !/^[（(]?%1[、.．)）:]?$/.test(format)) throw Error("请将自定义自动编号转换为文字")
    counts.set(id,current + 1)
    return { number: String(current), prefix: format.replace("%1",String(current)) + " " }
  }
}

async function inspect(bytes: Buffer) {
  const { zip, doc, docs } = await openTemplate(bytes)
  const body = at(doc.documentElement,"body")
  const blocks: Block[] = []
  const appendix: Element[] = []
  const cover: Element[] = []
  const warnings = new Set<string>()
  for (const [name, part] of docs) {
    if (/^word\/(?:header|footer)\d+\.xml$/.test(name) && elements(part,"p").some(p => /参考答案|标准答案|答案[：:]|解析[：:]/.test(paraText(p)) || answerHeading.test(paraText(p)) || answerLine.test(paraText(p)))) {
      throw Error("页眉或页脚含答案文字，请移入正文参考答案区")
    }
  }
  let title: Element | undefined, position: Position | undefined, block: Block | undefined, inAnswers = false
  let count = 0
  const autoNumber = automaticNumbers(docs.get("word/numbering.xml"), docs.get("word/styles.xml"))
  for (const p of elements(body,"p")) {
    const text = paraText(p)
    if (inAnswers || answerHeading.test(text)) {
      inAnswers = true
      if (parent(p) !== body || at(p,"sectPr") || at(p,"drawing")) throw Error("请将卷末参考答案放在正文的普通段落中")
      appendix.push(p)
      continue
    }
    const h = text.match(heading)
    const style = val(at(p,"pStyle"))
    const customHeading = text && !/说明|须知|注意事项|答题要求/.test(text) &&
      (/^(?:第?[一二三四五六七八九十百]+[、．.]|第[一二三四五六七八九十百\d]+大题)/.test(text) ||
      (/^(?:Heading|标题)\s*[1-6]$/i.test(style) && !isDocumentTitle.test(text) && !questionNumber.test(text)))
    if (h || customHeading) {
      const name = h?.[1] || ""
      const spec: TemplateSection = { title: text, type: types[name] || "essay", slots: [] }
      if (!name) warnings.add("“" + text.slice(0,50) + "”的题型待确认，已暂列为论述题，请校正后保存。")
      if (name.startsWith("名词解释") || name === "简答题") spec.tag = name.startsWith("名词解释") ? "名词解释" : name
      block = { spec, heading:p, positions:[], notes:[], each:text.match(eachScore)?.[1] }
      blocks.push(block)
      position = undefined
      continue
    }
    if (!block) {
      if (answerLine.test(text))
        throw Error("首个可识别大题前存在未归类的题目或答案，请校正大题标题")
      cover.push(p)
      if (!title && !at(p,"drawing") && (style === "Title" || isDocumentTitle.test(text) && !/满分|总分|考试时间|说明/.test(text)) && parent(p) === body) title = p
      continue
    }
    if (at(p,"drawing")) throw Error("题区含图片，无法可靠替换图片题或旧答案，请先移到卷首或页眉")
    if (!block.positions.length && scoreNote.test(text)) {
      block.notes.push(p)
      const each = text.match(eachScore)?.[1]
      if (each && block.each && Number(each) !== Number(block.each)) throw Error("大题的每题分值说明相互冲突，请先统一")
      block.each = each || block.each
      continue
    }
    if (/^(?:第?[一二三四五六七八九十]+[、．.]|第\d+大题)/.test(text)) throw Error("存在无法识别的大题标题：" + text.slice(0,40))
    const explicit = text.match(questionNumber)
    const automatic = autoNumber(p)
    if ((explicit || automatic) && !(position && answerLine.test(text))) {
      if (explicit && automatic) throw Error("题位同时使用两种编号，请统一后导入")
      if (++count > MAX_TEMPLATE_SLOTS) throw Error("每份模板最多支持 " + MAX_TEMPLATE_SLOTS + " 道题")
      const number = explicit ? explicit[1] || explicit[2] || explicit[3] : automatic!.number
      const points = text.match(score)?.[1] || block.each
      const spec: TemplateSlot = { number, points: points ? Number(points) : null }
      const label = text.slice(explicit?.[0].length || 0).replace(score,"").match(slotLabel)
      if (label && types[label[1] || label[2]] !== block.spec.type) spec.type = types[label[1] || label[2]]
      position = { spec, stem:p, options:[], answers:[], blanks:[], inlineOptions:/[AＡ][.．、)）][\s\S]*[BＢ][.．、)）]/.test(displayedText(p)), prefix:explicit?.[0] || automatic!.prefix }
      block.spec.slots.push(spec)
      block.positions.push(position)
    } else if (position && blank.test(text)) {
      if (parent(p) === parent(position.stem) && !at(p,"sectPr")) position.blanks.push(p)
    } else if (position && (option.test(text) || answerLine.test(text))) {
      if (parent(p) !== parent(position.stem)) throw Error("同一小题的选项和答案须与题干位于同一表格单元格或正文内")
      if (option.test(text)) position.options.push(p)
      else position.answers.push(p)
    } else if (position && text && /^(?:[—－-]*试卷(?:结束|完)[—－-]*|以下空白)$/.test(text)) {
      position = undefined
    } else if (position && text && parent(p) === parent(position.stem)) {
      if (/^(?:说明|要求|注意事项|考生须知|评分标准)\s*[：:]/.test(text)) throw Error("题间含固定说明，请将说明置于大题标题后")
      position.answers.push(p)
      warnings.add("未编号的题干续段或材料将随所在小题替换，请确认题间没有需要保留的固定说明。")
    } else if (text && (position || !/^(?:说明|要求|注意|请)[：:\s]?/.test(text))) {
      throw Error("无法确定段落属于题干、答案还是固定说明，请调整模板：" + text.slice(0,40))
    }
  }
  if (!blocks.length || blocks.some(b => !b.positions.length)) throw Error("请为每个大题设置可识别的题型标题和至少一个带编号的小题")
  for (const b of blocks) {
    if (new Set(b.spec.slots.map(s => s.number)).size !== b.positions.length) throw Error("同一大题内的题号重复，请先校正")
    for (const pos of b.positions) {
      if (new Set(pos.options.map(p => val(at(p,"pStyle")))).size > 1)
        throw Error("同一道题的选项使用不同段落样式，可能带有正确答案标记，请先统一选项样式")
      for (const p of [pos.stem,...pos.options,...pos.answers]) {
        if (at(p,"sectPr") || at(p,"hyperlink") || at(p,"bookmarkStart") || at(p,"bookmarkEnd") || at(p,"sym"))
          throw Error("可替换题位包含分节符、书签或特殊符号，请先转换为普通段落")
      }
    }
  }
  return { zip, doc, docs, body, blocks, appendix, title, cover, warnings }
}

export async function analyzeTemplateDocx(bytes: Buffer) {
  const { blocks, warnings } = await inspect(bytes)
  const sections = blocks.map(b => b.spec)
  if (sections.some(s => s.slots.some(slot => slot.points === null))) warnings.add("部分小题未标明分值，可在生成前逐题校正。")
  return { sections, warnings: [...warnings] }
}

function writeParagraph(p: Element, text: string, replaceNumbering = false) {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(text)) throw Error("题目文本含 Word 无法保存的控制字符")
  const doc = p.ownerDocument
  const props = at(p,"pPr")
  const runProps = at(p,"r") && at(at(p,"r"),"rPr")?.cloneNode(true)
  for (const child of Array.from(p.childNodes)) if (child !== props) p.removeChild(child)
  if (replaceNumbering) {
    const pPr = props || p.appendChild(doc.createElementNS(W,"w:pPr"))
    const numPr = at(pPr,"numPr") || doc.createElementNS(W,"w:numPr")
    if (!numPr.parentNode) {
      // 编号属性须位于缩进、对齐等段落属性之前。
      const after = Array.from(pPr.childNodes).find(n => /^(?:pBdr|spacing|ind|jc|tabs|rPr|sectPr)$/.test((n as Element).localName))
      pPr.insertBefore(numPr,after || null)
    }
    while (numPr.firstChild) numPr.removeChild(numPr.firstChild)
    numPr.appendChild(doc.createElementNS(W,"w:numId")).setAttributeNS(W,"w:val","0")
  }
  const run = p.appendChild(doc.createElementNS(W,"w:r"))
  if (runProps) run.appendChild(runProps)
  const lines = text.split(/\r\n?|\n/)
  lines.forEach((line,i) => {
    if (i) run.appendChild(doc.createElementNS(W,"w:br"))
    line.split("\t").forEach((part,j) => {
      if (j) run.appendChild(doc.createElementNS(W,"w:tab"))
      const t = run.appendChild(doc.createElementNS(W,"w:t"))
      t.setAttributeNS("http://www.w3.org/XML/1998/namespace","xml:space","preserve")
      t.appendChild(doc.createTextNode(part))
    })
  })
}

// 总分可能被 Word 拆在多个文字节点中，按原位置改值以保留字体、页码域和图片。
function replaceTotal(p: Element, points: number | null) {
  const spans = elements(p,"t")
  const strings = spans.map(t => t.textContent || "")
  const joined = strings.join("")
  const matches = Array.from(joined.matchAll(totalClaim)).reverse()
  for (const m of matches) {
    const start = m.index! + m[1].length
    const end = m.index! + m[0].length
    let offset = 0
    spans.forEach((span,i) => {
      const length = strings[i].length
      if (start < offset+length && end > offset) {
        const value = span.textContent || ""
        span.textContent = value.slice(0,Math.max(0,start-offset)) +
          (start >= offset ? points === null ? "待定" : points + m[2] : "") + value.slice(Math.max(0,end-offset))
      }
      offset += length
    })
  }
  return matches.length > 0
}

function optionFormatting(pos: Position) {
  const paragraphs = pos.inlineOptions ? [pos.stem] : pos.options
  const runs = paragraphs.flatMap(p => {
    const offset = pos.inlineOptions ? displayedText(p).search(/[AＡ][.．、)）]/) : 0
    let end = 0
    return elements(p,"r").filter(run => {
      const text = displayedText(run)
      end += text.length
      return end > offset && Boolean(text.trim())
    })
  })
  // 比对属性及取值，保留共同的强调样式，只移除能够区分原选项的标记。
  const varying = (nodes: (Element | undefined)[]) => ["color","highlight","shd","u","b","bCs","i","iCs","rStyle"].filter(name => {
    const signatures = nodes.map(node => {
      const value = node && at(node,name)
      return value ? JSON.stringify(Array.from(value.attributes).map(a => [a.namespaceURI,a.localName,a.value]).sort()) : ""
    })
    return new Set(signatures).size > 1
  })
  return {
    runMarks: varying(runs.map(r => at(r,"rPr"))),
    paragraphMarks: varying(paragraphs.map(p => at(p,"pPr"))),
    inlineRun: pos.inlineOptions ? runs[0]?.cloneNode(true) : undefined,
  }
}

function removeMarks(element: Element | undefined, names: string[]) {
  if (!element) return
  for (const name of names) for (const mark of elements(element,name)) parent(mark).removeChild(mark)
}

function cloneParagraph(p: Element) {
  const copy = p.cloneNode(true) as Element
  const w14 = "http://schemas.microsoft.com/office/word/2010/wordml"
  copy.removeAttributeNS(w14,"paraId")
  copy.removeAttributeNS(w14,"textId")
  return copy
}

function checkedSections(blocks: Block[], sections: TemplateSection[]) {
  if (sections.length !== blocks.length || sections.reduce((n,s) => n+s.slots.length,0) > MAX_TEMPLATE_SLOTS)
    throw Error("模板分区或题位数与原文件不符")
  return sections.map((section,index) => {
    const b = blocks[index]
    if (!section.slots.length || new Set(section.slots.map(s => s.number)).size !== section.slots.length)
      throw Error("每个分区至少保留一题，且题号须唯一")
    if (section.slots.length !== b.positions.length && b.positions.some(p => parent(p.stem).localName !== "body"))
      throw Error("表格内题位数量须与模板一致，请在 Word 内先调整表格行数")
    return {...section,title:formatTemplateHeading(section)}
  })
}

export async function validateTemplateLayout(bytes: Buffer, sections: TemplateSection[]) {
  return checkedSections((await inspect(bytes)).blocks, sections)
}

export async function renderTemplateDocx(bytes: Buffer, title: string, sections: TemplateSection[], questions: SerializedQuestion[], includeAnswers: boolean) {
  const layout = await inspect(bytes)
  const { doc, body, blocks } = layout
  const total = sections.reduce((n,s) => n+s.slots.length,0)
  if (total !== questions.length)
    throw Error("模板分区或题位与本次试卷不一致")
  const allPoints = sections.flatMap(s => s.slots.map(slot => slot.points))
  const points = allPoints.some(n => n === null) ? null : Number(allPoints.reduce<number>((sum,n) => sum+(n ?? 0),0).toFixed(6))
  layout.cover.forEach(p => replaceTotal(p,points))
  for (const [name,part] of layout.docs) {
    if (!/^word\/(?:header|footer)\d+\.xml$/.test(name)) continue
    const changed = elements(part,"p").map(p => replaceTotal(p,points)).some(Boolean)
    if (changed) layout.zip.file(name,new XMLSerializer().serializeToString(part))
  }
  if (layout.title) writeParagraph(layout.title,title)
  else {
    const p = doc.createElementNS(W,"w:p")
    body.insertBefore(p,body.firstChild)
    writeParagraph(p,title)
  }
  for (const p of layout.appendix) parent(p).removeChild(p)
  let offset = 0
  const keys: string[] = []
  checkedSections(blocks,sections).forEach((section,index) => {
    const b = blocks[index]
    const display = section.title
    if (display !== paraText(b.heading)) writeParagraph(b.heading,display)
    for (const note of b.notes) {
      const text = paraText(note)
      const updated = formatTemplateHeading({...section,title:text})
      if (updated !== text) writeParagraph(note,updated)
    }
    keys.push(display)
    const last = b.positions[b.positions.length-1]
    const shapes = b.positions.map(pos => pos.options.map(rowShape))
    const formats = b.positions.map(optionFormatting)
    const inlineGaps = b.positions.map(pos => rowShape(pos.stem).gap)
    const end = [last.stem,...last.options,...last.blanks,...last.answers]
    const anchor = Array.from(parent(last.stem).childNodes).filter(n => end.includes(n as Element)).pop()!.nextSibling
    section.slots.forEach((slot,i) => {
      const q = questions[offset++]
      if (q.type !== (slot.type || section.type)) throw Error("题目类型与模板题位不一致")
      const source = b.positions[i] || last
      const container = parent(source.stem)
      const extra = i >= b.positions.length
      const stem = extra ? container.insertBefore(cloneParagraph(source.stem),anchor) : source.stem
      const number = source.prefix.replace(/\d+/,() => slot.number)
      const opts = (q.options || []).map((v,j) => option.test(v) ? v : String.fromCharCode(65+j) + ". " + v)
      const origin = Math.min(i,b.positions.length-1)
      const line = number + (slot.points === null ? "" : "（" + slot.points + "分）") + q.content
      writeParagraph(stem,line, Boolean(at(stem,"numPr") || at(stem,"pStyle")))
      const format = formats[origin]
      if (source.inlineOptions && opts.length) {
        const inline = doc.createElementNS(W,"w:p")
        if (format.inlineRun) inline.appendChild(format.inlineRun.cloneNode(true))
        writeParagraph(inline,inlineGaps[origin] + opts.join(inlineGaps[origin]))
        removeMarks(inline,format.runMarks)
        stem.appendChild(at(inline,"r"))
      }
      let previous = stem
      const rows = shapes[origin]
      let usedRows = 0, usedOptions = 0
      while (!source.inlineOptions && usedOptions < opts.length) {
        const shape = rows[Math.min(usedRows,rows.length-1)] || {width:1,gap:""}
        const orig = source.options[usedRows]
        const sample = orig || source.options[source.options.length-1] || stem
        const p = !extra && orig ? orig : container.insertBefore(cloneParagraph(sample),previous.nextSibling)
        writeParagraph(p,opts.slice(usedOptions,usedOptions+shape.width).join(shape.gap),Boolean(at(p,"numPr") || at(p,"pStyle")))
        removeMarks(at(p,"r"),format.runMarks)
        removeMarks(at(p,"pPr"),format.paragraphMarks)
        previous = p
        usedRows++
        usedOptions += shape.width
      }
      if (extra) {
        for (const blank of source.blanks) container.insertBefore(cloneParagraph(blank),anchor)
      } else {
        for (const p of [...source.options.slice(usedRows),...source.answers]) container.removeChild(p)
      }
      keys.push(slot.number + ". " + (q.answer || "（无）"))
      if (q.explanation) keys.push("解析：" + q.explanation)
    })
    for (const old of b.positions.slice(section.slots.length)) {
      for (const p of [old.stem,...old.options,...old.blanks,...old.answers]) parent(p).removeChild(p)
    }
  })
  if (includeAnswers) {
    const anchor = Array.from(body.childNodes).find(n => (n as Element).localName === "sectPr")
    for (const value of ["参考答案",...keys]) {
      const p = doc.createElementNS(W,"w:p")
      writeParagraph(p,value)
      body.insertBefore(p,anchor || null)
    }
  }
  layout.zip.file("word/document.xml",new XMLSerializer().serializeToString(doc))
  return layout.zip.generateAsync({ type:"nodebuffer", compression:"DEFLATE" })
}
