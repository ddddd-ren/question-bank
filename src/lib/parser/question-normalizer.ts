import type { QuestionType, ExtractedQuestion } from './question-extractor'
import { normalizeChoiceAnswer } from './choice-answer'

export interface QualityIssue {
  type: 'missing_content' | 'missing_options' | 'missing_answer' | 'format_error' | 'options_count' | 'answer_mismatch'
  severity: 'error' | 'warning' | 'info'
  field: string
  message: string
  autoFixed: boolean
}

export interface NormalizedQuestion extends ExtractedQuestion {
  normalized: boolean
  changes: string[]
  issues: QualityIssue[]
}

interface QuestionTemplate {
  type: QuestionType
  label: string
  required: {
    content: boolean
    options: boolean
    minOptions: number
    maxOptions: number
    answer: boolean
  }
  format: {
    optionPattern: RegExp
    answerPattern: RegExp
  }
}

const questionTemplates: Record<QuestionType, QuestionTemplate> = {
  single: {
    type: 'single',
    label: '单选题',
    required: { content: true, options: true, minOptions: 2, maxOptions: 10, answer: true },
    format: {
      optionPattern: /^[A-Z][.、．]\s*.+$/,
      answerPattern: /^[A-Z]$/
    }
  },
  multiple: {
    type: 'multiple',
    label: '多选题',
    required: { content: true, options: true, minOptions: 2, maxOptions: 10, answer: true },
    format: {
      optionPattern: /^[A-Z][.、．]\s*.+$/,
      answerPattern: /^[A-Z]{2,}$/
    }
  },
  truefalse: {
    type: 'truefalse',
    label: '判断题',
    required: { content: true, options: false, minOptions: 0, maxOptions: 0, answer: true },
    format: {
      optionPattern: /^$/,
      answerPattern: /^[√×]|^true$|^false$/i
    }
  },
  fill: {
    type: 'fill',
    label: '填空题',
    required: { content: true, options: false, minOptions: 0, maxOptions: 0, answer: true },
    format: {
      optionPattern: /^$/,
      answerPattern: /.+/
    }
  },
  calculation: {
    type: 'calculation',
    label: '计算题',
    required: { content: true, options: false, minOptions: 0, maxOptions: 0, answer: false },
    format: {
      optionPattern: /^$/,
      answerPattern: /.*/
    }
  },
  essay: {
    type: 'essay',
    label: '论述题',
    required: { content: true, options: false, minOptions: 0, maxOptions: 0, answer: false },
    format: {
      optionPattern: /^$/,
      answerPattern: /.*/
    }
  },
  code: {
    type: 'code',
    label: '代码题',
    required: { content: true, options: false, minOptions: 0, maxOptions: 0, answer: false },
    format: {
      optionPattern: /^$/,
      answerPattern: /.*/
    }
  }
}

export function getTemplate(type: QuestionType): QuestionTemplate {
  return questionTemplates[type] || questionTemplates.essay
}

export function normalizeOptions(options: string[] | null): { normalized: string[] | null; changes: string[] } {
  if (!options || options.length === 0) {
    return { normalized: options, changes: [] }
  }

  const changes: string[] = []
  const normalized = options.map((opt, idx) => {
    let normalizedOpt = opt.trim()

    // Add missing letter prefix
    if (!/^[A-Z][.、．]/.test(normalizedOpt)) {
      const letter = String.fromCharCode(65 + idx)
      normalizedOpt = `${letter}. ${normalizedOpt}`
      changes.push(`选项 ${idx + 1}: 添加字母前缀`)
    }

    // Normalize separator to ". "
    normalizedOpt = normalizedOpt.replace(/^([A-Z])[、．]\s*/, '$1. ')

    return normalizedOpt
  })

  return { normalized, changes }
}

function optionLetters(options: string[] | null): Set<string> {
  const letters = new Set<string>()
  options?.forEach((option, idx) => {
    const match = option.trim().match(/^([A-Z])\s*[.、．:：]/i)
    letters.add((match?.[1] || String.fromCharCode(65 + idx)).toUpperCase())
  })
  return letters
}

