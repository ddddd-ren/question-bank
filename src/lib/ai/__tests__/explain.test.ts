import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ create: vi.fn(), construct: vi.fn(), cache: vi.fn(), save: vi.fn(), provider: vi.fn() }))
vi.mock("@/lib/auth-route", () => ({ withSession: (handler: unknown) => handler }))
vi.mock("@/lib/db/queries", () => ({ getAiCache: mocks.cache, setAiCache: mocks.save }))
vi.mock("@/lib/ai/config", () => ({ getActiveProvider: mocks.provider }))
vi.mock("openai", () => ({ default: class { constructor(options: unknown) { mocks.construct(options) } chat = { completions: { create: mocks.create } } } }))
import { POST } from "@/app/api/ai/explain/route"
beforeEach(() => {
  vi.clearAllMocks()
  mocks.provider.mockReturnValue({ apiKey: "test-secret", baseUrl: "https://example.invalid/v1", model: "test-only", maxTokens: 100 })
  mocks.create.mockResolvedValue((async function* () { yield { choices: [{ delta: { content: "提示" } }] } })())
})
afterEach(() => vi.useRealTimers())
it("接受null选项和分层提示，参考答案不传入上游且禁用重试", async () => {
  const response = await POST(new NextRequest("http://localhost/api/ai/explain", { method: "POST", body: JSON.stringify({ question: "测试题", options: null, answer: "不应出现在提示请求中的答案", mode: "hint", hintLevel: 2 }) }))
  expect(response.status).toBe(200)
  expect(await response.text()).toContain("提示")
  expect(JSON.stringify(mocks.create.mock.calls[0][0].messages)).not.toContain("不应出现在提示请求中的答案")
  expect(mocks.construct).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0, timeout: 60000 }))
  expect(mocks.create.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
})
it("参数错误返回400且不调用模型", async () => {
  const response = await POST(new NextRequest("http://localhost/api/ai/explain", { method: "POST", body: JSON.stringify({ question: "测试", mode: "hint", hintLevel: 4 }) }))
  expect(response.status).toBe(400)
  expect(mocks.create).not.toHaveBeenCalled()
})
it("流错误脱敏且不缓存部分回答", async () => {
  mocks.create.mockResolvedValue((async function* () { yield { choices: [{ delta: { content: "部分" } }] }; throw new Error("test-secret") })())
  const response = await POST(new NextRequest("http://localhost/api/ai/explain", { method: "POST", body: JSON.stringify({ question: "测试", questionId: 1 }) }))
  const text = await response.text()
  expect(text).toContain('"error"')
  expect(text).not.toContain("test-secret")
  expect(mocks.save).not.toHaveBeenCalled()
})
it("取消响应会中断上游，关闭后的流不会再次写入", async () => {
  mocks.create.mockImplementation(async (_input, { signal }: { signal: AbortSignal }) => (async function* () {
    yield { choices: [{ delta: { content: "片段" } }] }
    await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("abort")), { once: true }))
  })())
  const response = await POST(new NextRequest("http://localhost/api/ai/explain", { method: "POST", body: JSON.stringify({ question: "测试" }) }))
  await response.body!.cancel()
  expect(mocks.create.mock.calls[0][1].signal.aborted).toBe(true)
  expect(mocks.save).not.toHaveBeenCalled()
})
it("60秒为总时限，中断等待中的上游并返回504", async () => {
  vi.useFakeTimers()
  mocks.create.mockImplementation((_input, { signal }: { signal: AbortSignal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("abort")), { once: true })))
  const pending = POST(new NextRequest("http://localhost/api/ai/explain", { method: "POST", body: JSON.stringify({ question: "测试" }) }))
  await vi.advanceTimersByTimeAsync(60001)
  const response = await pending
  expect(response.status).toBe(504)
  expect(mocks.create.mock.calls[0][1].signal.aborted).toBe(true)
})
