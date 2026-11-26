import JSZip from "jszip"
import { describe, expect, it } from "vitest"
import { parsePdfBuffer } from "@/lib/parser/question-extractor"
import { parseTextbook } from "./parser"

const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
const office = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const relationships = "http://schemas.openxmlformats.org/package/2006/relationships"
const html = (body: string, title = "教材") => `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title></head><body>${body}</body></html>`
const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`

async function docx(content: string, styles = "") {
  const zip = new JSZip()
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file("_rels/.rels", `<Relationships xmlns="${relationships}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="word/document.xml"/></Relationships>`)
  zip.file("word/document.xml", `<w:document xmlns:w="${w}"><w:body>${content}</w:body></w:document>`)
  if (styles) {
    zip.file("word/_rels/document.xml.rels", `<Relationships xmlns="${relationships}"><Relationship Id="rId2" Type="${office}/styles" Target="custom/styles.xml"/></Relationships>`)
    zip.file("word/custom/styles.xml", `<w:styles xmlns:w="${w}">${styles}</w:styles>`)
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
}

async function epub(items: string, spine: string, files: Record<string, string>, ncx = false) {
  const zip = new JSZip()
  zip.file("mimetype", "application/epub+zip")
  zip.file("META-INF/container.xml", '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
  zip.file("OPS/book.opf", `<package xmlns="http://www.idpf.org/2007/opf" version="${ncx ? "2.0" : "3.0"}"><metadata/><manifest>${items}</manifest><spine${ncx ? ' toc="ncx"' : ""}>${spine}</spine></package>`)
  for (const [file, content] of Object.entries(files)) zip.file(file, content)
  return zip.generateAsync({ type: "nodebuffer" })
}

const pagesManifest = '<item id="later" href="Text/a.xhtml" media-type="application/xhtml+xml"/><item id="first" href="Text/%E7%AB%A0%E4%B8%80.xhtml" media-type="application/xhtml+xml"/>'
const spine = '<itemref idref="first"/><itemref idref="later"/>'

// 写出真实交叉引用表和页树，验证 PDF 页码及书签目标。
function pdf(pages: string[][], withBookmarks = false) {
  const objects: string[] = []
  const pageId = (index: number) => 4 + index * 2
  const outline = pageId(pages.length)
  const chinese = pages.some(lines => lines.some(line => /\p{Script=Han}/u.test(line)))
  objects.push(`<< /Type /Catalog /Pages 2 0 R ${withBookmarks ? `/Outlines ${outline} 0 R` : ""} >>`)
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`)
  objects.push(chinese
    ? "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 0 >> /DW 1000 /FontDescriptor << /Type /FontDescriptor /FontName /STSongStd-Light /Flags 6 /FontBBox [-25 -254 1000 880] /ItalicAngle 0 /Ascent 752 /CapHeight 737 /Descent -271 /StemV 58 >> >>] >>"
    : "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
  pages.forEach((lines, i) => {
    const text = "BT 50 740 Td " + lines.map((line, index) => {
      const literal = chinese ? `<${Buffer.from(line, "utf16le").swap16().toString("hex")}>` : `(${line})`
      return `${index ? "0 -32 Td" : ""} /F1 ${index ? 12 : 22} Tf ${literal} Tj`
    }).join(" ") + " ET"
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId(i) + 1} 0 R >>`)
    objects.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`)
  })
  if (withBookmarks) {
    objects.push(`<< /Type /Outlines /First ${outline + 1} 0 R /Last ${outline + 1} 0 R /Count 2 >>`)
    objects.push(`<< /Title <FEFF7B2C4E007AE0> /Parent ${outline} 0 R /Dest [${pageId(0)} 0 R /Fit] /First ${outline + 2} 0 R /Last ${outline + 2} 0 R /Count 1 >>`)
    objects.push(`<< /Title (Lab) /Parent ${outline + 1} 0 R /Dest [${pageId(2)} 0 R /Fit] >>`)
  }
  let source = "%PDF-1.4\n"
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(source.length)
    source += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const start = source.length
  source += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) source += `${String(offset).padStart(10, "0")} 00000 n \n`
  source += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
  return Buffer.from(source, "ascii")
}

describe("教材正文解析", () => {
  it("题目导入也能离线解码中文 PDF 并保留起始页码", async () => {
    const parsed = await parsePdfBuffer(pdf([[], [
      "单项选择题", "1．下列哪项是温度的单位？", "A．开尔文", "B．米", "答案：A",
    ]]))
    expect(parsed).toMatchObject([{ type: "single", sourcePage: 2, answer: "A", options: ["A. 开尔文", "B. 米"] }])
  })

  it("离线解码无 ToUnicode 的标准中文宋体 PDF", async () => {
    const parsed = await parseTextbook("物理.pdf", pdf([["第一章 平衡", "物理系统在平衡状态下具有确定的温度。"]]))
    expect(parsed.segments).toEqual(["第一章 平衡\n物理系统在平衡状态下具有确定的温度。"])
    expect(parsed.chapters).toEqual([{ title: "第一章 平衡", level: 1, start: 1 }])
    expect(parsed.warnings).toEqual([])
  })

  it("PDF 书签定位真实页树、保留空白页和中文书签", async () => {
    const bytes = pdf([["Front"], [], ["Lab notes"]], true)
    const original = Buffer.from(bytes)
    const result = await parseTextbook("实验.PDF", bytes)
    expect(result.segments).toEqual(["Front", "", "Lab notes"])
    expect(result.chapters).toEqual([{ title: "第一章", level: 1, start: 1 }, { title: "Lab", level: 2, start: 3 }])
    expect(result.warnings.join("")).toContain("1 页")
    expect(bytes).toEqual(original)
  })

  it("无书签 PDF 从编号或大号标题识别章节，保留真正页码", async () => {
    const result = await parseTextbook("book.pdf", pdf([
      ["Chapter 1", "A much longer line of regular body text."], [],
      ["Thermal equilibrium", "A much longer line of regular body text with no heading number."],
    ]))
    expect(result.chapters).toEqual([{ title: "Chapter 1", level: 1, start: 1 }, { title: "Thermal equilibrium", level: 1, start: 3 }])
  })

  it("无文字层的 PDF 仍可按页手工划分", async () => {
    const result = await parseTextbook("scan.pdf", pdf([[], [], []]))
    expect(result.segments).toEqual(["", "", ""])
    expect(result.chapters).toEqual([{ title: "正文", level: 1, start: 1 }])
    expect(result.warnings.join("")).toContain("手工划分")
  })

  it("EPUB 3 按 spine 顺序读取，并把同文件分组、内联锚点定位到真实段落", async () => {
    const bytes = await epub(pagesManifest + '<item id="nav" href="Guide/nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>', spine, {
      "OPS/Guide/nav.xhtml": html('<nav epub:type="page-list"><ol><li><a href="../Text/a.xhtml">印刷页</a></li></ol></nav><nav epub:type="toc"><ol><li><span>第一编</span><ol><li><a href="../Text/%E7%AB%A0%E4%B8%80.xhtml#begin">导论</a></li><li><a href="../Text/%E7%AB%A0%E4%B8%80.xhtml#unit">定理</a></li></ol></li><li><a href="../Text/a.xhtml">实验</a></li></ol></nav>'),
      "OPS/Text/a.xhtml": html("<h1>实验内容</h1><p>最后一段</p>"),
      "OPS/Text/章一.xhtml": html('<p>序言</p><section id="begin"><h1>章标题</h1><p>公理&nbsp;A<script>忽略脚本</script></p><p>性质<span id="unit">乙</span><br/>换行</p></section>'),
    })
    const result = await parseTextbook("教材.epub", bytes)
    expect(result.segments).toEqual(["序言", "章标题", "公理 A", "性质乙\n换行", "实验内容", "最后一段"])
    expect(result.chapters).toEqual([
      { title: "卷首", level: 1, start: 1 }, { title: "第一编", level: 1, start: 2 },
      { title: "导论", level: 2, start: 2 }, { title: "定理", level: 2, start: 4 }, { title: "实验", level: 1, start: 5 },
    ])
    expect(result.warnings).toEqual([])
  })

  it("EPUB 2 NCX 使用嵌套 navPoint 与片内定位", async () => {
    const bytes = await epub(pagesManifest + '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>', spine, {
      "OPS/Text/章一.xhtml": html('<p>热学公理</p><p id="b">熵的定义</p>'),
      "OPS/Text/a.xhtml": html("<p>补充说明</p>"),
      "OPS/toc.ncx": '<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://example.invalid/ncx.dtd"><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint><navLabel><text>热学</text></navLabel><content src="Text/章一.xhtml"/><navPoint><navLabel><text>熵</text></navLabel><content src="Text/章一.xhtml#b"/></navPoint></navPoint></navMap></ncx>',
    }, true)
    const result = await parseTextbook("热学.epub", bytes)
    expect(result.chapters).toEqual([{ title: "热学", level: 1, start: 1 }, { title: "熵", level: 2, start: 2 }])
  })

  it("无目录 EPUB 利用正文标题或书脊文档名保留可校正章节", async () => {
    const bytes = await epub(pagesManifest, spine, {
      "OPS/Text/章一.xhtml": html("<h1>认识函数</h1><div><p>定义</p><p>例子</p></div>"),
      "OPS/Text/a.xhtml": html("<p>习题</p>", "自测"),
    })
    const result = await parseTextbook("数学.epub", bytes)
    expect(result.segments).toEqual(["认识函数", "定义", "例子", "习题"])
    expect(result.chapters).toEqual([{ title: "认识函数", level: 1, start: 1 }, { title: "自测", level: 1, start: 4 }])
    expect(result.warnings.join("")).toContain("未提供可用目录")
  })

  it("DOCX 从继承样式与直接大纲级别识别多级标题，表格正文共用段号", async () => {
    const bytes = await docx(paragraph("序言") + '<w:p><w:pPr><w:pStyle w:val="chapter"/></w:pPr><w:r><w:t>热学基础</w:t></w:r></w:p>' +
      `<w:tbl><w:tr><w:tc>${paragraph("表中一段")}</w:tc></w:tr></w:tbl>` +
      '<w:p><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:r><w:t>平衡</w:t></w:r></w:p><w:p><w:del><w:r><w:t>已删除</w:t></w:r></w:del><w:r><w:instrText>不取域指令</w:instrText><w:t>第一行</w:t><w:br/><w:t>第二行</w:t></w:r></w:p>',
      '<w:style w:type="paragraph" w:styleId="one"><w:name w:val="标题 1"/></w:style><w:style w:type="paragraph" w:styleId="chapter"><w:basedOn w:val="one"/></w:style>')
    const result = await parseTextbook("热学.docx", bytes)
    expect(result.segments).toEqual(["序言", "热学基础", "表中一段", "平衡", "第一行\n第二行"])
    expect(result.chapters).toEqual([{ title: "卷首", level: 1, start: 1 }, { title: "热学基础", level: 1, start: 2 }, { title: "平衡", level: 2, start: 4 }])
  })

  it("普通 Word 段落可由章号识别或手工校正", async () => {
    const plain = await parseTextbook("读本.docx", await docx(paragraph("没有标题的段落")))
    expect(plain.chapters).toEqual([{ title: "正文", level: 1, start: 1 }])
    expect(plain.warnings.join("")).toContain("校正")
    const numbered = await parseTextbook("读本.docx", await docx(paragraph("第一章 函数") + paragraph("第一节 定义")))
    expect(numbered.chapters.map(c => [c.level, c.start])).toEqual([[1, 1], [2, 2]])
  })

  it("拒绝空正文、不完整压缩包、伪 PDF、错误扩展名和 XML 实体声明", async () => {
    await expect(parseTextbook("无.docx", await docx(""))).rejects.toThrow("没有可读取的正文")
    await expect(parseTextbook("无.epub", Buffer.from("bad"))).rejects.toThrow("完整")
    await expect(parseTextbook("无.pdf", Buffer.from("bad"))).rejects.toThrow("PDF 标识")
    await expect(parseTextbook("无.pptx", Buffer.from("bad"))).rejects.toThrow("仅支持")
    await expect(parseTextbook("空.pdf", Buffer.alloc(0))).rejects.toThrow("文件为空")
    await expect(parseTextbook("非法.docx", await docx("<!ENTITY x '非法'>"))).rejects.toThrow("实体声明")
  })

  it("含大附件的教材可超过 20 MiB，超出正文读取预算时给出错误", async () => {
    const zip = await JSZip.loadAsync(await docx(paragraph("图版说明")))
    zip.file("word/media/large.png", Buffer.alloc(20 * 1024 ** 2))
    const illustrated = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" })
    expect(illustrated.length).toBeGreaterThan(20 * 1024 ** 2)
    expect((await parseTextbook("图册.docx", illustrated)).segments).toEqual(["图版说明"])
    const oversized = await docx(paragraph("a".repeat(16 * 1024 ** 2)))
    await expect(parseTextbook("超长.docx", oversized)).rejects.toThrow("正文解压后过大")
  })

  it("拒绝 EPUB 加密正文，普通字体混淆可保留在原件", async () => {
    const encrypted = (uri: string, algorithm: string) => `<encryption><EncryptedData><EncryptionMethod Algorithm="${algorithm}"/><CipherData><CipherReference URI="${uri}"/></CipherData></EncryptedData></encryption>`
    const files = {
      "OPS/Text/章一.xhtml": html("<p>正文</p>"), "OPS/Text/a.xhtml": html("<p>附录</p>"),
      "META-INF/encryption.xml": encrypted("OPS/Text/a.xhtml", "urn:encrypted"),
    }
    await expect(parseTextbook("加密.epub", await epub(pagesManifest, spine, files))).rejects.toThrow("DRM")
    files["META-INF/encryption.xml"] = encrypted("OPS/font.otf", "http://www.idpf.org/2008/embedding")
    expect((await parseTextbook("普及版.epub", await epub(pagesManifest, spine, files))).segments).toHaveLength(2)
  })
})
