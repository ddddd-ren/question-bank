import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, handleApiError } from "@/lib/api-error"
import { withSession } from "@/lib/auth-route"
import { storeTextbook } from "@/lib/db/textbooks"
import { MAX_TEXTBOOK_BYTES } from "@/lib/textbooks/parser-common"
import { parseTextbook } from "@/lib/textbooks/parser"

async function readUpload(request: NextRequest) {
  const limit = MAX_TEXTBOOK_BYTES + 1024 ** 2
  const tooLarge = () => new ApiError(413, "教材文件不能超过 64 MiB")
  if (Number(request.headers.get("content-length")) > limit) throw tooLarge()
  const contentType = request.headers.get("content-type") || ""
  if (!request.body || !/^multipart\/form-data\s*;/iu.test(contentType)) throw new ApiError(400, "请使用文件上传表单提交教材")
  let received = 0
  const bounded = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength
      if (received > limit) throw tooLarge()
      controller.enqueue(chunk)
    },
  }))
  try {
    return await new Response(bounded, { headers: { "Content-Type": contentType } }).formData()
  } catch {
    if (received > limit) throw tooLarge()
    throw new ApiError(400, "教材上传不完整，请重新选择文件")
  }
}

export const POST = withSession(async function POST(request: NextRequest) {
  try {
    const form = await readUpload(request)
    const file = form.get("file")
    if (!(file instanceof File) || !file.size) throw new ApiError(400, "请选择非空的教材文件")
    if (file.size > MAX_TEXTBOOK_BYTES) throw new ApiError(413, "教材文件不能超过 64 MiB")
    const filename = z.string().trim().min(1).max(255).parse(file.name.split(/[\\/]/u).pop())
    const enteredTitle = z.string().trim().max(200).parse(form.get("title") ?? "")
    const title = enteredTitle || filename.replace(/\.[^.]+$/u, "").trim().slice(0, 200) || "教材"
    const edition = z.string().trim().max(100).parse(form.get("edition") ?? "")
    const bytes = Buffer.from(await file.arrayBuffer())
    const parsed = await parseTextbook(filename, bytes)
    const stored = storeTextbook({ title, edition, filename, bytes, parsed })
    return NextResponse.json({ ...stored, warnings: parsed.warnings })
  } catch (error) { return handleApiError(error) }
})
