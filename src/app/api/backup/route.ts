import { sqliteDb } from "@/lib/db"
import { withSession } from "@/lib/auth-route"
import { ApiError, handleApiError } from "@/lib/api-error"

export const GET = withSession(async function GET() {
  try {
    const size = Number(sqliteDb.pragma("page_count", { simple: true })) * Number(sqliteDb.pragma("page_size", { simple: true }))
    if (size > 256 * 1024 * 1024) throw new ApiError(413, "题库超过 256 MiB，请使用命令行备份工具")
    const snapshot = sqliteDb.serialize()
    const filename = `question-bank-${new Date().toISOString().replace(/[:.]/g, "-")}.db`
    return new Response(new Uint8Array(snapshot), {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) { return handleApiError(error) }
})
