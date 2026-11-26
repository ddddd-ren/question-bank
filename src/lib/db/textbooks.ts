import { createHash, randomUUID } from "node:crypto"
import { z } from "zod"
import { ApiError } from "../api-error"
import type {
  TextbookChapter, TextbookDetail, TextbookFormat, TextbookHeading, TextbookImportData,
  TextbookQuestionLink, TextbookSummary,
} from "../textbooks/types"
import { sqliteDb } from "./index"

type EditedHeading = TextbookHeading & { id?: string }
type ProgressChange = { chapterId: string; learnedTo: number | null; skipped?: boolean }
type ChapterLink = Omit<TextbookQuestionLink, "questionId">

const positiveInt = z.number().int().positive()
const chapterId = z.string().uuid()
const outlineSchema = z.array(z.object({
  id: chapterId.optional(), title: z.string().trim().min(1, "章节标题不能为空").max(200),
  level: positiveInt.max(6), start: positiveInt,
})).min(1, "请保留至少一个章节").max(3000)
const progressSchema = z.array(z.object({ chapterId, learnedTo: positiveInt.nullable(), skipped: z.boolean().optional() })
  .refine(change => !change.skipped || change.learnedTo === null, "跳过章节时已学位置应为空")).max(3000)
const linksSchema = z.array(z.object({ chapterId, through: positiveInt.nullable() })).max(3000)

function chapterRanges(input: EditedHeading[], unitCount: number) {
  const rows = outlineSchema.parse(input).map(chapter => ({ ...chapter, end: unitCount }))
  const open: typeof rows = []
  for (const [i, row] of rows.entries()) {
    if (row.start > unitCount || (i > 0 && row.start < rows[i - 1].start)) {
      throw new ApiError(400, "章节起点须在教材范围内，并按阅读顺序排列")
    }
    // 同页可以有多级标题；关闭父章时也要包含最后一个子节所在页。
    let end = row.start - 1
    while (open.length && open[open.length - 1].level >= row.level) {
      const previous = open.pop()!
      end = Math.max(previous.start, end)
      previous.end = end
    }
    open.push(row)
  }
  return rows
}

const summaryColumns = `b.id,b.title,b.edition,b.format,b.unit_count AS unitCount,
  (SELECT count(*) FROM textbook_chapters c WHERE c.book_id=b.id) AS chapterCount`

export function listTextbooks(): TextbookSummary[] {
  return sqliteDb.prepare(`SELECT ${summaryColumns} FROM textbooks b ORDER BY b.rowid DESC`).all() as TextbookSummary[]
}

function bookSummary(id: string): TextbookSummary {
  const book = sqliteDb.prepare(`SELECT ${summaryColumns} FROM textbooks b WHERE b.id=?`).get(id) as TextbookSummary | undefined
  if (!book) throw new ApiError(404, "教材不存在")
  return book
}

export function getTextbook(id: string): TextbookDetail {
  return sqliteDb.transaction(() => {
    const book = bookSummary(id)
    const chapters = sqliteDb.prepare(`
      SELECT c.id,c.title,c.level,c.start,c.end,c.learned_to AS learnedTo,c.recent_from AS recentFrom,c.skipped,
        (SELECT count(*) FROM textbook_question_links l WHERE l.chapter_id=c.id) AS linkedCount
      FROM textbook_chapters c WHERE c.book_id=? ORDER BY c.ordinal
    `).all(id) as (Omit<TextbookChapter, "skipped"> & { skipped: number })[]
    return { ...book, chapters: chapters.map(chapter => ({ ...chapter, skipped: Boolean(chapter.skipped) })) }
  })()
}

export function getTextbookSegments(id: string, from: number, to: number): string[] {
  const { unitCount } = bookSummary(id)
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 1 || to < from || to > unitCount) {
    throw new ApiError(400, "阅读位置超出教材范围")
  }
  return sqliteDb.prepare(`
    SELECT text FROM textbook_segments WHERE book_id=? AND position BETWEEN ? AND ? ORDER BY position
  `).pluck().all(id, from, to) as string[]
}

export function getTextbookFile(id: string) {
  const row = sqliteDb.prepare("SELECT filename,format,file FROM textbooks WHERE id=?").get(id) as
    { filename: string; format: TextbookFormat; file: Buffer } | undefined
  if (!row) throw new ApiError(404, "教材不存在")
  return row
}

