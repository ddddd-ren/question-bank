import { NextRequest, NextResponse } from "next/server"
import { ApiError, handleApiError } from "@/lib/api-error"
import { withSession } from "@/lib/auth-route"
import { getTextbook, updateTextbookOutline, updateTextbookProgress } from "@/lib/db/textbooks"

type Context = { params: Promise<{ id: string }> }

export const GET = withSession(async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { id } = await params
    return NextResponse.json({ book: getTextbook(id) })
  } catch (error) { return handleApiError(error) }
})

export const PATCH = withSession(async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => { throw new ApiError(400, "请提交有效的 JSON") })
    if (body?.action === "progress") return NextResponse.json({ book: updateTextbookProgress(id, body.changes, body.advanceOnly) })
    if (body?.action === "outline") return NextResponse.json({ book: updateTextbookOutline(id, body.chapters) })
    throw new ApiError(400, "请选择修改目录或学习进度")
  } catch (error) { return handleApiError(error) }
})
