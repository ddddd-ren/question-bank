import { NextRequest, NextResponse } from "next/server"
import { getQuestions } from "@/lib/db/queries"
import { serializeQuestions } from "@/lib/db/serialize"
import { handleApiError } from "@/lib/api-error"
import { withSession } from "@/lib/auth-route"
import { z } from "zod"

const ExportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  pageSize: z.coerce.number().int().min(1).max(50000).default(10000),
  type: z.string().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
})

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}

export const GET = withSession(async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = ExportQuerySchema.parse(Object.fromEntries(searchParams.entries()))

    const result = await getQuestions({
      pageSize: query.pageSize,
      type: query.type,
      categoryId: query.categoryId,
      subjectId: query.subjectId,
    })
    const questions = serializeQuestions(result.data)

    if (query.format === "csv") {
      const headers = ["id", "type", "content", "options", "answer", "explanation", "difficulty", "tags", "createdAt"]
      const csvLines = [headers.join(",")]
      for (const q of questions) {
        const row = [
          q.id,
          escapeCsvField(q.type),
          escapeCsvField(q.content || ""),
          escapeCsvField((q.options || []).join("|")),
          escapeCsvField(q.answer || ""),
          escapeCsvField(q.explanation || ""),
          q.difficulty || 1,
          escapeCsvField((q.tags || []).join("|")),
          escapeCsvField(q.createdAt || ""),
        ]
        csvLines.push(row.join(","))
      }
      return new NextResponse("\uFEFF" + csvLines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=questions-export-${Date.now()}.csv`,
          "Cache-Control": "private, no-cache",
        },
      })
    }

    return new NextResponse(JSON.stringify({
      version: "1.0",
      exportedAt: new Date().toISOString(),
      total: questions.length,
      questions,
    }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename=questions-export-${Date.now()}.json`,
        "Cache-Control": "private, no-cache",
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
})
