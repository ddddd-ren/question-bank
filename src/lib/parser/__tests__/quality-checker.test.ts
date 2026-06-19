import { describe, it, expect } from 'vitest'
import { checkQuestionQuality, generateQualityReport } from '../quality-checker'

describe('checkQuestionQuality', () => {
  it('should give high confidence for good question', () => {
    const quality = checkQuestionQuality({
      type: 'single',
      content: 'Which is a JavaScript data type?',
      options: ['A. String', 'B. Number', 'C. Boolean', 'D. All'],
      answer: 'D',
      explanation: null,
      contentHash: 'test'
    }, 0)
    expect(quality.confidence).toBeGreaterThan(80)
    expect(quality.issueCount.error).toBe(0)
  })

  it('should give low confidence for missing answer', () => {
    const quality = checkQuestionQuality({
      type: 'single',
      content: 'Which is correct?',
      options: ['A. Yes', 'B. No'],
      answer: null,
      explanation: null,
      contentHash: 'test'
    }, 0)
    expect(quality.issueCount.warning).toBeGreaterThan(0)
  })
})

describe('generateQualityReport', () => {
  it('should generate report with stats', () => {
    const report = generateQualityReport([
      {
        type: 'single',
        content: 'Good question?',
        options: ['A. Yes', 'B. No'],
        answer: 'A',
        explanation: null,
        contentHash: 'test1'
      },
      {
        type: 'single',
        content: 'Bad question',
        options: null,
        answer: null,
        explanation: null,
        contentHash: 'test2'
      }
    ], 5)

    expect(report.total).toBe(7)
    expect(report.filtered).toBe(5)
    expect(report.questions.length).toBe(2)
  })
})
