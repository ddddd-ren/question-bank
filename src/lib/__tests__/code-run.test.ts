import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { GET, POST } from "@/app/api/code/run/route"
import { AUTH_COOKIE_NAME, createSessionToken } from "../auth"
import { createCodeRunClientKey, truncateText } from "../code-run"
import { resetRateLimits } from "../rate-limit"

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

describe("编程题运行配置", () => {
  function request(method: "GET" | "POST") {
    vi.stubEnv("APP_ACCESS_TOKEN", "code-run-test-session")
    const request = new NextRequest("http://localhost/api/code/run", {
      method,
      ...(method === "POST" && { body: JSON.stringify({ code: "print(1)", language: "python" }) }),
    })
    request.cookies.set(AUTH_COOKIE_NAME, createSessionToken()!)
    return request
  }

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    resetRateLimits()
  })

  it("未配置沙箱时显示为停用，提交运行不会发出外部请求", async () => {
    vi.stubEnv("PISTON_EXECUTE_URL", "")
    const send = vi.fn()
    vi.stubGlobal("fetch", send)
    expect(await (await GET(request("GET"))).json()).toMatchObject({ enabled: false })
    expect((await POST(request("POST"))).status).toBe(503)
    expect(send).not.toHaveBeenCalled()
  })

  it("已配置时只请求指定沙箱，访问凭据留在服务端", async () => {
    const endpoint = "http://sandbox.example.test/api/v2/execute"
    const token = "audit-fixture"
    vi.stubEnv("PISTON_EXECUTE_URL", endpoint)
    vi.stubEnv("PISTON_API_TOKEN", token)
    const send = vi.fn().mockImplementation(async () => Response.json({
      language: "python", version: "3.10.0", run: { stdout: "1\n" },
    }))
    vi.stubGlobal("fetch", send)
    const capability = await (await GET(request("GET"))).json()
    expect(capability).toMatchObject({ enabled: true })
    expect(JSON.stringify(capability)).not.toContain(token)
    expect(JSON.stringify(capability)).not.toContain(endpoint)
    expect(await (await POST(request("POST"))).json()).toMatchObject({ stdout: "1\n", success: true })
    expect(send).toHaveBeenCalledExactlyOnceWith(endpoint, expect.objectContaining({
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      redirect: "error",
    }))
  })
})
