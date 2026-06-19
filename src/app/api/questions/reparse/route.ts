import { NextRequest, NextResponse } from "next/server"
import { getQuestionById, getQuestions, updateQuestion } from "@/lib/db/queries"
import { toEditable, fromEditable } from "@/lib/parser/question-templates"
import { detectQuestionType } from "@/lib/parser/question-extractor"
import { handleApiError } from "@/lib/api-error"
import type { QuestionType } from "@/lib/types"

// 单个题目重新识别
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { questionId } = body

    if (!questionId) {
      return NextResponse.json({ error: "缺少题目ID" }, { status: 400 })
    }

    const question = await getQuestionById(questionId)
    if (!question) {
      return NextResponse.json({ error: "题目不存在" }, { status: 404 })
    }

    const editable = toEditable({
      ...question,
      options: question.options ? JSON.parse(question.options) : null,
      tags: question.tags ? JSON.parse(question.tags) : null,
    })

    return NextResponse.json({
      questionId,
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

// 批量重新识别
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, questionIds, type: targetType } = body as {
      action: "reparse" | "changeType" | "applyTemplate"
      questionIds?: number[]
      type?: QuestionType
    }

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
