import { NextRequest, NextResponse } from "next/server"
import { getActiveProvider } from "@/lib/ai/queries"
import { testApiConnection } from "@/lib/ai/test"
import { handleApiError } from "@/lib/api-error"
import type { AiProvider } from "@/lib/ai/schema"

interface TestConfigBody {
  baseUrl?: string
  apiKey?: string
  model?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as TestConfigBody

    let provider = getActiveProvider()

    if (body.baseUrl || body.apiKey || body.model) {
      provider = {
        id: "test",
        name: "Test",
        baseUrl: body.baseUrl || provider?.baseUrl || "",
        apiKey: body.apiKey || provider?.apiKey || "",
        model: body.model || provider?.model || "",
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
