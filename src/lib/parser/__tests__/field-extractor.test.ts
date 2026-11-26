import { describe, expect, it } from "vitest"
import { extractFields } from "../field-extractor"
import { emptyDiagnostic, type QuestionBlock, type StructuredParagraph } from "../recognition-types"

function block(lines: Array<string | { text: string; isRed: boolean }>): QuestionBlock {
  return {
    sectionType: "single",
    boundaryConfidence: 100,
    diagnostic: emptyDiagnostic(),
    paragraphs: lines.map((line, sourceIndex): StructuredParagraph => typeof line === "string"
      ? { text: line, sourceIndex, sourceKind: "paragraph", styleHints: {} }
      : { text: line.text, sourceIndex, sourceKind: "paragraph", styleHints: { isRed: line.isRed } }),
  }
}

describe("extractFields", () => {
  it("提取同行选项", () => {
    expect(extractFields(block(["1. 下列属于框架的是？", "A. Vue B. MySQL C. Redis"])).options)
      .toEqual(["A. Vue", "B. MySQL", "C. Redis"])
  })

  it("将选项后的短段落追加到前一选项", () => {
    expect(extractFields(block(["1. 选择框架", "A. Vue", "渐进式框架", "B. MySQL"])).options)
      .toEqual(["A. Vue 渐进式框架", "B. MySQL"])
  })

  it("单独选项标记保留在题干并警告", () => {
    const result = extractFields(block(["1. 请解释 A. 表示什么"]));
    expect(result.options).toEqual([])
    expect(result.stem).toContain("A. 表示什么")
    expect(result.diagnostic.warnings.some((warning) => warning.code === "uncertain_option")).toBe(true)
  })

  it("分离同行答案与解析", () => {
    const result = extractFields(block(["1. 选择正确项", "A. Vue B. MySQL", "答案：A 解析：Vue 是框架。"]));
    expect(result.answer).toBe("A")
    expect(result.explanation).toBe("Vue 是框架。")
  })

  it("保留跨段解析中的答案字样", () => {
    const result = extractFields(block(["1. 选择正确项", "A. Vue B. MySQL", "答案：A", "解析：第一段", "答案 A 在这里是选项说明"]));
    expect(result.explanation).toBe("第一段\n答案 A 在这里是选项说明")
  })

  it("不把普通题干末尾字母当成答案", () => {
    const result = extractFields(block(["1. 变量名称以字母 A"]));
    expect(result.answer).toBeNull()
    expect(result.stem).toContain("字母 A")
  })

  it("只在存在有效选项时采用红色答案", () => {
    expect(extractFields(block(["1. 选择", "A. Vue B. MySQL", { text: "A", isRed: true }])).answer).toBe("A")
    expect(extractFields(block(["1. 解释字母", { text: "A", isRed: true }])).answer).toBeNull()
  })

  it("从题干括号中提取与选项匹配的答案", () => {
    const result = extractFields(block(["1. 关于 DB、DBS、DBMS 三者关系正确的是( A )", "A. 第一项 B. 第二项 C. 第三项"]));
    expect(result.answer).toBe("A")
    expect(result.stem).toContain("正确的是( )")
  })

  it("不把题干中间的函数式括号识别为答案", () => {
    const result = extractFields(block(["1. 函数 F(A=4 或 A=8) 的闭包是什么", "A. 第一项 B. 第二项 C. 第三项"]));
    expect(result.answer).toBeNull()
    expect(result.stem).toContain("F(A=4 或 A=8) 的闭包")
  })

  it("将括号内文本答案补成缺失的末项选项", () => {
    const result = extractFields(block([
      "9. X 的结果可能是（A=4 或 A=8 或 A=16）。",
      "A. A=4 或 A=6 或 A=9 B. A=2 或 A=4 或 A=8 C. A=2 或 A=4 或 A=9",
    ]))
    expect(result.options).toEqual([
      "A. A=4 或 A=6 或 A=9",
      "B. A=2 或 A=4 或 A=8",
      "C. A=2 或 A=4 或 A=9",
      "D. A=4 或 A=8 或 A=16",
    ])
    expect(result.answer).toBe("D")
    expect(result.stem).toContain("结果可能是（ ）。")
  })

  it("提取无选项题的括号文本答案", () => {
    const result = extractFields(block(["4. 内模式/模式映像保证数据的（物理独立性）"]));
    expect(result.options).toEqual([])
    expect(result.answer).toBe("物理独立性")
    expect(result.stem).toContain("数据的（ ）")
  })

  it("无选项时不把字母组合文本答案当成选项编号", () => {
    const result = extractFields(block(["5. 关系模式的候选码是（CE）。"]));
    expect(result.answer).toBe("CE")
    expect(result.stem).toContain("候选码是（ ）。")
  })
})
