import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { parsePowerPointBuffer } from "../question-extractor"

function slideXml(paragraphs: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      ${paragraphs.map((paragraph) => `
      <p:sp>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p><a:r><a:t>${paragraph}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>`).join("")}
    </p:spTree>
  </p:cSld>
</p:sld>`
}

async function createPptxBuffer(slides: string[][]) {
  const zip = new JSZip()
  slides.forEach((paragraphs, index) => {
    zip.file(`ppt/slides/slide${index + 1}.xml`, slideXml(paragraphs))
  })
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }))
}

function createLegacyPptTextRecord(text: string) {
  const payload = Buffer.from(text, "utf16le")
  const header = Buffer.alloc(8)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(4000, 2)
  header.writeUInt32LE(payload.length, 4)
  return Buffer.concat([header, payload])
}

describe("parsePowerPointBuffer", () => {
  it("extracts questions from pptx slide text in order", async () => {
    const buffer = await createPptxBuffer([
      [
        "一、单选题",
        "1. JavaScript 中声明常量使用哪个关键字？",
        "A. var",
        "B. let",
        "C. const",
        "D. static",
        "答案：C",
      ],
      [
        "二、判断题",
        "2. TypeScript 可以为 JavaScript 添加静态类型。（√）",
      ],
    ])

    const questions = await parsePowerPointBuffer(buffer)

    expect(questions).toHaveLength(2)
    expect(questions[0]).toMatchObject({
      type: "single",
      answer: "C",
    })
    expect(questions[0].content).toContain("JavaScript")
    expect(questions[0].options).toEqual(["A. var", "B. let", "C. const", "D. static"])
    expect(questions[1]).toMatchObject({
      type: "truefalse",
      answer: "√",
    })
  })

  it("extracts questions from legacy ppt text records", async () => {
    const buffer = createLegacyPptTextRecord([
      "一、单选题",
      "1. CSS 中设置文字颜色使用哪个属性？",
      "A. color",
      "B. font-size",
      "C. display",
      "D. margin",
      "答案：A",
    ].join("\r"))

    const questions = await parsePowerPointBuffer(buffer)

    expect(questions).toHaveLength(1)
    expect(questions[0]).toMatchObject({
      type: "single",
      answer: "A",
    })
    expect(questions[0].content).toContain("CSS")
    expect(questions[0].options).toEqual(["A. color", "B. font-size", "C. display", "D. margin"])
  })
})
