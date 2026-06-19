// DTO serialization helpers — centralize JSON field parsing

import type { Question } from "./schema"

export interface SerializedQuestion extends Omit<Question, 'options' | 'tags'> {
  options: string[] | null
  tags: string[] | null
}

export function serializeQuestion(q: Question): SerializedQuestion {
  return {
    ...q,
    options: parseJsonArray(q.options),
    tags: parseJsonArray(q.tags),
  }
}

export function serializeQuestions(questions: Question[]): SerializedQuestion[] {
  return questions.map(serializeQuestion)
}

export function parseJsonArray(value: string | null): string[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function stringifyJsonArray(value: string[] | null | undefined): string | null {
  if (!value || value.length === 0) return null
  return JSON.stringify(value)
}
