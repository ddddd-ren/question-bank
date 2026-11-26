import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import type { NewQuestion, Question } from "../schema"

let temporaryDirectory: string
let originalDatabasePath: string | undefined
let sqliteDb: typeof import("../index")["sqliteDb"]
let queries: typeof import("../queries")
let createdQuestions: Question[] = []

function createQuestionData(index: number): NewQuestion {
  return {
    type: index % 2 === 0 ? "single" : "essay",
    content: `集成测试题目 ${index}`,
    answer: `答案 ${index}`,
    contentHash: `integration-hash-${index}`,
    difficulty: 1,
  }
}

beforeAll(async () => {
  temporaryDirectory = mkdtempSync(path.join(tmpdir(), "question-bank-test-"))
  originalDatabasePath = process.env.DATABASE_PATH
  process.env.DATABASE_PATH = path.join(temporaryDirectory, "test.db")
  vi.resetModules()

  const databaseModule = await import("../index")
  sqliteDb = databaseModule.sqliteDb
  queries = await import("../queries")
})

afterAll(() => {
  sqliteDb.close()
  rmSync(temporaryDirectory, { recursive: true, force: true })

  if (originalDatabasePath === undefined) {
    delete process.env.DATABASE_PATH
  } else {
    process.env.DATABASE_PATH = originalDatabasePath
  }
})

describe("SQLite 批量查询", () => {
  it("空批量创建返回空数组", async () => {
    await expect(queries.createQuestionsBatch([])).resolves.toEqual([])
  })

  it("分批创建超过单次参数限制的题目", async () => {
    createdQuestions = await queries.createQuestionsBatch(
      Array.from({ length: 501 }, (_, index) => createQuestionData(index)),
    )

    expect(createdQuestions).toHaveLength(501)
    expect(new Set(createdQuestions.map((question) => question.id)).size).toBe(501)
  })

  it("分块查询大量 ID 并去除重复输入", async () => {
    const ids = createdQuestions.map((question) => question.id)
    const result = await queries.getQuestionsByIds([...ids, ids[0], ids[1]])

    expect(result).toHaveLength(501)
    expect(new Set(result.map((question) => question.id)).size).toBe(501)
  })

  it("分块查询大量哈希并去除重复输入", async () => {
    const hashes = createdQuestions.map((question) => question.contentHash)
    const result = await queries.getQuestionsByHashes([...hashes, hashes[0], hashes[1]])

    expect(result).toHaveLength(501)
    expect(new Set(result.map((question) => question.contentHash)).size).toBe(501)
  })

  it("跨分块写入遇到唯一键冲突时整体回滚", async () => {
    const beforeCount = sqliteDb.prepare("SELECT count(*) AS count FROM questions").get() as { count: number }
    const batch = Array.from({ length: 401 }, (_, index) => ({
      ...createQuestionData(1000 + index),
      contentHash: `atomic-hash-${index}`,
    }))
    batch.push(createQuestionData(0))

    await expect(queries.createQuestionsBatch(batch)).rejects.toThrow("UNIQUE")

    const afterCount = sqliteDb.prepare("SELECT count(*) AS count FROM questions").get() as { count: number }
    expect(afterCount.count).toBe(beforeCount.count)
  })

  it("随机题查询正确绑定过滤条件和数量", async () => {
    const result = await queries.getRandomQuestions({ type: "single", count: 7 })

    expect(result).toHaveLength(7)
    expect(result.every((question) => question.type === "single")).toBe(true)
  })

  it("连续随机抽题不会重复并产生不同题目集合", async () => {
    const resultSets = new Set<string>()

    for (let index = 0; index < 20; index += 1) {
      const result = await queries.getRandomQuestions({ type: "single", count: 20 })
      expect(result).toHaveLength(20)
      expect(new Set(result.map((question) => question.id)).size).toBe(20)
      expect(result.every((question) => question.type === "single")).toBe(true)
      resultSets.add(result.map((question) => question.id).sort((a, b) => a - b).join(","))
    }

    expect(resultSets.size).toBeGreaterThan(1)
  })

  it("随机抽题不受历史随机键间距影响，未答优先仍只从未答题抽取", async () => {
    const candidates = await queries.createQuestionsBatch([10, 20, 1_000_010].map((randomKey, index) => ({
      ...createQuestionData(2000 + index * 2), difficulty: 5, randomKey,
    })))
    const oldRandom = vi.spyOn(Math, "random").mockReturnValue(0.5)
    try {
      const filters = { type: "single", difficulty: 5 }
      const picked = new Set<number>()
      for (let index = 0; index < 75; index++) {
        const [question] = await queries.getRandomQuestions({ ...filters, count: 1 })
        picked.add(question.id)
      }
      expect(picked).toEqual(new Set(candidates.map(question => question.id)))
      const record = sqliteDb.prepare("INSERT INTO practice_records (question_id, is_correct) VALUES (?, 1)")
      record.run(candidates[0].id)
      record.run(candidates[1].id)
      const unanswered = await queries.getRandomQuestions({ ...filters, count: 1, unansweredFirst: true })
      expect(unanswered.map(question => question.id)).toEqual([candidates[2].id])
    } finally {
      oldRandom.mockRestore()
    }
  })

  it("错题查询正确绑定类型和数量参数", async () => {
    const singleQuestions = createdQuestions.filter((question) => question.type === "single").slice(0, 3)
    const essayQuestion = createdQuestions.find((question) => question.type === "essay")

    for (const question of singleQuestions) {
      sqliteDb.prepare(
        "INSERT INTO practice_records (question_id, is_correct, created_at) VALUES (?, 0, CURRENT_TIMESTAMP)",
      ).run(question.id)
    }
    sqliteDb.prepare(
      "INSERT INTO practice_records (question_id, is_correct, created_at) VALUES (?, 0, CURRENT_TIMESTAMP)",
    ).run(essayQuestion!.id)

    for (const question of [...singleQuestions, essayQuestion!]) {
      sqliteDb.prepare("INSERT INTO question_learning(question_id,status,next_review_at) VALUES(?,'learning',date('now'))").run(question.id)
    }
    const result = await queries.getWrongQuestions({ type: "single", count: 2 })

    expect(result).toHaveLength(2)
    expect(result.every((question) => question.type === "single")).toBe(true)
  })

  it("清空题库时一并删除题目关联记录", async () => {
    const questionId = createdQuestions[0].id
    sqliteDb.prepare(
      "INSERT INTO practice_records (question_id, is_correct, created_at) VALUES (?, 0, CURRENT_TIMESTAMP)",
    ).run(questionId)
    sqliteDb.prepare(
      "INSERT INTO ai_cache (question_id, model, response) VALUES (?, 'test-model', 'cached response')",
    ).run(questionId)
    sqliteDb.prepare(
      "INSERT INTO favorites (question_id) VALUES (?)",
    ).run(questionId)

    const beforeCount = sqliteDb.prepare("SELECT count(*) AS count FROM questions").pluck().get()
    const deleted = await queries.clearQuestions()

    expect(deleted).toBe(beforeCount)
    expect((sqliteDb.prepare("SELECT count(*) AS count FROM questions").get() as { count: number }).count).toBe(0)
    expect((sqliteDb.prepare("SELECT count(*) AS count FROM practice_records").get() as { count: number }).count).toBe(0)
    expect((sqliteDb.prepare("SELECT count(*) AS count FROM ai_cache").get() as { count: number }).count).toBe(0)
    expect((sqliteDb.prepare("SELECT count(*) AS count FROM favorites").get() as { count: number }).count).toBe(0)
  })
})
