import { NextRequest, NextResponse } from "next/server"
import {
  deleteKnowledgePoint,
  getKnowledgePointById,
  getKnowledgePointUsage,
  getSubjectById,
  updateKnowledgePoint,
} from "@/lib/db/queries"
import { ApiError, handleApiError } from "@/lib/api-error"
import { withSession } from "@/lib/auth-route"

function normalizeKnowledgePointPatch(body: Record<string, unknown>) {
  const data: {
    subjectId?: number
    name?: string
    parentId?: number | null
    description?: string | null
  } = {}

  if ("subjectId" in body) {
    data.subjectId = Number(body.subjectId)
  }

  if ("name" in body) {
    data.name = typeof body.name === "string" ? body.name.trim() : ""
  }

  if ("parentId" in body) {
    data.parentId = body.parentId === null || body.parentId === undefined || body.parentId === ""
      ? null
      : Number(body.parentId)
  }

  if ("description" in body) {
    const description = typeof body.description === "string" ? body.description.trim() : ""
    data.description = description || null
  }

  return data
}

async function assertValidParent(id: number, subjectId: number, parentId: number | null | undefined) {
  if (parentId === undefined || parentId === null) return

  if (!Number.isInteger(parentId) || parentId <= 0) {
    throw new ApiError(400, "无效的父级知识点")
  }

  let currentParentId: number | null = parentId
  while (currentParentId !== null) {
    if (currentParentId === id) {
      throw new ApiError(400, "不能将知识点移动到自己的下级")
    }

    const parent = await getKnowledgePointById(currentParentId)
    if (!parent) {
      throw new ApiError(404, "父级知识点不存在")
    }

    if (parent.subjectId !== subjectId) {
      throw new ApiError(400, "父级知识点必须属于同一学科")
    }

    currentParentId = parent.parentId
  }
}

export const PATCH = withSession(async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const knowledgePointId = Number(id)

    if (!Number.isInteger(knowledgePointId) || knowledgePointId <= 0) {
      throw new ApiError(400, "无效的知识点 ID")
    }

    const existing = await getKnowledgePointById(knowledgePointId)
    if (!existing) {
      return NextResponse.json({ error: "知识点不存在" }, { status: 404 })
    }

    const body = await request.json() as Record<string, unknown>
    const data = normalizeKnowledgePointPatch(body)

    if (Object.keys(data).length === 0) {
      throw new ApiError(400, "没有可更新的字段")
    }

    if ("name" in data && !data.name) {
      throw new ApiError(400, "知识点名称不能为空")
    }

    if (data.name && data.name.length > 80) {
      throw new ApiError(400, "知识点名称不能超过 80 个字符")
    }

    const nextSubjectId = data.subjectId ?? existing.subjectId
    if (!Number.isInteger(nextSubjectId) || nextSubjectId <= 0) {
      throw new ApiError(400, "无效的学科 ID")
    }

    const subject = await getSubjectById(nextSubjectId)
    if (!subject) {
      return NextResponse.json({ error: "学科不存在" }, { status: 404 })
    }

    const nextParentId = "parentId" in data ? data.parentId : existing.parentId
    await assertValidParent(knowledgePointId, nextSubjectId, nextParentId)

    const updated = await updateKnowledgePoint(knowledgePointId, data)
    if (!updated) {
      return NextResponse.json({ error: "知识点不存在" }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
})

export const DELETE = withSession(async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const knowledgePointId = Number(id)

    if (!Number.isInteger(knowledgePointId) || knowledgePointId <= 0) {
      throw new ApiError(400, "无效的知识点 ID")
    }

    const existing = await getKnowledgePointById(knowledgePointId)
    if (!existing) {
      return NextResponse.json({ error: "知识点不存在" }, { status: 404 })
    }

    const usage = await getKnowledgePointUsage(knowledgePointId)
    if (usage.childCount > 0 || usage.questionCount > 0) {
      throw new ApiError(
        400,
        "该知识点仍有关联数据，不能删除",
        `包含 ${usage.childCount} 个子知识点、${usage.questionCount} 道题目`
      )
    }

    const deleted = await deleteKnowledgePoint(knowledgePointId)
    if (!deleted) {
      return NextResponse.json({ error: "知识点不存在" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
})
