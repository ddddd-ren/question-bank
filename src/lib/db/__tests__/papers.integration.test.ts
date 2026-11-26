import { beforeAll, afterAll, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import type { SerializedQuestion } from "../serialize"
import JSZip from "jszip"
import { createPaperDocx } from "../../paper/docx"

let papers: typeof import("../papers")
let sqlite: typeof import("../index")["sqliteDb"]
const directory = mkdtempSync(path.join(tmpdir(), "paper-test-"))
const original = process.env.DATABASE_PATH
beforeAll(async () => {
  process.env.DATABASE_PATH = path.join(directory, "test.db")
  vi.resetModules()
  sqlite = (await import("../index")).sqliteDb
  papers = await import("../papers")
})
afterAll(() => {
  sqlite?.close()
  rmSync(directory, { recursive: true, force: true })
  if (original === undefined) delete process.env.DATABASE_PATH
  else process.env.DATABASE_PATH = original
})
const questions = [{ id: 999, type: "single", content: "原题", options: ["A. 原选项"], answer: "A" }, { id: 998, type: "essay", content: "论述", answer: "参考" }] as SerializedQuestion[]
const editAnswer = (questionId: number, to: string, from = "") => ({ questionId, answer: { from, to } })

it("保存不可变快照，提交前不泄露答案，重复交卷不重复记录", () => {
  const paper = papers.savePaper("试卷", questions)
  questions[0].content = "已修改"
  expect(papers.getPaper(paper.id).questions[0].content).toBe("原题")
  const attempt = papers.startAttempt(paper.id, "exam", 1)
  expect(attempt.paper.questions[0].answer).toBeNull()
  const done = papers.updateAttempt(attempt.id, { edits: [editAnswer(999, "A"), editAnswer(998, "参考")], submit: true })
  expect(done.results?.["999"].isCorrect).toBe(true)
  expect(done.results?.["998"].isCorrect).toBeNull()
  papers.updateAttempt(attempt.id, { edits: [editAnswer(999, "B", "A")], submit: true })
  const count = sqlite.prepare("SELECT count(*) AS n FROM practice_records").get() as { n: number }
  expect(count.n).toBe(2)
  expect(papers.getAttempt(attempt.id).answers["999"]).toBe("A")
})

it("到期恢复自动交卷且拒绝到期后答案", () => {
  const paper = papers.savePaper("限时", questions)
  const attempt = papers.startAttempt(paper.id, "exam", 1)
  papers.updateAttempt(attempt.id, { edits: [editAnswer(999, "A")] })
  sqlite.prepare("UPDATE paper_attempts SET expires_at = ? WHERE id = ?").run(Date.now() - 1, attempt.id)
  const done = papers.updateAttempt(attempt.id, { edits: [editAnswer(999, "B", "A")] })
  expect(done.submittedAt).not.toBeNull()
  expect(done.answers["999"]).toBe("A")
})

it("Word 从已保存快照生成，未知题目答案被拒绝且不污染已保存答案", async () => {
  const paper = papers.savePaper("导出", questions)
  const attempt = papers.startAttempt(paper.id, "practice")
  expect(() => papers.updateAttempt(attempt.id, { edits: [editAnswer(12345, "A")] })).toThrow("试卷外")
  expect(papers.getAttempt(attempt.id).answers).toEqual({})
  const snapshot = papers.getPaper(paper.id)
  const buffer = await createPaperDocx(snapshot.title, [{ type: "single", questions: snapshot.questions }], true)
  const xml = await (await JSZip.loadAsync(buffer)).file("word/document.xml")!.async("string")
  expect(xml).toContain("原选项")
  expect(xml).toContain("参考")
})

it("题库修改后仍按旧快照判分，交卷同步共享复习状态", () => {
  const id = Number(sqlite.prepare("INSERT INTO questions(type,content,answer,content_hash) VALUES('single','原题','A','paper-live-question')").run().lastInsertRowid)
  const paper = papers.savePaper("冻结答案", [{ ...questions[0], id, answer: "A" }])
  sqlite.prepare("UPDATE questions SET answer='B' WHERE id=?").run(id)
  const attempt = papers.startAttempt(paper.id, "practice")
  expect(papers.updateAttempt(attempt.id, { edits: [editAnswer(id, "A")], submit: true }).results?.[id].isCorrect).toBe(true)
  expect(sqlite.prepare("SELECT status FROM question_learning WHERE question_id=?").get(id)).toEqual({ status: "mastered" })
})

it("仅交卷后的主观题可自评，自评幂等且不可篡改客观题成绩", () => {
  const paper = papers.savePaper("自评", questions)
  const attempt = papers.startAttempt(paper.id, "practice")
  expect(() => papers.updateAttempt(attempt.id, { selfAssessment: { questionId: 998, isCorrect: true } })).toThrow("交卷后")
  papers.updateAttempt(attempt.id, { edits: [editAnswer(998, "我的论述")], submit: true })
  expect(() => papers.updateAttempt(attempt.id, { selfAssessment: { questionId: 999, isCorrect: true } })).toThrow("主观题")
  expect(papers.updateAttempt(attempt.id, { selfAssessment: { questionId: 998, isCorrect: true } }).results?.[998].isCorrect).toBe(true)
  papers.updateAttempt(attempt.id, { selfAssessment: { questionId: 998, isCorrect: true } })
  expect(() => papers.updateAttempt(attempt.id, { selfAssessment: { questionId: 998, isCorrect: false } })).toThrow("已经完成")
  expect(sqlite.prepare("SELECT count(*) AS n,is_correct FROM practice_records WHERE attempt_key=?").get(`paper:${attempt.id}:998`)).toEqual({ n: 1, is_correct: 1 })
})

it("旧库作答可续答，不同标签页修改不同题和标记时合并", () => {
  const paper = papers.savePaper("并发续答", questions)
  const { id } = papers.startAttempt(paper.id, "practice")
  sqlite.prepare("UPDATE paper_attempts SET answers=?,marked=? WHERE id=?")
    .run(JSON.stringify({ 999: "旧答案" }), "[999]", id)
  papers.updateAttempt(id, { edits: [{ questionId: 999, answer: { from: "旧答案", to: "新答案" } }] })
  const updated = papers.updateAttempt(id, { edits: [{ questionId: 998, answer: { from: "", to: "另一题" }, marked: true }] })
  expect(updated.answers).toEqual({ 999: "新答案", 998: "另一题" })
  expect(updated.marked).toEqual([999, 998])
})

it("同一改动重试可确认，冲突的整批改动和交卷一起回滚", () => {
  const paper = papers.savePaper("冲突", questions)
  const { id } = papers.startAttempt(paper.id, "practice")
  const saved = { edits: [{ questionId: 999, answer: { from: "", to: "A" } }] }
  papers.updateAttempt(id, saved)
  expect(papers.updateAttempt(id, saved).answers[999]).toBe("A")
  expect(() => papers.updateAttempt(id, {
    edits: [
      { questionId: 998, marked: true },
      { questionId: 999, answer: { from: "", to: "B" } },
    ],
    submit: true,
  })).toThrow("其他页面")
  expect(papers.getAttempt(id)).toMatchObject({ answers: { 999: "A" }, marked: [], submittedAt: null })
})
