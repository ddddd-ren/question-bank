import { NextRequest, NextResponse } from "next/server"
import { getQuestions } from "@/lib/db/queries"
import { serializeQuestions } from "@/lib/db/serialize"
import { handleApiError } from "@/lib/api-error"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const format = searchParams.get("format") || "json"

    // Fetch all questions (up to 10000)
    const result = await getQuestions({ pageSize: 10000 })
    const questions = serializeQuestions(result.data)

    if (format === "csv") {
      const headers = ["id", "type", "content", "options", "answer", "explanation", "difficulty", "tags", "createdAt"]
      const csvLines = [headers.join(",")]
      for (const q of questions) {
        const row = [
          q.id,
          q.type,
          JSON.stringify(q.content || ""),
          JSON.stringify((q.options || []).join("|")),
          JSON.stringify(q.answer || ""),
          JSON.stringify(q.explanation || ""),
          q.difficulty || 1,
          JSON.stringify((q.tags || []).join("|")),
          q.createdAt || "",
        ]
        csvLines.push(row.join(","))
      }
      return new NextResponse(csvLines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=question-bank-export.csv",
        },
      })
    }

    // JSON format
    return new NextResponse(JSON.stringify({ version: "1.0", exportedAt: new Date().toISOString(), total: questions.length, questions }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=question-bank-export.json",
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
