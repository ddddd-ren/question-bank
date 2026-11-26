import { describe, expect, it } from "vitest"
import { segmentQuestions } from "../question-segmenter"
import type { StructuredParagraph } from "../recognition-types"

function text(value: string, index: number): StructuredParagraph {
  return { text: value, sourceIndex: index, sourceKind: "paragraph", styleHints: {} }
}

describe("segmentQuestions", () => {
  it("识别章节、孤立题号和同行题号", () => {
    const blocks = segmentQuestions([
      text("一、单项选择题", 0), text("1.", 1), text("下列属于前端框架的是？", 2),
      text("A. Vue", 3), text("B. MySQL", 4), text("答案：A", 5),
      text("解析：Vue 是前端框架。", 6), text("2、下列属于数据库的是？", 7),
      text("A. React B. MySQL", 8),
    ])

    expect(blocks).toHaveLength(2)
    expect(blocks[0].sectionType).toBe("single")
    expect(blocks[0].paragraphs.map((item) => item.text)).toContain("解析：Vue 是前端框架。")
    expect(blocks[1].paragraphs[0].text).toContain("2、下列属于数据库的是？")
  })

  it("不把年份、选项和答案标签当作题目边界", () => {
    const blocks = segmentQuestions([
      text("1. 说明 2024. 年的变化", 0), text("A. 这只是正文", 1), text("答案：待定", 2),
    ])
    expect(blocks).toHaveLength(1)
  })

  it("上一题结构不足时合并疑似新题并警告", () => {
    const blocks = segmentQuestions([text("1. 一个未完成的问题", 0), text("2. 补充说明", 1)])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].diagnostic.warnings.some((warning) => warning.code === "uncertain_boundary")).toBe(true)
  })

  it("PDF 顶层题号切分无选项题目，但保留括号小问", () => {
    const blocks = segmentQuestions([
      { ...text("一、简答题", 0), sourceKind: "pdf-line" },
      { ...text("1. 说明数据库设计步骤。", 1), sourceKind: "pdf-line" },
      { ...text("2. 说明主码和候选码的关系。", 2), sourceKind: "pdf-line" },
      { ...text("(1) 先设计局部 E-R 模型。", 3), sourceKind: "pdf-line" },
      { ...text("(2) 再整合全局模型。", 4), sourceKind: "pdf-line" },
    ])

    expect(blocks).toHaveLength(2)
    expect(blocks[1].paragraphs.map((item) => item.text)).toEqual([
      "2. 说明主码和候选码的关系。",
      "(1) 先设计局部 E-R 模型。",
      "(2) 再整合全局模型。",
    ])
  })
})
