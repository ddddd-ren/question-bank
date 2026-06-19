import type { NormalizedQuestion } from './question-normalizer'
import { normalizeQuestion } from './question-normalizer'
import type { ExtractedQuestion } from './question-extractor'

export interface QuestionQuality {
  index: number
  question: NormalizedQuestion
  confidence: number
  issueCount: {
    error: number
    warning: number
    info: number
  }
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

  return {
    index,
    question: normalized,
    confidence,
    issueCount
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
