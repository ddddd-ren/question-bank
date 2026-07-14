import { describe, expect, it } from "vitest"
import type { AiProvider } from "../schema"
import { toSafeProvider } from "../config-response"

function createProvider(apiKey: string): AiProvider {
  return {
    id: "custom",
    name: "自定义",
    baseUrl: "https://example.com/v1",
    apiKey,
    model: "test-model",
    maxTokens: 2000,
    isActive: true,
  }
}

describe("toSafeProvider", () => {
  it.each(["short", "sk-1234567890abcdef", ""])("不返回密钥内容 %#", (apiKey) => {
    const result = toSafeProvider(createProvider(apiKey))

    expect(result).not.toHaveProperty("apiKey")
    expect(result.hasApiKey).toBe(apiKey.length > 0)
    if (apiKey) expect(JSON.stringify(result)).not.toContain(apiKey)
  })

  it("只返回公开字段", () => {
    expect(toSafeProvider(createProvider("secret"))).toEqual({
      id: "custom",
      name: "自定义",
      baseUrl: "https://example.com/v1",
      model: "test-model",
      maxTokens: 2000,
      isActive: true,
      hasApiKey: true,
    })
  })
})
