import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { DOMParser } from "@xmldom/xmldom"
import type { SerializedQuestion } from "../db/serialize"
import { analyzeTemplateDocx, renderTemplateDocx, validateTemplateLayout } from "./template-docx"
import { elements, W } from "./template-docx-package"

const p = (s: string, props = "") => '<w:p>'+props+'<w:r><w:rPr><w:b/></w:rPr><w:t>'+s+'</w:t></w:r></w:p>'
const numbering = '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="5"/></w:numPr></w:pPr>'
const header = '<w:hdr xmlns:w="'+W+'">'+p("学校名称")+'</w:hdr>'
async function fixture(body: string, rel = "") {
  const zip = new JSZip()
  zip.file("[Content_Types].xml",'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file("_rels/.rels",'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="word/document.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"/>'+rel+'</Relationships>')
  zip.file("word/document.xml",'<w:document xmlns:w="'+W+'"><w:body>'+p("旧样卷")+body+'<w:sectPr><w:pgSz w:w="11906"/></w:sectPr></w:body></w:document>')
  zip.file("word/numbering.xml",'<w:numbering xmlns:w="'+W+'"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1、"/></w:lvl></w:abstractNum><w:num w:numId="5"><w:abstractNumId w:val="1"/></w:num></w:numbering>')
  zip.file("word/header1.xml",header)
  return zip.generateAsync({type:"nodebuffer"})
}
function q(type: string, content: string, options: string[] | null = null) {
  return {type,content,options,answer:"新答案",explanation:"新解析"} as SerializedQuestion
}
async function inspectResult(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file("word/document.xml")!.async("string")
  const doc = new DOMParser().parseFromString(xml,"text/xml")
  return { zip,xml,text:elements(doc,"p").map(e => e.textContent).join("\n") }
}
describe("Word 模板", () => {
  it("保留重复分区、差异分、表格、原段落留白与页眉，删除旧题、旧选项和答案", async () => {
    const bytes = await fixture(p("一、单选题（共2题，每题2分，共5分）")+p("1. 旧题一（3分）")+p("A. 旧选项一")+p("B. 旧选项二")+p("解析：旧内联解析")+p("2. 旧题二")+p("")+p("二、名词解释")+p("3. 旧名词")+p("_______")+p("三、简答题")+'<w:tbl><w:tr><w:tc>'+p("旧简答",numbering)+'</w:tc></w:tr></w:tbl>'+p("参考答案")+p("1. 旧答案"))
    const {sections} = await analyzeTemplateDocx(bytes)
    expect(sections.map(s => [s.type,s.tag])).toEqual([["single",undefined],["essay","名词解释"],["essay","简答题"]])
    expect(sections[0].slots).toEqual([{number:"1",points:3},{number:"2",points:2}])
    expect(sections[2].slots[0].number).toBe("3")
    sections[0].slots.splice(1,1)
    sections[0].slots[0] = {number:"8",points:4}
    sections[1].slots.push({number:"4",points:5})
    const qs = [q("single","新选择",["甲","乙","丙"]),q("essay","新名词"),q("essay","新增名词"),q("essay","新简答")]
    for (const includeAnswers of [false,true]) {
      const result = await inspectResult(await renderTemplateDocx(bytes,"新卷",sections,qs,includeAnswers))
      expect(result.text).not.toMatch(/旧/)
      expect(result.text).toContain("共1题，每题4分，共4分")
      expect(result.text).toContain("8. （4分）新选择\nA. 甲\nB. 乙\nC. 丙")
      expect(result.text).toContain("新增名词\n_______")
      expect(result.xml).toContain("<w:tbl>")
      expect(result.xml).toContain("<w:b/>")
      expect(result.xml).toContain('<w:numId w:val="0"/>')
      expect(await result.zip.file("word/header1.xml")!.async("string")).toBe(header)
      expect(result.text.includes("8. 新答案")).toBe(includeAnswers)
      expect(result.text.includes("新解析")).toBe(includeAnswers)
    }
  })
  it("多段题干整体替换，原横排选项不改成竖排", async () => {
    const bytes = await fixture(p("一、单选题")+p("1. 旧题")+p("旧题补充材料")+p("A. 原甲    B. 原乙    C. 原丙"))
    const {sections} = await analyzeTemplateDocx(bytes)
    const result = await inspectResult(await renderTemplateDocx(bytes,"新卷",sections,[q("single","新题",["甲","乙","丙"])],false))
    expect(result.text).not.toMatch(/旧题|原甲/)
    expect(result.text).toContain("A. 甲    B. 乙    C. 丙")
  })
  it("外链、跨单元格调整均给出明确错误", async () => {
    await expect(analyzeTemplateDocx(await fixture("",'<Relationship TargetMode="External" Target="https://example.com"/>'))).rejects.toThrow("外部")
    const bytes = await fixture(p("一、判断题")+'<w:tbl><w:tr><w:tc>'+p("1. 旧题")+'</w:tc></w:tr></w:tbl>')
    const { sections } = await analyzeTemplateDocx(bytes)
    sections[0].slots.push({number:"2",points:3})
    await expect(validateTemplateLayout(bytes,sections)).rejects.toThrow("表格")
    await expect(renderTemplateDocx(bytes,"新卷",sections,[q("truefalse","题"),q("truefalse","题")],false)).rejects.toThrow("表格")
  })
  it("未知大题可人工校正，全卷总分同步，清除原选项颜色并拒绝页脚答案", async () => {
    const bytes = await fixture(p("满分：100 分")+p("四、综合应用")+p("1. 旧题")+p("A. 甲").replace("<w:b/>",'<w:color w:val="FF0000"/>')+p("B. 乙"))
    const {sections,warnings} = await analyzeTemplateDocx(bytes)
    expect(warnings.join("")).toContain("题型待确认")
    sections[0].type = "single"
    sections[0].slots[0].points = 6.5
    const result = await inspectResult(await renderTemplateDocx(bytes,"新卷",sections,[q("single","新题",["甲","乙"])],false))
    expect(result.text).toContain("满分：6.5 分")
    expect(result.xml).not.toContain("FF0000")
    const zip = await JSZip.loadAsync(bytes)
    zip.file("word/footer1.xml",header.replaceAll("w:hdr","w:ftr").replace("学校名称","本页参考答案：B"))
    await expect(analyzeTemplateDocx(await zip.generateAsync({type:"nodebuffer"}))).rejects.toThrow("页脚含答案")
  })
  it("保留 Word 默认脚注分隔线，移除旧文档缩略图及其关系", async () => {
    const zip = await JSZip.loadAsync(await fixture(p("一、判断题")+p("1. 旧题"),'<Relationship Type="thumbnail" Target="docProps/thumbnail.wmf"/>'))
    zip.file("docProps/thumbnail.wmf","原卷预览")
    const separator = '<w:footnotes xmlns:w="'+W+'"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote></w:footnotes>'
    zip.file("word/footnotes.xml",separator)
    const bytes = await zip.generateAsync({type:"nodebuffer"})
    const {sections} = await analyzeTemplateDocx(bytes)
    const result = await JSZip.loadAsync(await renderTemplateDocx(bytes,"新卷",sections,[q("truefalse","新判断")],false))
    expect(result.file("docProps/thumbnail.wmf")).toBeNull()
    expect(await result.file("_rels/.rels")!.async("string")).not.toContain("thumbnail")
    expect(await result.file("word/footnotes.xml")!.async("string")).toBe(separator)
    zip.file("word/footnotes.xml",separator.replace("<w:separator/>","<w:t>答案</w:t>"))
    await expect(analyzeTemplateDocx(await zip.generateAsync({type:"nodebuffer"}))).rejects.toThrow("脚注")
  })
  it("保留竖排和同行选项的统一蓝色粗体，只清除单个选项的高亮，总分显示六位小数", async () => {
    const common = '<w:b/><w:color w:val="1166CC"/>'
    const marked = common + '<w:highlight w:val="yellow"/>'
    const run = (s: string, props: string) => '<w:r><w:rPr>'+props+'</w:rPr><w:t>'+s+'</w:t></w:r>'
    const bytes = await fixture(p("全卷满分 1 分")+p("一、单选题（共2题，共1分）")+p("1. 旧题")+p("A. 甲").replace("<w:b/>",common)+p("B. 乙").replace("<w:b/>",marked)+
      '<w:p>'+run("2. 旧题 ","")+run("A. 甲    ",marked)+run("B. 乙",common)+'</w:p>')
    const {sections} = await analyzeTemplateDocx(bytes)
    sections[0].slots[0].points = 0.123456
    sections[0].slots[1].points = 0.2
    const result = await inspectResult(await renderTemplateDocx(bytes,"新卷",sections,[q("single","竖排",["甲","乙"]),q("single","同行",["甲","乙"])],false))
    expect(result.xml).not.toContain("yellow")
    expect(result.xml.match(/1166CC/g)).toHaveLength(3)
    const doc = new DOMParser().parseFromString(result.xml,"text/xml")
    for (const run of elements(doc,"r").filter(r => elements(r,"color").length)) expect(elements(run,"b")).toHaveLength(1)
    expect(result.text).toContain("满分 0.323456 分")
    expect(result.text).toContain("共0.323456分")
  })
  it("独立大题说明继承每小题分，调整题量后保留说明的位置和格式", async () => {
    const bytes = await fixture(p("一、判断题")+p("本大题共 2 小题，每小题 2 分，共 4 分")+p("1. 第一题")+p("2. 第二题")+p("二、简答题")+p("共 10 分")+p("1. 第三题"))
    const {sections} = await analyzeTemplateDocx(bytes)
    expect(sections[0].slots.map(s => s.points)).toEqual([2,2])
    expect(sections[1].slots[0].points).toBeNull()
    sections[0].slots = [{number:"1",points:3.5}]
    const result = await inspectResult(await renderTemplateDocx(bytes,"新卷",sections,[q("truefalse","新题"),q("essay","新简答")],false))
    expect(result.text).toContain("一、判断题\n本大题共 1 小题，每小题 3.5 分，共 3.5 分\n1. （3.5分）新题")
    expect(result.text).toContain("二、简答题\n总分待定")
    const doc = new DOMParser().parseFromString(result.xml,"text/xml")
    expect(elements(elements(doc,"p").find(par => par.textContent?.startsWith("本大题共"))!,"b")).toHaveLength(1)
  })
})
