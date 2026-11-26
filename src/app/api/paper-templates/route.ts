import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, handleApiError } from "@/lib/api-error"
import { QuestionTypeSchema } from "@/lib/api-validate"
import { withSession } from "@/lib/auth-route"
import { getPaperTemplate, getTemplateFile, listPaperTemplates, storePaperTemplate } from "@/lib/db/paper-templates"
import { isImportFileSizeAllowed, MAX_IMPORT_FILE_BYTES } from "@/lib/import-limits"
import { MAX_TEMPLATE_SLOTS } from "@/lib/paper/template"
import { analyzeTemplateDocx, validateTemplateLayout } from "@/lib/paper/template-docx"

const templateName = z.string().trim().min(1).max(200)
const sectionsSchema = z.array(z.object({
  title: z.string().trim().min(1).max(500),
  type: QuestionTypeSchema,
  tag: z.string().trim().min(1).max(50).optional(),
  knowledgePointId: z.number().int().positive().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  slots: z.array(z.object({
    number: z.string().trim().min(1).max(32),
    points: z.number().nonnegative().max(10000).nullable(),
    type: QuestionTypeSchema.optional(),
  })).min(1).max(MAX_TEMPLATE_SLOTS),
})).min(1).max(MAX_TEMPLATE_SLOTS).refine(
  sections => sections.reduce((count, section) => count + section.slots.length, 0) <= MAX_TEMPLATE_SLOTS,
  `每份模板最多支持 ${MAX_TEMPLATE_SLOTS} 道题`,
)

export const GET = withSession(async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")
    return NextResponse.json(id === null ? listPaperTemplates() : getPaperTemplate(z.string().uuid().parse(id)))
  } catch (error) { return handleApiError(error) }
})

function invalidDocx(error: unknown): never {
  const message = error instanceof Error && /[\u3400-\u9fff]/.test(error.message) ? error.message : "无法读取 Word 文件，请确认文件能在 Word 中正常打开"
  throw new ApiError(422, message)
}

export const POST = withSession(async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get("content-length")) > MAX_IMPORT_FILE_BYTES + 1024 * 1024) {
      throw new ApiError(413, "模板文件不能超过 20 MiB")
    }
    const form = await request.formData().catch(() => { throw new ApiError(400, "请使用文件上传表单提交模板") })
    const action = z.enum(["analyze", "save", "revise"]).parse(form.get("action"))
    let bytes: Buffer
    if (action === "revise") {
      bytes = getTemplateFile(z.string().uuid().parse(form.get("templateId")))
    } else {
      const file = form.get("file")
      if (!(file instanceof File) || !/\.docx$/i.test(file.name) || !file.size) {
        throw new ApiError(400, "请选择有效的 .docx 模板卷")
      }
      if (!isImportFileSizeAllowed(file.size)) throw new ApiError(413, "模板文件不能超过 20 MiB")
      bytes = Buffer.from(await file.arrayBuffer())
    }
    if (action === "analyze") return NextResponse.json(await analyzeTemplateDocx(bytes).catch(invalidDocx))

    const name = templateName.parse(form.get("name"))
    const raw = form.get("sections")
    if (typeof raw !== "string" || raw.length > 1024 * 1024) throw new ApiError(400, "请提交确认后的大题和题位")
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { throw new ApiError(400, "模板大题数据格式有误") }
    const sections = await validateTemplateLayout(bytes, sectionsSchema.parse(parsed)).catch(invalidDocx)
    return NextResponse.json(storePaperTemplate(name, sections, bytes))
  } catch (error) { return handleApiError(error) }
})
