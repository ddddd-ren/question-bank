import { NextResponse } from "next/server"
import { 
  getQuestionStats,
  getSubjectStats,
  getDifficultyStats,
  getKnowledgePointStats
} from "@/lib/db/queries"
import { handleApiError } from "@/lib/api-error"
import { withSession } from "@/lib/auth-route"

export const dynamic = "force-dynamic"

export const GET = withSession(async function GET() {
  try {
    const [questionStats, subjectStats, difficultyStats, knowledgePointStats] = await Promise.all([
      getQuestionStats(),
      getSubjectStats(),
      getDifficultyStats(),
      getKnowledgePointStats(),
    ])

    return NextResponse.json({
      questions: questionStats,
      subjects: subjectStats,
      difficulty: difficultyStats,
      knowledgePoints: knowledgePointStats,
    }, {
      headers: {
        "Cache-Control": "private, max-age=120, stale-while-revalidate=60",
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
})
