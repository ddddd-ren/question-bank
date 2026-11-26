import { NextResponse } from "next/server"
import { getQuestionStats } from "@/lib/db/queries"
import { handleApiError } from "@/lib/api-error"
import { withSession } from "@/lib/auth-route"

export const dynamic = "force-dynamic"

export const GET = withSession(async function GET() {
  try {
    const stats = await getQuestionStats()

    return NextResponse.json({
      total: stats.total,
      byType: stats.byType,
      categoryCount: stats.categoryCount,
    }, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=30",
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
})
