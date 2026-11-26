import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withSession } from "@/lib/auth-route"
import { handleApiError } from "@/lib/api-error"
import { getAttempt, startAttempt, updateAttempt } from "@/lib/db/papers"
import { PaperSaveConflict } from "@/lib/paper/autosave"
const create = z.object({ paperId: z.string().uuid(), mode: z.enum(["practice", "exam"]), minutes: z.number().int().min(1).max(480).default(60) })
const answer = z.string().max(20000)
const edit = z.object({
  questionId: z.number().int().positive(),
  answer: z.object({ from: answer, to: answer }).optional(),
  marked: z.boolean().optional(),
}).refine(value => value.answer !== undefined || value.marked !== undefined, "缺少题目改动")
const update = z.strictObject({
  id: z.string().uuid(),
  edits: z.array(edit).max(1000).refine(items => new Set(items.map(item => item.questionId)).size === items.length, "题目改动重复").optional(),
  submit: z.boolean().optional(),
  selfAssessment: z.object({ questionId: z.number().int().positive(), isCorrect: z.boolean() }).optional(),
})
export const GET = withSession(async function GET(request: NextRequest) {
  try { return NextResponse.json(getAttempt(z.string().uuid().parse(request.nextUrl.searchParams.get("id")))) }
  catch (error) { return handleApiError(error) }
})
export const POST = withSession(async function POST(request: NextRequest) {
  try { const data = create.parse(await request.json()); return NextResponse.json(startAttempt(data.paperId, data.mode, data.minutes)) }
  catch (error) { return handleApiError(error) }
})
export const PATCH = withSession(async function PATCH(request: NextRequest) {
  try { const data = update.parse(await request.json()); return NextResponse.json(updateAttempt(data.id, data)) }
  catch (error) {
    if (error instanceof PaperSaveConflict) {
      return NextResponse.json({
        error: error.message,
        conflict: { questionId: error.questionId, savedAnswer: error.savedAnswer },
      }, { status: 409 })
    }
    return handleApiError(error)
  }
})
