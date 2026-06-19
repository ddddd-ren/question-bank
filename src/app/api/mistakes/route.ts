import { NextRequest, NextResponse } from "next/server"
import { getMistakes, deletePracticeRecord } from "@/lib/db/queries"
import { parseJsonArray } from "@/lib/db/serialize"
import { handleApiError } from "@/lib/api-error"
import { parsePagination } from "@/lib/api-validate"

export async function GET(request: NextRequest) {
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
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { id } = body as { id: number }

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 })
    }

    await deletePracticeRecord(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
