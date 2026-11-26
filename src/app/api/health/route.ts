import { NextResponse } from "next/server"
import { sqliteDb } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    sqliteDb.prepare("SELECT 1").get()
    return NextResponse.json({ status: "ok" }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json({ status: "error" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    })
  }
}
