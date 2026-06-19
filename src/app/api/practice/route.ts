import { NextRequest, NextResponse } from "next/server"
import { getRandomQuestions, getWrongQuestions, createPracticeRecord, getPracticeStats } from "@/lib/db/queries"
import { serializeQuestions } from "@/lib/db/serialize"
import { handleApiError } from "@/lib/api-error"
import { PracticeSubmitSchema, validateBody } from "@/lib/api-validate"
import { parseOptionalNumber, parseOptionalString } from "@/lib/api-validate"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = parseOptionalString(searchParams.get("type"))
    const categoryId = parseOptionalNumber(searchParams.get("categoryId"))
    const count = searchParams.get("count") ? Number(searchParams.get("count")) : 10
    const stats = searchParams.get("stats") === "true"
    const mode = searchParams.get("mode")

    if (stats) {
      const statsData = await getPracticeStats()
      return NextResponse.json(statsData)
    }

    if (mode === "mistakes") {
      const questions = await getWrongQuestions({ type: type || undefined, count })
      return NextResponse.json({
        data: serializeQuestions(questions),
        mode: "mistakes",
      })
    }

    const questions = await getRandomQuestions({ type, categoryId, count })

    return NextResponse.json({
      data: serializeQuestions(questions),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = validateBody(PracticeSubmitSchema, body)
    const record = await createPracticeRecord(validated)
    return NextResponse.json(record)
  } catch (error) {
    return handleApiError(error)
  }
}
