import { afterEach, describe, expect, it } from "vitest"
import { NextRequest, NextResponse } from "next/server"
import { AUTH_COOKIE_NAME, createSessionToken } from "../auth"
import { withSession } from "../auth-route"

describe("withSession", () => {
  const originalToken = process.env.APP_ACCESS_TOKEN

  afterEach(() => {
    if (originalToken === undefined) delete process.env.APP_ACCESS_TOKEN
    else process.env.APP_ACCESS_TOKEN = originalToken
  })

  it("无有效会话时返回 401 且不执行处理器", async () => {
    process.env.APP_ACCESS_TOKEN = "auth-route-test-token"
    let called = false
    const handler = withSession(async (_request: NextRequest) => {
      void _request
      called = true
      return NextResponse.json({ ok: true })
    })

    const response = await handler(new NextRequest("http://localhost/api/private"))

    expect(response.status).toBe(401)
    expect(called).toBe(false)
  })

  it("有效会话可以执行处理器", async () => {
    process.env.APP_ACCESS_TOKEN = "auth-route-test-token"
    const handler = withSession(async (_request: NextRequest) => {
      void _request
      return NextResponse.json({ ok: true })
    })
    const request = new NextRequest("http://localhost/api/private")
    request.cookies.set(AUTH_COOKIE_NAME, createSessionToken()!)

    const response = await handler(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })
})
