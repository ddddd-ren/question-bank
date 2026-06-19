import { NextRequest, NextResponse } from "next/server"
import { parsePdfBuffer, parsePowerPointBuffer, parseWordBuffer } from "@/lib/parser"
import { parseJsonQuestions } from "@/lib/parser/json-parser"
import { applyTemplate, toEditable, fromEditable, renderPreview } from "@/lib/parser/question-templates"
import { handleApiError, ApiError } from "@/lib/api-error"
import { checkQuestionQuality, generateQualityReport } from "@/lib/parser/quality-checker"
import { isQuestionType } from "@/lib/types"
import { z } from "zod"

const PatchRequestSchema = z.object({
  question: z.object({
    type: z.enum(["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]),
    stem: z.string(),
    options: z.array(z.string()).optional(),
    answer: z.string().optional(),
    explanation: z.string().optional(),
    blankSlots: z.array(z.object({
      index: z.number(),
      label: z.string(),
      answer: z.string(),
    })).optional(),
  }),
  targetType: z.string(),
  index: z.number().int().min(0).optional().default(0),
})

const PutRequestSchema = z.object({
  questions: z.array(z.object({
    type: z.enum(["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]),
    stem: z.string(),
    options: z.array(z.string()).optional(),
    answer: z.string().optional(),
    explanation: z.string().optional(),
    blankSlots: z.array(z.object({
      index: z.number(),
      label: z.string(),
      answer: z.string(),
    })).optional(),
  })).min(1).max(10000),
  sourceFile: z.string().max(500).optional(),
})

// Parse CSV content
function parseCsvQuestions(csvContent: string) {
  const lines = csvContent.split("\n").filter(line => line.trim())
  if (lines.length < 2) {
    throw new ApiError(400, "CSV file is empty or format error")
  }

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase())
  const questions = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].match(/(".*?"|[^,]+)/g)?.map(v => v.replace(/^"|"$/g, "").trim()) || []

    if (values.length < 2) continue

    const typeIdx = headers.findIndex(h => h.includes("type"))
    const contentIdx = headers.findIndex(h => h.includes("content"))
    const optionsIdx = headers.findIndex(h => h.includes("options"))
    const answerIdx = headers.findIndex(h => h.includes("answer"))
    const explanationIdx = headers.findIndex(h => h.includes("explanation"))
    const tagsIdx = headers.findIndex(h => h.includes("tags"))

    const optionsStr = optionsIdx >= 0 ? values[optionsIdx] : undefined
    const options = optionsStr ? optionsStr.split("|").map(o => o.trim()) : undefined

    questions.push({
      type: typeIdx >= 0 ? values[typeIdx] : "essay",
      content: contentIdx >= 0 ? values[contentIdx] : values[0],
      options,
      answer: answerIdx >= 0 ? values[answerIdx] : undefined,
      explanation: explanationIdx >= 0 ? values[explanationIdx] : undefined,
      tags: tagsIdx >= 0 ? values[tagsIdx]?.split("|").map(t => t.trim()) : undefined,
    })
  }

  return parseJsonQuestions(JSON.stringify({ questions }))
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      throw new ApiError(400, "Please upload a file")
    }

    const fileName = file.name.toLowerCase()
    const buffer = Buffer.from(await file.arrayBuffer())
    let questions

    if (fileName.endsWith(".json")) {
      const jsonContent = buffer.toString("utf-8")
      questions = parseJsonQuestions(jsonContent)
    } else if (fileName.endsWith(".csv")) {
      const csvContent = buffer.toString("utf-8")
      questions = parseCsvQuestions(csvContent)
    } else if (fileName.endsWith(".docx")) {
      questions = await parseWordBuffer(buffer)
    } else if (fileName.endsWith(".pdf")) {
      questions = await parsePdfBuffer(buffer)
    } else if (fileName.endsWith(".ppt") || fileName.endsWith(".pptx") || fileName.endsWith(".pptm")) {
      questions = await parsePowerPointBuffer(buffer)
    } else {
      throw new ApiError(400, "Unsupported file format. Please use .docx, .pdf, .ppt, .pptx, .pptm, .json or .csv")
    }

    // Generate quality report
    const qualityReport = generateQualityReport(questions, 0)

    const editableQuestions = questions.map((q, idx) => ({
      index: idx,
      original: q,
      editable: toEditable(q),
      preview: renderPreview(q),
      quality: qualityReport.questions[idx],
    }))

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
}

// Apply a question template while still in import preview.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = PatchRequestSchema.parse(body)
    const { question, targetType, index } = validated

    if (!isQuestionType(targetType)) {
      throw new ApiError(400, "无效的题型模板")
    }

    const editable = applyTemplate(question, targetType)
    const standard = fromEditable(editable)
    const normalizedQuestion = {
      type: standard.type || targetType,
      content: standard.content || editable.stem,
      options: standard.options || null,
      answer: standard.answer || null,
      explanation: standard.explanation || null,
      contentHash: "",
    }

    return NextResponse.json({
      editable,
      preview: renderPreview(normalizedQuestion),
      quality: checkQuestionQuality(normalizedQuestion, index),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

// Batch import
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = PutRequestSchema.parse(body)
    const { questions, sourceFile } = validated

    const crypto = await import("crypto")
    const { createQuestionsBatch, getQuestionsByHashes } = await import("@/lib/db/queries")

    const processedQuestions = questions.map(editable => {
      const standard = fromEditable(editable)
      const content = (standard.content || "").replace(/\s+/g, "").toLowerCase()
      const hash = crypto.createHash("md5").update(content).digest("hex")

      return {
        type: standard.type || "essay",
        content: standard.content || "",
        options: standard.options ? JSON.stringify(standard.options) : null,
        answer: standard.answer || null,
        explanation: standard.explanation || null,
        contentHash: hash,
        sourceFile: sourceFile || null,
      }
    })

    const hashes = processedQuestions.map(q => q.contentHash)
    const existingQuestions = await getQuestionsByHashes(hashes)
    const existingHashSet = new Set(existingQuestions.map(q => q.contentHash))

    const toImport = []
    const duplicates = []

    for (const q of processedQuestions) {
      if (existingHashSet.has(q.contentHash)) {
        duplicates.push({ content: q.content.substring(0, 50) })
      } else {
        toImport.push(q)
      }
    }

    if (toImport.length > 0) {
      await createQuestionsBatch(toImport)
    }

    return NextResponse.json({
      imported: toImport.length,
      duplicates: duplicates.length,
      total: questions.length,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