export function storeTextbook(input: {
  title: string; edition: string; filename: string; bytes: Buffer; parsed: TextbookImportData
}): { id: string; reused: boolean } {
  const { parsed, bytes } = input
  const title = z.string().trim().min(1).max(200).parse(input.title)
  const edition = z.string().trim().max(100).parse(input.edition)
  const filename = z.string().trim().min(1).max(255).parse(input.filename.split(/[\\/]/).pop())
  if (!bytes.length || !parsed.segments.length) throw new ApiError(400, "缺少教材原件或正文")
  const hash = createHash("sha256").update(bytes).digest("hex")
  return sqliteDb.transaction(() => {
    const existing = sqliteDb.prepare("SELECT id FROM textbooks WHERE file_hash=? AND edition=?").pluck().get(hash, edition) as string | undefined
    if (existing) return { id: existing, reused: true }
    const chapters = chapterRanges(parsed.chapters, parsed.segments.length)
    const id = randomUUID()
    sqliteDb.prepare("INSERT INTO textbooks(id,title,edition,format,unit_count,file_hash,filename,file) VALUES(?,?,?,?,?,?,?,?)")
      .run(id, title, edition, parsed.format, parsed.segments.length, hash, filename, bytes)
    const segment = sqliteDb.prepare("INSERT INTO textbook_segments(book_id,position,text) VALUES(?,?,?)")
    parsed.segments.forEach((text, i) => segment.run(id, i + 1, text))
    const insert = sqliteDb.prepare("INSERT INTO textbook_chapters(id,book_id,ordinal,title,level,start,end) VALUES(?,?,?,?,?,?,?)")
    chapters.forEach((c, i) => insert.run(randomUUID(), id, i, c.title, c.level, c.start, c.end))
    return { id, reused: false }
  }).immediate()
}

function requireChapter(chapters: Map<string, TextbookChapter>, id: string, through: number | null) {
  const chapter = chapters.get(id)
  if (!chapter) throw new ApiError(400, "章节不属于当前教材或被重复提交，请重新选择")
  if (through !== null && (through < chapter.start || through > chapter.end)) {
    throw new ApiError(400, `“${chapter.title}”的位置须在 ${chapter.start} 至 ${chapter.end} 之间`)
  }
  return chapter
}

export function updateTextbookProgress(id: string, changes: ProgressChange[], advanceOnly = false): TextbookDetail {
  const entries = progressSchema.parse(changes)
  z.boolean().parse(advanceOnly)
  return sqliteDb.transaction(() => {
    const chapters = new Map(getTextbook(id).chapters.map(chapter => [chapter.id, chapter]))
    const updates = entries.map(({ chapterId, learnedTo, skipped }) => {
      const chapter = requireChapter(chapters, chapterId, learnedTo)
      chapters.delete(chapterId)
      // 快捷推进不能用旧页面清除更新的进度，明确跳过的章节须经主动勾选才恢复。
      if (advanceOnly && ((chapter.skipped && skipped !== false) ||
        (chapter.learnedTo !== null && (learnedTo === null || learnedTo < chapter.learnedTo)))) {
        return { chapter, learnedTo: chapter.learnedTo, skipped: Boolean(chapter.skipped), addedFrom: null }
      }
      const oldEnd = chapter.learnedTo ?? chapter.start - 1
      const addedFrom = learnedTo !== null && learnedTo > oldEnd ? oldEnd + 1 : null
      return { chapter, learnedTo, skipped: skipped === true, addedFrom }
    })
    const added = updates.some(update => update.addedFrom !== null)
    if (added) sqliteDb.prepare("UPDATE textbook_chapters SET recent_from=NULL WHERE book_id=? AND recent_from IS NOT NULL").run(id)
    const write = sqliteDb.prepare("UPDATE textbook_chapters SET learned_to=?,recent_from=?,skipped=? WHERE id=?")
    for (const { chapter, learnedTo, skipped, addedFrom } of updates) {
      if (chapter.learnedTo === learnedTo && Boolean(chapter.skipped) === skipped) continue
      const oldRecent = chapter.recentFrom
      const recent = !added && oldRecent !== null && learnedTo !== null && learnedTo >= oldRecent ? oldRecent : addedFrom
      write.run(learnedTo, recent, Number(skipped), chapter.id)
    }
    return getTextbook(id)
  }).immediate()
}

function headingKey(heading: TextbookHeading) {
  return JSON.stringify([heading.start, heading.level, heading.title])
}

