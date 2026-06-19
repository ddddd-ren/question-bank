import { NextRequest, NextResponse } from "next/server"
import { getQuestions, getQuestionStats } from "@/lib/db/queries"
import { serializeQuestions } from "@/lib/db/serialize"
import { handleApiError } from "@/lib/api-error"
import { QuestionQuerySchema, validateQuery } from "@/lib/api-validate"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = validateQuery(QuestionQuerySchema, searchParams)

    if (query.stats) {
      const statsData = await getQuestionStats()
      return NextResponse.json(statsData)
    }

    const result = await getQuestions({
      type: query.type,
      categoryId: query.categoryId,
      subjectId: query.subjectId,
      knowledgePointId: query.knowledgePointId,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
      hasAnswer: query.hasAnswer,
      recentDays: query.recentDays,
    })

    return NextResponse.json({
      data: serializeQuestions(result.data),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(result.total / query.pageSize),
    }, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=15",
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
