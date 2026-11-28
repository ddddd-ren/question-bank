import { getDueReviewCount } from "@/lib/db/learning"
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
import { withSession } from "@/lib/auth-route"

export const dynamic = "force-dynamic"

export const GET = withSession(async function GET() {
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
      dueReviewCount: getDueReviewCount(),
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
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
})
