import { NextRequest, NextResponse } from "next/server"
import { getQuestionById, updateQuestion, deleteQuestion } from "@/lib/db/queries"
import { serializeQuestion, stringifyJsonArray } from "@/lib/db/serialize"
import { handleApiError } from "@/lib/api-error"
import { ApiError } from "@/lib/api-error"
import { z } from "zod"

const QuestionUpdateSchema = z.object({
  content: z.string().min(1).max(10000).optional(),
  type: z.enum(["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]).optional(),
  options: z.array(z.string()).max(20).optional(),
  answer: z.string().max(5000).nullable().optional(),
  explanation: z.string().max(10000).nullable().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  subjectId: z.number().int().positive().nullable().optional(),
  knowledgePointId: z.number().int().positive().nullable().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const numId = Number(id)
    if (isNaN(numId) || numId <= 0) {
      throw new ApiError(400, "无效的题目ID")
    }
    const question = await getQuestionById(numId)

    if (!question) {
      return NextResponse.json({ error: "题目不存在" }, { status: 404 })
    }

    return NextResponse.json(serializeQuestion(question), {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=30",
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const numId = Number(id)
    if (isNaN(numId) || numId <= 0) {
      throw new ApiError(400, "无效的题目ID")
    }
    const body = await request.json()
    const validated = QuestionUpdateSchema.parse(body)

    const updated = await updateQuestion(numId, {
      ...validated,
      options: stringifyJsonArray(validated.options),
      tags: stringifyJsonArray(validated.tags),
    })

    if (!updated) {
      return NextResponse.json({ error: "题目不存在" }, { status: 404 })
    }

    return NextResponse.json(serializeQuestion(updated))
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const numId = Number(id)
    if (isNaN(numId) || numId <= 0) {
      throw new ApiError(400, "无效的题目ID")
    }
    const deleted = await deleteQuestion(numId)

    if (!deleted) {
      return NextResponse.json({ error: "题目不存在" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
