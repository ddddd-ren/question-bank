import { NextRequest, NextResponse } from "next/server"
import { getQuestionById, getQuestions, updateQuestion } from "@/lib/db/queries"
import { toEditable, fromEditable } from "@/lib/parser/question-templates"
import { detectQuestionType } from "@/lib/parser/question-extractor"
import { handleApiError } from "@/lib/api-error"
import type { QuestionType } from "@/lib/types"
import { z } from "zod"

const PostRequestSchema = z.object({
  questionId: z.number().int().positive(),
})

const PutRequestSchema = z.object({
  action: z.enum(["reparse", "changeType", "applyTemplate"]),
  questionIds: z.array(z.number().int().positive()).max(1000).optional(),
  type: z.enum(["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = PostRequestSchema.parse(body)

    const question = await getQuestionById(validated.questionId)
    if (!question) {
      return NextResponse.json({ error: "题目不存在" }, { status: 404 })
    }

    const editable = toEditable({
      ...question,
      options: question.options ? JSON.parse(question.options) : null,
      tags: question.tags ? JSON.parse(question.tags) : null,
    })

    return NextResponse.json({
      questionId: validated.questionId,
      original: {
        type: question.type,
        content: question.content,
      },
      editable,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = PutRequestSchema.parse(body)
    const { action, questionIds, type: targetType } = validated

    let questionsToUpdate: number[] = []

    if (questionIds && questionIds.length > 0) {
      questionsToUpdate = questionIds
    } else {
      const allQuestions = await getQuestions({ pageSize: 1000 })
      questionsToUpdate = allQuestions.data.map(q => q.id)
    }

    let updated = 0
    let failed = 0

    for (const qId of questionsToUpdate) {
      try {
        const question = await getQuestionById(qId)
        if (!question) {
          failed++
          continue
        }

        const parsed = {
          ...question,
          options: question.options ? JSON.parse(question.options) : null,
          tags: question.tags ? JSON.parse(question.tags) : null,
        }

        if (action === "changeType" && targetType) {
          await updateQuestion(qId, { type: targetType })
          updated++
        } else if (action === "reparse" || action === "applyTemplate") {
          const editable = toEditable(parsed)

          if (!targetType) {
            const detectedType = detectQuestionType(
              question.content,
              parsed.options || [],
              question.type as QuestionType
            )
            if (detectedType !== question.type) {
              editable.type = detectedType
            }
          } else {
            editable.type = targetType
          }

          const standard = fromEditable(editable)
          await updateQuestion(qId, {
            type: standard.type,
            content: standard.content || question.content,
            options: standard.options ? JSON.stringify(standard.options) : question.options,
            answer: standard.answer || question.answer,
            explanation: standard.explanation || question.explanation,
          })
          updated++
        }
      } catch (err) {
        console.error(`Failed to update question ${qId}:`, err)
        failed++
      }
    }

    return NextResponse.json({
      updated,
      failed,
      total: questionsToUpdate.length,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
