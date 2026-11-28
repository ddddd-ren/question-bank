import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { handleApiError } from "@/lib/api-error"
import { getMistakeAnalysisStats } from "@/lib/db/learning"
import { withSession } from "@/lib/auth-route"

const QuerySchema = z.object({
  subjectId: z.coerce.number().int().positive().optional(),
  period: z.enum(["30", "all"]).default("30"),
})

export const dynamic = "force-dynamic"

export const GET = withSession(async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = QuerySchema.parse({
      subjectId: searchParams.get("subjectId") ?? undefined,
      period: searchParams.get("period") ?? undefined,
    })

    return NextResponse.json(getMistakeAnalysisStats({
      subjectId: query.subjectId,
      days: query.period === "30" ? 30 : null,
    }), {
      headers: {
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
})
