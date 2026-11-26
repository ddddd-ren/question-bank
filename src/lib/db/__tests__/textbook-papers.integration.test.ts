import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import JSZip from "jszip"
import { NextRequest } from "next/server"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
import type { TextbookPaperRequest } from "../../textbooks/types"
import type { TemplateSection } from "../../paper/template"
import type { SerializedQuestion } from "../serialize"
import { AUTH_COOKIE_NAME, createSessionToken } from "../../auth"
import { createPaperDocx } from "../../paper/docx"
import { analyzeTemplateDocx } from "../../paper/template-docx"

const directory = mkdtempSync(path.join(tmpdir(), "textbook-paper-"))
let sql: typeof import("../index").sqliteDb
let books: typeof import("../textbooks"), papers: typeof import("../paper-templates"), scopes: typeof import("../textbook-paper-scope")
beforeAll(async () => {
  vi.stubEnv("DATABASE_PATH", path.join(directory, "tests.db"))
  vi.resetModules()
  sql = (await import("../index")).sqliteDb
  books = await import("../textbooks")
  papers = await import("../paper-templates")
  scopes = await import("../textbook-paper-scope")
})
afterAll(() => { sql?.close(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }) })

function fixture(label: string) {
  const { id } = books.storeTextbook({ title: label, edition: "第2版", filename: "教材.pdf", bytes: Buffer.from(label), parsed: {
    format: "pdf", segments: Array(10).fill("正文"), warnings: [], chapters: [
      { title: "上篇", level: 1, start: 1 }, { title: "甲", level: 2, start: 1 },
      { title: "乙", level: 2, start: 4 }, { title: "丙", level: 1, start: 7 }, { title: "丁", level: 1, start: 9 },
    ],
  } })
  const [part, a, b, c, d] = books.getTextbook(id).chapters
  books.updateTextbookProgress(id, [{ chapterId: part.id, learnedTo: 6 }, { chapterId: a.id, learnedTo: 3 }])
  books.updateTextbookProgress(id, [{ chapterId: c.id, learnedTo: 7 }])
  let i = 0
  function q(name: string, links: [string, number | null][], type = "single") {
    const qid = Number(sql.prepare("INSERT INTO questions(type,content,content_hash) VALUES(?,?,?)")
      .run(type, label + name, label + (++i)).lastInsertRowid)
    if (links.length) books.setTextbookQuestionLinks(id, [qid], links.map(([chapterId, through]) => ({ chapterId, through })), "add")
    return qid
  }
  return { id, part, a, b, c, d, q }
}

const slot = { number: "1", points: 3 }
function section(type: TemplateSection["type"], count = 1): TemplateSection {
  return { title: type, type, slots: Array.from({ length: count }, (_, i) => ({ ...slot, number: String(i + 1) })) }
}

it("累计、最近新增及自选逐项核对部分进度、跨节题、父子跳读和同题不同记录", () => {
  const { id, part, a, b, c, d, q } = fixture("筛选")
  const old = q("旧", [[a.id, null]]), fresh = q("新", [[c.id, 7]])
  const parentEarly = q("篇首", [[part.id, 2]]), combined = q("新旧", [[a.id, null], [c.id, 7]])
  q("未学页", [[c.id, 8]]); q("整节", [[c.id, null]]); q("跳节", [[b.id, 4]])
  q("含跳节", [[part.id, null]]); q("跨未学", [[a.id, 1], [d.id, null]]); q("无关联", [])
  q("重复", [[a.id, 1]]); q("重复", [[d.id, null]])
  const search = (request: Omit<TextbookPaperRequest, "bookId">) =>
    scopes.studyCandidates(scopes.freezeStudyScope({ ...request, bookId: id }, 10)).all.sort((x,y) => x-y)
  expect(search({ mode: "cumulative" })).toEqual([old, fresh, parentEarly, combined])
  expect(search({ mode: "recent" })).toEqual([fresh])
  expect(search({ mode: "custom", chapterIds: [a.id] })).toEqual([old])
  expect(search({ mode: "custom", chapterIds: [part.id, c.id] })).toEqual([old, fresh, parentEarly, combined])
  expect(() => search({ mode: "custom", chapterIds: [d.id] })).toThrow("已学")
  books.updateTextbookProgress(id, [{ chapterId: c.id, learnedTo: 8 }])
  const lastPage = q("最后一页", [[c.id, 8]])
  expect(search({ mode: "recent" })).toContain(lastPage)
  expect(search({ mode: "recent" })).not.toContain(fresh)
})

