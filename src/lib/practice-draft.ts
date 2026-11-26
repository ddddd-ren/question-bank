import { z } from "zod"
import { PracticeSubmitSchema } from "./practice-input"
import { gradePracticeAnswer } from "./answer-grading"
import type { QuestionType } from "./types"

export const PRACTICE_DRAFT_KEY = "question-bank:practice-draft:v1"
const questionSchema = z.object({
  id: z.number().int().positive(), type: z.string(), content: z.string(),
  options: z.array(z.string()).nullable(), answer: z.string().nullable(), explanation: z.string().nullable().optional(),
})
const answerSchema = z.object({
  questionId: z.number().int().positive(), questionContent: z.string(), userAnswer: z.string(),
  correctAnswer: z.string().nullable(), isCorrect: z.boolean().nullable(), timeSpent: z.number().nonnegative(),
  saved: z.boolean(), selfAssessment: z.boolean().optional(),
})
const draftSchema = z.object({
  version: z.literal(1), sessionId: z.string().uuid(), context: z.string(),
  questions: z.array(questionSchema).min(1).max(100), currentIndex: z.number().int().nonnegative(),
  records: z.array(answerSchema).max(100), inputs: z.record(z.string(), z.string()),
  showReview: z.boolean(),
}).refine((d) => d.currentIndex < d.questions.length
  && new Set(d.questions.map(q => q.id)).size === d.questions.length
  && new Set(d.records.map(r => r.questionId)).size === d.records.length
  && d.records.every(r => d.questions.some(q => q.id === r.questionId)))
export type PracticeDraft = z.infer<typeof draftSchema>
export type Question = z.infer<typeof questionSchema>
export type AnswerRecord = z.infer<typeof answerSchema>
export function parsePracticeDraft(value: string | null): PracticeDraft | null {
  if (!value) return null
  try {
    const draft = draftSchema.parse(JSON.parse(value))
    draft.records = draft.records.filter(record => {
      if (record.saved) return true
      const parsed = PracticeSubmitSchema.safeParse(record)
      if (parsed.success) {
        record.userAnswer = parsed.data.userAnswer
        record.timeSpent = parsed.data.timeSpent ?? 0
        return true
      }
      // 旧版本失败答案恢复为可编辑输入，避免刷新后反复提交同一无效负载。
      draft.inputs[String(record.questionId)] = record.userAnswer
      draft.currentIndex = draft.questions.findIndex(q => q.id === record.questionId)
      draft.showReview = false
      return false
    })
    return draft
  } catch { return null }
}
export function recordAnswer(records: AnswerRecord[], answer: AnswerRecord, update = false): AnswerRecord[] {
  if (records.some(r => r.questionId === answer.questionId)) {
    return update ? records.map(r => r.questionId === answer.questionId ? answer : r) : records
  }
  return [...records, answer]
}

export function createAnswerRecord(question: Question, answer: string, timeSpent: number): AnswerRecord {
  const input = PracticeSubmitSchema.parse({ questionId: question.id, userAnswer: answer, timeSpent })
  return {
    questionId: question.id, questionContent: question.content, userAnswer: input.userAnswer, correctAnswer: question.answer,
    isCorrect: gradePracticeAnswer(question.type as QuestionType, question.answer, input.userAnswer),
    timeSpent: input.timeSpent ?? 0, saved: false,
  }
}
