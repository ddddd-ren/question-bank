import { normalizeChoiceAnswer } from "./choice-answer"
import { type QuestionBlock, type RecognitionDiagnostic } from "./recognition-types"

export interface ExtractedFields {
  stem: string
  options: string[]
  answer: string | null
  explanation: string | null
  diagnostic: RecognitionDiagnostic
}

const EXPLANATION_LABEL = /(?:答案解析|解析|详解|解答|说明|分析)\s*[:：]/i
const ANSWER_LABEL = /(?:参考答案|正确答案|标准答案|答案|Answer|Ans)\s*[:：]\s*/i
const OPTION_MARKER = /(?:^|\s)[（(]?([A-ZＡ-Ｚ])[)）.．、]\s*/gi
const BRACKETED_CHOICE_ANSWER = /[（(]\s*([A-ZＡ-Ｚ](?:\s*[,，、]?\s*[A-ZＡ-Ｚ])*)\s*[)）]/gi
const BRACKETED_TEXT_ANSWER = /[（(]\s*([^()（）]{1,200}?)\s*[)）](?=\s*(?:[。．.!！?？；;]|$))/g
const QUESTION_NUMBER = /^(?:第\s*\d{1,3}\s*题|[（(]?\d{1,3}[)）.．、])\s*/

function normalizeLetter(letter: string): string {
  const code = letter.charCodeAt(0)
  if (code >= 0xff21 && code <= 0xff3a) return String.fromCharCode(code - 0xff21 + 65)
  return letter.toUpperCase()
}

function optionParts(text: string): Array<{ letter: string; body: string; prefix: string }> {
  const markers = Array.from(text.matchAll(OPTION_MARKER))
  return markers.map((marker, index) => {
    const start = (marker.index ?? 0) + marker[0].length
    const end = index + 1 < markers.length ? markers[index + 1].index : text.length
    return {
      letter: normalizeLetter(marker[1]),
      body: text.slice(start, end).trim(),
      prefix: index === 0 ? text.slice(0, marker.index).trim() : "",
    }
  })
}

export function extractFields(block: QuestionBlock): ExtractedFields {
  const diagnostic: RecognitionDiagnostic = {
    confidence: block.diagnostic.confidence,
    warnings: [...block.diagnostic.warnings],
    evidence: [...block.diagnostic.evidence],
  }
  const working = block.paragraphs.map((paragraph) => ({ ...paragraph }))
  const explanationLines: string[] = []
  let explanationStarted = false

  for (const paragraph of working) {
    if (explanationStarted) {
      explanationLines.push(paragraph.text)
      paragraph.text = ""
      continue
    }
    const match = paragraph.text.match(EXPLANATION_LABEL)
    if (!match || match.index === undefined) continue
    explanationStarted = true
    const before = paragraph.text.slice(0, match.index).trim()
    const after = paragraph.text.slice(match.index + match[0].length).trim()
    paragraph.text = before
    if (after) explanationLines.push(after)
  }

  let answer: string | null = null
  for (const paragraph of working) {
    const match = paragraph.text.match(ANSWER_LABEL)
    if (!match || match.index === undefined) continue
    const value = paragraph.text.slice(match.index + match[0].length).trim()
    answer = normalizeChoiceAnswer(value) || value || null
    paragraph.text = paragraph.text.slice(0, match.index).trim()
    break
  }

  const markerCount = working.reduce((count, paragraph) => count + optionParts(paragraph.text).length, 0)
  const options: string[] = []
  const stemLines: string[] = []
  let optionsStarted = false

  if (markerCount >= 2) {
    for (const paragraph of working) {
      if (!paragraph.text) continue
      const parts = optionParts(paragraph.text)
      if (parts.length > 0) {
        if (parts[0].prefix) stemLines.push(parts[0].prefix)
        optionsStarted = true
        options.push(...parts.map((part) => `${part.letter}. ${part.body}`.trimEnd()))
      } else if (optionsStarted && paragraph.text.length <= 120 && !ANSWER_LABEL.test(paragraph.text)) {
        options[options.length - 1] = `${options[options.length - 1]} ${paragraph.text}`.trim()
      } else {
        stemLines.push(paragraph.text)
      }
    }
  } else {
    stemLines.push(...working.map((paragraph) => paragraph.text).filter(Boolean))
    if (markerCount === 1) {
      diagnostic.confidence = Math.min(diagnostic.confidence, 60)
      diagnostic.warnings.push({
        code: "uncertain_option",
        message: "仅检测到一个选项标记，已保留在题干中",
      })
    }
  }

  if (!answer && options.length > 0) {
    const redAnswerIndex = working.findIndex((paragraph) => paragraph.styleHints.isRed && /^[A-ZＡ-Ｚ]$/i.test(paragraph.text.trim()))
    if (redAnswerIndex >= 0) {
      const candidate = normalizeLetter(working[redAnswerIndex].text.trim())
      if (options.some((option) => option.startsWith(`${candidate}.`))) {
        answer = candidate
        const redText = working[redAnswerIndex].text
        const stemIndex = stemLines.indexOf(redText)
        if (stemIndex >= 0) stemLines.splice(stemIndex, 1)
      }
    }
  }

  if (!answer && options.length > 0) {
    const availableOptions = new Set(options.map((option) => option[0]))
    for (let index = 0; !answer && index < stemLines.length; index += 1) {
      stemLines[index] = stemLines[index].replace(BRACKETED_CHOICE_ANSWER, (match, value: string) => {
        const candidate = normalizeChoiceAnswer(value)
        if (!candidate || [...candidate].some((letter) => !availableOptions.has(letter))) return match
        answer = candidate
        return match.startsWith("（") ? "（ ）" : "( )"
      })
    }
  }

  if (!answer && block.sectionType === "single") {
    const stem = stemLines.join("\n")
    const matches = Array.from(stem.matchAll(BRACKETED_TEXT_ANSWER))
    const match = matches.findLast((candidate) => options.length === 0 || !normalizeChoiceAnswer(candidate[1]))
    if (match?.index !== undefined) {
      const candidate = match[1].replace(/\s+/g, " ").trim()
      const matchingOption = options.find((option) => option.slice(2).replace(/\s+/g, "").trim() === candidate.replace(/\s+/g, ""))
      if (options.length === 0) {
        answer = candidate
      } else if (matchingOption) {
        answer = matchingOption[0]
      } else if (options.length === 3 && options.every((option, index) => option.startsWith(`${String.fromCharCode(65 + index)}.`))) {
        options.push(`D. ${candidate}`)
        answer = "D"
      }

      if (answer) {
        const blank = match[0].startsWith("（") ? "（ ）" : "( )"
        stemLines.splice(0, stemLines.length, `${stem.slice(0, match.index)}${blank}${stem.slice(match.index + match[0].length)}`)
      }
    }
  }

  return {
    stem: stemLines.join("\n").replace(QUESTION_NUMBER, "").trim(),
    options,
    answer,
    explanation: explanationLines.length > 0 ? explanationLines.join("\n").trim() : null,
    diagnostic,
  }
}
