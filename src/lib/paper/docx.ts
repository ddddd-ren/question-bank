import JSZip from "jszip"
import type { SerializedQuestion } from "@/lib/db/serialize"
import { typeLabels } from "@/lib/constants"

export interface PaperSection {
  type: string
  questions: SerializedQuestion[]
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function paragraph(text: string, style?: string) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""
  const lines = text.split("\n")
  const runs = lines.map((line, index) => {
    const br = index === 0 ? "" : "<w:br/>"
    return `<w:r>${br}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`
  }).join("")
  return `<w:p>${styleXml}${runs}</w:p>`
}

function buildDocumentXml(title: string, sections: PaperSection[], includeAnswers: boolean) {
  const body: string[] = []

  body.push(paragraph(title, "Title"))
  body.push(paragraph(`生成时间：${new Date().toLocaleString("zh-CN")}`))
  body.push(paragraph(""))

  for (const section of sections) {
    if (section.questions.length === 0) continue
    body.push(paragraph(`${typeLabels[section.type] || section.type}（共 ${section.questions.length} 题）`, "Heading1"))

    section.questions.forEach((question, index) => {
      body.push(paragraph(`${index + 1}. ${question.content}`))
      if (question.options && question.options.length > 0) {
        for (const option of question.options) {
          body.push(paragraph(`    ${option}`))
        }
      }
      body.push(paragraph(""))
    })
  }

  if (includeAnswers) {
    body.push(paragraph("参考答案", "Heading1"))
    for (const section of sections) {
      if (section.questions.length === 0) continue
      body.push(paragraph(typeLabels[section.type] || section.type, "Heading2"))
      section.questions.forEach((question, index) => {
        body.push(paragraph(`${index + 1}. ${question.answer || "（无）"}`))
        if (question.explanation) {
          body.push(paragraph(`解析：${question.explanation}`))
        }
      })
      body.push(paragraph(""))
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body.join("\n")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="24"/></w:rPr>
  </w:style>
</w:styles>`
}

export async function createPaperDocx(title: string, sections: PaperSection[], includeAnswers: boolean) {
  const zip = new JSZip()

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`)

  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)

  const word = zip.folder("word")
  word?.file("document.xml", buildDocumentXml(title, sections, includeAnswers))
  word?.file("styles.xml", stylesXml())
  word?.folder("_rels")?.file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
}
