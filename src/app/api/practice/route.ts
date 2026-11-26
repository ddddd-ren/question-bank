import { NextRequest, NextResponse } from "next/server"
import { getRandomQuestions, getPracticeStats } from "@/lib/db/queries"
import { serializeQuestions } from "@/lib/db/serialize"
import { ApiError, handleApiError } from "@/lib/api-error"
import { PracticeSubmitSchema, parseBoundedInteger, parseOptionalNumber, parseOptionalString, validateBody } from "@/lib/api-validate"
import { getReviewQuestions, saveLearningRecord } from "@/lib/db/learning"
import { z } from "zod"
import { withSession } from "@/lib/auth-route"

export const GET = withSession(async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = parseOptionalString(searchParams.get("type"))
    const categoryId = parseOptionalNumber(searchParams.get("categoryId"))
    const subjectId = parseOptionalNumber(searchParams.get("subjectId"))
    const knowledgePointId = parseOptionalNumber(searchParams.get("knowledgePointId"))
    const difficulty = searchParams.has("difficulty") ? parseBoundedInteger(searchParams.get("difficulty"), { defaultValue: 1, min: 1, max: 5 }) : undefined
    const unansweredFirst = searchParams.get("unansweredFirst") === "true"
    const count = parseBoundedInteger(searchParams.get("count"), { defaultValue: 10, min: 1, max: 100 })
    const stats = searchParams.get("stats") === "true"
    const mode = searchParams.get("mode")

    if (stats) {
      const statsData = await getPracticeStats()
      return NextResponse.json(statsData)
    }

    if (mode === "mistakes" || mode === "due") {
      const questions = getReviewQuestions({ type, subjectId, knowledgePointId, difficulty, count, mode })
      return NextResponse.json({
        data: serializeQuestions(questions),
        mode,
      }, {
        headers: {
          "Cache-Control": "private, no-cache",
        },
      })
    }

    const questions = await getRandomQuestions({ type, categoryId, subjectId, knowledgePointId, difficulty, unansweredFirst, count })

    return NextResponse.json({
      data: serializeQuestions(questions),
    }, {
      headers: {
        "Cache-Control": "private, max-age=10, stale-while-revalidate=5",
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
})

export const POST = withSession(async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = validateBody(PracticeSubmitSchema.extend({
      attemptKey: z.string().min(1).max(200),
      selfAssessment: z.boolean().optional(),
    }), body)
    if (!validated.attemptKey.startsWith("practice:")) throw new ApiError(400, "答题标识无效")
    const record = saveLearningRecord(validated)
    return NextResponse.json(record)
  } catch (error) {
    return handleApiError(error)
  }
})
