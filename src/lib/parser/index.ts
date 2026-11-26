export {
  extractQuestionsFromHtml,
  parsePdfBuffer,
  parsePdfTextToQuestions,
  parsePowerPointBuffer,
  parseWordBuffer,
  parseWordFile,
} from "./question-extractor"
export type { ExtractedQuestion } from "./question-extractor"
export type { RecognitionDiagnostic, RecognitionWarning, StructuredParagraph } from "./recognition-types"
export { QUESTION_TYPES, isQuestionType, assertQuestionType } from "@/lib/types"
export type { QuestionType } from "@/lib/types"
