import { describe, it, expect } from 'vitest'
import { checkQuestionQuality, generateQualityReport } from '../quality-checker'

describe('checkQuestionQuality', () => {
  it.each([
    { type: 'single' as const, answer: 'Z', options: ['A. 一', 'Z. 自定义选项'] },
    { type: 'multiple' as const, answer: 'FALSE', options: ['F. 一', 'A. 二', 'L. 三', 'S. 四', 'E. 五'] },
  ])('即使选项存在也拒绝无法判分的答案 $answer', ({ type, answer, options }) => {
    const quality = checkQuestionQuality({ type, content: '请选择正确的选项', options, answer, explanation: null, contentHash: '' }, 0)
    expect(quality.question.issues).toContainEqual(expect.objectContaining({ type: 'format_error', severity: 'error' }))
  })

  it('补出的空白选项不能成为有效答案', () => {
    const quality = checkQuestionQuality({ type: 'single', content: '请选择正确的选项', options: ['A. 一', 'B. 二', 'C. ', 'D. '], answer: 'C', explanation: null, contentHash: '' }, 0)
    expect(quality.issueCount.error).toBeGreaterThan(0)
  })

  it.each(['Z', 'C', 'AB', '答案不合法'])('选择题答案 %s 无法通过共享质量校验', (answer) => {
    const quality = checkQuestionQuality({ type: 'single', content: '请选择正确的选项', options: ['A. 一', 'B. 二'], answer, explanation: null, contentHash: '' }, 0)
    expect(quality.issueCount.error).toBeGreaterThan(0)
  })

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

  it('maps uncertain recognition warnings and preserves evidence', () => {
    const quality = checkQuestionQuality({
      type: 'essay',
      content: 'This looks like a choice question without enough evidence.',
      options: null,
      answer: null,
      explanation: null,
      contentHash: 'test',
      diagnostic: {
        confidence: 62,
        warnings: [{ code: 'uncertain_type', message: '题型证据不足' }],
        evidence: ['检测到四个选项', '未检测到答案'],
      },
    }, 0)

    expect(quality.recognition?.confidence).toBe(62)
    expect(quality.recognition?.evidence).toEqual(['检测到四个选项', '未检测到答案'])
    expect(quality.question.issues).toContainEqual(expect.objectContaining({
      type: 'uncertain_type',
      severity: 'warning',
      message: '题型证据不足',
    }))
  })

  it.each([
    ['answer_option_mismatch', '答案引用了不存在的选项'],
    ['blank_answer_mismatch', '填空位与答案数量不一致'],
  ] as const)('maps %s recognition warnings to errors', (code, message) => {
    const quality = checkQuestionQuality({
      type: 'essay',
      content: 'A sufficiently long question stem.',
      options: null,
      answer: null,
      explanation: null,
      contentHash: 'test',
      diagnostic: {
        confidence: 40,
        warnings: [{ code, message }],
        evidence: [],
      },
    }, 0)

    expect(quality.question.issues).toContainEqual(expect.objectContaining({ code, severity: 'error' }))
  })

  it('keeps the legacy quality shape when recognition diagnostics are absent', () => {
    const quality = checkQuestionQuality({
      type: 'essay',
      content: 'A sufficiently long legacy question.',
      options: null,
      answer: null,
      explanation: null,
      contentHash: 'legacy',
    }, 0)

    expect(quality).not.toHaveProperty('recognition')
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
