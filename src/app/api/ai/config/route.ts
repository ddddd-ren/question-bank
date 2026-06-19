import { NextRequest, NextResponse } from "next/server"
import { getAllProviders, updateProvider, activateProvider } from "@/lib/ai/queries"
import { handleApiError } from "@/lib/api-error"
import { ApiError } from "@/lib/api-error"
import { z } from "zod"

const ProviderUpdateSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["activate"]).optional(),
  name: z.string().max(100).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().max(200).optional(),
  model: z.string().max(100).optional(),
  maxTokens: z.number().int().min(100).max(100000).optional(),
})

export async function GET() {
  try {
    const providers = getAllProviders()
    const safeProviders = providers.map(p => ({
      ...p,
      apiKey: p.apiKey ? `${p.apiKey.substring(0, 4)}****${p.apiKey.substring(p.apiKey.length - 4)}` : "",
      hasApiKey: !!p.apiKey,
    }))
    return NextResponse.json(safeProviders)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = ProviderUpdateSchema.parse(body)
    const { id, action, ...data } = validated

    if (action === "activate") {
      const success = activateProvider(id)
      if (!success) {
        throw new ApiError(400, "激活失败")
      }
      return NextResponse.json({ success: true })
    }

    const success = updateProvider(id, data)
    if (!success) {
      throw new ApiError(400, "更新失败")
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
