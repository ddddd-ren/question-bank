import { randomUUID } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { NextRequest } from "next/server"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { AUTH_COOKIE_NAME, createSessionToken } from "../auth"

const directory = mkdtempSync(path.join(tmpdir(), "book-exercises-"))
let db: typeof import("../db").sqliteDb, books: typeof import("../db/textbooks")
let exercises: typeof import("@/app/api/textbooks/[id]/exercises/route"), imports: typeof import("@/app/api/questions/preview/route")
let cookie: string
beforeAll(async () => {
  vi.stubEnv("DATABASE_PATH", path.join(directory, "db.sqlite"))
  vi.stubEnv("APP_ACCESS_TOKEN", randomUUID())
  cookie = AUTH_COOKIE_NAME + "=" + createSessionToken()
  db = (await import("../db")).sqliteDb
  books = await import("../db/textbooks")
  exercises = await import("@/app/api/textbooks/[id]/exercises/route")
  imports = await import("@/app/api/questions/preview/route")
})
afterAll(() => { db?.close(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }) })

function request(method: string, body: unknown, token = cookie) {
  return new NextRequest("http://localhost/api", { method, headers: { cookie: token, "Content-Type": "application/json" }, body: JSON.stringify(body) })
}

it("课后题预览、校验、出处、重复复用与章节关联在同一事务里完成", async () => {
  const { id } = books.storeTextbook({ title: "信息技术", edition: "春季", filename: "课本.docx", bytes: Buffer.from("课本"),
    parsed: { format: "docx", warnings: [], chapters: [{ title: "基础习题", level: 1, start: 1 }],
      segments: ["第一章 信息技术", "一、单项选择题", "1. 下列设备中属于输入设备的是？", "A. 键盘", "B. 显示器", "C. 打印机", "D. 音箱", "答案：A"] } })
  const chapter = books.getTextbook(id).chapters[0]
  const selection = { bookId: id, chapterId: chapter.id, from: 2, to: 8 }
  const ctx = { params: Promise.resolve({ id }) }
  expect((await exercises.POST(request("POST", selection, ""), ctx)).status).toBe(401)
  const response = await exercises.POST(request("POST", selection), ctx)
  expect(response.status).toBe(200)
  const { questions: preview } = await response.json()
  expect(preview).toHaveLength(1)
  const editable = preview[0].editable
  expect(editable).toMatchObject({ type: "single", sourcePage: 3, answer: "A" })
  const save = (questions: unknown[]) => imports.PUT(request("PUT", { textbook: selection, questions }))
  expect((await save([{ ...editable, answer: "Z" }])).status).toBe(400)
  const outside = await save([editable, { ...editable, stem: "另一道题的正确选项是什么？", sourcePage: 99 }])
  expect(outside.status).toBe(400)
  expect((await outside.json()).error).toContain("出处超出")
  expect(db.prepare("SELECT count(*) FROM questions").pluck().get()).toBe(0)
  expect(await (await save([editable])).json()).toMatchObject({ imported: 1, linked: 1 })
  const row = db.prepare("SELECT id,source_file,source_page FROM questions").get() as { id: number; source_file: string; source_page: null }
  expect(row.source_file).toContain("第 3 段")
  expect(row.source_page).toBeNull()
  expect(books.getQuestionTextbookLinks(id, row.id)).toEqual([{ chapterId: chapter.id, through: null }])
  books.setTextbookQuestionLinks(id, [row.id], [{ chapterId: chapter.id, through: 3 }], "replace")
  expect(await (await save([editable, editable])).json()).toMatchObject({ imported: 0, linked: 1 })
  expect(books.getQuestionTextbookLinks(id, row.id)[0].through).toBe(3)
  db.prepare("UPDATE questions SET archived_at='已归档' WHERE id=?").run(row.id)
  expect(await (await save([editable])).json()).toMatchObject({ imported: 0, linked: 0, archived: 1 })
})
