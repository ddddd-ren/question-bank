import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-error"
import { withSession } from "@/lib/auth-route"
import { getTextbookFile, getTextbookSegments } from "@/lib/db/textbooks"

const mimeTypes = {
  pdf: "application/pdf", epub: "application/epub+zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

export const GET = withSession(async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const query = request.nextUrl.searchParams
    if (query.get("original") === "1") {
      const { filename, file, format } = getTextbookFile(id)
      const display = format === "pdf" && query.get("inline") === "1" ? "inline" : "attachment"
      const encoded = encodeURIComponent(filename).replace(/['()*]/g, character => "%" + character.charCodeAt(0).toString(16))
      return new NextResponse(new Uint8Array(file), { headers: {
        "Content-Type": mimeTypes[format],
        "Content-Disposition": `${display}; filename="textbook.${format}"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(display === "inline" && { "X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": "frame-ancestors 'self'" }),
      } })
    }
    const position = Number(query.get("position"))
    const [text] = getTextbookSegments(id, position, position)
    return NextResponse.json({ position, text })
  } catch (error) { return handleApiError(error) }
})
