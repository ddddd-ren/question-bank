import mammoth from "mammoth"
import JSZip from "jszip"
import { normalizeChoiceAnswer } from "./choice-answer"
import { shouldFilterContent } from "./content-filter"
import { normalizeQuestion } from "./question-normalizer"
import { normalizeParagraphs } from "./structure-normalizer"
import { SECTION_SCORE_NOTE, segmentQuestions } from "./question-segmenter"
import { extractFields } from "./field-extractor"
import { classifyQuestion } from "./type-classifier"
import type { RecognitionDiagnostic, StructuredParagraph } from "./recognition-types"

import { type QuestionType } from "@/lib/types"
export type { QuestionType }

export interface ExtractedQuestion {
  type: QuestionType
  content: string
  options: string[] | null
  answer: string | null
  explanation: string | null
  contentHash: string
  tags?: string[]
  diagnostic?: RecognitionDiagnostic
  sourcePage?: number
}

// Type mapping from Chinese section headers
const TYPE_MAP: Record<string, QuestionType> = {
  "单选题": "single",
  "多选题": "multiple",
  "单项选择题": "single",
  "多项选择题": "multiple",
  "不定项选择题": "multiple",
  "判断题": "truefalse",
  "填空题": "fill",
  "计算题": "calculation",
  "论述题": "essay",
  "编程题": "code",
  "程序设计题": "code",
  "选择题": "single",
  "编程": "code",
  "程序填空": "code",
  "程序题": "code",
  "程序": "code",
  "名词解释": "essay",
  "名词解释题": "essay",
  "设计题": "essay",
  "应用题": "essay",
  "简答题": "essay",
  "问答题": "essay",
  "分析题": "essay",
  // 简写形式
  "选择": "single",
  "单选": "single",
  "多选": "multiple",
  "判断": "truefalse",
  "填空": "fill",
  "计算": "calculation",
  "论述": "essay",
  "应用": "essay",
  "简答": "essay",
  "问答": "essay",
  "分析": "code",
}

const ANSWER_LABEL_SOURCE = String.raw`(?:[【\[]\s*)?(?:参考[ \t]*答案|正确[ \t]*答案|标准[ \t]*答案|答案|正确[ \t]*选项|选项[ \t]*答案|Answer|Ans)(?:\s*[】\]])?`
const EXPLANATION_LABEL_SOURCE = String.raw`(?:答案[ \t]*解析|解析|详解|解答|说明|分析)`
const QUESTION_TYPE_SOURCE = "单项选择题|多项选择题|不定项选择题|单选题|多选题|判断题|填空题|计算题|论述题|编程题|程序设计题|编程|程序填空|程序题|选择题|名词解释题|名词解释|设计题|应用题|简答题|问答题|分析题|判断|选择|填空|计算|论述|应用|简答|问答|程序|分析"

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function paragraphsToHtml(paragraphs: string[]): string {
  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("\n")
}

function normalizeLatinLetter(letter: string): string {
  const char = letter.trim()[0] || ""
  const code = char.charCodeAt(0)
  if (code >= 0xff41 && code <= 0xff5a) return String.fromCharCode(code - 0xff41 + 97).toUpperCase()
  if (code >= 0xff21 && code <= 0xff3a) return String.fromCharCode(code - 0xff21 + 65)
  return char.toUpperCase()
}

function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 10)))
}

function decodeHtmlText(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
}

function extractPowerPointParagraphs(slideXml: string): string[] {
  const paragraphs: string[] = []
  const paragraphMatches = slideXml.match(/<a:p[\s\S]*?<\/a:p>/g) || []

  for (const paragraphXml of paragraphMatches) {
    const texts = [...paragraphXml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
      .map((match) => decodeXmlText(match[1]).trim())
      .filter(Boolean)

    const paragraph = texts.join("").replace(/\s+/g, " ").trim()
    if (paragraph) {
      paragraphs.push(paragraph)
    }
  }

  return paragraphs
}

function normalizePowerPointText(text: string): string {
  return decodeXmlText(text)
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]+/g, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
}

function splitPowerPointText(text: string): string[] {
  return normalizePowerPointText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 2)
}

function pushUniqueParagraph(target: string[], seen: Set<string>, text: string) {
  for (const paragraph of splitPowerPointText(text)) {
    if (paragraph.length < 3 || isGarbageText(paragraph)) continue

    const key = paragraph.replace(/\s+/g, "")
    if (!seen.has(key)) {
      seen.add(key)
      target.push(paragraph)
    }
  }
}

function isReadableChar(code: number): boolean {
  return (
    code === 9 ||
    code === 10 ||
    code === 13 ||
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0x3000 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xff00 && code <= 0xffef)
  )
}

