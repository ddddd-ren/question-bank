import { NextRequest, NextResponse } from "next/server"
import { getAllProviders, updateProvider, activateProvider } from "@/lib/ai/queries"
import { handleApiError } from "@/lib/api-error"

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
    const { id, action, ...data } = body

    if (!id) {
      return NextResponse.json({ error: "缺少provider ID" }, { status: 400 })
    }

    if (action === "activate") {
      const success = activateProvider(id)
      if (!success) {
        return NextResponse.json({ error: "激活失败" }, { status: 400 })
      }
      return NextResponse.json({ success: true })
    }

    const success = updateProvider(id, data)
    if (!success) {
      return NextResponse.json({ error: "更新失败" }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
