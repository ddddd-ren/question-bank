import type { NormalizedQuestion } from './question-normalizer'
import { normalizeQuestion } from './question-normalizer'
import type { ExtractedQuestion } from './question-extractor'
import type { RecognitionDiagnostic, RecognitionWarningCode } from './recognition-types'

export interface QuestionQuality {
  index: number
  question: NormalizedQuestion
  confidence: number
  issueCount: {
    error: number
    warning: number
    info: number
  }
  recognition?: RecognitionDiagnostic
}

export interface QualityReport {
  total: number
  passed: number
  withIssues: number
  filtered: number
  questions: QuestionQuality[]
}

export function checkQuestionQuality(question: ExtractedQuestion, index: number): QuestionQuality {
  const normalized = normalizeQuestion(question)

  const recognitionFields: Record<RecognitionWarningCode, string> = {
    uncertain_boundary: 'content',
    uncertain_type: 'type',
    uncertain_option: 'options',
    answer_option_mismatch: 'answer',
    blank_answer_mismatch: 'answer',
    conflicting_signals: 'type',
  }

  for (const warning of question.diagnostic?.warnings || []) {
    const field = recognitionFields[warning.code]
    const duplicate = normalized.issues.some((issue) => issue.type === warning.code && issue.field === field)
    if (duplicate) continue

    normalized.issues.push({
      type: warning.code,
      code: warning.code,
      severity: warning.code === 'answer_option_mismatch' || warning.code === 'blank_answer_mismatch'
        ? 'error'
        : 'warning',
      field,
      message: warning.message,
      autoFixed: false,
    })
  }

  const issueCount = {
    error: normalized.issues.filter(i => i.severity === 'error').length,
    warning: normalized.issues.filter(i => i.severity === 'warning').length,
    info: normalized.issues.filter(i => i.severity === 'info').length,
  }

  // Calculate confidence score
  let confidence = 100
  confidence -= issueCount.error * 30
  confidence -= issueCount.warning * 15
  confidence -= issueCount.info * 5
  confidence = Math.max(0, Math.min(100, confidence))
  if (question.diagnostic) {
    confidence = Math.min(confidence, question.diagnostic.confidence)
  }

  return {
    index,
    question: normalized,
    confidence,
    issueCount,
    ...(question.diagnostic ? { recognition: question.diagnostic } : {}),
  }
}

export function generateQualityReport(questions: ExtractedQuestion[], filteredCount: number): QualityReport {
  const qualities = questions.map((q, idx) => checkQuestionQuality(q, idx))

  return {
    total: questions.length + filteredCount,
    passed: qualities.filter(q => q.issueCount.error === 0 && q.issueCount.warning === 0).length,
    withIssues: qualities.filter(q => q.issueCount.error > 0 || q.issueCount.warning > 0).length,
    filtered: filteredCount,
    questions: qualities
  }
}
