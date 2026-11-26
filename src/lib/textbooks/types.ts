export type TextbookFormat = "pdf" | "epub" | "docx"

export interface TextbookHeading {
  title: string
  level: number
  start: number
}

export interface TextbookImportData {
  format: TextbookFormat
  segments: string[]
  chapters: TextbookHeading[]
  warnings: string[]
}

export interface TextbookSummary {
  id: string
  title: string
  edition: string
  format: TextbookFormat
  unitCount: number
  chapterCount: number
}

export interface TextbookChapter extends TextbookHeading {
  id: string
  end: number
  learnedTo: number | null
  recentFrom: number | null
  skipped?: boolean
  linkedCount: number
}

export interface TextbookDetail extends TextbookSummary {
  chapters: TextbookChapter[]
}

export interface TextbookQuestionLink {
  questionId: number
  chapterId: string
  through: number | null
}

export type StudyMode = "cumulative" | "recent" | "custom" | "mixed"

export interface TextbookPaperRequest {
  bookId: string
  mode: StudyMode
  chapterIds?: string[]
  newCount?: number
}

export const studyModeNames: Record<StudyMode, string> = {
  cumulative: "累计复习",
  recent: "只考本次新学",
  custom: "自选已学章节",
  mixed: "新课与旧课搭配",
}
