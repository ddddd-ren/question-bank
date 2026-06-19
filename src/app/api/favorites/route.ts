import { NextRequest, NextResponse } from "next/server"
import { getFavorites, getFavoriteByQuestionId, toggleFavorite } from "@/lib/db/queries"
import { handleApiError } from "@/lib/api-error"
import { ApiError } from "@/lib/api-error"
import { parsePagination } from "@/lib/api-validate"
import { z } from "zod"

const FavoriteToggleSchema = z.object({
  questionId: z.number().int().positive(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const { page, pageSize } = parsePagination(searchParams)
    const questionId = searchParams.get("questionId")
    const typeFilter = searchParams.get("type")
    const searchQuery = searchParams.get("search")

    if (questionId) {
      const numId = Number(questionId)
      if (isNaN(numId) || numId <= 0) {
        throw new ApiError(400, "无效的题目ID")
      }
      const favorite = await getFavoriteByQuestionId(numId)
      return NextResponse.json({ isFavorited: !!favorite })
    }

    const result = await getFavorites({ type: typeFilter || undefined, search: searchQuery || undefined, page, pageSize })
    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = FavoriteToggleSchema.parse(body)
    const isFavorited = await toggleFavorite(validated.questionId)
    return NextResponse.json({ isFavorited })
  } catch (error) {
    return handleApiError(error)
  }
}
