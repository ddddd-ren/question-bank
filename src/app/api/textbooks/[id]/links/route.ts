import { NextRequest, NextResponse } from "next/server"
import { ApiError, handleApiError } from "@/lib/api-error"
import { withSession } from "@/lib/auth-route"
import { getQuestionTextbookLinks, setTextbookQuestionLinks } from "@/lib/db/textbooks"

type Context = { params: Promise<{ id: string }> }

export const GET = withSession(async function GET(request: NextRequest, { params }: Context) {
  try {
    const { id } = await params
    const questionId = Number(request.nextUrl.searchParams.get("questionId"))
    return NextResponse.json({ links: getQuestionTextbookLinks(id, questionId) })
  } catch (error) { return handleApiError(error) }
})

export const POST = withSession(async function POST(request: NextRequest, { params }: Context) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => { throw new ApiError(400, "请提交有效的 JSON") })
    setTextbookQuestionLinks(id, body?.questionIds, body?.links, body?.mode)
    return NextResponse.json({ success: true })
  } catch (error) { return handleApiError(error) }
})
