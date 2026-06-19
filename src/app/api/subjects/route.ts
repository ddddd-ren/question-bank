import { NextRequest, NextResponse } from "next/server"
import { createSubject, getSubjects } from "@/lib/db/queries"
import { handleApiError } from "@/lib/api-error"
import { z } from "zod"

const SubjectSchema = z.object({
  name: z.string().min(1).max(60).trim(),
  code: z.string().max(20).trim().nullable().optional(),
  description: z.string().max(500).trim().nullable().optional(),
})

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
    const body = await request.json()
    const validated = SubjectSchema.parse(body)

    const subject = await createSubject({
      name: validated.name,
      code: validated.code || null,
      description: validated.description || null,
    })
    return NextResponse.json(subject)
  } catch (error) {
    return handleApiError(error)
  }
}
