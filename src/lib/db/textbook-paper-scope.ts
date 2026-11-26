import { ApiError } from "../api-error"
import type { PaperStudyScope } from "../paper/template"
import type { TextbookPaperRequest } from "../textbooks/types"
import { sqliteDb } from "./index"
import { getTextbook, listTextbookQuestionLinks } from "./textbooks"

export function freezeStudyScope(request: TextbookPaperRequest, total: number): PaperStudyScope {
  const book = getTextbook(request.bookId)
  if (!book.chapters.some(chapter => chapter.learnedTo !== null)) throw new ApiError(409, "请先到教材页标记已学范围")
  if (request.mode === "custom") {
    const known = new Set(book.chapters.filter(chapter => chapter.learnedTo !== null).map(chapter => chapter.id))
    if (!request.chapterIds?.length || request.chapterIds.some(id => !known.has(id))) throw new ApiError(400, "请从本册教材选择已学章节")
  }
  if (request.mode === "mixed" && (request.newCount === undefined || !Number.isInteger(request.newCount) || request.newCount < 0 || request.newCount > total)) {
    throw new ApiError(400, `新课题数须在 0 至 ${total} 题之间`)
  }
  const chapters = book.chapters.map(({ id, title, level, start, end, learnedTo, recentFrom, skipped }) =>
    ({ id, title, level, start, end, learnedTo, recentFrom, ...(skipped && { skipped: true }) }))
  return { bookId: book.id, mode: request.mode, title: book.title, edition: book.edition, format: book.format, chapters,
    ...(request.mode === "custom" && { chapterIds: [...new Set(request.chapterIds)] }),
    ...(request.mode === "mixed" && { newCount: request.newCount }) }
}

export interface StudyCandidates { all: number[]; recent: number[]; review: number[] }

export function studyCandidates(scope: PaperStudyScope): StudyCandidates {
  const links = listTextbookQuestionLinks(scope.bookId)
  const result: StudyCandidates = { all: [], recent: [], review: [] }
  if (!links.length) return result

  const current = getTextbook(scope.bookId).chapters
  const bounds = (chapters: PaperStudyScope["chapters"]) => {
    const ends = chapters.map(() => chapters.length)
    const trail: number[] = []
    chapters.forEach((chapter, index) => {
      while (trail.length && chapters[trail[trail.length - 1]].level >= chapter.level) ends[trail.pop()!] = index
      trail.push(index)
    })
    return ends
  }
  const chapters = scope.chapters
  const ends = bounds(chapters), liveEnds = bounds(current)
  const liveIndex = new Map(current.map((chapter, index) => [chapter.id, index]))
  const indexById = new Map(chapters.map((chapter, index) => [chapter.id, index]))
  const selected = new Set(scope.chapterIds)
  const included = new Set<string>()
  if (scope.mode === "custom") {
    for (let index = 0; index < chapters.length; index++) {
      if (!selected.has(chapters[index].id)) continue
      for (let i = index; i < ends[index]; i++) included.add(chapters[i].id)
      index = ends[index] - 1
    }
  }

  const previous = 1, recent = 2
  const cached = new Map<string, number>()
  function classify(chapterId: string, through: number | null) {
    const index = indexById.get(chapterId), live = liveIndex.get(chapterId)
    if (index === undefined || live === undefined || (scope.mode === "custom" && !included.has(chapterId))) return 0
    // 原卷换题沿用当时的目录和进度。目录边界变化后不能把新位置套在旧快照上。
    if (ends[index] - index !== liveEnds[live] - live) return 0
    const chapter = chapters[index], target = through ?? chapter.end
    if (target < chapter.start || target > chapter.end) return 0
    let periods = 0
    for (let i = index; i < ends[index]; i++) {
      const child = chapters[i], now = current[live + i - index]
      if (child.id !== now.id || child.level !== now.level || child.start !== now.start || child.end !== now.end) return 0
      if (child.start > target) continue
      const required = Math.min(target, child.end)
      if (child.learnedTo === null || child.learnedTo < required) return 0
      if (through !== null && child.end < target) continue
      const start = through === null ? child.start : required
      if (child.recentFrom === null || start < child.recentFrom) periods |= previous
      if (child.recentFrom !== null && required >= child.recentFrom) periods |= recent
    }
    return periods
  }

  const ids = [...new Set(links.map(link => link.questionId))]
  const rows = sqliteDb.prepare(`SELECT id, coalesce(nullif(fingerprint,''), question_fingerprint(type,content,options)) AS identity
    FROM questions WHERE archived_at IS NULL AND id IN (SELECT value FROM json_each(?))`).all(JSON.stringify(ids)) as { id: number; identity: string }[]
  const identities = new Map(rows.map(row => [row.id, row.identity]))
  const periods = new Map<string, number>()
  for (const { questionId, chapterId, through } of links) {
    const identity = identities.get(questionId)
    if (!identity || periods.get(identity) === 0) continue
    const key = chapterId + "/" + (through ?? "all")
    if (!cached.has(key)) cached.set(key, classify(chapterId, through))
    const value = cached.get(key)!
    // 同一道题的历史重复记录共享全部必需考点，不能从另一条记录绕过进度。
    periods.set(identity, value === 0 ? 0 : (periods.get(identity) ?? 0) | value)
  }
  for (const { id, identity } of rows) {
    const value = periods.get(identity)
    if (!value) continue
    if (value === recent) result.recent.push(id)
    if (value === previous) result.review.push(id)
    if (scope.mode !== "recent" || value === recent) result.all.push(id)
  }
  return result
}
