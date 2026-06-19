import { NextRequest, NextResponse } from "next/server"
import { getQuestionsByIds, getRandomQuestions } from "@/lib/db/queries"
import { serializeQuestions, type SerializedQuestion } from "@/lib/db/serialize"
import { handleApiError, ApiError } from "@/lib/api-error"
import { isQuestionType, type QuestionType } from "@/lib/types"
import { createPaperDocx, type PaperSection } from "@/lib/paper/docx"
import { z } from "zod"

const PaperRuleSchema = z.object({
  type: z.string(),
  count: z.number().int().min(0).max(100),
})

const PaperRequestSchema = z.object({
  title: z.string().max(200).optional(),
  mode: z.enum(["random", "manual"]),
  rules: z.array(PaperRuleSchema).max(10).optional(),
  questionIds: z.array(z.number().int().positive()).max(1000).optional(),
  includeAnswers: z.boolean().optional().default(true),
  format: z.enum(["json", "docx"]).optional().default("json"),
})

const sectionOrder: QuestionType[] = ["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]

function groupQuestions(questions: SerializedQuestion[]) {
  const groups = new Map<string, SerializedQuestion[]>()
  for (const question of questions) {
    const items = groups.get(question.type) || []
    items.push(question)
    groups.set(question.type, items)
  }

  return sectionOrder
    .filter((type) => groups.has(type))
    .map((type) => ({ type, questions: groups.get(type) || [] }))
}

async function buildRandomPaper(rules: Array<{ type: string; count: number }>) {
  const selected: SerializedQuestion[] = []

  for (const rule of rules) {
    if (!isQuestionType(rule.type)) {
      throw new ApiError(400, `无效题型: ${rule.type}`)
    }
    const count = Math.max(0, Math.min(100, Number(rule.count) || 0))
    if (count === 0) continue

    const questions = await getRandomQuestions({ type: rule.type, count })
    selected.push(...serializeQuestions(questions))
  }

  return selected
}

async function buildManualPaper(questionIds: number[]) {
  const uniqueIds = Array.from(new Set(questionIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)))
  if (uniqueIds.length === 0) return []

  const questions = serializeQuestions(await getQuestionsByIds(uniqueIds))
  const byId = new Map(questions.map((question) => [question.id, question]))
  return uniqueIds.map((id) => byId.get(id)).filter((question): question is SerializedQuestion => Boolean(question))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = PaperRequestSchema.parse(body)
    const title = validated.title?.trim() || "题库试卷"
    const includeAnswers = validated.includeAnswers !== false
    const format = validated.format || "json"

    const questions = validated.mode === "manual"
      ? await buildManualPaper(validated.questionIds || [])
      : await buildRandomPaper(validated.rules || [])

    if (questions.length === 0) {
      throw new ApiError(400, "没有可组卷的题目")
    }

    const sections: PaperSection[] = groupQuestions(questions)

    if (format === "docx") {
      const buffer = await createPaperDocx(title, sections, includeAnswers)
      const filename = encodeURIComponent(`${title}.docx`)
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
      return new NextResponse(arrayBuffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        },
      })
    }

    return NextResponse.json({
      title,
      total: questions.length,
      sections,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
