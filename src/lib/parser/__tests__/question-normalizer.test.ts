import { describe, it, expect } from 'vitest'
import { normalizeOptions, normalizeAnswer, validateQuestion, normalizeQuestion } from '../question-normalizer'

describe('normalizeOptions', () => {
  it('should add missing letter prefix', () => {
    const result = normalizeOptions(['String', 'Number', 'Boolean'])
    expect(result.normalized).toEqual(['A. String', 'B. Number', 'C. Boolean'])
    expect(result.changes.length).toBe(3)
  })

  it('should normalize separator', () => {
    const result = normalizeOptions(['A、String', 'B、Number'])
    expect(result.normalized).toEqual(['A. String', 'B. Number'])
  })

  it('should handle null options', () => {
    const result = normalizeOptions(null)
    expect(result.normalized).toBeNull()
    expect(result.changes.length).toBe(0)
  })
})

describe('normalizeAnswer', () => {
  it('should uppercase single choice answer', () => {
    const result = normalizeAnswer('a', 'single')
    expect(result.normalized).toBe('A')
  })

  it('should normalize multiple choice separators and order', () => {
    const result = normalizeAnswer('c、a,a', 'multiple')
    expect(result.normalized).toBe('AC')
  })

  it('should normalize true/false', () => {
    expect(normalizeAnswer('对', 'truefalse').normalized).toBe('√')
    expect(normalizeAnswer('错', 'truefalse').normalized).toBe('×')
    expect(normalizeAnswer('true', 'truefalse').normalized).toBe('√')
  })
})

describe('validateQuestion', () => {
  it('should detect missing content', () => {
    const issues = validateQuestion({
      type: 'single',
      content: '',
      options: ['A. test'],
      answer: 'A',
      explanation: null,
      contentHash: 'test'
    })
    expect(issues.some(i => i.type === 'missing_content')).toBe(true)
  })

  it('should detect missing options for choice questions', () => {
    const issues = validateQuestion({
      type: 'single',
      content: 'Test question?',
      options: null,
      answer: 'A',
      explanation: null,
      contentHash: 'test'
    })
    expect(issues.some(i => i.type === 'missing_options')).toBe(true)
  })

  it('should detect choice answers outside available options', () => {
    const issues = validateQuestion({
      type: 'single',
      content: 'Test question?',
      options: ['A. Yes', 'B. No'],
      answer: 'C',
      explanation: null,
      contentHash: 'test'
    })
    expect(issues.some(i => i.type === 'answer_mismatch')).toBe(true)
  })
})

describe('normalizeQuestion', () => {
  it('should normalize and validate a question', () => {
    const result = normalizeQuestion({
      type: 'single',
      content: 'Which is correct?',
      options: ['String', 'Number', 'Boolean', 'All'],
      answer: 'd',
      explanation: null,
      contentHash: 'test'
    })
    expect(result.normalized).toBe(true)
    expect(result.options).toEqual(['A. String', 'B. Number', 'C. Boolean', 'D. All'])
    expect(result.answer).toBe('D')
  })
})
