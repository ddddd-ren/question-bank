import { ApiError } from "../api-error"
import { sqliteDb } from "./index"
import { insertQuestionsBatch } from "./queries"
import type { NewQuestion } from "./schema"
import { getTextbook, listTextbookQuestionLinks, setTextbookQuestionLinks } from "./textbooks"

export interface ExerciseSelection { bookId: string; chapterId: string; from: number; to: number }
export const MAX_EXERCISE_UNITS = 250
export const MAX_EXERCISES = 300

export function getExerciseChapter(selection: ExerciseSelection) {
  const book = getTextbook(selection.bookId)
  const chapter = book.chapters.find(c => c.id === selection.chapterId)
  if (!chapter) throw new ApiError(404, "这本教材中找不到所选章节")
  if (selection.from < chapter.start || selection.to > chapter.end || selection.from > selection.to) throw new ApiError(400, "习题范围须在所选章节内")
  if (selection.to - selection.from + 1 > MAX_EXERCISE_UNITS) throw new ApiError(400, `一次最多预览 ${MAX_EXERCISE_UNITS} 页或段，请缩小范围`)
  return { book, chapter }
}

export function saveTextbookExercises(selection: ExerciseSelection, questions: NewQuestion[]) {
  if (questions.length > MAX_EXERCISES) throw new ApiError(400, `一次最多导入 ${MAX_EXERCISES} 道教材习题`)
  return sqliteDb.transaction(() => {
    const { book, chapter } = getExerciseChapter(selection)
    const unique = new Map<string, NewQuestion>()
    for (const q of questions) {
      const position = q.sourcePage
      if (position != null && (position < selection.from || position > selection.to)) throw new ApiError(400, "习题出处超出本次预览范围")
      if (!unique.has(q.contentHash)) unique.set(q.contentHash, { ...q, sourcePage: book.format === "pdf" ? position : null,
        sourceFile: [book.title, book.edition, chapter.title, book.format !== "pdf" && position ? `第 ${position} 段` : ""].filter(Boolean).join(" · ") })
    }
    const existing = sqliteDb.prepare(`SELECT id, fingerprint, archived_at FROM questions
      WHERE fingerprint IN (SELECT value FROM json_each(?)) ORDER BY archived_at IS NOT NULL, id`)
      .all(JSON.stringify([...unique.keys()])) as { id: number; fingerprint: string; archived_at: string | null }[]
    const ids: number[] = []
    let archived = 0
    for (const q of existing) {
      if (!unique.delete(q.fingerprint)) continue
      if (q.archived_at === null) ids.push(q.id)
      else archived++
    }
    const created = insertQuestionsBatch([...unique.values()])
    ids.push(...created.map(q => q.id))
    const linked = new Set(listTextbookQuestionLinks(book.id).filter(link => link.chapterId === chapter.id).map(link => link.questionId))
    const pending = ids.filter(id => !linked.has(id))
    if (pending.length) setTextbookQuestionLinks(book.id, pending, [{ chapterId: chapter.id, through: null }], "add")
    return { imported: created.length, linked: ids.length, archived }
  }).immediate()
}
