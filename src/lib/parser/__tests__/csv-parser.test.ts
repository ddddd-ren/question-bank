import { describe, expect, it } from "vitest"
import { parseCsvQuestions } from "../csv-parser"

describe("parseCsvQuestions", () => {
  it("支持带逗号、引号和换行的字段", () => {
    const questions = parseCsvQuestions([
      "type,content,options,answer,explanation",
      'single,"问题，包含逗号和""引号""","A. 第一项|B. 第二项",A,"逐行解析\\n说明"',
    ].join("\n"))

    expect(questions).toHaveLength(1)
    expect(questions[0]).toMatchObject({
      type: "single",
      content: '问题，包含逗号和"引号"',
      options: ["A. 第一项", "B. 第二项"],
      answer: "A",
    })
  })

  it("保留合法的跨行题干", () => {
    const questions = parseCsvQuestions([
      "type,content,answer",
      'essay,"第一行题干\n第二行题干",答案',
    ].join("\n"))

    expect(questions[0].content).toBe("第一行题干\n第二行题干")
  })

  it("空文件和缺少题干时抛出明确错误", () => {
    expect(() => parseCsvQuestions("type,content\n")).toThrow("CSV 文件为空")
    expect(() => parseCsvQuestions("type,answer\nessay,答案")).toThrow("缺少题干")
  })
})
