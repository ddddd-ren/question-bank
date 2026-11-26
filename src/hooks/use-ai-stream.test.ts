import { afterEach, beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({ values: [] as unknown[], cleanups: [] as (() => void)[] }))
vi.mock("react", () => ({
  useState: (initial: unknown) => { const index = state.values.push(initial) - 1; return [initial, (value: unknown) => { state.values[index] = value }] },
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => () => void) => { state.cleanups.push(effect()) },
}))
import { useAiStream } from "./use-ai-stream"
const opts = { question: "题目", type: "single" }
beforeEach(() => { state.values = []; state.cleanups = [] })
afterEach(() => { state.cleanups.forEach(cleanup => cleanup()); vi.unstubAllGlobals() })

it("新请求取消旧请求，迟到的旧响应不覆盖新回答", async () => {
  const resolvers: ((response: Response) => void)[] = []
  const signals: AbortSignal[] = []
  vi.stubGlobal("fetch", vi.fn((_url, init) => { signals.push(init.signal); return new Promise(resolve => resolvers.push(resolve)) }))
  const hook = useAiStream()
  const first = hook.startStream(opts)
  const second = hook.startStream(opts)
  expect(signals[0].aborted).toBe(true)
  resolvers[1](Response.json({ response: "新回答" })); await second
  resolvers[0](Response.json({ response: "旧回答" })); await first
  expect(state.values).toEqual(["新回答", false, null])
})
it("流错误独立显示且清空不完整答案", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('data: {"content":"部分答案"}\n\ndata: {"error":"上游中断"}\n\n', { headers: { "Content-Type": "text/event-stream" } })))
  await useAiStream().startStream(opts)
  expect(state.values).toEqual(["", false, "上游中断"])
})
it("reset与卸载取消进行中的请求，之后响应不写入状态", async () => {
  let resolve!: (response: Response) => void
  let signal!: AbortSignal
  vi.stubGlobal("fetch", vi.fn((_url, init) => { signal = init.signal; return new Promise(done => { resolve = done }) }))
  const hook = useAiStream()
  const pending = hook.startStream(opts)
  hook.reset()
  expect(signal.aborted).toBe(true)
  resolve(Response.json({ response: "应忽略" })); await pending
  expect(state.values).toEqual(["", false, null])
  const next = hook.startStream(opts)
  state.cleanups[0]()
  expect(signal.aborted).toBe(true)
  resolve(Response.json({ response: "卸载后" })); await next
  expect(state.values[0]).toBe("")
})
