import { afterEach, describe, expect, it } from "vitest"
import { createSessionToken, isAccessTokenValid, isPublicPath, isSessionTokenValid } from "../auth"

describe("auth", () => {
  const originalToken = process.env.APP_ACCESS_TOKEN

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.APP_ACCESS_TOKEN
    } else {
      process.env.APP_ACCESS_TOKEN = originalToken
    }
  })

  it("接受配置的访问令牌", () => {
    process.env.APP_ACCESS_TOKEN = "test-secret"
    expect(isAccessTokenValid("test-secret")).toBe(true)
  })

  it("拒绝缺失、错误和长度不同的访问令牌", () => {
    process.env.APP_ACCESS_TOKEN = "test-secret"
    expect(isAccessTokenValid(undefined)).toBe(false)
    expect(isAccessTokenValid("wrong")).toBe(false)
    expect(isAccessTokenValid("test-secrex")).toBe(false)
  })

  it("使用派生摘要作为会话令牌", () => {
    process.env.APP_ACCESS_TOKEN = "test-secret"
    const sessionToken = createSessionToken()

    expect(sessionToken).toMatch(/^[a-f0-9]{64}$/)
    expect(sessionToken).not.toContain("test-secret")
    expect(isSessionTokenValid(sessionToken)).toBe(true)
    expect(isSessionTokenValid("invalid-session")).toBe(false)
  })

  it("未配置访问令牌时拒绝创建或验证会话", () => {
    delete process.env.APP_ACCESS_TOKEN
    expect(createSessionToken()).toBeUndefined()
    expect(isSessionTokenValid(undefined)).toBe(false)
  })

  it("只放行登录入口和静态资源", () => {
    expect(isPublicPath("/login")).toBe(true)
    expect(isPublicPath("/api/auth/login")).toBe(true)
    expect(isPublicPath("/_next/static/app.js")).toBe(true)
    expect(isPublicPath("/icon.png")).toBe(true)
    expect(isPublicPath("/api/dashboard")).toBe(false)
    expect(isPublicPath("/settings")).toBe(false)
  })
})
