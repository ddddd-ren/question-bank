import { NextRequest, NextResponse } from "next/server"
import { createKnowledgePoint, getKnowledgePointById, getKnowledgePoints, getSubjectById } from "@/lib/db/queries"
import { ApiError, handleApiError } from "@/lib/api-error"
import { parseOptionalNumber, requireBody } from "@/lib/api-validate"

function normalizeKnowledgePointBody(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const description = typeof body.description === "string" ? body.description.trim() : ""
  const subjectId = Number(body.subjectId)
  const parentId = body.parentId === null || body.parentId === undefined || body.parentId === ""
    ? null
    : Number(body.parentId)

  return {
    subjectId,
    name,
    parentId,
    description: description || null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subjectId = parseOptionalNumber(searchParams.get("subjectId"))
    const knowledgePoints = await getKnowledgePoints({ subjectId })
    return NextResponse.json(knowledgePoints)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>
    const data = normalizeKnowledgePointBody(body)
    requireBody(data, ["subjectId", "name"])

    if (!Number.isInteger(data.subjectId) || data.subjectId <= 0) {
      throw new ApiError(400, "无效的学科 ID")
    }

    if (data.name.length > 80) {
      throw new ApiError(400, "知识点名称不能超过 80 个字符")
    }

    if (data.parentId !== null && (!Number.isInteger(data.parentId) || data.parentId <= 0)) {
      throw new ApiError(400, "无效的父级知识点")
    }

    const subject = await getSubjectById(data.subjectId)
    if (!subject) {
      return NextResponse.json({ error: "学科不存在" }, { status: 404 })
    }

    if (data.parentId !== null) {
      const parent = await getKnowledgePointById(data.parentId)
      if (!parent) {
        return NextResponse.json({ error: "父级知识点不存在" }, { status: 404 })
      }
      if (parent.subjectId !== data.subjectId) {
        throw new ApiError(400, "父级知识点必须属于同一学科")
      }
    }

    const knowledgePoint = await createKnowledgePoint(data)
    return NextResponse.json(knowledgePoint)
  } catch (error) {
    return handleApiError(error)
  }
}
