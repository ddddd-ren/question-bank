import { randomUUID } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { NextRequest } from "next/server"
import JSZip from "jszip"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { AUTH_COOKIE_NAME, createSessionToken } from "../auth"
import type { SerializedQuestion } from "../db/serialize"
import { createPaperDocx } from "./docx"
import type { TemplateSection } from "./template"

const directory = mkdtempSync(path.join(tmpdir(), "template-workflow-"))
let db: typeof import("../db").sqliteDb
let templates: typeof import("@/app/api/paper-templates/route")
let papers: typeof import("@/app/api/papers/route")
let file: File
let cookie: string

beforeAll(async () => {
  vi.stubEnv("DATABASE_PATH", path.join(directory, "test.db"))
  vi.stubEnv("APP_ACCESS_TOKEN", randomUUID())
  cookie = `${AUTH_COOKIE_NAME}=${createSessionToken()}`
  db = (await import("../db")).sqliteDb
  templates = await import("@/app/api/paper-templates/route")
  papers = await import("@/app/api/papers/route")
  const source = ["single", "fill", "single"].map((type, i) => ({
    type, questions: [{ type, content: `样卷原题${i}`, answer: "样卷原答案" } as SerializedQuestion],
  }))
  const bytes = await createPaperDocx("测试样卷", source, true)
  file = new File([new Uint8Array(bytes)], "样卷.docx")
  const insert = db.prepare("INSERT INTO questions(type,content,answer,content_hash) VALUES(?,?,?,?)")
  for (const [i,type] of ["single", "single", "fill"].entries()) insert.run(type, `题库新题${i}`, `新答案${i}`, `fixture-${i}`)
})

afterAll(() => {
  db?.close()
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

function upload(action: string, sections?: TemplateSection[], source = file) {
  const form = new FormData()
  form.set("action", action)
  form.set("file", source)
  form.set("name", "课程模板")
  if (sections) form.set("sections", JSON.stringify(sections))
  return templates.POST(new NextRequest("http://localhost/api/paper-templates", { method: "POST", headers: { cookie }, body: form }))
}

it("按已确认模板组卷，网页、学生卷和答案卷按同一大题顺序读取快照", async () => {
  const analysis = await upload("analyze")
  expect(analysis.status).toBe(200)
  const { sections }: { sections: TemplateSection[] } = await analysis.json()
  expect(sections.map(s => s.type)).toEqual(["single", "fill", "single"])
  sections.forEach((s, i) => { s.slots[0].points = i + 1 })
  const saved = await upload("save", sections)
  expect(saved.status).toBe(200)
  const { id } = await saved.json()
  const generation = await papers.POST(new NextRequest("http://localhost/api/papers", { method: "POST", headers: { cookie }, body: JSON.stringify({ mode: "template", templateId: id, title: "新试卷" }) }))
  expect(generation.status).toBe(200)
  const paper = await generation.json()
  expect(paper.template.id).toBe(id)
  expect(paper.sections.map((s: TemplateSection) => s.slots[0].points)).toEqual([1, 2, 3])
  for (const withAnswers of [false, true]) {
    const response = await papers.GET(new NextRequest(`http://localhost/api/papers?id=${paper.id}&format=docx&includeAnswers=${withAnswers}`, { headers: { cookie } }))
    expect(response.status).toBe(200)
    const xml = await (await JSZip.loadAsync(await response.arrayBuffer())).file("word/document.xml")!.async("string")
    expect(xml).not.toMatch(/样卷原题|样卷原答案/)
    expect(xml.includes("新答案")).toBe(withAnswers)
    const positions = paper.questions.map((q: SerializedQuestion) => xml.indexOf(q.content))
    expect(positions.every((position: number, i: number) => position >= 0 && (!i || position > positions[i - 1]))).toBe(true)
  }

  const revision = new FormData()
  revision.set("action", "revise")
  revision.set("templateId", id)
  revision.set("name", "修订版")
  sections[0].slots[0].points = 8
  revision.set("sections", JSON.stringify(sections))
  const revised = await templates.POST(new NextRequest("http://localhost/api/paper-templates", { method: "POST", headers: { cookie }, body: revision }))
  expect(revised.status).toBe(200)
  const newVersion = await revised.json()
  expect(newVersion.id).not.toBe(id)
  expect(newVersion.sections[0].slots[0].points).toBe(8)
  const original = await papers.GET(new NextRequest(`http://localhost/api/papers?id=${paper.id}`, { headers: { cookie } }))
  expect((await original.json()).template.sections[0].slots[0].points).toBe(1)
})

it("模板列表须登录，损坏的上传不能保存，校正的大题须对应原文", async () => {
  const unauthenticated = await templates.GET(new NextRequest("http://localhost/api/paper-templates"))
  expect(unauthenticated.status).toBe(401)
  const invalid = await upload("analyze", undefined, new File(["格式错误"], "错误.docx"))
  expect(invalid.status).toBe(422)
  const analysis = await (await upload("analyze")).json()
  const before = db.prepare("SELECT count(*) FROM paper_templates").pluck().get()
  expect((await upload("save", analysis.sections.slice(1))).status).toBe(422)
  expect(db.prepare("SELECT count(*) FROM paper_templates").pluck().get()).toBe(before)
})
