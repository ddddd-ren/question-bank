import { NextRequest, NextResponse } from "next/server"
import { getQuestionsByIds, getRandomQuestions } from "@/lib/db/queries"
import { serializeQuestions, type SerializedQuestion } from "@/lib/db/serialize"
import { handleApiError, ApiError } from "@/lib/api-error"
import { isQuestionType } from "@/lib/types"
import { typeLabels } from "@/lib/constants"
import { createPaperDocx } from "@/lib/paper/docx"
import { getPaper, listPapers, savePaper, listAttempts, type SavedPaper } from "@/lib/db/papers"
import { checkTemplate, generateTemplatePaper, getTemplateFile, replaceTemplateQuestion } from "@/lib/db/paper-templates"
import { renderTemplateDocx } from "@/lib/paper/template-docx"
import { z } from "zod"
import { withSession } from "@/lib/auth-route"

const filters = {
  subjectId: z.number().int().positive().optional(),
  knowledgePointId: z.number().int().positive().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
}
const schema = z.discriminatedUnion("mode", [z.object({
  title: z.string().trim().max(200).optional(), mode: z.enum(["random", "manual"]),
  rules: z.array(z.object({ type: z.string(), count: z.number().int().min(0).max(100) })).max(7).optional(),
  questionIds: z.array(z.number().int().positive()).max(1000).optional(),
  ...filters,
}), z.object({
  mode: z.literal("template"), templateId: z.string().uuid(), title: z.string().trim().max(200).optional(),
  preflight: z.boolean().optional(), ...filters,
  study: z.object({
    bookId: z.string().uuid(), mode: z.enum(["cumulative", "recent", "custom", "mixed"]),
    chapterIds: z.array(z.string().uuid()).max(10000).optional(),
    newCount: z.number().int().min(0).max(1000).optional(),
  }).optional(),
}), z.object({
  mode: z.literal("replace"), paperId: z.string().uuid(), index: z.number().int().nonnegative(),
})])

function sections(paper: SavedPaper) {
  if (!paper.template) {
    return Object.keys(typeLabels).map(type => ({ type, questions: paper.questions.filter(q => q.type === type) })).filter(s => s.questions.length)
  }
  let offset = 0
  return paper.template.sections.map(section => {
    const questions = paper.questions.slice(offset, offset + section.slots.length)
    offset += questions.length
    return { ...section, questions }
  })
}

function paperResponse(paper: SavedPaper) {
  return { ...paper, sections: sections(paper), total: paper.questions.length }
}
export const GET = withSession(async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams, id = params.get("id")
    if (!id) return NextResponse.json(listPapers())
    const paper = getPaper(id)
    if (params.get("format") === "docx") {
      const includeAnswers = params.get("includeAnswers") === "true"
      const buffer = paper.template
        ? await renderTemplateDocx(getTemplateFile(paper.template.id), paper.title, paper.template.sections, paper.questions, includeAnswers)
          .catch((error: unknown) => { throw new ApiError(422, error instanceof Error ? error.message : "无法按模板导出试卷") })
        : await createPaperDocx(paper.title, sections(paper), includeAnswers)
      const filename = paper.template ? `${paper.title}-${includeAnswers ? "答案卷" : "学生卷"}` : paper.title
      return new NextResponse(new Uint8Array(buffer), { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.docx`,
      } })
    }
    return NextResponse.json({ ...paperResponse(paper), attempts: listAttempts(id) })
  } catch (error) { return handleApiError(error) }
})
export const POST = withSession(async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json().catch(() => { throw new ApiError(400, "组卷参数必须是 JSON") }))
    if (input.mode === "replace") return NextResponse.json(paperResponse(replaceTemplateQuestion(input.paperId, input.index)))
    if (input.mode === "template") {
      const filters = { subjectId: input.subjectId, knowledgePointId: input.knowledgePointId, difficulty: input.difficulty }
      if (input.preflight) return NextResponse.json(checkTemplate(input.templateId, filters, input.study))
      return NextResponse.json(paperResponse(generateTemplatePaper(input.templateId, filters, input.title, input.study)))
    }
    let questions: SerializedQuestion[] = []
    if (input.mode === "manual") {
      const ids = [...new Set(input.questionIds || [])]
      const found = serializeQuestions(await getQuestionsByIds(ids))
      if (found.length !== ids.length) throw new ApiError(400, "所选题目已删除或归档，请重新选题")
      const byId = new Map(found.map(q => [q.id, q]))
      questions = ids.map(id => byId.get(id)!)
    } else {
      const seen = new Set<string>()
      for (const rule of input.rules || []) {
        if (!isQuestionType(rule.type) || seen.has(rule.type)) throw new ApiError(400, "题型无效或重复")
        seen.add(rule.type)
        if (!rule.count) continue
        const found = serializeQuestions(await getRandomQuestions({ type: rule.type, count: rule.count, subjectId: input.subjectId, knowledgePointId: input.knowledgePointId, difficulty: input.difficulty }))
        if (found.length < rule.count) throw new ApiError(400, `${typeLabels[rule.type]}题量不足：需要 ${rule.count} 题，仅有 ${found.length} 题`)
        questions.push(...found)
      }
    }
    if (!questions.length) throw new ApiError(400, "没有可组卷的题目")
    const paper = savePaper(input.title || "题库试卷", questions)
    return NextResponse.json(paperResponse(paper))
  } catch (error) { return handleApiError(error) }
})
