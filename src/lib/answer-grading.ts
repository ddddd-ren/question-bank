import { normalizeChoiceAnswer } from "@/lib/parser/choice-answer"
import type { QuestionType } from "@/lib/types"

function normalizeTrueFalseAnswer(answer: string): string | null {
  const normalized = answer.trim().toLowerCase()
  if (["true", "对", "是", "正确", "√"].includes(normalized)) return "√"
  if (["false", "错", "否", "错误", "×", "x"].includes(normalized)) return "×"
  return null
}

function normalizeFreeText(answer: string): string {
  return answer.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase()
}

export function gradePracticeAnswer(
  type: QuestionType,
  expectedAnswer: string | null | undefined,
  userAnswer: string,
): boolean | null {
  if (!expectedAnswer?.trim()) return null

  if (type === "single" || type === "multiple") {
    const expected = normalizeChoiceAnswer(expectedAnswer)
    const actual = normalizeChoiceAnswer(userAnswer)
    return expected && actual ? expected === actual : false
  }

  if (type === "truefalse") {
    const expected = normalizeTrueFalseAnswer(expectedAnswer)
    const actual = normalizeTrueFalseAnswer(userAnswer)
    return expected && actual ? expected === actual : false
  }

  if (type === "fill") {
    return normalizeFreeText(expectedAnswer) === normalizeFreeText(userAnswer)
  }

  return null
}

export function toggleChoiceSelection(
  type: QuestionType,
  currentAnswer: string | null | undefined,
  choice: string,
): string | null {
  const normalizedChoice = normalizeChoiceAnswer(choice)
  if (!normalizedChoice) return currentAnswer || null
  if (type !== "multiple") return normalizedChoice

  const selected = new Set(normalizeChoiceAnswer(currentAnswer)?.split("") || [])
  if (selected.has(normalizedChoice)) {
    selected.delete(normalizedChoice)
  } else {
    selected.add(normalizedChoice)
  }

  return selected.size > 0 ? Array.from(selected).sort().join("") : null
}
