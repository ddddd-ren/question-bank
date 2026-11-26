import { describe, expect, it } from "vitest"
import { createAiCacheKey } from "../ai-cache-key"

const baseInput = {
  providerBaseUrl: "https://api.example.com/v1",
  model: "model-a",
  question: "题目内容",
  options: ["A. 一", "B. 二"],
  answer: "A",
  type: "single",
}

describe("createAiCacheKey", () => {
  it("相同提示输入产生稳定键", () => {
    expect(createAiCacheKey(baseInput)).toBe(createAiCacheKey({ ...baseInput }))
  })

  it("模式、用户答案或模型配置变化时不会复用旧响应", () => {
    const normal = createAiCacheKey(baseInput)
    expect(createAiCacheKey({ ...baseInput, mode: "review", userAnswer: "B" })).not.toBe(normal)
    expect(createAiCacheKey({ ...baseInput, userAnswer: "A" })).not.toBe(normal)
    expect(createAiCacheKey({ ...baseInput, model: "model-b" })).not.toBe(normal)
  })
  it("分层提示隔离缓存，默认层级等于第一层", () => {
    const first = createAiCacheKey({ ...baseInput, mode: "hint" })
    expect(first).toBe(createAiCacheKey({ ...baseInput, mode: "hint", hintLevel: 1 }))
    expect(first).not.toBe(createAiCacheKey({ ...baseInput, mode: "hint", hintLevel: 2 }))
    expect(first).not.toBe(createAiCacheKey({ ...baseInput, mode: "hint", hintLevel: 3 }))
  })
})