function extractUtf16Runs(buffer: Buffer): string[] {
  const runs: string[] = []
  let current = ""

  for (let offset = 0; offset + 1 < buffer.length; offset += 2) {
    const code = buffer.readUInt16LE(offset)
    if (isReadableChar(code)) {
      current += String.fromCharCode(code)
    } else {
      if (current.trim().length >= 2) runs.push(current)
      current = ""
    }
  }

  if (current.trim().length >= 2) runs.push(current)
  return runs
}

function isGarbageText(text: string): boolean {
  const compact = text.replace(/\s+/g, "")
  if (compact.length < 3) return true
  if (/^[^\u4e00-\u9fff\u3000-\u303ff0-9A-Za-z]{3,}$/.test(compact)) return true
  const chineseRatio = (compact.match(/[\u4e00-\u9fff]/g) || []).length / compact.length
  if (compact.length > 5 && chineseRatio < 0.1 && !/[A-Za-z]{3,}/.test(compact)) return true
  return false
}

function extractLegacyPowerPointParagraphs(buffer: Buffer): string[] {
  const paragraphs: string[] = []
  const seen = new Set<string>()
  const maxRecordLength = 1024 * 256
  const textRecordTypes = new Set([4000, 4008, 4026, 4011, 4012])

  for (let offset = 0; offset + 8 <= buffer.length; offset += 1) {
    const recordType = buffer.readUInt16LE(offset + 2)
    if (!textRecordTypes.has(recordType)) continue

    const recordLength = buffer.readUInt32LE(offset + 4)
    const start = offset + 8
    const end = start + recordLength
    if (recordLength <= 0 || recordLength > maxRecordLength || end > buffer.length) continue

    const payload = buffer.subarray(start, end)
    const text = recordType === 4008
      ? payload.toString("latin1")
      : payload.toString("utf16le")

    pushUniqueParagraph(paragraphs, seen, text)
  }

  if (paragraphs.length === 0) {
    for (const text of extractUtf16Runs(buffer)) {
      pushUniqueParagraph(paragraphs, seen, text)
    }
  }

  return paragraphs
}

function normalizePdfText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]+/g, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim()
}

function addBreakBeforeLabel(text: string, labelSource: string, suffixSource: string, flags = "gi"): string {
  return text.replace(
    new RegExp(`(^|[^\\n])(${labelSource}${suffixSource})`, flags),
    (match: string, prefix: string, label: string, offset: number, source: string) => {
      const labelStart = offset + prefix.length
      const beforeLabel = source
        .slice(Math.max(0, labelStart - 6), labelStart)
        .replace(/[ \t]/g, "")
      const compactLabel = label.replace(/[ \t]/g, "")

      if (
        (/^答案/.test(compactLabel) && /(?:参考|正确|标准|选项)$/.test(beforeLabel)) ||
        (/^选项/.test(compactLabel) && /正确$/.test(beforeLabel)) ||
        (/^解析/.test(compactLabel) && /答案$/.test(beforeLabel))
      ) {
        return match
      }

      return prefix ? `${prefix}\n${label}` : label
    }
  )
}

function addAnswerAndExplanationBreaks(text: string): string {
  return addBreakBeforeLabel(
    addBreakBeforeLabel(text, ANSWER_LABEL_SOURCE, String.raw`\s*[:：?？]?`),
    EXPLANATION_LABEL_SOURCE,
    String.raw`\s*[:：]`
  )
}

