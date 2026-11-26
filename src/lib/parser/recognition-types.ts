import type { QuestionType } from "@/lib/types"

export interface StructuredParagraph {
  text: string
  sourceIndex: number
  sourceKind: "paragraph" | "table" | "slide" | "pdf-line"
  styleHints: { isRed?: boolean; isBold?: boolean; level?: number }
}

export type RecognitionWarningCode =
  | "uncertain_boundary"
  | "uncertain_type"
  | "uncertain_option"
  | "answer_option_mismatch"
  | "blank_answer_mismatch"
  | "conflicting_signals"

export interface RecognitionWarning {
  code: RecognitionWarningCode
  message: string
  sourceText?: string
}

export interface RecognitionDiagnostic {
  confidence: number
  warnings: RecognitionWarning[]
  evidence: string[]
}

export interface QuestionBlock {
  paragraphs: StructuredParagraph[]
  sectionType?: QuestionType
  sectionTag?: string
  boundaryConfidence: number
  diagnostic: RecognitionDiagnostic
}

export function emptyDiagnostic(confidence = 100): RecognitionDiagnostic {
  return { confidence, warnings: [], evidence: [] }
}