it("同一次匹配满足模板及精确新旧数量，换题使用当时的进度和类别，缺题不落盘", () => {
  const { id, a, b, c, q } = fixture("配额")
  const old = [q("旧一", [[a.id, 1]]), q("旧二", [[a.id, 2]])]
  const fresh = [q("新一", [[c.id, 7]]), q("新二", [[c.id, 7]])]
  const essay = q("简答", [[c.id, 7]], "essay")
  const future = q("以后", [[b.id, 5]])
  const tmpl = papers.storePaperTemplate("期末", [section("single", 2), section("essay")], Buffer.from("模板"))
  const request: TextbookPaperRequest = { bookId: id, mode: "mixed", newCount: 2 }
  expect(papers.checkTemplate(tmpl.id, {}, request)).toMatchObject({ total: 3, shortages: [],
    balance: { newAssigned: 2, newRequired: 2, oldAssigned: 1, oldRequired: 1 } })
  const paper = papers.generateTemplatePaper(tmpl.id, {}, "阶段考", request)
  const ids = paper.questions.map(q => q.id)
  expect(ids[2]).toBe(essay)
  expect(ids.filter(q => old.includes(q))).toHaveLength(1)
  expect(ids.filter(q => fresh.includes(q))).toHaveLength(1)
  expect(paper.template?.sections).toEqual(tmpl.sections)
  const empty = { ...request, newCount: 0 }
  expect(papers.checkTemplate(tmpl.id, {}, empty).shortages).toEqual([{ sectionIndex: 1, required: 1, available: 0 }])
  const count = () => sql.prepare("SELECT count(*) FROM papers").pluck().get()
  const saved = count()
  expect(() => papers.generateTemplatePaper(tmpl.id, {}, "缺题", empty)).toThrow("缺 1 题")
  expect(count()).toBe(saved)
  books.updateTextbookProgress(id, [{ chapterId: b.id, learnedTo: b.end }, { chapterId: c.id, learnedTo: null }])
  const index = ids.findIndex(q => fresh.includes(q))
  const swapped = papers.replaceTemplateQuestion(paper.id, index)
  expect(swapped.template?.study).toEqual(paper.template?.study)
  expect(fresh).toContain(swapped.questions[index].id)
  expect(swapped.questions[index].id).not.toBe(ids[index])
  expect(swapped.questions.map(q => q.id)).not.toContain(future)
  expect(swapped.questions[2].id).toBe(essay)
})

it("八单选两简答的模板按七新三旧出卷，HTTP 预检、保存与 Word 下载采用同一题序及分值", async () => {
  vi.stubEnv("APP_ACCESS_TOKEN", randomUUID())
  const cookie = AUTH_COOKIE_NAME + "=" + createSessionToken()
  const api = await import("@/app/api/papers/route")
  const { id, a, b, c, q } = fixture("周测")
  const fresh: number[] = []
  for (let i = 1; i <= 4; i++) q(`复习题目（${i}）`, [[a.id, a.end]])
  for (let i = 1; i <= 6; i++) fresh.push(q(`本课选择题（${i}）`, [[c.id, 7]]))
  for (let i = 1; i <= 2; i++) fresh.push(q(`本课简答题（${i}）`, [[c.id, 7]], "essay"))
  const forbidden = q("跳过的选择题", [[b.id, b.start]])
  const source = await createPaperDocx("单元模板", [{ type: "single", count: 8 }, { type: "essay", count: 2 }].map(({ type, count }) =>
    ({ type, questions: Array.from({ length: count }, (_, i) => ({ type, content: `样卷原题 ${i}`, answer: "模板原答案" } as SerializedQuestion)) })), true)
  const { sections } = await analyzeTemplateDocx(source)
  for (const s of sections) for (const item of s.slots) item.points = s.type === "single" ? 2 : 7
  const template = papers.storePaperTemplate("周测样卷", sections, source)
  const body = { mode: "template", templateId: template.id, study: { bookId: id, mode: "mixed", newCount: 7 } }
  const post = (value: unknown) => api.POST(new NextRequest("http://localhost/api/papers", { method: "POST", headers: { cookie }, body: JSON.stringify(value) }))
  expect(await (await post({ ...body, preflight: true })).json()).toMatchObject({ total: 10, shortages: [], balance: { newAssigned: 7, oldAssigned: 3 } })
  const response = await post(body)
  expect(response.status).toBe(200)
  const paper = await response.json()
  expect(paper.questions.map((row: SerializedQuestion) => row.type)).toEqual([...Array(8).fill("single"), "essay", "essay"])
  expect(paper.questions.filter((row: SerializedQuestion) => fresh.includes(row.id))).toHaveLength(7)
  expect(paper.questions.map((row: SerializedQuestion) => row.id)).not.toContain(forbidden)
  expect(paper.template.sections.flatMap((s: TemplateSection) => s.slots.map(item => item.points))).toEqual([...Array(8).fill(2), 7, 7])
  expect(paper.template.study.chapters.find((row: { id: string }) => row.id === b.id).learnedTo).toBeNull()
  for (const answers of [false, true]) {
    const file = await api.GET(new NextRequest(`http://localhost/api/papers?id=${paper.id}&format=docx&includeAnswers=${answers}`, { headers: { cookie } }))
    expect(file.status).toBe(200)
    const xml = await (await JSZip.loadAsync(await file.arrayBuffer())).file("word/document.xml")!.async("string")
    expect(xml).not.toMatch(/样卷原题|模板原答案|跳过的选择题/)
    expect(xml.includes("参考答案")).toBe(answers)
    const offsets = paper.questions.map((question: SerializedQuestion) => xml.indexOf(question.content))
    expect(offsets.every((value: number, i: number) => value >= 0 && (!i || value > offsets[i - 1]))).toBe(true)
  }
})
