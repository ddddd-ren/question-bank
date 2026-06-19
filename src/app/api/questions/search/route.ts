import { NextRequest, NextResponse } from "next/server"
import { getQuestions } from "@/lib/db/queries"
import { serializeQuestions } from "@/lib/db/serialize"
import { handleApiError } from "@/lib/api-error"
import { z } from "zod"

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  type: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = SearchQuerySchema.parse(Object.fromEntries(searchParams.entries()))

    const result = await getQuestions({
      search: query.q,
      type: query.type,
      page: query.page,
      pageSize: query.pageSize,
    })

    return NextResponse.json({
      query: query.q,
      data: serializeQuestions(result.data),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(result.total / query.pageSize),
    }, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=15",
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
