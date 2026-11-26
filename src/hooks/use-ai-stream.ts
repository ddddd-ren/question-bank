"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { consumeSseChunk } from "@/lib/sse-parser"

interface UseAiStreamOptions {
  questionId?: number
  question: string
  options?: string[] | null
  answer?: string | null
  type: string
  mode?: "hint" | "review"
  hintLevel?: number
  userAnswer?: string
}

export function useAiStream() {
  const [response, setResponse] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    const previous = active.current
    active.current = null
    previous?.abort()
    setLoading(false)
    setResponse("")
  }, [])
  useEffect(() => () => { active.current?.abort(); active.current = null }, [])

  const startStream = useCallback(async (opts: UseAiStreamOptions) => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    const current = () => active.current === controller && !controller.signal.aborted
    setLoading(true)
    setResponse("")
    setError(null)
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts), signal: controller.signal,
      })
      if (!current()) return
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "AI请求失败")
      }
      if ((res.headers.get("content-type") || "").includes("text/event-stream")) {
        reader = res.body?.getReader()
        if (!reader) throw new Error("AI响应为空")
        const decoder = new TextDecoder()
        let fullResponse = ""
        let completed = false
        let state = { buffer: "", events: [] as string[] }
        const processEvents = (events: string[]) => {
          for (const event of events) {
            const data = event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n")
            if (!data) continue
            if (data === "[DONE]") { completed = true; continue }
            const parsed = JSON.parse(data)
            if (parsed.error) throw new Error(String(parsed.error))
            if (typeof parsed.content === "string") { fullResponse += parsed.content; if (current()) setResponse(fullResponse) }
          }
        }
        while (current() && !completed) {
          const { done, value } = await reader.read()
          if (done) break
          state = consumeSseChunk(state, decoder.decode(value, { stream: true }))
          processEvents(state.events)
          state = { buffer: state.buffer, events: [] }
        }
        if (!current()) return
        state = consumeSseChunk(state, decoder.decode() + "\n\n")
        processEvents(state.events)
        if (!completed) throw new Error("AI响应未完成，请重试")
      } else {
        const data = await res.json()
        if (data.error) throw new Error(String(data.error))
        if (typeof data.response !== "string") throw new Error("AI响应为空")
        if (current()) setResponse(data.response)
      }
    } catch (err) {
      if (current()) { setError(err instanceof Error ? err.message : "AI请求失败"); setResponse("") }
    } finally {
      await reader?.cancel().catch(() => {})
      if (current()) { setLoading(false); active.current = null }
    }
  }, [])

  const reset = useCallback(() => { cancel(); setError(null) }, [cancel])
  return { response, loading, error, startStream, reset, cancel }
}