export function normalizeAnswer(answer: string | null, type: QuestionType): { normalized: string | null; changes: string[] } {
  if (!answer) {
    return { normalized: answer, changes: [] }
  }

  const changes: string[] = []
  let normalized = answer.trim()

  // Normalize based on type
  if (type === 'single' || type === 'multiple') {
    const choiceAnswer = normalizeChoiceAnswer(normalized)
    if (choiceAnswer && choiceAnswer !== normalized) {
      normalized = choiceAnswer
      changes.push('答案: 标准化为选项字母')
    }
  } else if (type === 'truefalse') {
    // Normalize to √/×
    if (/^(true|对|是|正确|√)$/i.test(normalized)) {
      if (normalized !== '√') {
        normalized = '√'
        changes.push('答案: 标准化为 √')
      }
    } else if (/^(false|错|否|错误|×)$/i.test(normalized)) {
      if (normalized !== '×') {
        normalized = '×'
        changes.push('答案: 标准化为 ×')
      }
    }
  }

  return { normalized, changes }
}

export function validateQuestion(question: ExtractedQuestion): QualityIssue[] {
  const template = getTemplate(question.type)
  const issues: QualityIssue[] = []

  // Check required content
  if (template.required.content && (!question.content || question.content.trim().length < 5)) {
    issues.push({
      type: 'missing_content',
      severity: 'error',
      field: 'content',
      message: '题干内容缺失或过短',
      autoFixed: false
    })
  }

  // Check required options
  if (template.required.options) {
    if (!question.options || question.options.length === 0) {
      issues.push({
        type: 'missing_options',
        severity: 'error',
        field: 'options',
        message: `${template.label}必须包含选项`,
        autoFixed: false
      })
    } else if (question.options.length < template.required.minOptions) {
      issues.push({
        type: 'options_count',
        severity: 'warning',
        field: 'options',
        message: `选项数量不足，至少需要 ${template.required.minOptions} 个`,
        autoFixed: false
      })
    }
  }

  // Check required answer
  if (template.required.answer && (!question.answer || question.answer.trim().length === 0)) {
    issues.push({
      type: 'missing_answer',
      severity: 'warning',
      field: 'answer',
      message: '缺少答案',
      autoFixed: false
    })
  }

  // Check answer format
  const answerForValidation = question.type === 'single' || question.type === 'multiple'
    ? normalizeChoiceAnswer(question.answer)
    : question.answer

  if (answerForValidation && !template.format.answerPattern.test(answerForValidation)) {
    issues.push({
      type: 'format_error',
      severity: 'info',
      field: 'answer',
      message: `答案格式不符合 ${template.label} 规范`,
      autoFixed: false
    })
  }

  if ((question.type === 'single' || question.type === 'multiple') && question.answer && question.options?.length) {
    const normalizedAnswer = normalizeChoiceAnswer(question.answer)
    const availableLetters = optionLetters(question.options)
    const invalidLetters = normalizedAnswer
      ?.split('')
      .filter((letter) => !availableLetters.has(letter))

    if (invalidLetters && invalidLetters.length > 0) {
      issues.push({
        type: 'answer_mismatch',
        severity: 'warning',
        field: 'answer',
        message: `答案包含不存在的选项：${invalidLetters.join('、')}`,
        autoFixed: false
      })
    }
  }

  return issues
}

export function normalizeQuestion(question: ExtractedQuestion): NormalizedQuestion {
  const allChanges: string[] = []
  const allIssues: QualityIssue[] = []

  // Validate original question
  const validationIssues = validateQuestion(question)
  allIssues.push(...validationIssues)

  // Normalize options
  const { normalized: normalizedOptions, changes: optionChanges } = normalizeOptions(question.options)
  allChanges.push(...optionChanges)

  // Normalize answer
  const { normalized: normalizedAnswer, changes: answerChanges } = normalizeAnswer(question.answer, question.type)
  allChanges.push(...answerChanges)

  return {
    ...question,
    options: normalizedOptions,
    answer: normalizedAnswer,
    normalized: allChanges.length > 0,
    changes: allChanges,
    issues: allIssues
  }
}
