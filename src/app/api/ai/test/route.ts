import { NextRequest, NextResponse } from "next/server"
import { getActiveProvider } from "@/lib/ai/queries"
import { testApiConnection } from "@/lib/ai/test"
import { handleApiError } from "@/lib/api-error"
import type { AiProvider } from "@/lib/ai/schema"
import { z } from "zod"

const TestConfigSchema = z.object({
  baseUrl: z.string().url().optional(),
  apiKey: z.string().max(200).optional(),
  model: z.string().max(100).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const validated = TestConfigSchema.parse(body)

    let provider = getActiveProvider()

    if (validated.baseUrl || validated.apiKey || validated.model) {
      provider = {
        id: "test",
        name: "Test",
        baseUrl: validated.baseUrl || provider?.baseUrl || "",
        apiKey: validated.apiKey || provider?.apiKey || "",
        model: validated.model || provider?.model || "",
        maxTokens: 100,
        isActive: true,
      } satisfies AiProvider
    }

    if (!provider) {
      return NextResponse.json({ success: false, message: "未配置 AI 服务" })
    }

    const result = await testApiConnection(provider)
    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error)
  }
}
