import { NextRequest, NextResponse } from "next/server"
import { getMistakes } from "@/lib/db/queries"
import { parseJsonArray } from "@/lib/db/serialize"
import { handleApiError } from "@/lib/api-error"
import { parsePagination } from "@/lib/api-validate"
import { setLearningStatus } from "@/lib/db/learning"
import { z } from "zod"
import { withSession } from "@/lib/auth-route"

const DeleteRequestSchema = z.object({
  questionId: z.number().int().positive(),
  status: z.enum(["mastered", "archived"]),
})

export const GET = withSession(async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const { page, pageSize } = parsePagination(searchParams)
    const typeFilter = searchParams.get("type")
    const searchQuery = searchParams.get("search")

    const result = await getMistakes({ type: typeFilter || undefined, search: searchQuery || undefined, page, pageSize })

    return NextResponse.json({
      ...result,
      data: result.data.map(r => ({
        ...r,
        questionOptions: parseJsonArray(r.questionOptions),
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
})

export const PATCH = withSession(async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = DeleteRequestSchema.parse(body)

    setLearningStatus(validated.questionId, validated.status)
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
})
