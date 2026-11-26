import { NextResponse } from "next/server"
import { QUESTION_TYPES } from "@/lib/types"
import { typeLabels } from "@/lib/constants"
import { withSession } from "@/lib/auth-route"

export const revalidate = 3600

export const GET = withSession(async function GET() {
  const types = QUESTION_TYPES.map(type => ({
    value: type,
    label: typeLabels[type] || type,
  }))

  return NextResponse.json({
    types,
    count: types.length,
  }, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  })
})
