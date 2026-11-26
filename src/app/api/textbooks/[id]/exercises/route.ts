import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, handleApiError } from "@/lib/api-error"
import { withSession } from "@/lib/auth-route"
import { getExerciseChapter, MAX_EXERCISES } from "@/lib/db/textbook-exercises"
import { getTextbookSegments } from "@/lib/db/textbooks"
import { parsePositionedExercises } from "@/lib/parser/question-extractor"
import { toEditable } from "@/lib/parser/question-templates"
import { checkQuestionQuality } from "@/lib/parser/quality-checker"

const range = z.object({ chapterId: z.string().uuid(), from: z.number().int().positive(), to: z.number().int().positive() })

export const POST = withSession(async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: bookId } = await context.params
    const selection = { ...range.parse(await request.json().catch(() => { throw new ApiError(400, "习题范围须为 JSON") })), bookId }
    getExerciseChapter(selection)
    const segments = getTextbookSegments(bookId, selection.from, selection.to)
    if (segments.reduce((n, text) => n + text.length, 0) > 500000) throw new ApiError(413, "所选正文过长，请缩小习题范围")
    const questions = await parsePositionedExercises(segments, selection.from)
    if (questions.length > MAX_EXERCISES) throw new ApiError(400, `识别到超过 ${MAX_EXERCISES} 道题，请缩小预览范围`)
    return NextResponse.json({ questions: questions.map((q, i) => ({ editable: toEditable(q), quality: checkQuestionQuality(q, i) })) })
  } catch (error) { return handleApiError(error) }
})
