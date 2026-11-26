import { describe, expect, it } from "vitest"
import { getParserKind } from "../loader"

describe("getParserKind", () => {
  it.each([
    ["questions.json", "json"],
    ["questions.csv", "csv"],
    ["questions.docx", "word"],
    ["questions.PDF", "pdf"],
    ["slides.ppt", "powerpoint"],
    ["slides.pptx", "powerpoint"],
    ["slides.pptm", "powerpoint"],
  ])("识别 %s", (fileName, expected) => {
    expect(getParserKind(fileName)).toBe(expected)
  })

  it("拒绝不支持的格式", () => {
    expect(() => getParserKind("notes.txt")).toThrow("不支持的文件格式")
  })
})
