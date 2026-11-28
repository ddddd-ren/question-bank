import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

vi.mock("@/lib/api-error", () => ({ ApiError: class extends Error { constructor(public statusCode: number, message: string) { super(message) } } }))

let directory: string
let oldPath: string | undefined
let db: typeof import("../index")["sqliteDb"]
let learning: typeof import("../learning")
let questionId: number
beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "learning-test-"))
  oldPath = process.env.DATABASE_PATH
  process.env.DATABASE_PATH = path.join(directory, "test.db")
  vi.resetModules()
  db = (await import("../index")).sqliteDb
  learning = await import("../learning")
  questionId = Number(db.prepare("INSERT INTO questions(type,content,answer,content_hash) VALUES('single','测试','A','learning-test')").run().lastInsertRowid)
})
afterAll(() => {
  db?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
  if (oldPath === undefined) delete process.env.DATABASE_PATH
  else process.env.DATABASE_PATH = oldPath
})
describe("学习记录", () => {
  it("同轮重试幂等，新一轮可以再次练习", () => {
    const data = { questionId, attemptKey: "round-1", userAnswer: "B", timeSpent: 5 }
    const first = learning.saveLearningRecord(data)
    expect(learning.saveLearningRecord(data).id).toBe(first.id)
    expect(learning.saveLearningRecord({ ...data, attemptKey: "round-2" }).id).not.toBe(first.id)
    expect(db.prepare("SELECT count(*) n FROM practice_records").get()).toEqual({ n: 2 })
    expect(db.prepare("SELECT status FROM question_learning WHERE question_id=?").get(questionId)).toEqual({ status: "learning" })
  })
  it("主观待判分仅自评一次，归档不删除历史", () => {
    const essayId = Number(db.prepare("INSERT INTO questions(type,content,answer,content_hash) VALUES('essay','论述','参考','essay-test')").run().lastInsertRowid)
    const data = { questionId: essayId, attemptKey: "essay-1", userAnswer: "回答" }
    expect(learning.saveLearningRecord(data).isCorrect).toBeNull()
    expect(learning.saveLearningRecord({ ...data, selfAssessment: true }).isCorrect).toBe(true)
    expect(learning.saveLearningRecord({ ...data, selfAssessment: false }).isCorrect).toBe(true)
    learning.setLearningStatus(questionId, "archived")
    expect(db.prepare("SELECT count(*) n FROM practice_records").get()).toEqual({ n: 3 })
    expect(learning.getDueReviewCount()).toBe(0)
  })
  it("拒绝复用同一答题标识提交不同答案", () => {
    expect(() => learning.saveLearningRecord({ questionId, attemptKey: "round-1", userAnswer: "A" })).toThrow()
  })
  it("待判分不计入正确率，掌握和归档不改历史统计", async () => {
    const essay = Number(db.prepare("INSERT INTO questions(type,content,content_hash) VALUES('essay','待判分','pending-test')").run().lastInsertRowid)
    learning.saveLearningRecord({ questionId: essay, attemptKey: "pending-1", userAnswer: "回答" })
    const queries = await import("../queries")
    const before = await queries.getPracticeStats()
    expect(before).toMatchObject({ total: 4, graded: 3, pending: 1, correct: 1, accuracy: 33 })
    learning.setLearningStatus(essay, "mastered")
    expect(await queries.getPracticeStats()).toEqual(before)
  })
  it("旧待判分答案自评不能覆盖更新一轮的复习状态", () => {
    const essay = Number(db.prepare("INSERT INTO questions(type,content,content_hash) VALUES('essay','时间顺序','ordering-test')").run().lastInsertRowid)
    const data = { questionId: essay, userAnswer: "回答" }
    learning.saveLearningRecord({ ...data, attemptKey: "old-pending" })
    learning.saveLearningRecord({ ...data, attemptKey: "new-wrong", selfAssessment: false })
    learning.saveLearningRecord({ ...data, attemptKey: "old-pending", selfAssessment: true })
    expect(db.prepare("SELECT status FROM question_learning WHERE question_id=?").get(essay)).toEqual({ status: "learning" })
  })
  it("到期队列支持题型筛选并排除已归档题目", () => {
    db.prepare("UPDATE question_learning SET next_review_at=date('now','-1 day') WHERE status!='archived'").run()
    const before = learning.getDueReviewCount()
    expect(before).toBeGreaterThan(0)
    expect(learning.getReviewQuestions({ mode: "due", type: "single", count: 20 })).toHaveLength(0)
    const essays = learning.getReviewQuestions({ mode: "due", type: "essay", count: 20 })
    expect(essays.length).toBe(before)
    db.prepare("UPDATE questions SET archived_at=CURRENT_TIMESTAMP WHERE id=?").run(essays[0].id)
    expect(learning.getDueReviewCount()).toBe(before - 1)
  })
  it("试卷快照已不存在的题目仍保留答题记录", () => {
    const record = learning.saveLearningRecord({ questionId: 99999, attemptKey: "paper:deleted:1", userAnswer: "A", isCorrect: true })
    expect(record.questionId).toBeNull()
    expect(record.isCorrect).toBe(true)
  })

  it("错题分析按学科和知识点汇总已判分作答，并统计错题数", async () => {
    const subjectId = Number(db.prepare("INSERT INTO subjects(name) VALUES('分析学科')").run().lastInsertRowid)
    const knowledgePointId = Number(db.prepare("INSERT INTO knowledge_points(subject_id,name) VALUES(?, '分析知识点')").run(subjectId).lastInsertRowid)
    const analyzedQuestionId = Number(db.prepare(
      "INSERT INTO questions(type,content,answer,content_hash,subject_id,knowledge_point_id) VALUES('single','分析题','A','analysis-test',?,?)"
    ).run(subjectId, knowledgePointId).lastInsertRowid)
    const pendingQuestionId = Number(db.prepare(
      "INSERT INTO questions(type,content,content_hash,subject_id,knowledge_point_id) VALUES('essay','待判分','analysis-pending',?,?)"
    ).run(subjectId, knowledgePointId).lastInsertRowid)

    learning.saveLearningRecord({ questionId: analyzedQuestionId, attemptKey: "analysis-wrong-1", userAnswer: "B" })
    learning.saveLearningRecord({ questionId: analyzedQuestionId, attemptKey: "analysis-correct-1", userAnswer: "A" })
    learning.saveLearningRecord({ questionId: pendingQuestionId, attemptKey: "analysis-pending-1", userAnswer: "未判分" })

    expect(learning.getMistakeAnalysisStats({ subjectId, days: 30 })).toEqual([
      expect.objectContaining({
        subjectId,
        subjectName: "分析学科",
        knowledgePointId,
        knowledgePointName: "分析知识点",
        graded: 2,
        correct: 1,
        wrong: 1,
        wrongQuestions: 1,
      }),
    ])
  })
})
