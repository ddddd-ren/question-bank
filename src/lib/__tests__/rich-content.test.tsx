import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { RichContent } from "@/components/rich-content"

describe("题目富文本", () => {
  it("显示公式、图片与原有换行", () => {
    const html = renderToStaticMarkup(createElement(RichContent, { content: "第一行\n第二行\n\n$x^2$\n\n![示意图](https://example.com/diagram.png)" }))
    expect(html).toContain("第一行\n第二行")
    expect(html).toContain('class="katex"')
    expect(html).toContain('alt="示意图"')
    expect(html).toContain('referrerPolicy="no-referrer"')
  })

  it("不执行原始 HTML 或危险链接", () => {
    const html = renderToStaticMarkup(createElement(RichContent, { content: '<script>alert(1)</script>\n\n[危险](javascript:alert(1))' }))
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("javascript:")
  })
})