export function updateTextbookOutline(id: string, outline: EditedHeading[]): TextbookDetail {
  return sqliteDb.transaction(() => {
    const book = getTextbook(id)
    const rows = chapterRanges(outline, book.unitCount)
    const old = new Map(book.chapters.map(chapter => [chapter.id, chapter]))
    const retained = new Set<string>()
    for (const { id: chapterId } of rows) {
      if (chapterId === undefined) continue
      if (!old.has(chapterId) || retained.has(chapterId)) throw new ApiError(400, "目录包含重复章节或其他教材的章节")
      retained.add(chapterId)
    }
    // 重试新增目录时仅复用唯一的完全相同条目，避免错迁同名章节的进度和关联。
    const exact = new Map<string, string | null>()
    for (const chapter of book.chapters) {
      if (retained.has(chapter.id)) continue
      const key = headingKey(chapter)
      exact.set(key, exact.has(key) ? null : chapter.id)
    }
    const incomingKeys = new Set<string>()
    for (const row of rows) {
      if (row.id) continue
      const key = headingKey(row)
      if (incomingKeys.has(key)) exact.delete(key)
      incomingKeys.add(key)
    }
    const movesLink = sqliteDb.prepare("SELECT 1 FROM textbook_question_links WHERE chapter_id=? AND (through IS NULL OR through>?) LIMIT 1")
    for (const row of rows) {
      row.id ??= exact.get(headingKey(row)) ?? randomUUID()
      retained.add(row.id)
      const previous = old.get(row.id)
      if (!previous) continue
      if (previous.skipped && (row.start !== previous.start || row.end !== previous.end)) {
        throw new ApiError(409, `“${previous.title}”已标为跳过，请先恢复为未学再修改章节范围`)
      }
      if (previous.learnedTo !== null && (row.start !== previous.start || row.end < previous.learnedTo)) {
        throw new ApiError(409, `“${previous.title}”的已学范围会改变，请先在原目录中调整或清除该章进度`)
      }
      if (previous.linkedCount && (row.start !== previous.start || (row.end !== previous.end && movesLink.get(row.id, row.end)))) {
        throw new ApiError(409, `“${previous.title}”的题目关联范围会改变，请先调整原有题目关联`)
      }
    }
    const remove = sqliteDb.prepare("DELETE FROM textbook_chapters WHERE id=?")
    for (const previous of book.chapters) {
      if (retained.has(previous.id)) continue
      if (previous.learnedTo !== null || previous.skipped || previous.linkedCount) {
        throw new ApiError(409, `“${previous.title}”已有学习记录或关联题，请保留该章节，或先恢复为未学并解除关联`)
      }
      remove.run(previous.id)
    }
    const save = sqliteDb.prepare(`
      INSERT INTO textbook_chapters(id,book_id,ordinal,title,level,start,end) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET ordinal=excluded.ordinal,title=excluded.title,level=excluded.level,start=excluded.start,end=excluded.end
    `)
    rows.forEach((row, i) => save.run(row.id, id, i, row.title, row.level, row.start, row.end))
    return getTextbook(id)
  }).immediate()
}

const questionLinksQuery = `
  FROM textbook_chapters c JOIN textbook_question_links l ON l.chapter_id=c.id WHERE c.book_id=?
`

export function listTextbookQuestionLinks(bookId: string): TextbookQuestionLink[] {
  return sqliteDb.prepare(`SELECT l.question_id AS questionId,l.chapter_id AS chapterId,l.through ${questionLinksQuery}
    ORDER BY c.ordinal,l.question_id`).all(bookId) as TextbookQuestionLink[]
}

export function getQuestionTextbookLinks(bookId: string, questionId: number): ChapterLink[] {
  bookSummary(bookId)
  positiveInt.parse(questionId)
  if (!sqliteDb.prepare("SELECT 1 FROM questions WHERE id=?").get(questionId)) throw new ApiError(404, "题目不存在")
  return sqliteDb.prepare(`SELECT l.chapter_id AS chapterId,l.through ${questionLinksQuery}
    AND l.question_id=? ORDER BY c.ordinal`).all(bookId, questionId) as ChapterLink[]
}

export function setTextbookQuestionLinks(bookId: string, questionIds: number[], links: ChapterLink[], mode: "replace" | "add"): void {
  const ids = [...new Set(z.array(positiveInt).min(1, "请选择题目").max(10000).parse(questionIds))]
  const entries = linksSchema.parse(links)
  z.enum(["replace", "add"]).parse(mode)
  sqliteDb.transaction(() => {
    const chapters = new Map(getTextbook(bookId).chapters.map(chapter => [chapter.id, chapter]))
    for (const { chapterId, through } of entries) {
      requireChapter(chapters, chapterId, through)
      chapters.delete(chapterId)
    }
    const idsJson = JSON.stringify(ids)
    const found = sqliteDb.prepare("SELECT count(*) FROM questions WHERE id IN (SELECT value FROM json_each(?))").pluck().get(idsJson)
    if (found !== ids.length) throw new ApiError(404, "选中的题目已不存在，请刷新后重试")
    if (mode === "replace") {
      sqliteDb.prepare(`DELETE FROM textbook_question_links WHERE question_id IN (SELECT value FROM json_each(?))
        AND chapter_id IN (SELECT id FROM textbook_chapters WHERE book_id=?)`).run(idsJson, bookId)
    }
    const insert = sqliteDb.prepare(`
      INSERT INTO textbook_question_links(question_id,chapter_id,through)
      SELECT value,?,? FROM json_each(?) WHERE true
      ON CONFLICT(question_id,chapter_id) DO UPDATE SET through=max(through,excluded.through)
    `)
    // SQLite 的 max 遇 NULL 会返回 NULL，恰好保留更严格的整节要求。
    for (const link of entries) insert.run(link.chapterId, link.through, idsJson)
  }).immediate()
}
