import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { AUTH_COOKIE_NAME, createSessionToken } from "@/lib/auth"
import { createPaperDocx } from "@/lib/paper/docx"
import { MAX_TEXTBOOK_BYTES } from "./parser-common"

let post: typeof import("@/app/api/textbooks/import/route").POST
let db: typeof import("@/lib/db").sqliteDb
let cookie: string

beforeAll(async () => {
  vi.stubEnv("DATABASE_PATH", ":memory:")
  vi.stubEnv("APP_ACCESS_TOKEN", randomUUID())
  cookie = `${AUTH_COOKIE_NAME}=${createSessionToken()}`
  db = (await import("@/lib/db")).sqliteDb
  post = (await import("@/app/api/textbooks/import/route")).POST
})
afterAll(() => { db?.close(); vi.unstubAllEnvs() })

function request(body?: FormData, headers: Record<string, string> = { cookie }) {
  return new NextRequest("http://localhost/api/textbooks/import", { method: "POST", headers, body })
}

it("认证上传保存原件、中文文件名、正文和版次，重复导入复用且不产生题目", async () => {
  const bytes = await createPaperDocx("实验导引", [], false)
  const form = new FormData()
  form.set("file", new File([new Uint8Array(bytes)], "大学物理.docx"))
  form.set("edition", "  第三版  ")
  const before = db.prepare("SELECT count(*) FROM questions").pluck().get()
  const upload = await post(request(form))
  expect(upload.status).toBe(200)
  const saved = await upload.json()
  expect(saved).toMatchObject({ reused: false, warnings: expect.any(Array) })
  expect(db.prepare("SELECT title,edition,filename,file FROM textbooks WHERE id=?").get(saved.id)).toEqual({
    title: "大学物理", edition: "第三版", filename: "大学物理.docx", file: bytes,
  })
  expect(db.prepare("SELECT text FROM textbook_segments WHERE book_id=? ORDER BY position LIMIT 1").pluck().get(saved.id)).toBe("实验导引")
  const repeated = await post(request(form))
  expect(await repeated.json()).toMatchObject({ id: saved.id, reused: true })
  expect(db.prepare("SELECT count(*) FROM questions").pluck().get()).toBe(before)
})

it("拒绝未登录、空文件、过大请求和损坏教材，不产生半成品", async () => {
  const before = db.prepare("SELECT count(*) FROM textbooks").pluck().get()
  const empty = new FormData()
  empty.set("file", new File([], "空.epub"))
  expect((await post(request(empty, {}))).status).toBe(401)
  expect((await post(request(empty))).status).toBe(400)
  expect((await post(request(undefined, { cookie, "content-length": String(MAX_TEXTBOOK_BYTES + 2 * 1024 ** 2) }))).status).toBe(413)
  const invalid = new FormData()
  invalid.set("file", new File(["损坏"], "教材.docx"))
  expect((await post(request(invalid))).status).toBe(422)
  expect(db.prepare("SELECT count(*) FROM textbooks").pluck().get()).toBe(before)
})
