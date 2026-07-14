import { describe, expect, it } from "vitest"
import { createCodeRunClientKey, truncateText } from "../code-run"

describe("code-run helpers", () => {
  it("截断超过上限的文本", () => {
    expect(truncateText("abcdef", 4)).toBe("abcd\n...[输出已截断]")
    expect(truncateText("abc", 4)).toBe("abc")
    expect(truncateText(undefined, 4)).toBe("")
  })

  it("为会话生成稳定且不可逆的限流键", () => {
    const first = createCodeRunClientKey("session-token")
    const second = createCodeRunClientKey("session-token")

    expect(first).toBe(second)
    expect(first).not.toContain("session-token")
    expect(createCodeRunClientKey(undefined)).toBe("anonymous")
  })
})
