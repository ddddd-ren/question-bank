import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { NextRequest } from "next/server"
import { questionFingerprint } from "@/lib/question-fingerprint"

vi.mock("@/lib/auth-route", () => ({ withSession: (handler: unknown) => handler }))
let directory: string
let originalPath: string | undefined
let sqliteDb: typeof import("../index")["sqliteDb"]
let queries: typeof import("../queries")

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "question-integrity-"))
  originalPath = process.env.DATABASE_PATH
  process.env.DATABASE_PATH = path.join(directory, "test.db")
  vi.resetModules()
  sqliteDb = (await import("../index")).sqliteDb
  queries = await import("../queries")
})

afterAll(() => {
  sqliteDb?.close()
  rmSync(directory, { recursive: true, force: true })
  if (originalPath === undefined) delete process.env.DATABASE_PATH
  else process.env.DATABASE_PATH = originalPath
})

describe("题目编辑与归档", () => {
  it("JSON 越界答案在预览和直接导入均被拦截，编辑纠正后可导入", async () => {
    const { POST, PATCH, PUT } = await import("@/app/api/questions/preview/route")
    const form = new FormData()
    form.set("file", new File([JSON.stringify({ questions: [{ type: "single", content: "导入纠错验收：2+2 等于多少？", options: ["A. 4", "B. 5"], answer: "Z" }] })], "invalid-answer.json", { type: "application/json" }))
    const preview = await POST(new NextRequest("http://localhost/api/questions/preview", { method: "POST", body: form }))
    const draft = (await preview.json()).questions[0]
    expect(draft.quality.issueCount.error).toBeGreaterThan(0)
    const importQuestion = (question: unknown) => PUT(new NextRequest("http://localhost/api/questions/preview", { method: "PUT", body: JSON.stringify({ questions: [question] }) }))
    expect((await importQuestion(draft.editable)).status).toBe(400)
    const corrected = await PATCH(new NextRequest("http://localhost/api/questions/preview", { method: "PATCH", body: JSON.stringify({ question: { ...draft.editable, answer: "A" } }) }))
    const fixed = await corrected.json()
    expect(fixed.quality.issueCount.error).toBe(0)
    expect(await (await importQuestion(fixed.editable)).json()).toMatchObject({ imported: 1 })
  })

  it.each(["json", "csv"])("%s 的标签经过预览、切换题型和去重入库仍保留", async format => {
    const { POST, PATCH, PUT } = await import("@/app/api/questions/preview/route")
    const tags = ["简答题", "操作系统"]
    const content = `标签导入回归 ${format}：说明操作系统提供的服务。`
    const source = format === "json"
      ? JSON.stringify([{ type: "essay", content, answer: "资源管理", tags }])
      : `type,content,answer,tags\nessay,${content},资源管理,${tags.join("|")}`
    const url = "http://localhost/api/questions/preview"
    const form = new FormData()
    form.set("file", new File([source], `source.${format}`))
    const preview = await (await POST(new NextRequest(url, { method: "POST", body: form }))).json()
    const question = preview.questions[0]
    expect(question.preview).toContain("标签：简答题、操作系统")
    for (const targetType of ["calculation", "essay"]) {
      const changed = await PATCH(new NextRequest(url, { method: "PATCH", body: JSON.stringify({ question: question.editable, targetType }) }))
      question.editable = (await changed.json()).editable
      expect(question.editable.tags).toEqual(tags)
    }
    const imported = await PUT(new NextRequest(url, { method: "PUT", body: JSON.stringify({ questions: [question.editable, { ...question.editable, tags: ["操作系统", "补充"] }] }) }))
    expect(await imported.json()).toMatchObject({ imported: 1, duplicates: 1 })
    expect(JSON.parse((await queries.getQuestions({ search: content })).data[0].tags!)).toEqual([...tags, "补充"])
  })

  it("编辑后旧指纹失效，同题干不同选项保留为不同题目", async () => {
    const original = { type: "single" as const, content: "指纹去重测试题干", options: '["A. 一","B. 二"]', contentHash: "ignored" }
    const question = await queries.createQuestion(original)
    const oldFingerprint = questionFingerprint(original)
    const updated = await queries.updateQuestion(question.id, { options: '["A. 一","B. 三"]' })
    expect(updated?.fingerprint).not.toBe(oldFingerprint)
    expect(await queries.getQuestionByHash(oldFingerprint)).toBeUndefined()
    const reimported = await queries.createQuestion(original)
    expect(reimported.id).not.toBe(question.id)
    expect((await queries.getQuestionsByHashes([oldFingerprint])).map(q => q.id)).toEqual([reimported.id])
    await queries.deleteQuestion(reimported.id)
    // 归档题仍参与导入去重，避免重新导入悄悄复活已归档题目。
    expect((await queries.getQuestionsByHashes([oldFingerprint])).map(q => q.id)).toEqual([reimported.id])
    const { PUT } = await import("@/app/api/questions/preview/route")
    const imported = await PUT(new NextRequest("http://localhost/api/questions/preview", { method: "PUT", body: JSON.stringify({ questions: [{ type: original.type, stem: original.content, options: JSON.parse(original.options) }] }) }))
    expect(await imported.json()).toMatchObject({ imported: 0, duplicates: 1 })
    expect((await queries.getQuestionById(reimported.id))?.archivedAt).toBeTruthy()
  })

  it("并发局部编辑后的指纹与最终题干选项保持一致", async () => {
    const question = await queries.createQuestion({ type: "single", content: "并发编辑原题干", options: '["A. 一","B. 二"]', contentHash: "concurrent" })
    await Promise.all([
      queries.updateQuestion(question.id, { content: "并发编辑新题干" }),
      queries.updateQuestion(question.id, { options: '["A. 三","B. 四"]' }),
    ])
    const updated = (await queries.getQuestionById(question.id))!
    expect(updated.content).toBe("并发编辑新题干")
    expect(updated.fingerprint).toBe(questionFingerprint(updated))
  })

  it("手动预览保存重算错误和预览，纠正后的题目可导入", async () => {
    const { PATCH, PUT } = await import("@/app/api/questions/preview/route")
    const send = (question: unknown) => PATCH(new NextRequest("http://localhost/api/questions/preview", { method: "PATCH", body: JSON.stringify({ question }) }))
    const draft = { type: "single", stem: "请选择正确的测试选项", answer: "A", sourcePage: 3 }
    const invalid = await (await send(draft)).json()
    expect(invalid.quality.issueCount.error).toBeGreaterThan(0)
    const fixed = await (await send({ ...draft, options: ["A. 正确", "B. 错误"] })).json()
    expect(fixed.quality.issueCount.error).toBe(0)
    expect(fixed.preview).toContain("A. 正确")
    expect(fixed.editable.sourcePage).toBe(3)
    const imported = await PUT(new NextRequest("http://localhost/api/questions/preview", { method: "PUT", body: JSON.stringify({ questions: [fixed.editable] }) }))
    expect(await imported.json()).toMatchObject({ imported: 1, duplicates: 0 })
    expect((await queries.getQuestions({ search: draft.stem })).data[0].sourcePage).toBe(3)
  })

  it("PUT 省略数组保留原值，显式 null 可以清空选项", async () => {
    const question = await queries.createQuestion({ type: "single", content: "保留选项与标签", options: '["A. 一","B. 二"]', tags: '["标签"]', contentHash: "partial" })
    const { PUT } = await import("@/app/api/questions/[id]/route")
    const send = (body: unknown) => PUT(new NextRequest(`http://localhost/api/questions/${question.id}`, { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ id: String(question.id) }) })
    const partial = await send({ explanation: "补充解析" })
    expect(partial.status).toBe(200)
    expect(await partial.json()).toMatchObject({ options: ["A. 一", "B. 二"], tags: ["标签"] })
    const empty = await send({ type: "essay", options: null })
    expect(empty.status).toBe(200)
    expect(await empty.json()).toMatchObject({ options: null, tags: ["标签"] })
  })

  it("归档保留学习记录和收藏，默认列表与抽题隐藏归档", async () => {
    const question = await queries.createQuestion({ type: "essay", content: "归档测试题目", contentHash: "archive" })
    await queries.createPracticeRecord({ questionId: question.id, isCorrect: false })
    await queries.toggleFavorite(question.id)
    await expect(queries.deleteQuestion(question.id)).resolves.toBe(true)
    expect((await queries.getQuestionById(question.id))?.archivedAt).toBeTruthy()
    expect((await queries.getQuestions({ search: "归档测试题目" })).total).toBe(0)
    expect((await queries.getRandomQuestions({ count: 100 })).some(q => q.id === question.id)).toBe(false)
    expect((await queries.getFavorites()).data.some(q => q.questionId === question.id)).toBe(false)
    expect(sqliteDb.prepare("SELECT count(*) AS n FROM practice_records WHERE question_id = ?").get(question.id)).toEqual({ n: 1 })
    expect(sqliteDb.prepare("SELECT count(*) AS n FROM favorites WHERE question_id = ?").get(question.id)).toEqual({ n: 1 })
  })
})
