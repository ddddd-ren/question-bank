import { NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-error"
import { withSession } from "@/lib/auth-route"
import { listTextbooks } from "@/lib/db/textbooks"

export const GET = withSession(async function GET() {
  try {
    return NextResponse.json({ books: listTextbooks() })
  } catch (error) { return handleApiError(error) }
})
