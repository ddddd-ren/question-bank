import { NextResponse } from "next/server"
import { 
  getRecentActivity, 
  getDailyStats, 
  getPracticeStats, 
  getQuestionStats, 
  getWrongQuestionCount,
  getSubjectStats,
  getDifficultyStats,
  getPracticeTrend
} from "@/lib/db/queries"
import { handleApiError } from "@/lib/api-error"

export const revalidate = 60

export async function GET() {
  try {
    const [practiceStats, questionStats, recentActivity, dailyStats, wrongCount, subjectStats, difficultyStats, practiceTrend] = await Promise.all([
      getPracticeStats(),
      getQuestionStats(),
      getRecentActivity(5),
      getDailyStats(7),
      getWrongQuestionCount(),
      getSubjectStats(),
      getDifficultyStats(),
      getPracticeTrend(30),
    ])

    return NextResponse.json({
      practice: practiceStats,
      questions: questionStats,
      recentActivity,
      dailyStats,
      wrongCount,
      subjectStats,
      difficultyStats,
      practiceTrend,
    }, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=30",
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
