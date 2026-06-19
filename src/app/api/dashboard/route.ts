import { NextResponse } from "next/server"
import { getRecentActivity, getDailyStats, getPracticeStats, getQuestionStats, getWrongQuestionCount } from "@/lib/db/queries"
import { handleApiError } from "@/lib/api-error"

export async function GET() {
  try {
    const [practiceStats, questionStats, recentActivity, dailyStats, wrongCount] = await Promise.all([
      getPracticeStats(),
      getQuestionStats(),
      getRecentActivity(5),
      getDailyStats(7),
      getWrongQuestionCount(),
    ])

    return NextResponse.json({
      practice: practiceStats,
      questions: questionStats,
      recentActivity,
      dailyStats,
      wrongCount,
    })
  } catch (error) {
    return handleApiError(error)
  }
}