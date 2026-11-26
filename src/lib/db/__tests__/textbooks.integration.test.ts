import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import Database from "better-sqlite3"
import { NextRequest } from "next/server"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { AUTH_COOKIE_NAME, createSessionToken } from "../../auth"
import type { TextbookHeading, TextbookImportData } from "../../textbooks/types"
import { backupDatabase, restoreDatabase, verifyDatabase } from "../backup.mjs"

const directory = mkdtempSync(path.join(tmpdir(), "textbook-store-"))
const database = path.join(directory, "books.db")
let store: typeof import("../textbooks")
let sqlite: typeof import("../index")["sqliteDb"]

beforeAll(async () => {
  vi.stubEnv("DATABASE_PATH", database)
  vi.resetModules()
  sqlite = (await import("../index")).sqliteDb
  store = await import("../textbooks")
})
afterAll(() => {
  sqlite?.close()
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

const headings: TextbookHeading[] = [
  { title: "上篇", start: 1, level: 1 }, { title: "甲节", start: 1, level: 2 },
  { title: "乙节", start: 4, level: 2 }, { title: "下篇", start: 7, level: 1 },
]
function input(title: string, edition = "第一版", chapters = headings) {
  const parsed: TextbookImportData = {
    format: "pdf", chapters, segments: ["封面", "", "甲", "乙", "丙", "丁", "戊", "己"], warnings: [],
  }
  return { title, edition, filename: title + ".pdf", bytes: Buffer.from("原件-" + title), parsed }
}
function makeBook(title: string) { return store.getTextbook(store.storeTextbook(input(title)).id) }
function question(content: string): number {
  return Number(sqlite.prepare("INSERT INTO questions(type,content,content_hash) VALUES('essay',?,?)").run(content, content).lastInsertRowid)
}

it("同文件同版复用，新版独立；逐页保留扫描空页、原始文件和同页层级", () => {
  const source = input("电子教材")
  const { id, reused } = store.storeTextbook(source)
  expect(reused).toBe(false)
  expect(store.storeTextbook({ ...source, title: "重命名", edition: " 第一版 " })).toEqual({ id, reused: true })
  const other = store.storeTextbook({ ...source, edition: "第二版" })
  expect(other.id).not.toBe(id)
  expect(store.getTextbook(id)).toMatchObject({ title: "电子教材", unitCount: 8, chapterCount: 4 })
  expect(store.listTextbooks().filter(book => book.title === "电子教材")).toHaveLength(2)
  expect(store.getTextbook(id).chapters.map(c => [c.start, c.end])).toEqual([[1, 6], [1, 3], [4, 6], [7, 8]])
  expect(store.getTextbookSegments(id, 1, 3)).toEqual(["封面", "", "甲"])
  expect(() => store.getTextbookSegments(id, 8, 9)).toThrow("范围")
  expect(store.getTextbookFile(id)).toEqual({ filename: "电子教材.pdf", format: "pdf", file: source.bytes })
  const sharedPage = store.storeTextbook(input("页底新节", "", [
    { title: "章一", level: 1, start: 1 }, { title: "节末", level: 2, start: 5 }, { title: "章二", level: 1, start: 5 },
  ]))
  expect(store.getTextbook(sharedPage.id).chapters.map(c => c.end)).toEqual([5, 5, 8])
})

it("一批增加记录各自新增起点，相同保存幂等，仅回退时截短最近批次", () => {
  const book = makeBook("进度")
  const [, a, b, c] = book.chapters
  const save = (...entries: [string, number | null][]) => store.updateTextbookProgress(book.id,
    entries.map(([chapterId, learnedTo]) => ({ chapterId, learnedTo }))).chapters.map(ch => [ch.learnedTo, ch.recentFrom])
  expect(save([a.id, 2], [b.id, 5])).toEqual([[null, null], [2, 1], [5, 4], [null, null]])
  expect(save([a.id, 2])).toEqual([[null, null], [2, 1], [5, 4], [null, null]])
  expect(store.updateTextbookProgress(book.id, [{ chapterId: a.id, learnedTo: 1 }], true).chapters[1])
    .toMatchObject({ learnedTo: 2, recentFrom: 1 })
  expect(save([a.id, 1])).toEqual([[null, null], [1, 1], [5, 4], [null, null]])
  expect(save([a.id, 3], [b.id, 4], [c.id, 8])).toEqual([[null, null], [3, 2], [4, null], [8, 7]])
  expect(save([a.id, 1], [c.id, 7])).toEqual([[null, null], [1, null], [4, null], [7, 7]])
  expect(() => save([a.id, 2], [b.id, 7])).toThrow("之间")
  expect(() => save([a.id, 2], [makeBook("异书进度").chapters[0].id, 1])).toThrow("不属于")
  expect(save()).toEqual([[null, null], [1, null], [4, null], [7, 7]])
})

it("明确区分跳过和未学，快捷推进不会覆盖跳过状态", () => {
  const book = makeBook("跳过状态")
  const chapter = book.chapters[1]
  const skipped = store.updateTextbookProgress(book.id, [{ chapterId: chapter.id, learnedTo: null, skipped: true }]).chapters[1]
  expect(skipped).toMatchObject({ learnedTo: null, recentFrom: null, skipped: true })
  const preserved = store.updateTextbookProgress(book.id, [{ chapterId: chapter.id, learnedTo: 2 }], true).chapters[1]
  expect(preserved).toMatchObject({ learnedTo: null, recentFrom: null, skipped: true })
  const restored = store.updateTextbookProgress(book.id, [{ chapterId: chapter.id, learnedTo: null, skipped: false }]).chapters[1]
  expect(restored).toMatchObject({ learnedTo: null, recentFrom: null, skipped: false })
})

it("目录修订保留稳定章和真实覆盖；合并、删章或位置越界须先处理旧进度和关联", () => {
  const book = makeBook("目录")
  const [part, a, b, c] = book.chapters
  const q = question("目录关联题")
  store.updateTextbookProgress(book.id, [{ chapterId: a.id, learnedTo: 3 }])
  store.setTextbookQuestionLinks(book.id, [q], [{ chapterId: b.id, through: 6 }], "replace")
  const renamed = store.updateTextbookOutline(book.id, [part, { ...a, title: "甲（修订）" }, b, c])
  expect(renamed.chapters[1]).toMatchObject({ id: a.id, learnedTo: 3, recentFrom: 1 })
  expect(store.updateTextbookOutline(book.id, renamed.chapters.map(({ title, start, level }) => ({ title, start, level }))).chapters)
    .toEqual(renamed.chapters)
  expect(() => store.updateTextbookOutline(book.id, [part, b, c])).toThrow("保留该章节")
  expect(() => store.updateTextbookOutline(book.id, [part, a, { ...b, start: 3 }, c])).toThrow("已学范围")
  expect(() => store.updateTextbookOutline(book.id, [part, a, b, { ...c, start: 6 }])).toThrow("关联范围")
  expect(store.getTextbook(book.id)).toEqual(renamed)
  store.setTextbookQuestionLinks(book.id, [q], [{ chapterId: b.id, through: 5 }], "replace")
  const shorter = store.updateTextbookOutline(book.id, [part, a, b, { ...c, start: 6 }])
  expect(shorter.chapters[2]).toMatchObject({ end: 5, linkedCount: 1 })
  store.setTextbookQuestionLinks(book.id, [q], [{ chapterId: b.id, through: null }], "replace")
  expect(() => store.updateTextbookOutline(book.id, [part, a, b, c])).toThrow("关联范围")
  expect(() => store.updateTextbookOutline(book.id, [part, a, b, { ...c, id: a.id }])).toThrow("重复")
})

it("批量追加保留严格要求，替换仅影响本教材，非法题号和跨版章节使整批回滚", () => {
  const book = makeBook("关联")
  const other = store.getTextbook(store.storeTextbook(input("关联", "新版本")).id)
  const q = question("批量一"), r = question("批量二")
  const [, a, b] = book.chapters
  const otherLink = { chapterId: other.chapters[2].id, through: 5 }
  const edit = (through: number | null) => store.setTextbookQuestionLinks(book.id, [q, r], [{ chapterId: b.id, through }], "add")
  store.setTextbookQuestionLinks(other.id, [q, r], [otherLink], "replace")
  edit(4)
  edit(6)
  edit(5)
  expect(store.getQuestionTextbookLinks(book.id, r)).toEqual([{ chapterId: b.id, through: 6 }])
  edit(null)
  edit(5)
  expect(store.listTextbookQuestionLinks(book.id)).toEqual([q, r].map(questionId => ({ questionId, chapterId: b.id, through: null })))
  expect(() => store.setTextbookQuestionLinks(book.id, [q, 999999], [], "replace")).toThrow("题目已不存在")
  expect(() => store.setTextbookQuestionLinks(book.id, [q], [otherLink], "replace")).toThrow("不属于")
  expect(() => store.setTextbookQuestionLinks(book.id, [q], [{ chapterId: a.id, through: 4 }], "replace")).toThrow("之间")
  expect(store.getQuestionTextbookLinks(book.id, q)).toEqual([{ chapterId: b.id, through: null }])
  store.setTextbookQuestionLinks(book.id, [q], [], "replace")
  expect(store.getQuestionTextbookLinks(book.id, q)).toEqual([])
  expect(store.getQuestionTextbookLinks(other.id, q)).toEqual([otherLink])
  sqlite.prepare("DELETE FROM questions WHERE id=?").run(r)
  expect(store.listTextbookQuestionLinks(book.id)).toEqual([])
})

it("完整备份可还原教材原件、页段、目录进度和题目关联", async () => {
  const book = makeBook("备份教材")
  const a = book.chapters[1]
  const q = question("备份题")
  store.updateTextbookProgress(book.id, [{ chapterId: a.id, learnedTo: 2 }])
  store.setTextbookQuestionLinks(book.id, [q], [{ chapterId: a.id, through: 1 }], "replace")
  const backup = path.join(directory, "backup.db"), restored = path.join(directory, "restored.db")
  await backupDatabase(database, backup)
  await restoreDatabase(backup, restored, { stopped: true })
  const snapshot = new Database(restored, { readonly: true })
  try {
    expect(snapshot.prepare("SELECT file FROM textbooks WHERE id=?").pluck().get(book.id)).toEqual(input("备份教材").bytes)
    expect(snapshot.prepare("SELECT text FROM textbook_segments WHERE book_id=? ORDER BY position").pluck().all(book.id)).toEqual(input("").parsed.segments)
    expect(snapshot.prepare("SELECT learned_to,recent_from FROM textbook_chapters WHERE id=?").get(a.id)).toEqual({ learned_to: 2, recent_from: 1 })
    expect(snapshot.prepare("SELECT through FROM textbook_question_links WHERE question_id=? AND chapter_id=?").pluck().get(q, a.id)).toBe(1)
  } finally { snapshot.close() }
  const damaged = new Database(restored)
  try { damaged.exec("DROP TABLE textbook_segments") } finally { damaged.close() }
  expect(() => verifyDatabase(restored)).toThrow("教材数据表")
})

it("教材 API 验证会话、原件下载和 PDF 内联，拒绝畸形修改", async () => {
  const list: (request: NextRequest) => Promise<Response> = (await import("../../../app/api/textbooks/route")).GET
  const content = (await import("../../../app/api/textbooks/[id]/content/route")).GET
  const detail = await import("../../../app/api/textbooks/[id]/route")
  const links = await import("../../../app/api/textbooks/[id]/links/route")
  const book = makeBook("接口教材")
  const context = { params: Promise.resolve({ id: book.id }) }
  vi.stubEnv("APP_ACCESS_TOKEN", "textbook-session-test")
  const request = (query = "", auth = true, method = "GET", body?: string) => {
    const req = new NextRequest("http://localhost/api/textbooks/" + book.id + query, { method, body })
    if (auth) req.cookies.set(AUTH_COOKIE_NAME, createSessionToken()!)
    return req
  }
  for (const handler of [detail.GET, content, links.GET, links.POST, detail.PATCH]) {
    expect((await handler(request("?original=1", false), context)).status).toBe(401)
  }
  expect((await list(request("", false))).status).toBe(401)
  expect((await (await list(request())).json()).books.map((b: { id: string }) => b.id)).toContain(book.id)
  expect(await (await content(request("?position=2"), context)).json()).toEqual({ position: 2, text: "" })
  const source = await content(request("?original=1"), context)
  expect(source.headers.get("Content-Disposition")).toMatch(/^attachment;/)
  expect(Buffer.from(await source.arrayBuffer())).toEqual(input("接口教材").bytes)
  expect((await content(request("?original=1&inline=1"), context)).headers.get("Content-Disposition")).toMatch(/^inline;/)
  expect((await detail.PATCH(request("", true, "PATCH", "{"), context)).status).toBe(400)
  expect((await links.POST(request("", true, "POST", "null"), context)).status).toBe(400)
})
