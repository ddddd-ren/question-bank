import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { getAiCache, setAiCache } from "@/lib/db/queries"
import { getActiveProvider } from "@/lib/ai/config"
import { getErrorMessage } from "@/lib/utils"
import { z } from "zod"

const ExplainRequestSchema = z.object({
  questionId: z.number().int().positive().optional(),
  question: z.string().min(1).max(10000),
  options: z.array(z.string().max(1000)).max(20).optional(),
  answer: z.string().max(5000).nullable().optional(),
  type: z.enum(["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]).optional(),
  mode: z.enum(["review"]).optional(),
  userAnswer: z.string().max(5000).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = ExplainRequestSchema.parse(body)
    const { questionId, question: questionText, options, answer, type, mode, userAnswer } = validated

    const provider = getActiveProvider()
    if (!provider) {
      return NextResponse.json({ error: "未配置AI服务，请在设置中配置" }, { status: 400 })
    }

    if (!provider.apiKey) {
      return NextResponse.json({ error: "API Key 未配置" }, { status: 400 })
    }

    const model = provider.model

    if (questionId) {
      const cached = await getAiCache(questionId, model)
      if (cached) {
        return NextResponse.json({ response: cached.response, cached: true })
      }
    }

    let systemPrompt = "你是一个专业的教育辅导助手。请清晰、准确地解答题目，并给出详细的解题思路。"

    if (mode === "review") {
      systemPrompt = "你是一个专业的学习复盘助手。用户答错了这道题，请分析错误原因、归纳关键知识点、并给出同类题的学习方向。请用简洁的中文回答。"
    }
    let userPrompt = ""

    switch (type) {
      case "single":
      case "multiple":
        systemPrompt += "这是选择题，请分析每个选项的正确性。"
        userPrompt = `题目：${questionText}\n选项：${options?.join("\n") || "无"}\n${answer ? `参考答案：${answer}` : ""}\n请详细解答：`
        break
      case "truefalse":
        systemPrompt += "这是判断题，请说明判断的理由。"
        userPrompt = `题目：${questionText}\n${answer ? `参考答案：${answer}` : ""}\n请详细解答：`
        break
      case "fill":
        systemPrompt += "这是填空题，请说明答案的推导过程。"
        userPrompt = `题目：${questionText}\n${answer ? `参考答案：${answer}` : ""}\n请详细解答：`
        break
      case "code":
        systemPrompt += "这是编程题，请给出详细的代码实现和解题思路，代码请使用代码块格式。"
        userPrompt = `题目：${questionText}\n${answer ? `参考答案：${answer}` : ""}\n请提供完整代码实现和详细解释：`
        break
      case "calculation":
      case "essay":
        systemPrompt += "这是计算/论述题，请给出完整的解答过程。"
        userPrompt = `题目：${questionText}\n${answer ? `参考答案：${answer}` : ""}\n请详细解答：`
        break
      default:
        userPrompt = mode === "review"
          ? `题目：${questionText}\n${answer ? `正确答案：${answer}` : ""}\n${userAnswer ? `用户的错误答案：${userAnswer}` : ""}\n请分析：\n1. 错误原因\n2. 关键知识点\n3. 同类题学习方向`
          : `题目：${questionText}\n请详细解答：`
    }

    const openai = new OpenAI({
      baseURL: provider.baseUrl,
      apiKey: provider.apiKey,
    })

    const stream = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: true,
      max_tokens: provider.maxTokens || 2000,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        let fullResponse = ""
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || ""
            if (content) {
              fullResponse += content
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
            }
          }

          if (questionId && fullResponse) {
            await setAiCache(questionId, model, fullResponse)
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        } catch (error: unknown) {
          const errorMsg = getErrorMessage(error, "Stream error")
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  } catch (error: unknown) {
    console.error("AI explain error:", error)
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to generate explanation") },
      { status: 500 }
    )
  }
}
