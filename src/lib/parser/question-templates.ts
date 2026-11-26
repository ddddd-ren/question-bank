import type { ExtractedQuestion, QuestionType } from "./question-extractor"
import { normalizeChoiceAnswer } from "./choice-answer"

export interface BlankSlot {
  id: number
  placeholder: string
  answer?: string
}

export interface PreservedTemplateData {
  sourceType: QuestionType
  options?: string[]
  answer?: string
  blanks?: BlankSlot[]
  warnings?: string[]
}

export interface EditableQuestion {
  type: QuestionType
  stem: string
  sourcePage?: number
  tags?: string[]
  options?: string[]
  blanks?: BlankSlot[]
  answer?: string
  explanation?: string
  preserved?: PreservedTemplateData
}

export interface QuestionTemplate {
  type: QuestionType
  label: string
  render: (question: ExtractedQuestion) => string
  toEditable: (question: ExtractedQuestion) => EditableQuestion
  fromEditable: (editable: EditableQuestion) => Partial<ExtractedQuestion>
}

function parseOptions(options: string[] | string | null | undefined): string[] {
  if (!options) return []
  if (Array.isArray(options)) return options
  try {
    const parsed = JSON.parse(options) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

function normalizeTrueFalseAnswer(answer?: string): string | null {
  if (!answer) return null
  if (/^(true|对|是|正确|√)$/i.test(answer.trim())) return "√"
  if (/^(false|错|否|错误|×|x)$/i.test(answer.trim())) return "×"
  return answer.trim()
}

function validTrueFalseAnswer(answer?: string): string | undefined {
  const normalized = normalizeTrueFalseAnswer(answer)
  return normalized === "√" || normalized === "×" ? normalized : undefined
}

function validChoiceAnswer(answer?: string): string | undefined {
  const normalized = normalizeChoiceAnswerForTemplate(answer)
  return normalized && /^[A-Z]+$/.test(normalized) ? normalized : undefined
}

function compactText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeOptionLabel(option: string, index: number): string {
  const trimmed = option.trim()
  const letter = String.fromCharCode(65 + index)
  if (!trimmed) return `${letter}. `

  const match = trimmed.match(/^([A-ZＡ-Ｚａ-ｚ])\s*[.、．:：)）]\s*(.*)$/)
  if (match) {
    const code = match[1].charCodeAt(0)
    const normalizedLetter = code >= 0xff41
      ? String.fromCharCode(code - 0xff41 + 97).toUpperCase()
      : code >= 0xff21
        ? String.fromCharCode(code - 0xff21 + 65)
        : match[1].toUpperCase()
    return `${normalizedLetter}. ${match[2].trim()}`
  }

  return `${letter}. ${trimmed}`
}

function normalizeChoiceOptions(options: string[] | string | null | undefined, minSlots = 4): string[] {
  const parsed = parseOptions(options)
    .map((option, index) => normalizeOptionLabel(option, index))
    .filter((option) => option.replace(/^[A-Z]\.\s*/, "").trim().length > 0)

  while (parsed.length < minSlots) {
    parsed.push(`${String.fromCharCode(65 + parsed.length)}. `)
  }

  return parsed
}

function cleanChoiceOptions(options: string[] | undefined): string[] | null {
  const cleaned = (options || [])
    .map((option, index) => normalizeOptionLabel(option, index))
    .filter((option) => option.replace(/^[A-Z]\.\s*/, "").trim().length > 0)

  return cleaned.length > 0 ? cleaned : null
}

function normalizeChoiceAnswerForTemplate(answer?: string): string | undefined {
  const trimmed = answer?.trim()
  if (!trimmed) return undefined
  return normalizeChoiceAnswer(trimmed) || trimmed
}

function answerLine(label: string, answer: string | null | undefined): string {
  return answer ? `\n\n${label}：${answer}` : ""
}

function baseEditable(type: QuestionType, question: ExtractedQuestion): EditableQuestion {
  return {
    type,
    stem: question.content,
    answer: question.answer || undefined,
    explanation: question.explanation || undefined,
  }
}

const singleChoiceTemplate: QuestionTemplate = {
  type: "single",
  label: "单选题",
  render(question) {
    const options = parseOptions(question.options)
    return question.content + (options.length ? `\n${options.join("\n")}` : "") + answerLine("答案", question.answer)
  },
  toEditable(question) {
    return {
      ...baseEditable("single", question),
      options: normalizeChoiceOptions(question.options),
      answer: normalizeChoiceAnswerForTemplate(question.answer || undefined),
    }
  },
  fromEditable(editable) {
    return {
      type: "single",
      content: editable.stem,
      options: cleanChoiceOptions(editable.options),
      answer: normalizeChoiceAnswerForTemplate(editable.answer) || null,
      explanation: compactText(editable.explanation),
    }
  },
}

const multipleChoiceTemplate: QuestionTemplate = {
  type: "multiple",
  label: "多选题",
  render(question) {
    const options = parseOptions(question.options)
    return question.content + (options.length ? `\n${options.join("\n")}` : "") + answerLine("答案", question.answer)
  },
  toEditable(question) {
    return {
      ...baseEditable("multiple", question),
      options: normalizeChoiceOptions(question.options),
      answer: normalizeChoiceAnswerForTemplate(question.answer || undefined),
    }
  },
  fromEditable(editable) {
    return {
      type: "multiple",
      content: editable.stem,
      options: cleanChoiceOptions(editable.options),
      answer: normalizeChoiceAnswerForTemplate(editable.answer) || null,
      explanation: compactText(editable.explanation),
    }
  },
}

const trueFalseTemplate: QuestionTemplate = {
  type: "truefalse",
  label: "判断题",
  render(question) {
    return question.content + answerLine("答案", normalizeTrueFalseAnswer(question.answer || undefined))
  },
  toEditable(question) {
    const stem = question.content
      .replace(/[（(]\s*(√|×|x|X|对|错|是|否|true|false)\s*[）)]/gi, "（ ）")
      .trim()

    return {
      ...baseEditable("truefalse", question),
      stem,
      answer: normalizeTrueFalseAnswer(question.answer || undefined) || undefined,
    }
  },
  fromEditable(editable) {
    return {
      type: "truefalse",
      content: editable.stem,
      options: null,
      answer: normalizeTrueFalseAnswer(editable.answer) || null,
      explanation: compactText(editable.explanation),
    }
  },
}

const BLANK_MARKER_PATTERN = /____\{(\d+)\}|[（(]\s*[）)]|【\s*】|\[\s*]|_{3,}/g

const fillBlankTemplate: QuestionTemplate = {
  type: "fill",
  label: "填空题",
  render(question) {
    return question.content + answerLine("答案", question.answer)
  },
  toEditable(question) {
    const answers = (question.answer || "").split(/[;；|]/).map((item) => item.trim()).filter(Boolean)
    const blanks: BlankSlot[] = []
    const existingIds = Array.from(question.content.matchAll(/____\{(\d+)\}/g), (match) => Number(match[1]))
    let nextBlankId = Math.max(0, ...existingIds) + 1
    let answerIndex = 0

    const stem = question.content.replace(BLANK_MARKER_PATTERN, (marker, numberedId?: string) => {
        const id = numberedId ? Number(numberedId) : nextBlankId++
        blanks.push({ id, placeholder: "____", answer: answers[answerIndex] })
        answerIndex += 1
        return `____{${id}}`
    })

    if (blanks.length === 0 && question.answer) {
      blanks.push({ id: 1, placeholder: "____", answer: question.answer })
    }

    const surplusAnswers = answers.slice(blanks.length)
    const preserved = surplusAnswers.length > 0
      ? {
          sourceType: "fill" as const,
          answer: surplusAnswers.join("; "),
          warnings: ["答案数量多于填空位，额外答案已保留"],
        }
      : undefined

    return {
      ...baseEditable("fill", question),
      stem,
      blanks,
      preserved,
    }
  },
  fromEditable(editable) {
    const answers = editable.blanks?.map((blank) => blank.answer?.trim()).filter(Boolean) as string[] | undefined

    return {
      type: "fill",
      content: editable.stem,
      options: null,
      answer: answers && answers.length > 0 ? answers.join("; ") : editable.answer || null,
      explanation: compactText(editable.explanation),
    }
  },
}

const calculationTemplate: QuestionTemplate = {
  type: "calculation",
  label: "计算题",
  render(question) {
    return question.content + answerLine("参考答案", question.answer)
  },
  toEditable(question) {
    return baseEditable("calculation", question)
  },
  fromEditable(editable) {
    return {
      type: "calculation",
      content: editable.stem,
      options: null,
      answer: compactText(editable.answer),
      explanation: compactText(editable.explanation),
    }
  },
}

const essayTemplate: QuestionTemplate = {
  type: "essay",
  label: "论述题",
  render(question) {
    return question.content + answerLine("参考答案", question.answer)
  },
  toEditable(question) {
    return baseEditable("essay", question)
  },
  fromEditable(editable) {
    return {
      type: "essay",
      content: editable.stem,
      options: null,
      answer: compactText(editable.answer),
      explanation: compactText(editable.explanation),
    }
  },
}

const codeTemplate: QuestionTemplate = {
  type: "code",
  label: "编程题",
  render(question) {
    return question.content + (question.answer ? `\n\n参考代码：\n${question.answer}` : "")
  },
  toEditable(question) {
    return baseEditable("code", question)
  },
  fromEditable(editable) {
    return {
      type: "code",
      content: editable.stem,
      options: null,
      answer: compactText(editable.answer),
      explanation: compactText(editable.explanation),
    }
  },
}

export const questionTemplates: Record<QuestionType, QuestionTemplate> = {
  single: singleChoiceTemplate,
  multiple: multipleChoiceTemplate,
  truefalse: trueFalseTemplate,
  fill: fillBlankTemplate,
  calculation: calculationTemplate,
  essay: essayTemplate,
  code: codeTemplate,
}

export function getTemplate(type: QuestionType): QuestionTemplate {
  return questionTemplates[type] || essayTemplate
}

export function toEditable(question: ExtractedQuestion): EditableQuestion {
  return { ...getTemplate(question.type).toEditable(question), sourcePage: question.sourcePage, tags: question.tags }
}

export function fromEditable(editable: EditableQuestion): Partial<ExtractedQuestion> {
  return { ...getTemplate(editable.type).fromEditable(editable), sourcePage: editable.sourcePage, tags: editable.tags }
}

export function applyTemplate(editable: EditableQuestion, targetType: QuestionType): EditableQuestion {
  const blankAnswers = editable.blanks
    ?.map((blank) => blank.answer?.trim())
    .filter((answer): answer is string => Boolean(answer))

  const currentAnswer = blankAnswers && blankAnswers.length > 0
    ? blankAnswers.join("; ")
    : compactText(editable.answer) || undefined
  const preserved: PreservedTemplateData = editable.preserved || {
    sourceType: editable.type,
    options: cleanChoiceOptions(editable.options) || undefined,
    answer: currentAnswer,
    blanks: editable.blanks?.map((blank) => ({ ...blank })),
  }

  if (targetType === preserved.sourceType) {
    const answerWasEdited = Boolean(currentAnswer && currentAnswer !== preserved.answer)
    const restoredAnswer = answerWasEdited ? currentAnswer : preserved.answer
    const restored = toEditable({
      sourcePage: editable.sourcePage, tags: editable.tags,
      type: targetType,
      content: editable.stem,
      options: preserved.options || null,
      answer: restoredAnswer || null,
      explanation: compactText(editable.explanation),
      contentHash: "",
    })

    return {
      ...restored,
      blanks: targetType === "fill" && preserved.blanks
        ? preserved.blanks.map((blank) => ({ ...blank }))
        : restored.blanks,
      preserved,
    }
  }

  const targetAnswer = targetType === "truefalse"
    ? validTrueFalseAnswer(currentAnswer)
    : targetType === "single" || targetType === "multiple"
      ? validChoiceAnswer(currentAnswer)
      : currentAnswer

  const converted = toEditable({
    sourcePage: editable.sourcePage, tags: editable.tags,
    type: targetType,
    content: editable.stem,
    options: targetType === "single" || targetType === "multiple" ? cleanChoiceOptions(editable.options) : null,
    answer: targetAnswer || null,
    explanation: compactText(editable.explanation),
    contentHash: "",
  })

  return { ...converted, preserved }
}

export function renderPreview(question: ExtractedQuestion): string {
  return getTemplate(question.type).render(question) + (question.tags?.length ? `\n\n标签：${question.tags.join("、")}` : "")
}
