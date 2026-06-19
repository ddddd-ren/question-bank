import { NextRequest, NextResponse } from "next/server"
import { deleteSubject, getSubjectById, getSubjectUsage, updateSubject } from "@/lib/db/queries"
import { ApiError, handleApiError } from "@/lib/api-error"

function normalizeSubjectPatch(body: Record<string, unknown>) {
  const data: {
    name?: string
    code?: string | null
    description?: string | null
  } = {}

  if ("name" in body) {
    data.name = typeof body.name === "string" ? body.name.trim() : ""
  }

  if ("code" in body) {
    const code = typeof body.code === "string" ? body.code.trim() : ""
    data.code = code || null
  }

  if ("description" in body) {
    const description = typeof body.description === "string" ? body.description.trim() : ""
    data.description = description || null
  }

  return data
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const subjectId = Number(id)

    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      throw new ApiError(400, "无效的学科 ID")
    }

    const body = await request.json() as Record<string, unknown>
    const data = normalizeSubjectPatch(body)

    if (Object.keys(data).length === 0) {
      throw new ApiError(400, "没有可更新的字段")
    }

    if ("name" in data && !data.name) {
      throw new ApiError(400, "学科名称不能为空")
    }

    if (data.name && data.name.length > 60) {
      throw new ApiError(400, "学科名称不能超过 60 个字符")
    }

    const updated = await updateSubject(subjectId, data)
    if (!updated) {
      return NextResponse.json({ error: "学科不存在" }, { status: 404 })
    }

    return NextResponse.json(updated)
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
    const subjectId = Number(id)

    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      throw new ApiError(400, "无效的学科 ID")
    }

    const subject = await getSubjectById(subjectId)
    if (!subject) {
      return NextResponse.json({ error: "学科不存在" }, { status: 404 })
    }

    const usage = await getSubjectUsage(subjectId)
    if (usage.knowledgePointCount > 0 || usage.questionCount > 0) {
      throw new ApiError(
        400,
        "该学科仍有关联数据，不能删除",
        `包含 ${usage.knowledgePointCount} 个知识点、${usage.questionCount} 道题目`
      )
    }

    const deleted = await deleteSubject(subjectId)
    if (!deleted) {
      return NextResponse.json({ error: "学科不存在" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
