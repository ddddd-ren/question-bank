import { questionFingerprint } from "@/lib/question-fingerprint"
import type { ExtractedQuestion, QuestionType } from "./question-extractor"

interface JsonQuestion {
  type: string
  content: string
  options?: string[] | string
  answer?: string
  explanation?: string
  tags?: string[]
  difficulty?: number
}

interface JsonTemplate {
  version?: string
  questions: JsonQuestion[]
}

function isValidQuestionType(type: string): type is QuestionType {
  const validTypes: QuestionType[] = ["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]
  return validTypes.includes(type as QuestionType)
}

function normalizeOptions(options: string[] | string | undefined): string[] | null {
  if (!options) return null
  
  let optionArray: string[]
  if (typeof options === "string") {
    try {
      const parsed = JSON.parse(options)
      optionArray = Array.isArray(parsed) ? parsed : [options]
    } catch {
      optionArray = options.split(/[,;]/).map(s => s.trim()).filter(Boolean)
    }
  } else {
    optionArray = options
  }

  return optionArray.map((opt, idx) => {
    const trimmed = opt.trim()
    if (/^[A-Z][.:]/.test(trimmed)) {
      return trimmed
    }
    const letter = String.fromCharCode(65 + idx)
    return letter + ". " + trimmed
  })
}

export function parseJsonQuestions(jsonContent: string): ExtractedQuestion[] {
  try {
    const data = JSON.parse(jsonContent) as JsonTemplate | JsonQuestion[]
    const questions = Array.isArray(data) ? data : (data.questions || [])
    
    if (!Array.isArray(questions)) {
      throw new Error("Invalid JSON format: requires questions array")
    }

    return questions
      .filter((q): q is JsonQuestion => {
        if (!q.content || !q.type) {
          console.warn("Skipping invalid question: missing content or type")
          return false
        }
        if (!isValidQuestionType(q.type)) {
          console.warn('Skipping invalid question: unsupported type "' + q.type + '"')
          return false
        }
        return true
      })
      .map(q => ({
        type: q.type as QuestionType,
        content: q.content.trim(),
        options: normalizeOptions(q.options),
        answer: q.answer?.trim() || null,
        explanation: q.explanation?.trim() || null,
        contentHash: questionFingerprint({ type: q.type, content: q.content, options: normalizeOptions(q.options) }),
        tags: q.tags || [],
      }))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("JSON syntax error")
    }
    throw error
  }
}

export function validateJsonTemplate(jsonContent: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  try {
    const data = JSON.parse(jsonContent)
    const questions = Array.isArray(data) ? data : (data.questions || [])
    
    if (!Array.isArray(questions)) {
      errors.push("Requires questions array")
      return { valid: false, errors }
    }

    questions.forEach((q: Record<string, unknown>, idx: number) => {
      const num = idx + 1
      if (!q.content) errors.push("Question " + num + ": missing content field")
      if (!q.type) errors.push("Question " + num + ": missing type field")
      else if (!isValidQuestionType(q.type as string)) {
        errors.push('Question ' + num + ': unsupported type "' + q.type + '"')
      }
      
      if ((q.type === "single" || q.type === "multiple") && !q.options) {
        errors.push("Question " + num + ": choice questions must include options field")
      }
    })

    return { valid: errors.length === 0, errors }
  } catch {
    errors.push("JSON syntax error")
    return { valid: false, errors }
  }
}
