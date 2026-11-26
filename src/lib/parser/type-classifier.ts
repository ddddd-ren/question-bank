import type { QuestionType } from "@/lib/types"
import type { RecognitionDiagnostic, RecognitionWarning } from "./recognition-types"
import { normalizeChoiceAnswer } from "./choice-answer"

export interface TypeDecision {
  type: QuestionType
  confidence: number
  evidence: string[]
  alternatives: Array<{ type: QuestionType; score: number }>
  warnings: RecognitionDiagnostic["warnings"]
}

const TYPES: QuestionType[] = ["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]

export function classifyQuestion(input: {
  stem: string
  options: string[]
  answer: string | null
  sectionType?: QuestionType
}): TypeDecision {
  const scores = Object.fromEntries(TYPES.map((type) => [type, 0])) as Record<QuestionType, number>
  const evidence: string[] = []
  const warnings: RecognitionWarning[] = []

  if (input.sectionType) {
    scores[input.sectionType] += 100
    evidence.push(`章节题型：${input.sectionType}`)
  }

  if (input.options.length >= 2) {
    scores.single += 50
    scores.multiple += 50
    evidence.push(`检测到 ${input.options.length} 个选项`)
  }

  const choiceAnswer = normalizeChoiceAnswer(input.answer)
  if (choiceAnswer && input.options.length >= 2) {
    const target = choiceAnswer.length > 1 ? "multiple" : "single"
    scores[target] += choiceAnswer.length > 1 ? 35 : 25
    evidence.push(`有效选项答案：${choiceAnswer}`)
  }

  if (/^(?:true|false|对|错|是|否|正确|错误|√|×)$/i.test(input.answer?.trim() || "") || /[（(]\s*[√×]\s*[）)]/.test(input.stem)) {
    scores.truefalse += 45
    evidence.push("检测到判断答案或判断占位")
  }

  const blankCount = input.stem.match(/____\{?\d*\}?|_{3,}|[（(]\s*[）)]|【\s*】|\[\s*]/g)?.length || 0
  const inlineTextFill = (input.sectionType === "single" || input.sectionType === "multiple")
    && input.options.length === 0
    && Boolean(input.answer)
    && blankCount > 0
  if (inlineTextFill) {
    scores.fill += 120
    evidence.push("选择题章节中检测到括号文本答案，按填空题处理")
  }
  if (blankCount >= 2) {
    scores.fill += 40
    evidence.push(`检测到 ${blankCount} 个填空位`)
  }

  if (/(?:编写程序|程序设计|代码|function\s+\w+|class\s+\w+|#include)/i.test(input.stem)) {
    scores.code += 35
    evidence.push("检测到编程证据")
  }
  if (/(?:计算|求解|证明)/.test(input.stem)) {
    scores.calculation += 20
    evidence.push("检测到计算关键词")
  }
  if (/(?:简述|分析|论述|说明)/.test(input.stem)) {
    scores.essay += 15
    evidence.push("检测到论述关键词")
  }

  const alternatives = TYPES
    .map((type) => ({ type, score: Math.min(100, scores[type]) }))
    .sort((left, right) => right.score - left.score)
  const [first, second] = alternatives
  const difference = first.score - second.score

  let type = first.type
  if (inlineTextFill) type = "fill"
  else if (input.sectionType) type = input.sectionType
  else if (first.score === 0 || (first.type === "single" && second.type === "multiple" && difference < 20)) type = "essay"

  if (!input.sectionType && type === "essay" && input.options.length >= 2 && !choiceAnswer) {
    warnings.push({ code: "uncertain_type", message: "检测到选项但缺少章节或答案证据，已保守按论述题处理" })
  }
  if (first.score > 0 && difference < 20) {
    warnings.push({ code: "conflicting_signals", message: "题型证据接近，建议人工核对" })
  }

  return {
    type,
    confidence: Math.max(20, Math.min(100, first.score === 0 ? 30 : 50 + difference)),
    evidence,
    alternatives,
    warnings,
  }
}
