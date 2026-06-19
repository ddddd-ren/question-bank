// Shared domain types — single source of truth

export const QUESTION_TYPES = [
  "single",
  "multiple",
  "truefalse",
  "fill",
  "calculation",
  "essay",
  "code",
] as const

export type QuestionType = (typeof QUESTION_TYPES)[number]

export function isQuestionType(value: string): value is QuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(value)
}

export function assertQuestionType(value: string): QuestionType {
  if (!isQuestionType(value)) {
    throw new Error(`Invalid question type: ${value}`)
  }
  return value
}
