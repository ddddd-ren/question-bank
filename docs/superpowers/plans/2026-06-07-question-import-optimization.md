# Question Import Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the question import system with strict matching, content filtering, template normalization, and quality checking to improve recognition accuracy and reduce false positives.

**Architecture:** The system will be enhanced with four new modules: content-filter.ts for filtering non-question content, question-normalizer.ts for template-based normalization, quality-checker.ts for quality validation, and content-marker.ts for marking suspicious content. These modules integrate into the existing question-extractor.ts pipeline.

**Tech Stack:** TypeScript, Next.js API routes, Drizzle ORM, SQLite

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/parser/content-filter.ts` | Filter non-question content (meta, sections, answer areas) |
| `src/lib/parser/question-normalizer.ts` | Normalize questions using templates per type |
| `src/lib/parser/quality-checker.ts` | Validate question quality and detect issues |
| `src/lib/parser/content-marker.ts` | Mark suspicious content for user review |
| `src/lib/parser/question-extractor.ts` | Main extraction pipeline (modify to integrate new modules) |
| `src/components/import/question-editor.tsx` | Display quality issues and markers in UI |
| `src/app/import/page.tsx` | Show filtering stats and batch operations |

---

### Task 1: Content Filter Module

**Files:**
- Create: `src/lib/parser/content-filter.ts`

- [ ] **Step 1: Create content filter with meta patterns**

```typescript
// src/lib/parser/content-filter.ts

export interface FilterResult {
  filter: boolean
  reason?: string
  category?: 'meta' | 'section' | 'answer_area' | 'uncertain'
}

// Meta information patterns (auto-filter)
const metaPatterns: { pattern: RegExp; reason: string }[] = [
  { pattern: /^(?:页眉|页脚|header|footer)/i, reason: '页眉页脚' },
  { pattern: /(?:版权|©|Copyright|All Rights Reserved)/i, reason: '版权声明' },
  { pattern: /^(?:参考文献|References|Bibliography)/i, reason: '参考文献' },
  { pattern: /^(?:第?\d+页|Page\s*\d+|\d+\s*\/\s*\d+)/i, reason: '页码' },
  { pattern: /^(?:考试时间|考试科目|试卷类型|满分|及格)/, reason: '考试信息' },
  { pattern: /^(?:注意事项|温馨提示|考生须知|答题要求)/, reason: '注意事项' },
]

// Section patterns (auto-filter)
const sectionPatterns: { pattern: RegExp; reason: string }[] = [
  { pattern: /^(?:第[一二三四五六七八九十\d]+[章节]|Chapter\s*\d+)/i, reason: '章节标题' },
  { pattern: /^(?:一|二|三|四|五|六|七|八|九|十|[1-9])\s*[、.．]\s*(?:单选题|多选题|判断题|填空题|计算题|论述题|编程题)/, reason: '大题标题' },
  { pattern: /^(?:本部分|本大题|本题共|共\d+题)/, reason: '考试说明' },
  { pattern: /^(?:每题|每小题|每空)\s*\d+\s*分/, reason: '分值说明' },
]

// Answer area patterns (auto-filter)
const answerAreaPatterns: { pattern: RegExp; reason: string }[] = [
  { pattern: /^(?:参考答案|答案|解析|解答|Answer|Solution)/i, reason: '答案区域标题' },
  { pattern: /^[A-D]{1,4}\s*$/, reason: '答案内容' },
  { pattern: /^(?:正确答案|正确选项)[：:]\s*[A-D]/, reason: '答案标记' },
  { pattern: /^(?:解析|解题思路|考点分析)[：:]/, reason: '解析内容' },
]

export function shouldFilterContent(text: string): FilterResult {
  const trimmed = text.trim()

  // Too short (may be page number or sequence)
  if (trimmed.length < 2) {
    return { filter: true, reason: '内容过短', category: 'meta' }
  }

  // Check meta patterns
  for (const { pattern, reason } of metaPatterns) {
    if (pattern.test(trimmed)) {
      return { filter: true, reason, category: 'meta' }
    }
  }

  // Check section patterns
  for (const { pattern, reason } of sectionPatterns) {
    if (pattern.test(trimmed)) {
      return { filter: true, reason, category: 'section' }
    }
  }

  // Check answer area patterns
  for (const { pattern, reason } of answerAreaPatterns) {
    if (pattern.test(trimmed)) {
      return { filter: true, reason, category: 'answer_area' }
    }
  }

  return { filter: false }
}
```

- [ ] **Step 2: Add strict question number matching**

```typescript
// Add to src/lib/parser/content-filter.ts

