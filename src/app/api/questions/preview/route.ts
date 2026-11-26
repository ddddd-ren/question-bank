import { NextRequest, NextResponse } from "next/server"
import { parseJsonQuestions } from "@/lib/parser/json-parser"
import { parseCsvQuestions } from "@/lib/parser/csv-parser"
import { getParserKind } from "@/lib/parser/loader"
import { applyTemplate, toEditable, fromEditable, renderPreview } from "@/lib/parser/question-templates"
import { handleApiError, ApiError } from "@/lib/api-error"
import { checkQuestionQuality, generateQualityReport } from "@/lib/parser/quality-checker"
import { isQuestionType } from "@/lib/types"
import { z } from "zod"
import { withSession } from "@/lib/auth-route"
import { isImportFileSizeAllowed, MAX_IMPORT_FILE_BYTES, MAX_IMPORT_QUESTIONS, MAX_IMPORT_TEXT_LENGTH } from "@/lib/import-limits"
import { splitDuplicateQuestions } from "@/lib/import-dedupe"
import { questionFingerprint } from "@/lib/question-fingerprint"

const TagsSchema = z.array(z.string().trim().min(1).max(50)).max(10).optional()

const BlankSchema = z.object({
  id: z.number().int().positive(),
  placeholder: z.string().max(200),
  answer: z.string().max(5000).optional(),
})

