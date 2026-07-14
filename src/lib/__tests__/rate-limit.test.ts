import { beforeEach, describe, expect, it } from "vitest"
import { consumeRateLimit, resetRateLimits } from "../rate-limit"

describe("consumeRateLimit", () => {
  beforeEach(() => {
    resetRateLimits()
  })

  it("在固定窗口内限制请求次数", () => {
    const options = { limit: 10, windowMs: 60_000 }

    for (let index = 0; index < 10; index += 1) {
      const result = consumeRateLimit("client-a", options, 1_000)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9 - index)
    }

    expect(consumeRateLimit("client-a", options, 1_000)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    })
  })

  it("窗口过期后重新允许请求", () => {
    const options = { limit: 1, windowMs: 60_000 }

    expect(consumeRateLimit("client-a", options, 1_000).allowed).toBe(true)
    expect(consumeRateLimit("client-a", options, 2_000).allowed).toBe(false)
    expect(consumeRateLimit("client-a", options, 61_000)).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0,
    })
  })

  it("不同客户端使用独立窗口", () => {
    const options = { limit: 1, windowMs: 60_000 }

    expect(consumeRateLimit("client-a", options, 1_000).allowed).toBe(true)
    expect(consumeRateLimit("client-b", options, 1_000).allowed).toBe(true)
  })
})
