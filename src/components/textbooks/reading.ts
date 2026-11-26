import type { TextbookChapter, TextbookFormat } from "@/lib/textbooks/types"

export const selectClass = "h-9 max-w-full rounded-lg border border-input bg-card px-2 text-sm focus-visible:outline-ring"

export function positionUnit(format: TextbookFormat) {
  return format === "pdf" ? "页" : "段"
}

export function chapterRange(chapter: TextbookChapter, unit: string) {
  const span = chapter.start === chapter.end ? chapter.start : `${chapter.start}–${chapter.end}`
  return `第 ${span} ${unit}`
}

export function learnedLabel(chapter: TextbookChapter, unit: string) {
  if (chapter.skipped) return "已跳过"
  if (chapter.learnedTo === null) return "未学"
  return chapter.learnedTo === chapter.end ? "已学至节末" : `学至第 ${chapter.learnedTo} ${unit}`
}

export function chapterAt(chapters: TextbookChapter[], position: number, preferredId?: string) {
  let nearest: TextbookChapter | undefined
  for (const chapter of chapters) {
    if (chapter.start > position) break
    if (chapter.end < position) continue
    if (chapter.id === preferredId) return chapter
    if (!nearest || chapter.level >= nearest.level) nearest = chapter
  }
  return nearest
}

// 缺少键时保留原进度，只有用户明确选择跳过时才提交 null。
export type ProgressDraft = Record<string, string>

export function advanceThrough(chapters: TextbookChapter[], position: number): ProgressDraft {
  const draft: ProgressDraft = {}
  for (const chapter of chapters) {
    if (chapter.start > position) break
    if (chapter.skipped) continue
    const target = Math.min(chapter.end, position)
    if (chapter.learnedTo !== null && chapter.learnedTo >= target) continue
    draft[chapter.id] = target === chapter.end ? "full" : String(target)
  }
  return draft
}

export function changeChapterMark(
  chapters: TextbookChapter[], index: number, value: string, draft: ProgressDraft,
): ProgressDraft {
  const next = { ...draft }
  const chapter = chapters[index]
  if (value === "keep") delete next[chapter.id]
  else next[chapter.id] = value
  const position = Number(value)
  for (let i = index + 1; i < chapters.length && chapters[i].level > chapter.level; i++) {
    const child = chapters[i]
    delete next[child.id]
    if (value === "full" || value === "skip" || value === "clear") next[child.id] = value
    else if (Number.isInteger(position) && position >= child.start && position <= chapter.end) {
      const target = Math.min(child.end, position)
      if (target > (child.learnedTo ?? 0)) next[child.id] = target === child.end ? "full" : String(target)
    }
  }
  return next
}

export function progressChanges(chapters: TextbookChapter[], draft: ProgressDraft) {
  return chapters.flatMap(chapter => {
    const mark = draft[chapter.id]
    if (mark === undefined) return []
    const learnedTo = mark === "skip" ? null : mark === "full" ? chapter.end : Number(mark)
    const skipped = mark === "skip"
    if (mark === "clear") {
      if (chapter.learnedTo === null && !chapter.skipped) return []
      return [{ chapterId: chapter.id, learnedTo: null, skipped: false }]
    }
    if (learnedTo !== null && (!Number.isInteger(learnedTo) || learnedTo < chapter.start || learnedTo > chapter.end)) {
      throw new Error(`「${chapter.title}」的学习位置须在 ${chapter.start} 至 ${chapter.end} 之间`)
    }
    return learnedTo === chapter.learnedTo && skipped === Boolean(chapter.skipped) ? []
      : [{ chapterId: chapter.id, learnedTo, ...(skipped && { skipped: true }) }]
  })
}
