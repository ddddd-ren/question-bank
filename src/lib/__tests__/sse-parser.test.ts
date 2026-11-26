import { describe, expect, it } from "vitest"
import { consumeSseChunk } from "../sse-parser"

describe("consumeSseChunk", () => {
  it("可以拼接被网络 chunk 拆开的 SSE 事件", () => {
    let state = consumeSseChunk({ buffer: "", events: [] }, 'data: {"content":"部')
    state = consumeSseChunk(state, '分"}\n\ndata: [DONE]\n\n')

    expect(state.events).toEqual(['data: {"content":"部分"}', "data: [DONE]"])
    expect(state.buffer).toBe("")
  })

  it("保留尚未结束的事件", () => {
    const state = consumeSseChunk({ buffer: "", events: [] }, "data: partial")
    expect(state.events).toEqual([])
    expect(state.buffer).toBe("data: partial")
  })
})
