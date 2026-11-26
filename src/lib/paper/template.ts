import type { QuestionType } from "@/lib/types"
import type { TextbookChapter, TextbookFormat, TextbookPaperRequest } from "@/lib/textbooks/types"

export const MAX_TEMPLATE_SLOTS = 1000

export interface TemplateSlot {
  number: string
  points: number | null
  type?: QuestionType
}

export interface TemplateSection {
  title: string
  type: QuestionType
  tag?: string
  knowledgePointId?: number
  difficulty?: number
  slots: TemplateSlot[]
}

export interface TemplateFilters {
  subjectId?: number
  knowledgePointId?: number
  difficulty?: number
}

export interface SavedTemplate {
  id: string
  name: string
  sections: TemplateSection[]
}

export interface PaperTemplateSnapshot extends SavedTemplate {
  filters: TemplateFilters
  study?: PaperStudyScope
}

export interface PaperStudyScope extends TextbookPaperRequest {
  title: string
  edition: string
  format: TextbookFormat
  chapters: Omit<TextbookChapter, "linkedCount">[]
  newSlots?: number[]
}

export interface StudyBalance {
  newRequired: number
  newAssigned: number
  oldRequired: number
  oldAssigned: number
}

export interface TemplateShortage {
  sectionIndex: number
  required: number
  available: number
}
