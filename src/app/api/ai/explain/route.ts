import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { getAiCache, setAiCache } from "@/lib/db/queries"
import { getActiveProvider } from "@/lib/ai/config"
import { z } from "zod"
import { withSession } from "@/lib/auth-route"
import { createAiCacheKey } from "@/lib/ai-cache-key"
import { createExplainPrompt } from "@/lib/ai/explain-prompt"

const ExplainRequestSchema = z.object({
  questionId: z.number().int().positive().optional(),
  question: z.string().min(1).max(10000),
  options: z.array(z.string().max(1000)).max(20).nullable().optional(),
  answer: z.string().max(5000).nullable().optional(),
  type: z.enum(["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]).optional(),
  mode: z.enum(["hint", "review"]).default("review"),
  hintLevel: z.number().int().min(1).max(3).default(1),
  userAnswer: z.string().max(5000).optional(),
})

export const POST = withSession(async function POST(request: NextRequest) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  try {
    const validated = ExplainRequestSchema.parse(await request.json())
    const { questionId } = validated
    const provider = getActiveProvider()
    if (!provider?.apiKey) return NextResponse.json({ error: "未配置AI服务或API Key，请在设置中配置" }, { status: 400 })
    const model = provider.model
    const cacheKey = createAiCacheKey({ ...validated, providerBaseUrl: provider.baseUrl, promptVersion: "v3", model })
    if (questionId) {
      const cached = await getAiCache(questionId, cacheKey)
      if (cached) return NextResponse.json({ response: cached.response, cached: true })
    }
    const prompt = createExplainPrompt(validated)
    const abort = new AbortController()
    const signal = AbortSignal.any([request.signal, abort.signal])
    timer = setTimeout(() => { timedOut = true; abort.abort() }, 60000)
    const openai = new OpenAI({ baseURL: provider.baseUrl, apiKey: provider.apiKey, timeout: 60000, maxRetries: 0 })
    const stream = await openai.chat.completions.create({
      model,
      messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
      stream: true, max_tokens: provider.maxTokens || 2000,
    }, { signal })
    const encoder = new TextEncoder()
    let closed = false
    const readable = new ReadableStream({
      async start(controller) {
        const send = (value: unknown) => {
          if (!closed && !request.signal.aborted) controller.enqueue(encoder.encode(`data: ${typeof value === "string" ? value : JSON.stringify(value)}\n\n`))
        }
        let fullResponse = ""
        try {
          for await (const chunk of stream) {
            if (signal.aborted || closed) break
            const content = chunk.choices[0]?.delta?.content || ""
            if (content) { fullResponse += content; send({ content }) }
          }
          if (signal.aborted) {
            if (timedOut) send({ error: "AI请求超过60秒，请重试" })
          } else {
            if (questionId && fullResponse && !closed) await setAiCache(questionId, model, cacheKey, fullResponse)
            send("[DONE]")
          }
        } catch {
          send({ error: timedOut ? "AI请求超过60秒，请重试" : "AI响应中断，请重试" })
        } finally {
          clearTimeout(timer)
          if (!closed) { closed = true; controller.close() }
        }
      },
      cancel() { closed = true; clearTimeout(timer); abort.abort() },
    })
    return new Response(readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } })
  } catch (error) {
    clearTimeout(timer)
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "请求参数无效，请检查题目、提示层级与选项" }, { status: 400 })
    return NextResponse.json({ error: timedOut ? "AI请求超过60秒，请重试" : request.signal.aborted ? "请求已取消" : "AI服务请求失败，请检查配置或稍后重试" }, { status: timedOut ? 504 : request.signal.aborted ? 499 : 502 })
  }
})
