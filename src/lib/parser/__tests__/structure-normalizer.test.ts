import { describe, expect, it } from "vitest"
import { normalizeParagraphs } from "../structure-normalizer"
import type { StructuredParagraph } from "../recognition-types"

function paragraph(text: string, sourceIndex: number, sourceKind: StructuredParagraph["sourceKind"] = "paragraph"): StructuredParagraph {
  return { text, sourceIndex, sourceKind, styleHints: {} }
}

describe("normalizeParagraphs", () => {
  it("规范化全角结构符号、不可见字符和连续空白", () => {
    expect(normalizeParagraphs([paragraph("Ａ．  React\u200b  框架", 0, "pdf-line")])).toEqual([
      paragraph("A. React 框架", 0, "pdf-line"),
    ])
  })

  it("删除 PDF 页码但保留普通数字正文", () => {
    expect(normalizeParagraphs([
      paragraph("第 3 页", 0, "pdf-line"),
      paragraph("3 / 12", 1, "pdf-line"),
      paragraph("2024 年有 12 个月", 2, "pdf-line"),
    ])).toEqual([paragraph("2024 年有 12 个月", 2, "pdf-line")])
  })

  it("只删除相邻且完全相同的 PPT 段落", () => {
    expect(normalizeParagraphs([
      paragraph("题目内容", 0, "slide"),
      paragraph("题目内容", 1, "slide"),
      paragraph("其他内容", 2, "slide"),
      paragraph("题目内容", 3, "slide"),
    ]).map((item) => item.text)).toEqual(["题目内容", "其他内容", "题目内容"])
  })
})
