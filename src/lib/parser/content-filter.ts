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

// Term definition patterns (auto-filter - 名词解释)
const termDefinitionPatterns: { pattern: RegExp; reason: string }[] = [
  { pattern: /^[\u4e00-\u9fff]{2,8}[：:][\u4e00-\u9fff]/, reason: '名词解释' },
  { pattern: /^(?:数据|数据库|主属性|外键|事务|实体|关系|SQL|索引|视图|触发器|存储过程|范式|主码|候选码|超码|元组|属性|域|模式|内模式|外模式|DDL|DML|DCL)[：:]/, reason: '术语定义' },
]

// Strict question number patterns for HTML
export const strictStartPatternsHtml = [
  { regex: /<p[^>]*>\s*(\d+)\s*[.、．]\s*(?=[A-Z\u4e00-\u9fa5'"「])/g, type: 'dot' },
  { regex: /<p[^>]*>\s*第\s*(\d+|[一二三四五六七八九十]+)\s*题\s*[.、：:]?\s*/g, type: 'di' },
  { regex: /<p[^>]*>\s*[（(]\s*(\d+)\s*[）)]\s*/g, type: 'paren' },
]

// Strict question number patterns for plain text
export const strictStartPatternsText = [
  { regex: /^\s*(\d+)\s*[.、．]\s*(?=[A-Z\u4e00-\u9fa5'"「])/g, type: 'dot' },
  { regex: /^\s*第\s*(\d+|[一二三四五六七八九十]+)\s*题\s*[.、：:]?\s*/g, type: 'di' },
  { regex: /^\s*[（(]\s*(\d+)\s*[）)]\s*/g, type: 'paren' },
]

// Exclude patterns (not question numbers)
export const excludePatterns = [
  /^\d{4}年/,
  /^第[一二三四五六七八九十\d]+[章页]/,
  /^\d+[分秒]/,
  /^[①②③④⑤⑥⑦⑧⑨⑩]/,
]

export function shouldFilterContent(text: string): FilterResult {
  const trimmed = text.trim()

  if (trimmed.length < 2) {
    return { filter: true, reason: '内容过短', category: 'meta' }
  }

  for (const { pattern, reason } of metaPatterns) {
    if (pattern.test(trimmed)) {
      return { filter: true, reason, category: 'meta' }
    }
  }

  for (const { pattern, reason } of sectionPatterns) {
    if (pattern.test(trimmed)) {
      return { filter: true, reason, category: 'section' }
    }
  }

  for (const { pattern, reason } of answerAreaPatterns) {
    if (pattern.test(trimmed)) {
      return { filter: true, reason, category: 'answer_area' }
    }
  }

  for (const { pattern, reason } of termDefinitionPatterns) {
    if (pattern.test(trimmed)) {
      return { filter: true, reason, category: 'meta' }
    }
  }

  return { filter: false }
}

export function isValidQuestionNumber(text: string): boolean {
  const trimmed = text.trim()

  for (const pattern of excludePatterns) {
    if (pattern.test(trimmed)) {
      return false
    }
  }

  // Check plain text patterns
  for (const { regex } of strictStartPatternsText) {
    regex.lastIndex = 0
    if (regex.test(trimmed)) {
      return true
    }
  }

  // Check HTML patterns
  for (const { regex } of strictStartPatternsHtml) {
    regex.lastIndex = 0
    if (regex.test(trimmed)) {
      return true
    }
  }

  return false
}
