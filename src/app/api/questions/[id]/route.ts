import { NextRequest, NextResponse } from "next/server"
import { getQuestionById, updateQuestion, deleteQuestion } from "@/lib/db/queries"
import { serializeQuestion, stringifyJsonArray } from "@/lib/db/serialize"
import { handleApiError } from "@/lib/api-error"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const question = await getQuestionById(Number(id))

    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 })
    }

    return NextResponse.json(serializeQuestion(question))
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
    const body = await request.json()

    const updated = await updateQuestion(Number(id), {
      ...body,
      options: stringifyJsonArray(body.options),
      tags: stringifyJsonArray(body.tags),
    })

    if (!updated) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 })
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
    const deleted = await deleteQuestion(Number(id))

    if (!deleted) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
