import { NextResponse } from "next/server"
import { 
  getPracticeStats,
  getDailyStats,
  getPracticeTrend,
  getWrongQuestionCount
} from "@/lib/db/queries"
import { handleApiError } from "@/lib/api-error"
import { z } from "zod"

const StatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = StatsQuerySchema.parse(Object.fromEntries(searchParams.entries()))

    const [practiceStats, dailyStats, practiceTrend, wrongCount] = await Promise.all([
      getPracticeStats(),
      getDailyStats(7),
      getPracticeTrend(query.days),
      getWrongQuestionCount(),
    ])

    return NextResponse.json({
      practice: practiceStats,
      dailyStats,
      practiceTrend,
      wrongCount,
    }, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=30",
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
