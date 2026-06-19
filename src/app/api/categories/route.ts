import { NextRequest, NextResponse } from "next/server"
import { getCategories, createCategory, deleteCategory } from "@/lib/db/queries"
import { ApiError, handleApiError } from "@/lib/api-error"
import { z } from "zod"

const CategorySchema = z.object({
  name: z.string().min(1).max(100).trim(),
  parentId: z.number().int().positive().nullable().optional(),
})

export async function GET() {
  try {
    const categories = await getCategories()
    return NextResponse.json(categories, {
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
    const validated = CategorySchema.parse(body)
    const category = await createCategory(validated)
    return NextResponse.json(category)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id || isNaN(Number(id))) {
      throw new ApiError(400, "无效的分类ID")
    }

    const deleted = await deleteCategory(Number(id))

    if (!deleted) {
      return NextResponse.json({ error: "分类不存在" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
