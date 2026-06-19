import { NextRequest, NextResponse } from "next/server"
import { getFavorites, getFavoriteByQuestionId, toggleFavorite } from "@/lib/db/queries"
import { handleApiError } from "@/lib/api-error"
import { parsePagination } from "@/lib/api-validate"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const { page, pageSize } = parsePagination(searchParams)
    const questionId = searchParams.get("questionId")
    const typeFilter = searchParams.get("type")
    const searchQuery = searchParams.get("search")

    // Check if a specific question is favorited
    if (questionId) {
      const favorite = await getFavoriteByQuestionId(Number(questionId))
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
    const { questionId } = body

    if (!questionId) {
      return NextResponse.json({ error: "缺少题目ID" }, { status: 400 })
    }

    const isFavorited = await toggleFavorite(questionId)
    return NextResponse.json({ isFavorited })
  } catch (error) {
    return handleApiError(error)
  }
}
