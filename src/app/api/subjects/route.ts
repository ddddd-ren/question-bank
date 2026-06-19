import { NextRequest, NextResponse } from "next/server"
import { createSubject, getSubjects } from "@/lib/db/queries"
import { ApiError, handleApiError } from "@/lib/api-error"
import { requireBody } from "@/lib/api-validate"

function normalizeSubjectBody(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const code = typeof body.code === "string" ? body.code.trim() : ""
  const description = typeof body.description === "string" ? body.description.trim() : ""

  return {
    name,
    code: code || null,
    description: description || null,
  }
}

export async function GET() {
  try {
    const subjects = await getSubjects()
    return NextResponse.json(subjects)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>
    const data = normalizeSubjectBody(body)
    requireBody(data, ["name"])

    if (data.name.length > 60) {
      throw new ApiError(400, "学科名称不能超过 60 个字符")
    }

    const subject = await createSubject(data)
    return NextResponse.json(subject)
  } catch (error) {
    return handleApiError(error)
  }
}