function addPdfStructuralBreaks(text: string): string {
  const withQuestionBreaks = text
    .replace(new RegExp(`\\s+((?:[一二三四五六七八九十]+|\\d{1,2})\\s*[、.．:：]\\s*(?:${QUESTION_TYPE_SOURCE}))`, "g"), "\n$1")
    .replace(/\s+(应用题[一二三四五六七八九十\d]+)/g, "\n$1")
    .replace(/([^\nA-Za-z0-9])(\d{1,3}\s*[、.．。]\s*(?=[A-Za-z\u4e00-\u9fff"“《（(]))/g, "$1\n$2")
    .replace(/([^\n])(第\s*\d{1,3}\s*题\s*)/g, "$1\n$2")
    .replace(/([^\nA-Za-z0-9])([（【]\s*\d{1,3}\s*[）】]\s*(?=[A-Za-z\u4e00-\u9fff"“《]))/g, "$1\n$2")
    .replace(
      /([^\S\n])([A-HＡ-Ｈａ-ｈ]\s*[.、．:：)）]\s*\S)/g,
      (match: string, _space: string, option: string, offset: number, source: string) => {
        const beforeSpace = source.slice(0, offset).trimEnd().slice(-1)
        return /[（(]/.test(beforeSpace) ? match : `\n${option}`
      }
    )

  return addAnswerAndExplanationBreaks(withQuestionBreaks)
}

function isPdfPageArtifact(line: string): boolean {
  const compact = line.replace(/\s+/g, "")
  return (
    /^第?\d{1,3}页(?:共\d{1,3}页)?$/.test(compact) ||
    /^\d{1,3}\/\d{1,3}$/.test(compact) ||
    /^-\d{1,3}-$/.test(compact) ||
    /^Page\d{1,3}(?:of\d{1,3})?$/i.test(compact)
  )
}

function isStandaloneQuestionNumber(line: string): boolean {
  return /^(?:第\s*)?\d{1,3}\s*(?:题)?\s*[、.．。:：)）]?$/.test(line) ||
    /^[（【]\s*\d{1,3}\s*[）】]$/.test(line)
}

function pdfTextToParagraphs(text: string): string[] {
  const normalized = addPdfStructuralBreaks(normalizePdfText(text))
  const rawLines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isPdfPageArtifact(line))

  const paragraphs: string[] = []
  for (let idx = 0; idx < rawLines.length; idx++) {
    const line = rawLines[idx]
    const next = rawLines[idx + 1]
    if (next && isStandaloneQuestionNumber(line) && !isPdfPageArtifact(next)) {
      paragraphs.push(`${line} ${next}`.trim())
      idx += 1
    } else {
      paragraphs.push(line)
    }
  }

  return paragraphs
}

// Extract red-colored text from HTML (answers marked in red)
function extractRedText(html: string): { redTexts: string[]; cleanHtml: string } {
  const redTexts: string[] = []

  const redPatterns = [
    /<span[^>]*style="[^"]*color:\s*red[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    /<span[^>]*style="[^"]*color:\s*#(?:ff0000|f00|red)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    /<span[^>]*style="[^"]*color:\s*rgb\s*\(\s*255\s*,\s*0\s*,\s*0\s*\)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    /<span[^>]*class="[^"]*(?:red|Red|RED)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    /<font[^>]*color="[^"]*red[^"]*"[^>]*>([\s\S]*?)<\/font>/gi,
    /<font[^>]*color="[^"]*#(?:ff0000|f00)[^"]*"[^>]*>([\s\S]*?)<\/font>/gi,
  ]

  let cleanHtml = html

  for (const pattern of redPatterns) {
    let match
    pattern.lastIndex = 0
    while ((match = pattern.exec(cleanHtml)) !== null) {
      const text = match[1].replace(/<[^>]+>/g, "").trim()
      if (text) {
        redTexts.push(text)
      }
      cleanHtml = cleanHtml.replace(match[0], match[1])
    }
  }

  return { redTexts, cleanHtml }
}

// Extract options from HTML table
function extractOptionsFromTable(tableHtml: string): string[] {
  const options: string[] = []
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi
  let match

  while ((match = tdRegex.exec(tableHtml)) !== null) {
    const content = match[1]
      .replace(/<[^>]+>/g, "")
      .trim()
    if (content && /^[A-HＡ-Ｈａ-ｈ]\s*[.、．:：)）]/.test(content)) {
      options.push(content)
    }
  }

  return options
}

// Extract options from paragraphs
function extractOptionsFromParagraphs(html: string): string[] {
  const options: string[] = []
  const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let match

  while ((match = paragraphRegex.exec(html)) !== null) {
    const paragraphText = decodeHtmlText(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
    for (const optionText of extractOptionsFromText(paragraphText)) {
      if (!options.includes(optionText)) {
        options.push(optionText)
      }
    }
  }

  return options
}

function extractOptionsFromText(text: string): string[] {
  const markers = getOptionMarkers(text)
  if (markers.length === 0) return []

  return markers
    .map((marker, idx) => {
      const start = marker.index! + marker[0].length
      const end = idx + 1 < markers.length ? markers[idx + 1].index! : text.length
      const body = text
        .slice(start, end)
        .replace(new RegExp(`\\s*${ANSWER_LABEL_SOURCE}\\s*[:：?？]?\\s*[\\s\\S]*$`, "i"), "")
        .trim()

      return body ? `${normalizeLatinLetter(marker[1])}. ${body}` : null
    })
    .filter((option): option is string => Boolean(option))
}

function getOptionMarkers(text: string): RegExpMatchArray[] {
  return [...text.matchAll(/(?:^|\s)([A-HＡ-Ｈａ-ｈ])\s*[.、．:：)）]\s*/g)]
    .filter((marker) => {
      const beforeMarker = text.slice(0, marker.index).trimEnd()
      return !/[（(]$/.test(beforeMarker)
    })
}

function removeOptionRunsFromText(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const firstMarker = getOptionMarkers(line)[0]
      if (!firstMarker || firstMarker.index === undefined) return line
      const optionStart = firstMarker.index

      const optionArea = line.slice(optionStart)
      if (extractOptionsFromText(optionArea).length === 0) return line

      const answerMatch = optionArea.match(new RegExp(`\\s${ANSWER_LABEL_SOURCE}\\s*[:：?？]?\\s*[\\s\\S]*$`, "i"))
      return [line.slice(0, optionStart).trimEnd(), answerMatch?.[0].trim()]
        .filter(Boolean)
        .join("\n")
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function extractInlineOptionText(text: string): string | null {
  const firstMarker = getOptionMarkers(text)
    .find((marker) => normalizeLatinLetter(marker[1]) === "A")
  if (!firstMarker || firstMarker.index === undefined) return null
  const optionStart = firstMarker.index

  const optionText = text.slice(optionStart).trim()
  return extractOptionsFromText(optionText).length > 0 ? optionText : null
}

function splitExplanation(content: string): { contentWithoutExplanation: string; explanation: string | null } {
  const normalizedContent = addAnswerAndExplanationBreaks(content)
  const explanationMatch = normalizedContent.match(new RegExp(`(?:^|\\n)\\s*${EXPLANATION_LABEL_SOURCE}\\s*[:：]\\s*([\\s\\S]+)$`, "i"))
  if (!explanationMatch) {
    return { contentWithoutExplanation: normalizedContent, explanation: null }
  }

  const explanation = explanationMatch[1].trim()
  return {
    contentWithoutExplanation: normalizedContent.substring(0, explanationMatch.index).trim(),
    explanation: explanation || null,
  }
}

// Extract answer from question content
function extractAnswer(content: string, type?: QuestionType, redTexts?: string[]): { cleanContent: string; answer: string | null } {
  // Pattern 0: 红色字体答案（优先级最高）
  if (redTexts && redTexts.length > 0) {
    const filteredRedTexts = redTexts.filter(t => !/^[A-Z]$/.test(t.trim()))
    if (filteredRedTexts.length > 0) {
      return { cleanContent: content, answer: filteredRedTexts.join("; ") }
    }
  }

  // Pattern 0.5a: tail answer letters for choice questions
  if (type === "single" || type === "multiple") {
    const tailAnswer = content.match(/[。．.、，,：:]\s*([A-ZＡ-Ｚａ-ｚ](?:\s*[、，,\s]\s*[A-ZＡ-Ｚａ-ｚ])*)\s*$/)
    if (tailAnswer) {
      const cleanContent = content.substring(0, tailAnswer.index).trim()
      if (!new RegExp(`${ANSWER_LABEL_SOURCE}\\s*[:：?？]?\\s*$`, "i").test(cleanContent)) {
        return {
          cleanContent,
          answer: normalizeChoiceAnswer(tailAnswer[1])
        }
      }
    }
  }

  // Pattern 0.5b: tail true/false markers
  if (type === "truefalse") {
    const tailTf = content.match(/[。．]?\s*[（）]?\s*([√×X])\s*[（）]?\s*$/i)
    if (tailTf) {
      return {
        cleanContent: content.substring(0, tailTf.index).trim(),
        answer: /[xX×]/.test(tailTf[1]) ? "×" : "√"
      }
    }
  }

  // Pattern 1: （A ）or （A） 选择题多选题
  if (type === "single" || type === "multiple") {
    const embeddedAnswerMatches = [...content.matchAll(/[（【(]\s*([A-ZＡ-Ｚａ-ｚ][A-ZＡ-Ｚａ-ｚ、，,\s]*)\s*[）】)]/g)]
    const embeddedAnswerMatch = embeddedAnswerMatches
      .filter((match) => {
        const beforeMatch = content.slice(0, match.index).trimEnd()
        return !/[、，,]/.test(match[1]) && !/[A-Za-z]$/.test(beforeMatch)
      })
      .at(-1)
    if (embeddedAnswerMatch) {
      const answer = normalizeChoiceAnswer(embeddedAnswerMatch[1])
      const cleanContent = content.replace(embeddedAnswerMatch[0], "（ ）")
      return { cleanContent, answer }
    }

    const parentheticalAnswers = [...content.matchAll(/[（【(]\s*([^（）()【】\n]{1,80})\s*[）】)]/g)]
      .filter((match) => {
        const value = match[1].trim()
        return value.length > 0 &&
          !/^[A-HＡ-Ｈａ-ｈ]\s*[.、．:：)）]/.test(value) &&
          !/^[A-ZＡ-Ｚ](?:\s*[、，,]\s*[A-ZＡ-Ｚ])+$/.test(value)
      })
    const parentheticalAnswer = parentheticalAnswers.at(-1)
    if (parentheticalAnswer) {
      const answer = parentheticalAnswer[1].trim()
      const cleanContent = content.replace(parentheticalAnswer[0], "（ ）")
      return { cleanContent, answer }
    }
  }

  // Pattern 2: 答案：xxx - 通用
  const normalizedContent = addAnswerAndExplanationBreaks(content)
  const answerMatch = normalizedContent.match(new RegExp(`${ANSWER_LABEL_SOURCE}\\s*[:：?？]?\\s*([\\s\\S]*?)(?:\\n\\s*(?:${EXPLANATION_LABEL_SOURCE}|注意)\\s*[:：]?|$)`, "i"))
  if (answerMatch) {
    const answer = (type === "single" || type === "multiple")
      ? normalizeChoiceAnswer(answerMatch[1])
      : answerMatch[1].trim()
    if (answer && answer.length > 0) {
      const cleanContent = normalizedContent.replace(answerMatch[0], "").trim()
      return { cleanContent, answer }
    }
  }

  // Pattern 3: true/false for 判断题
  if (type === "truefalse") {
    const tfMatch = content.match(/[（【(]\s*(√|×|对|错|是|否|正确|错误|True|False)\s*[）】)]/i)
    if (tfMatch) {
      const answer = tfMatch[1]
      const cleanContent = content.replace(tfMatch[0], "（ ）")
      return { cleanContent, answer }
    }
  }

  // Pattern 4: 填空题 - 答案在括号中
  if (type === "fill") {
    const fillMatches = content.match(/[（【(]\s*([^（）()【】]+?)\s*[）】)]/g)
    if (fillMatches && fillMatches.length > 0) {
      const answers = fillMatches.map(m => {
        const inner = m.match(/[（【(]\s*([^（）()【】]+?)\s*[）】)]/)
        return inner ? inner[1].trim() : ""
      }).filter(Boolean)

      if (answers.length > 0) {
        let cleanContent = content
        fillMatches.forEach(m => {
          cleanContent = cleanContent.replace(m, "（ ）")
        })
        return { cleanContent, answer: answers.join("; ") }
      }
    }
  }

  // Pattern 5: 编程题代码题
  if (type === "code") {
    const codeBlockMatch = content.match(/```[\w]*\n([\s\S]*?)```/)
    if (codeBlockMatch) {
      const answer = codeBlockMatch[1].trim()
      const cleanContent = content.replace(codeBlockMatch[0], "").trim()
      return { cleanContent, answer }
    }

    const codeAnswerMatch = content.match(new RegExp(`(?:${ANSWER_LABEL_SOURCE}|示例代码|示例程序|能编译通过|不能编译通过)[：:?？]?\\s*([\\s\\S]*?)(?:\\n\\s*(?:${EXPLANATION_LABEL_SOURCE}|注意)|$)`, "i"))
    if (codeAnswerMatch) {
      const answer = codeAnswerMatch[1].trim()
      if (answer.length > 0) {
        const cleanContent = content.replace(codeAnswerMatch[0], "").trim()
        return { cleanContent, answer }
      }
    }
  }

  return { cleanContent: content, answer: null }
}

// Detect question type from content
export function detectQuestionType(content: string, options: string[], sectionType?: QuestionType): QuestionType {
  if (options.length > 0) {
    if (sectionType === "multiple") return "multiple"
    const normalizedAnswer = normalizeChoiceAnswer(content.match(new RegExp(`${ANSWER_LABEL_SOURCE}\\s*[:：?？]?\\s*([A-ZＡ-Ｚａ-ｚ、，,\\s]+)`, "i"))?.[1])
    if (
      /[（【(]\s*[A-ZＡ-Ｚａ-ｚ]\s*[、，,\s]\s*[A-ZＡ-Ｚａ-ｚ]/.test(content) ||
      /多选|多项|不定项/.test(content) ||
      (normalizedAnswer && normalizedAnswer.length > 1)
    ) {
      return "multiple"
    }
    return "single"
  }

  if (sectionType) {
    return sectionType
  }

  if (/[（【(]\s*(√|×|对|错|是|否|正确|错误|True|False)\s*[）】)]/i.test(content)) {
    return "truefalse"
  }
  if (/[）】)]?\s*[（【(]\s*[√×X]\s*[）】)]\s*$/.test(content)) {
    return "truefalse"
  }
  if (/[。]\s*[√×]\s*$/.test(content)) {
    return "truefalse"
  }
  if (/判断.*是否|是否.*正确|对错|正确与否|是否正确|是否属于|是否有效/.test(content)) {
    return "truefalse"
  }

  if (/填空|填写|填入|填上/.test(content)) {
    return "fill"
  }
  if (/[（【(]\s{2,}[）】)]|[（【(]\s*[）】)]|[【】]|\[\s*\]|_{3,}|\(\s*\)/.test(content)) {
    return "fill"
  }

  if (/论述|简述|试述|详述|阐述|评述/.test(content)) {
    return "essay"
  }
  if (/哪些方面|如何理解|如何体现|有何意义|有何区别|有何不同/.test(content)) {
    return "essay"
  }

  if (/[{};]/.test(content) && /(?:class|public|private|void|int|String|System)\s/.test(content)) {
    return "code"
  }
  if (/编程|程序|代码|实现|编写|写一个|函数|算法/.test(content) && /[{};]/.test(content)) {
    return "code"
  }

  if (/计算|求解|证明|推导|求值|求出|算出|得出/.test(content)) {
    return "calculation"
  }
  return "essay"
}
export async function extractQuestionsFromHtml(html: string, sourcePages?: number[]): Promise<ExtractedQuestion[]> {
  const questions: ExtractedQuestion[] = []

  const { cleanHtml } = extractRedText(html)

  const sectionRegex = /<(p|h[1-6])\b[^>]*>(?:<strong>)?\s*([^<>]+?)\s*(?:<\/strong>)?<\/\1>/gi
  const knownHeading = new RegExp(String.raw`^(?:(?:[一二三四五六七八九十]+|[1-9]|10)\s*[、.．:：]\s*)?(${QUESTION_TYPE_SOURCE})(?:[一二三四五六七八九十\d]+)?\s*${SECTION_SCORE_NOTE}$`)
  const sections: { type: QuestionType; tag?: string; startIdx: number; content: string }[] = []

  let sectionMatch
  const sectionPositions: { type: QuestionType; tag?: string; idx: number }[] = []

  while ((sectionMatch = sectionRegex.exec(cleanHtml)) !== null) {
    const heading = sectionMatch[2].trim()
    const typeName = knownHeading.exec(heading)?.[1]
    const type = typeName && TYPE_MAP[typeName]
    if (type) {
      const tag = typeName.startsWith("名词解释") ? "名词解释" : typeName === "简答题" ? typeName : undefined
      sectionPositions.push({ type, tag, idx: sectionMatch.index })
    } else if (sectionPositions.at(-1)?.tag && (sectionMatch[1] !== "p" || /^\s*[一二三四五六七八九十]+\s*[、.．:：]/.test(heading))) {
      // 遇到新大题标题时，后续题目不能继续沿用上一大题的标签。
      sectionPositions.push({ type: "essay", idx: sectionMatch.index })
    }
  }

  for (let i = 0; i < sectionPositions.length; i++) {
    const { type, tag, idx } = sectionPositions[i]
    const endIdx = i + 1 < sectionPositions.length ? sectionPositions[i + 1].idx : cleanHtml.length
    const sectionContent = cleanHtml.substring(idx, endIdx)
    sections.push({ type, tag, startIdx: idx, content: sectionContent })
  }

  if (sections.length === 0) {
    sections.push({ type: "essay", startIdx: 0, content: cleanHtml })
  }

  for (const section of sections) {
    const questionStarts: { num: string; pos: number; len: number }[] = []

    const startPatterns = [
      { regex: /<p[^>]*>\s*(\d+)\s*[、.．。:：)）]\s*/g, type: "dot" },
      { regex: /<p[^>]*>\s*(\d+)\s+(?=[A-Z\u4e00-\u9fff"])/g, type: "space" },
      { regex: /<p[^>]*>\s*(\d+)\s*[\u4e00-\u9fff]/g, type: "chinese" },
      { regex: /<p[^>]*>\s*第\s*(\d+)\s*题/g, type: "di" },
      { regex: /<p[^>]*>\s*[（【]\s*(\d+)\s*[）】]\s*/g, type: "paren" },
    ]

    for (const { regex } of startPatterns) {
      let match
      regex.lastIndex = 0
      while ((match = regex.exec(section.content)) !== null) {
        const beforeMatch = section.content.substring(Math.max(0, match.index - 300), match.index)
        const isInsideCode = /(?:class|void|int|String|public|private|protected)\s+\w+\s*[{(;]/.test(beforeMatch)
        if (!isInsideCode) {
          questionStarts.push({
            num: match[1],
            pos: match.index,
            len: match[0].length,
          })
        }
      }
    }

    questionStarts.sort((a, b) => a.pos - b.pos)
    const uniqueStarts = questionStarts.filter((q, i, arr) =>
      i === 0 || q.pos - arr[i - 1].pos > 5
    )

    for (let i = 0; i < uniqueStarts.length; i++) {
      const start = uniqueStarts[i]
      const end = i + 1 < uniqueStarts.length ? uniqueStarts[i + 1].pos : section.content.length

      const questionHtml = section.content.substring(start.pos + start.len, end).trim()

      const headerCheck = questionHtml.replace(/<[^>]+>/g, "").trim()
      if (new RegExp(`^(?:${QUESTION_TYPE_SOURCE})`).test(headerCheck)) {
        continue
      }

      const { redTexts: questionRedTexts, cleanHtml: questionCleanHtml } = extractRedText(questionHtml)

      const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi
      const options: string[] = []
      let tableMatch

      while ((tableMatch = tableRegex.exec(questionCleanHtml)) !== null) {
        const extractedOptions = extractOptionsFromTable(tableMatch[0])
        options.push(...extractedOptions)
      }

      const paragraphOptions = extractOptionsFromParagraphs(questionCleanHtml)
      paragraphOptions.forEach(opt => {
        if (!options.includes(opt)) options.push(opt)
      })

      const cleanQuestionHtml = questionCleanHtml
        .replace(/<table[\s\S]*?<\/table>/gi, "")
        .replace(/<p[^>]*>\s*[A-HＡ-Ｈａ-ｈ]\s*[、.．。：:）)]\s*.+?<\/p>/gi, "")
        .trim()

      const processedHtml = cleanQuestionHtml
        .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
          const formatted = code
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .trim()
          return "\n```\n" + formatted + "\n```\n"
        })

      let plainText = processedHtml
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\n{3,}/g, "\n\n")
        .trim()

      plainText = addAnswerAndExplanationBreaks(plainText)
        .replace(/\n{3,}/g, "\n\n")
        .trim()

      const inlineOptionText = extractInlineOptionText(plainText)
      if (inlineOptionText) {
        extractOptionsFromText(inlineOptionText).forEach(opt => {
          if (!options.includes(opt)) options.push(opt)
        })
      }

      if (options.length > 0) {
        plainText = removeOptionRunsFromText(plainText)
      }

      if (plainText.length < 5) continue

      plainText = plainText.replace(
        new RegExp(`^\\s*[（【）】]\\s*(?:${QUESTION_TYPE_SOURCE})\\s*[,，]\\s*\\d+\\.?\\d*\\s*分\\s*[（【）】]\\s*`, "i"),
        ""
      )

      const detectedType = detectQuestionType(plainText, options, section.type)
      const questionType = detectedType

      const { contentWithoutExplanation, explanation } = splitExplanation(plainText)
      const { cleanContent, answer } = extractAnswer(contentWithoutExplanation, questionType, questionRedTexts)

      questions.push({
        type: questionType,
        tags: section.tag ? [section.tag] : undefined,
        content: cleanContent,
        options: options.length > 0 ? options : null,
        answer,
        explanation,
        contentHash: "",
        sourcePage: sourcePages?.[(cleanHtml.slice(0, section.startIdx + start.pos).match(/<p\b/gi) || []).length],
      })
    }
  }

  // Filter non-question content and normalize
  const filteredQuestions = questions.filter(q => {
    const { filter } = shouldFilterContent(q.content)
    return !filter
  })

  // Normalize all questions
  const normalizedQuestions = filteredQuestions.map(q => normalizeQuestion(q))

  return normalizedQuestions
}

export function recognizeParagraphs(
  texts: string[],
  sourceKind: StructuredParagraph["sourceKind"] = "paragraph",
  sourcePages?: number[],
): ExtractedQuestion[] {
  const paragraphs = normalizeParagraphs(texts.map((text, sourceIndex) => ({
    text,
    sourceIndex,
    sourceKind,
    styleHints: {},
  })))

  return segmentQuestions(paragraphs).flatMap((block) => {
    const fields = extractFields(block)
    if (!fields.stem) return []
    const decision = classifyQuestion({
      stem: fields.stem,
      options: fields.options,
      answer: fields.answer,
      sectionType: block.sectionType,
    })
    const diagnostic: RecognitionDiagnostic = {
      confidence: Math.min(block.diagnostic.confidence, fields.diagnostic.confidence, decision.confidence),
      warnings: [...block.diagnostic.warnings, ...fields.diagnostic.warnings, ...decision.warnings],
      evidence: [...block.diagnostic.evidence, ...fields.diagnostic.evidence, ...decision.evidence],
    }
    const question: ExtractedQuestion = {
      type: decision.type,
      tags: block.sectionTag ? [block.sectionTag] : undefined,
      content: fields.stem,
      options: fields.options.length > 0 ? fields.options : null,
      answer: fields.answer,
      explanation: fields.explanation,
      contentHash: "",
      diagnostic,
      sourcePage: sourcePages?.[block.paragraphs[0]?.sourceIndex],
    }
    const { filter } = shouldFilterContent(question.content)
    // 名词解释的题干本身常以“术语：定义”开头，不能按普通元信息过滤。
    const keepPdfEssay = sourceKind === "pdf-line" && block.sectionType === "essay"
    return filter && !keepPdfEssay ? [] : [normalizeQuestion(question)]
  })
}

// Main function: convert Word file to questions
export async function parseWordFile(filePath: string): Promise<ExtractedQuestion[]> {
  const result = await mammoth.convertToHtml({ path: filePath })

  if (result.messages.length > 0) {
    console.warn("Mammoth warnings:", result.messages)
  }

  return extractQuestionsFromHtml(result.value)
}

// Parse from buffer (for uploaded files)
export async function parseWordBuffer(buffer: Buffer): Promise<ExtractedQuestion[]> {
  const result = await mammoth.convertToHtml({ buffer })

  if (result.messages.length > 0) {
    console.warn("Mammoth warnings:", result.messages)
  }

  return extractQuestionsFromHtml(result.value)
}

export async function parsePdfTextToQuestions(text: string): Promise<ExtractedQuestion[]> {
  const paragraphs = pdfTextToParagraphs(text)
  if (paragraphs.length === 0) {
    throw new Error("未从 PDF 中提取到文本内容")
  }

  const recognized = recognizeParagraphs(paragraphs, "pdf-line")
  return recognized.length > 0 ? recognized : extractQuestionsFromHtml(paragraphsToHtml(paragraphs))
}

// 保留每一页的位置，扫描图片仍需先进行 OCR。
export async function parsePdfBuffer(buffer: Buffer): Promise<ExtractedQuestion[]> {
  const { withPdfDocument } = await import("./pdf-document")
  const pages = await withPdfDocument(buffer, async pdf => {
    const pages: string[] = []
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index)
      try {
        const content = await page.getTextContent()
        pages.push(content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : "") : "").join(""))
      } finally {
        page.cleanup()
      }
    }
    return pages
  })
  if (!pages.some(page => page.trim())) throw new Error("未从 PDF 中提取到文本内容，请确认不是纯扫描图片 PDF")
  return parsePositionedExercises(pages, 1)
}

