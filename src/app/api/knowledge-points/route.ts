import { NextRequest, NextResponse } from "next/server"
import { createKnowledgePoint, getKnowledgePointById, getKnowledgePoints, getSubjectById } from "@/lib/db/queries"
import { ApiError, handleApiError } from "@/lib/api-error"
import { parseOptionalNumber } from "@/lib/api-validate"
import { z } from "zod"

const KnowledgePointSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  description: z.string().max(500).trim().nullable().optional(),
  subjectId: z.number().int().positive(),
  parentId: z.number().int().positive().nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subjectId = parseOptionalNumber(searchParams.get("subjectId"))
    const knowledgePoints = await getKnowledgePoints({ subjectId })
    return NextResponse.json(knowledgePoints, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=15",
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = KnowledgePointSchema.parse(body)

    const subject = await getSubjectById(validated.subjectId)
    if (!subject) {
      return NextResponse.json({ error: "学科不存在" }, { status: 404 })
    }

    if (validated.parentId !== null && validated.parentId !== undefined) {
      const parent = await getKnowledgePointById(validated.parentId)
      if (!parent) {
        return NextResponse.json({ error: "父级知识点不存在" }, { status: 404 })
      }
      if (parent.subjectId !== validated.subjectId) {
        throw new ApiError(400, "父级知识点必须属于同一学科")
      }
    }

    const knowledgePoint = await createKnowledgePoint({
      name: validated.name,
      description: validated.description || null,
      subjectId: validated.subjectId,
      parentId: validated.parentId || null,
    })
    return NextResponse.json(knowledgePoint)
  } catch (error) {
    return handleApiError(error)
  }
}