// Strict question number patterns
export const strictStartPatterns = [
  // "1." or "1、" or "1．" - number + dot/separator
  { regex: /<p[^>]*>\s*(\d+)\s*[.、．]\s*(?=[A-Z\u4e00-\u9fa5'"「])/g, type: 'dot' },
  // "第1题" or "第一题" - explicit "第X题" format
  { regex: /<p[^>]*>\s*第\s*(\d+)\s*题\s*[.、：:]\s*/g, type: 'di' },
  // "(1)" or "（1）" - number in parentheses
  { regex: /<p[^>]*>\s*[（(]\s*(\d+)\s*[）)]\s*/g, type: 'paren' },
]

// Exclude patterns (not question numbers)
export const excludePatterns = [
  /^\d{4}年/,           // Year
  /^第[一二三四五六七八九十\d]+[章页]/, // Chapter/page
  /^\d+[分秒]/,         // Score/time
  /^[①②③④⑤⑥⑦⑧⑨⑩]/, // Circled numbers
]

export function isValidQuestionNumber(text: string): boolean {
  const trimmed = text.trim()
  
  // Check exclude patterns
  for (const pattern of excludePatterns) {
    if (pattern.test(trimmed)) {
      return false
    }
  }
  
  // Check strict patterns
  for (const { regex } of strictStartPatterns) {
    regex.lastIndex = 0
    if (regex.test(trimmed)) {
      return true
    }
  }
  
  return false
}
```

- [ ] **Step 3: Test content filter**

Create test file `src/lib/parser/__tests__/content-filter.test.ts`:

```typescript
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
```

Run: `npx vitest run src/lib/parser/__tests__/content-filter.test.ts`

---

### Task 2: Question Normalizer Module

**Files:**
- Create: `src/lib/parser/question-normalizer.ts`

- [ ] **Step 1: Create question templates**

```typescript
// src/lib/parser/question-normalizer.ts

import type { QuestionType, ExtractedQuestion } from './question-extractor'

export interface NormalizedQuestion extends ExtractedQuestion {
  normalized: boolean
  changes: string[]
  issues: QualityIssue[]
}

export interface QualityIssue {
  type: 'missing_content' | 'missing_options' | 'missing_answer' | 'format_error' | 'options_count' | 'answer_mismatch'
  severity: 'error' | 'warning' | 'info'
  field: string
  message: string
  autoFixed: boolean
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
```

- [ ] **Step 2: Add normalization functions**

```typescript
// Add to src/lib/parser/question-normalizer.ts

export function normalizeOptions(options: string[] | null): { normalized: string[] | null; changes: string[] } {
  if (!options || options.length === 0) {
    return { normalized: options, changes: [] }
  }

  const changes: string[] = []
  const normalized = options.map((opt, idx) => {
    let normalized = opt.trim()
    
    // Add missing letter prefix
    if (!/^[A-Z][.、．]/.test(normalized)) {
      const letter = String.fromCharCode(65 + idx)
      normalized = `${letter}. ${normalized}`
      changes.push(`选项 ${idx + 1}: 添加字母前缀`)
    }
    
    // Normalize separator to ". "
    normalized = normalized.replace(/^([A-Z])[、．]\s*/, '$1. ')
    
    return normalized
  })

  return { normalized, changes }
}

export function normalizeAnswer(answer: string | null, type: QuestionType): { normalized: string | null; changes: string[] } {
  if (!answer) {
    return { normalized: answer, changes: [] }
  }

  const changes: string[] = []
  let normalized = answer.trim()

  // Normalize based on type
  if (type === 'single' || type === 'multiple') {
    // Uppercase letters
    const upper = normalized.toUpperCase()
    if (upper !== normalized) {
      normalized = upper
      changes.push('答案: 转换为大写')
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
  if (question.answer && !template.format.answerPattern.test(question.answer)) {
    issues.push({
      type: 'format_error',
      severity: 'info',
      field: 'answer',
      message: `答案格式不符合 ${template.label} 规范`,
      autoFixed: false
    })
  }

  return issues
}
```

- [ ] **Step 3: Add main normalize function**

```typescript
// Add to src/lib/parser/question-normalizer.ts

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
```

- [ ] **Step 4: Test normalizer**

Create test file `src/lib/parser/__tests__/question-normalizer.test.ts`:

```typescript
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
```

Run: `npx vitest run src/lib/parser/__tests__/question-normalizer.test.ts`

---

### Task 3: Quality Checker Module

**Files:**
- Create: `src/lib/parser/quality-checker.ts`

- [ ] **Step 1: Create quality checker**

```typescript
// src/lib/parser/quality-checker.ts

import type { NormalizedQuestion, QualityIssue } from './question-normalizer'
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
```

- [ ] **Step 2: Test quality checker**

Create test file `src/lib/parser/__tests__/quality-checker.test.ts`:

```typescript
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
```

Run: `npx vitest run src/lib/parser/__tests__/quality-checker.test.ts`

---

### Task 4: Integrate into Question Extractor

**Files:**
- Modify: `src/lib/parser/question-extractor.ts`

- [ ] **Step 1: Add imports**

Add at the top of `src/lib/parser/question-extractor.ts`:

```typescript
import { shouldFilterContent, isValidQuestionNumber } from './content-filter'
import { normalizeQuestion } from './question-normalizer'
```

- [ ] **Step 2: Modify extractQuestionsFromHtml function**

Find the section where questions are extracted and add filtering:

```typescript
// In extractQuestionsFromHtml function, after extracting questionStarts

// Filter out non-question content
const filteredStarts = questionStarts.filter(q => {
  const content = section.content.substring(q.pos, q.pos + 200)
  const plainText = content.replace(/<[^>]+>/g, '').trim()
  const { filter } = shouldFilterContent(plainText)
  return !filter
})

// Use filtered starts instead of original
const uniqueStarts = filteredStarts.filter((q, i, arr) =>
  i === 0 || q.pos - arr[i - 1].pos > 5
)
```

- [ ] **Step 3: Add normalization at the end**

Before returning questions, normalize them:

```typescript
// At the end of extractQuestionsFromHtml, before return

// Normalize all questions
const normalizedQuestions = questions.map(q => normalizeQuestion(q))

return normalizedQuestions
```

- [ ] **Step 4: Test integration**

Run existing tests to ensure nothing breaks:

```bash
npx vitest run src/lib/parser/__tests__/
```

---

### Task 5: Update Preview API

**Files:**
- Modify: `src/app/api/questions/preview/route.ts`

- [ ] **Step 1: Add quality report to response**

```typescript
// In POST handler, after parsing questions

import { generateQualityReport } from '@/lib/parser/quality-checker'
import { shouldFilterContent } from '@/lib/parser/content-filter'

// Count filtered content
let filteredCount = 0
// ... (track during parsing)

// Generate quality report
const qualityReport = generateQualityReport(questions, filteredCount)

return NextResponse.json({
  total: questions.length,
  questions: editableQuestions,
  quality: {
    passed: qualityReport.passed,
    withIssues: qualityReport.withIssues,
    filtered: qualityReport.filtered
  }
})
```

---

### Task 6: Update Import UI

**Files:**
- Modify: `src/components/import/question-editor.tsx`
- Modify: `src/app/import/page.tsx`

- [ ] **Step 1: Add quality badge to question editor**

```typescript
// In QuestionEditor component, add quality display

interface QuestionEditorProps {
  question: EditableQuestion
  index: number
  quality?: {
    confidence: number
    issues: QualityIssue[]
    changes: string[]
  }
  onSave: (index: number, question: EditableQuestion) => void
  onRemove: (index: number) => void
}

// In the card header, add quality badge
{quality && quality.issues.length > 0 && (
  <Badge variant={quality.issues.some(i => i.severity === 'error') ? 'destructive' : 'warning'}>
    {quality.issues.length} 个问题
  </Badge>
)}

// Show changes if any
{quality && quality.changes.length > 0 && (
  <div className="text-xs text-muted-foreground mt-2">
    <span className="font-medium">自动修复：</span>
    {quality.changes.map((change, i) => (
      <span key={i} className="ml-1">✓ {change}</span>
    ))}
  </div>
)}
```

- [ ] **Step 2: Add quality stats to import page**

```typescript
// In ImportPage component, add stats display

const qualityStats = useMemo(() => {
  if (!parsedQuestions.length) return null
  
  const passed = parsedQuestions.filter(q => q.quality?.issues.length === 0).length
  const withIssues = parsedQuestions.filter(q => q.quality?.issues.length > 0).length
  const withChanges = parsedQuestions.filter(q => q.quality?.changes.length > 0).length
  
  return { passed, withIssues, withChanges }
}, [parsedQuestions])

// Display stats
{qualityStats && (
  <div className="flex gap-4 text-sm">
    <span className="text-green-600">✓ {qualityStats.passed} 通过</span>
    <span className="text-amber-600">⚠ {qualityStats.withIssues} 有问题</span>
    <span className="text-blue-600">↻ {qualityStats.withChanges} 已修复</span>
  </div>
)}
```

---

### Task 7: Run All Tests

- [ ] **Step 1: Run all parser tests**

```bash
npx vitest run src/lib/parser/__tests__/ --reporter=verbose
```

Expected: All tests pass

- [ ] **Step 2: Run build to verify**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 3: Commit changes**

```bash
git add src/lib/parser/ src/app/api/questions/preview/ src/components/import/ src/app/import/
git commit -m "feat: optimize question import with filtering, normalization, and quality checking"
```

---

## Summary

This plan implements four key improvements:

1. **Content Filtering** - Automatically filters non-question content (meta info, sections, answer areas)
2. **Strict Number Matching** - Only recognizes explicit question number formats
3. **Template Normalization** - Normalizes options and answers per question type
4. **Quality Checking** - Validates questions and reports issues with confidence scores

Each task includes complete code, tests, and verification steps. The implementation follows TDD principles with frequent commits.