export async function parsePositionedExercises(segments: string[], first: number): Promise<ExtractedQuestion[]> {
  const paragraphs: string[] = []
  const sourcePages: number[] = []
  segments.forEach((page, index) => {
    const lines = pdfTextToParagraphs(page)
    paragraphs.push(...lines)
    sourcePages.push(...lines.map(() => index + first))
  })
  if (!paragraphs.length) return []
  const recognized = recognizeParagraphs(paragraphs, "pdf-line", sourcePages)
  return recognized.length ? recognized : extractQuestionsFromHtml(paragraphsToHtml(paragraphs), sourcePages)
}

// Parse PowerPoint OOXML files (.pptx/.pptm) and legacy binary .ppt files from uploaded buffers.
export async function parsePowerPointBuffer(buffer: Buffer): Promise<ExtractedQuestion[]> {
  const paragraphs: string[] = []
  const sourcePages: number[] = []

  try {
    const zip = await JSZip.loadAsync(buffer)
    const slideFiles = Object.keys(zip.files)
      .map((path) => {
        const match = path.match(/^ppt\/slides\/slide(\d+)\.xml$/i)
        return match ? { path, index: Number(match[1]) } : null
      })
      .filter((entry): entry is { path: string; index: number } => entry !== null)
      .sort((a, b) => a.index - b.index)

    if (slideFiles.length === 0) {
      throw new Error("未找到可识别的幻灯片内容，请确认文件是有效的 .pptx 或 .pptm")
    }

    for (const slide of slideFiles) {
      const file = zip.file(slide.path)
      if (!file) continue

      const slideXml = await file.async("string")
      const lines = extractPowerPointParagraphs(slideXml)
      paragraphs.push(...lines)
      sourcePages.push(...lines.map(() => slide.index))
    }
  } catch {
    const { extractOLE2Text } = await import("./ole2-parser")
    paragraphs.push(...extractOLE2Text(buffer))

    if (paragraphs.length === 0) {
      paragraphs.push(...extractLegacyPowerPointParagraphs(buffer))
    }
  }

  if (paragraphs.length === 0) {
    throw new Error("未从 PPT 中提取到文本内容")
  }

  return extractQuestionsFromHtml(paragraphsToHtml(paragraphs), sourcePages)
}