const PreservedSchema = z.object({
  sourceType: z.enum(["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]),
  options: z.array(z.string().max(2000)).max(20).optional(),
  answer: z.string().max(10000).optional(),
  blanks: z.array(BlankSchema).max(100).optional(),
  warnings: z.array(z.string().max(500)).max(100).optional(),
})

const PatchRequestSchema = z.object({
  question: z.object({
    sourcePage: z.number().int().positive().optional(),
    type: z.enum(["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]),
    tags: TagsSchema,
    stem: z.string().min(1).max(MAX_IMPORT_TEXT_LENGTH),
    options: z.array(z.string().max(2000)).max(20).optional(),
    answer: z.string().max(10000).optional(),
    explanation: z.string().max(MAX_IMPORT_TEXT_LENGTH).optional(),
    blanks: z.array(BlankSchema).max(100).optional(),
    preserved: PreservedSchema.optional(),
    blankSlots: z.array(z.object({
      index: z.number(),
      label: z.string().max(200),
      answer: z.string().max(5000),
    })).max(100).optional(),
  }),
  targetType: z.string().optional(),
  index: z.number().int().min(0).optional().default(0),
})

const PutRequestSchema = z.object({
  questions: z.array(z.object({
    sourcePage: z.number().int().positive().optional(),
    type: z.enum(["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]),
    tags: TagsSchema,
    stem: z.string().min(1).max(MAX_IMPORT_TEXT_LENGTH),
    options: z.array(z.string().max(2000)).max(20).optional(),
    answer: z.string().max(10000).optional(),
    explanation: z.string().max(MAX_IMPORT_TEXT_LENGTH).optional(),
    blanks: z.array(BlankSchema).max(100).optional(),
    blankSlots: z.array(z.object({
      index: z.number(),
      label: z.string().max(200),
      answer: z.string().max(5000),
    })).max(100).optional(),
  })).min(1).max(MAX_IMPORT_QUESTIONS),
  sourceFile: z.string().max(500).optional(),
  textbook: z.object({ bookId: z.string().uuid(), chapterId: z.string().uuid(), from: z.number().int().positive(), to: z.number().int().positive() }).optional(),
})

export const POST = withSession(async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length"))
    if (Number.isFinite(contentLength) && contentLength > MAX_IMPORT_FILE_BYTES + 1024 * 1024) {
      throw new ApiError(413, "导入文件不能超过 20 MiB")
    }

    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      throw new ApiError(400, "Please upload a file")
    }
    if (!isImportFileSizeAllowed(file.size)) {
      throw new ApiError(413, "导入文件不能超过 20 MiB")
    }

    const parserKind = getParserKind(file.name)
    const buffer = Buffer.from(await file.arrayBuffer())
    let questions

    if (parserKind === "json") {
      const jsonContent = buffer.toString("utf-8")
      questions = parseJsonQuestions(jsonContent)
    } else if (parserKind === "csv") {
      const csvContent = buffer.toString("utf-8")
      questions = parseCsvQuestions(csvContent)
    } else if (parserKind === "word") {
      const { parseWordBuffer } = await import("@/lib/parser/question-extractor")
      questions = await parseWordBuffer(buffer)
    } else if (parserKind === "pdf") {
      const { parsePdfBuffer } = await import("@/lib/parser/question-extractor")
      questions = await parsePdfBuffer(buffer)
    } else {
      const { parsePowerPointBuffer } = await import("@/lib/parser/question-extractor")
      questions = await parsePowerPointBuffer(buffer)
    }

    // Generate quality report
    const qualityReport = generateQualityReport(questions, 0)

    const editableQuestions = questions.map((question, idx) => {
      const q = { ...question, tags: TagsSchema.parse(question.tags) }
      return {
        index: idx,
        original: q,
        editable: toEditable(q),
        preview: renderPreview(q),
        quality: qualityReport.questions[idx],
      }
    })

    return NextResponse.json({
      total: questions.length,
      questions: editableQuestions,
      quality: {
        passed: qualityReport.passed,
        withIssues: qualityReport.withIssues,
        filtered: qualityReport.filtered,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
})

// Apply a question template while still in import preview.
export const PATCH = withSession(async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = PatchRequestSchema.parse(body)
    const { question, targetType, index } = validated

    if (targetType !== undefined && !isQuestionType(targetType)) {
      throw new ApiError(400, "无效的题型模板")
    }

    const editable = targetType && isQuestionType(targetType) ? applyTemplate(question, targetType) : question
    const standard = fromEditable(editable)
    const normalizedQuestion = {
      type: standard.type || editable.type,
      content: standard.content || editable.stem,
      options: standard.options || null,
      answer: standard.answer || null,
      explanation: standard.explanation || null,
      contentHash: "",
      sourcePage: standard.sourcePage,
      tags: standard.tags,
    }

    return NextResponse.json({
      editable,
      preview: renderPreview(normalizedQuestion),
      quality: checkQuestionQuality(normalizedQuestion, index),
    })
  } catch (error) {
    return handleApiError(error)
  }
})

// Batch import
export const PUT = withSession(async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = PutRequestSchema.parse(body)
    const { questions, sourceFile } = validated

    const { createQuestionsBatch, getQuestionsByHashes } = await import("@/lib/db/queries")

    const processedQuestions = questions.map((editable, index) => {
      const standard = fromEditable(editable)
      const hash = questionFingerprint({ type: standard.type || "essay", content: standard.content || "", options: standard.options })

      const question = {
        type: standard.type || "essay",
        content: standard.content || "",
        options: standard.options || null,
        answer: standard.answer || null,
        explanation: standard.explanation || null,
        contentHash: hash,
        tags: standard.tags,
        sourceFile: sourceFile || null,
        sourcePage: standard.sourcePage ?? null,
      }
      const quality = checkQuestionQuality({ ...question, sourcePage: standard.sourcePage }, index)
      if (quality.issueCount.error > 0) {
        throw new ApiError(400, `第 ${index + 1} 题仍有错误：${quality.question.issues.find(issue => issue.severity === "error")?.message}`)
      }
      return { ...question, options: question.options ? JSON.stringify(question.options) : null }
    })

    if (validated.textbook) {
      const { saveTextbookExercises } = await import("@/lib/db/textbook-exercises")
      const result = saveTextbookExercises(validated.textbook, processedQuestions.map(q => ({ ...q, tags: q.tags?.length ? JSON.stringify(q.tags) : null })))
      return NextResponse.json(result)
    }
    const hashes = processedQuestions.map(q => q.contentHash)
    const existingQuestions = await getQuestionsByHashes(hashes)
    const existingHashSet = new Set(existingQuestions.map(q => q.fingerprint!))

    const dedupeResult = splitDuplicateQuestions(processedQuestions, existingHashSet)
    const toImport = dedupeResult.unique
    const duplicates = dedupeResult.duplicateCount

    if (toImport.length > 0) {
      const byHash = new Map(toImport.map(q => [q.contentHash, q]))
      for (const q of processedQuestions) {
        const kept = byHash.get(q.contentHash)
        if (kept && kept !== q && q.tags?.length) {
          kept.tags = [...new Set([...(kept.tags ?? []), ...q.tags])]
          if (kept.tags.length > 10) throw new ApiError(400, "同题合并后的标签超过 10 个，请调整后导入")
        }
      }
      await createQuestionsBatch(toImport.map(q => ({ ...q, tags: q.tags?.length ? JSON.stringify(q.tags) : null })))
    }

    return NextResponse.json({
      imported: toImport.length,
      duplicates,
      total: questions.length,
    })
  } catch (error) {
    return handleApiError(error)
  }
})
