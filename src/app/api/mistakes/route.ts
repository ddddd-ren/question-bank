import { NextRequest, NextResponse } from "next/server"
import { getMistakes, deletePracticeRecord } from "@/lib/db/queries"
import { parseJsonArray } from "@/lib/db/serialize"
import { handleApiError } from "@/lib/api-error"
import { parsePagination } from "@/lib/api-validate"
import { z } from "zod"

const DeleteRequestSchema = z.object({
  id: z.number().int().positive(),
})

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
    const validated = DeleteRequestSchema.parse(body)

    await deletePracticeRecord(validated.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
