import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { questions } from "@/lib/db/schema"
import { sql, desc } from "drizzle-orm"
import { handleApiError } from "@/lib/api-error"
import { withSession } from "@/lib/auth-route"

export const GET = withSession(async function GET() {
  try {
    const batches = await db
      .select({
        sourceFile: questions.sourceFile,
        count: sql<number>`count(*)`,
        latest: sql<string>`max(${questions.createdAt})`,
      })
      .from(questions)
      .where(sql`${questions.sourceFile} IS NOT NULL`)
      .groupBy(questions.sourceFile)
      .orderBy(desc(sql`max(${questions.createdAt})`))

    return NextResponse.json({ batches })
  } catch (error) {
    return handleApiError(error)
  }
})
