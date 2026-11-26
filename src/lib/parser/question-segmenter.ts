import type { QuestionType } from "@/lib/types"
import { emptyDiagnostic, type QuestionBlock, type StructuredParagraph } from "./recognition-types"

export const SECTION_SCORE_NOTE = String.raw`(?:[（(][每本大共总合计满小题分值数一二三四五六七八九十百零两0-9.,，、：:；; \t]{1,80}[）)])?`
const subtypeHeading = new RegExp(String.raw`^(?:名词解释(?:题)?|简答题)\s*${SECTION_SCORE_NOTE}$`)

const SECTION_TYPES: Array<[RegExp, QuestionType]> = [
  [/^(?:单项选择题|单选题)/, "single"],
  [/^(?:多项选择题|不定项选择题|多选题)/, "multiple"],
  [/^(?:判断题|判断)/, "truefalse"],
  [/^(?:填空题|填空)/, "fill"],
  [/^(?:计算题|计算)/, "calculation"],
  [/^(?:编程题|程序设计题|程序题|编程)/, "code"],
  [/^(?:论述题|简答题|问答题|分析题|名词解释)/, "essay"],
  [/^(?:设计题|应用题)/, "essay"],
]

const QUESTION_START = /^(?:第\s*\d{1,3}\s*题|[（(]?\d{1,3}[)）.．、])(?:\s*|$)/
const PDF_TOP_LEVEL_QUESTION_START = /^(?:第\s*\d{1,3}\s*题|\d{1,3}\s*[.．、。:：])(?:\s*|$)/
const OPTION_START = /^(?:[（(]?[A-ZＡ-Ｚ][)）.．、])/i
const ANSWER_START = /^(?:参考答案|正确答案|标准答案|答案|Answer|Ans)\s*[:：]/i

function sectionInfo(text: string) {
  if (text.length > 30) return undefined
  const heading = text.replace(/^(?:第\s*[一二三四五六七八九十\d]+\s*[章节]|[一二三四五六七八九十\d]+\s*[、.．:：])\s*/, "")
  const isShortBareHeading = heading.length <= 8
  if (!isShortBareHeading && heading === text) return undefined
  if (/^(?:名词解释|简答题)/.test(heading) && !subtypeHeading.test(heading)) return undefined
  const type = SECTION_TYPES.find(([pattern]) => pattern.test(heading))?.[1]
  if (!type) return undefined
  const sectionTag = heading.startsWith("名词解释") ? "名词解释" : heading.startsWith("简答题") ? "简答题" : undefined
  return { sectionType: type, sectionTag }
}

function canCloseBlock(paragraphs: StructuredParagraph[]): boolean {
  const optionCount = paragraphs.filter((item) => OPTION_START.test(item.text)).length
  return optionCount >= 2 || paragraphs.some((item) => ANSWER_START.test(item.text))
}

function createBlock(section: ReturnType<typeof sectionInfo>): QuestionBlock {
  return { paragraphs: [], ...section, boundaryConfidence: 100, diagnostic: emptyDiagnostic() }
}

export function segmentQuestions(paragraphs: StructuredParagraph[]): QuestionBlock[] {
  const blocks: QuestionBlock[] = []
  let currentSection: ReturnType<typeof sectionInfo>
  let current: QuestionBlock | null = null
  let sectionHasQuestion = false

  for (const paragraph of paragraphs) {
    const detectedSection = sectionInfo(paragraph.text)
    if (detectedSection || (currentSection?.sectionTag && /^[一二三四五六七八九十]+\s*[、.．:：]/.test(paragraph.text))) {
      if (current?.paragraphs.length) blocks.push(current)
      current = null
      currentSection = detectedSection
      sectionHasQuestion = false
      continue
    }

    const startsQuestion = QUESTION_START.test(paragraph.text)
    if (!current) {
      if (paragraph.sourceKind === "pdf-line" && currentSection && !sectionHasQuestion && !startsQuestion) continue
      if (!currentSection && !startsQuestion) continue
      current = createBlock(currentSection)
      current.paragraphs.push(paragraph)
      if (startsQuestion) sectionHasQuestion = true
      continue
    }

    if (startsQuestion) {
      // PDF 文本通常把答案写在题干括号内，没有选项/答案标签可作为结束信号。
      // 顶层阿拉伯数字题号可直接切分；(1)/1）等嵌套小问不匹配该规则。
      if (paragraph.sourceKind === "pdf-line" && PDF_TOP_LEVEL_QUESTION_START.test(paragraph.text)) {
        blocks.push(current)
        current = createBlock(currentSection)
        current.paragraphs.push(paragraph)
        sectionHasQuestion = true
        continue
      }

      if (canCloseBlock(current.paragraphs)) {
        blocks.push(current)
        current = createBlock(currentSection)
        current.paragraphs.push(paragraph)
        continue
      }

      if (current.paragraphs.length > 0) {
        current.boundaryConfidence = Math.min(current.boundaryConfidence, 45)
        current.diagnostic.confidence = Math.min(current.diagnostic.confidence, 45)
        current.diagnostic.warnings.push({
          code: "uncertain_boundary",
          message: "疑似新题边界，但上一题结构不完整，已保守合并",
          sourceText: paragraph.text,
        })
      }
    }

    current.paragraphs.push(paragraph)
  }

  if (current?.paragraphs.length) blocks.push(current)
  return blocks
}
