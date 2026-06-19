"use client"

import { useState, useCallback } from "react"

interface UseAiStreamOptions {
  questionId?: number
  question: string
  options?: string[] | null
  answer?: string | null
  type: string
  mode?: string
  userAnswer?: string
}

export function useAiStream() {
  const [response, setResponse] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startStream = useCallback(async (opts: UseAiStreamOptions) => {
    setLoading(true)
    setResponse("")
    setError(null)

    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      })

      if (!res.ok) throw new Error("请求失败")

      // 检查是否是SSE流式响应
      const contentType = res.headers.get("content-type") || ""
      if (contentType.includes("text/event-stream")) {
        // SSE流式解析
        const reader = res.body?.getReader()
        if (!reader) return

        const decoder = new TextDecoder()
        let fullResponse = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split("\n")

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6)
              if (data === "[DONE]") break

              try {
                const parsed = JSON.parse(data)
                if (parsed.content) {
                  fullResponse += parsed.content
                  setResponse(fullResponse)
                }
              } catch {
                // 忽略解析错误
              }
            }
          }
        }
      } else {
        // 普通JSON响应（缓存命中）
        const data = await res.json()
        if (data.response) {
          setResponse(data.response)
        } else if (data.error) {
          throw new Error(data.error)
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI解答请求失败"
      setError(msg)
      setResponse(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResponse("")
    setError(null)
  }, [])

  return { response, loading, error, startStream, reset }
}
