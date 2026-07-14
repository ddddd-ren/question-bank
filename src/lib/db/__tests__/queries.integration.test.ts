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

  it("随机题查询正确绑定过滤条件和数量", async () => {
    const result = await queries.getRandomQuestions({ type: "single", count: 7 })

    expect(result).toHaveLength(7)
    expect(result.every((question) => question.type === "single")).toBe(true)
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

    const result = await queries.getWrongQuestions({ type: "single", count: 2 })

    expect(result).toHaveLength(2)
    expect(result.every((question) => question.type === "single")).toBe(true)
  })
})
