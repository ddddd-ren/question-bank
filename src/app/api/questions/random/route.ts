import { NextRequest, NextResponse } from "next/server"
import { getRandomQuestions } from "@/lib/db/queries"
import { serializeQuestions } from "@/lib/db/serialize"
import { handleApiError } from "@/lib/api-error"
import { z } from "zod"
import { withSession } from "@/lib/auth-route"

const RandomQuerySchema = z.object({
  type: z.string().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  knowledgePointId: z.coerce.number().int().positive().optional(),
  count: z.coerce.number().int().min(1).max(100).optional().default(10),
})

export const GET = withSession(async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = RandomQuerySchema.parse(Object.fromEntries(searchParams.entries()))

    const questions = await getRandomQuestions({
      type: query.type,
      categoryId: query.categoryId,
      subjectId: query.subjectId,
      knowledgePointId: query.knowledgePointId,
      count: query.count,
    })

    return NextResponse.json({
      data: serializeQuestions(questions),
      count: questions.length,
    }, {
      headers: {
        "Cache-Control": "private, no-cache",
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
})
