import { describe, it, expect } from 'vitest'
import { shouldFilterContent, isValidQuestionNumber } from '../content-filter'

describe('shouldFilterContent', () => {
  it('should filter short content', () => {
    expect(shouldFilterContent('A')).toEqual({ filter: true, reason: '内容过短', category: 'meta' })
  })

  it('should filter copyright text', () => {
    expect(shouldFilterContent('Copyright 2024').filter).toBe(true)
  })

  it('should filter page numbers', () => {
    expect(shouldFilterContent('第1页').filter).toBe(true)
    expect(shouldFilterContent('Page 1').filter).toBe(true)
  })

  it('should filter section headers', () => {
    expect(shouldFilterContent('第一章 总论').filter).toBe(true)
    expect(shouldFilterContent('一、单选题').filter).toBe(true)
  })

  it('should filter answer areas', () => {
    expect(shouldFilterContent('参考答案').filter).toBe(true)
    expect(shouldFilterContent('答案：A').filter).toBe(true)
  })

  it('should not filter normal question content', () => {
    expect(shouldFilterContent('以下哪个是JavaScript的数据类型？').filter).toBe(false)
  })
})

describe('isValidQuestionNumber', () => {
  it('should match standard format', () => {
    expect(isValidQuestionNumber('1. 以下哪个')).toBe(true)
    expect(isValidQuestionNumber('2、下列')).toBe(true)
  })

  it('should match 第X题 format', () => {
    expect(isValidQuestionNumber('第1题')).toBe(true)
    expect(isValidQuestionNumber('第一题')).toBe(true)
  })

  it('should exclude years', () => {
    expect(isValidQuestionNumber('2024年考试')).toBe(false)
  })

  it('should exclude chapters', () => {
    expect(isValidQuestionNumber('第一章')).toBe(false)
  })
})
