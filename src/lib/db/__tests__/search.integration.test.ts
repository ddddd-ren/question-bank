import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { shouldUseFullTextSearch, toFtsPhrase } from "../search"

let temporaryDirectory: string
let originalDatabasePath: string | undefined
let sqliteDb: typeof import("../index")["sqliteDb"]
let queries: typeof import("../queries")

describe("FTS 查询构造", () => {
  it("只对三个及以上字符启用全文搜索", () => {
    expect(shouldUseFullTextSearch("计算机")).toBe(true)
    expect(shouldUseFullTextSearch("  network  ")).toBe(true)
    expect(shouldUseFullTextSearch("计算")).toBe(false)
    expect(shouldUseFullTextSearch("  ")).toBe(false)
  })

  it("将双引号转义为安全短语", () => {
    expect(toFtsPhrase(' 操作"系统 ')).toBe('"操作""系统"')
  })
})

describe("FTS 索引同步", () => {
  beforeAll(async () => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "question-bank-search-"))
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
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH
    else process.env.DATABASE_PATH = originalDatabasePath
  })

  it("插入、更新和删除题目时同步全文索引", async () => {
    const question = await queries.createQuestion({
      type: "essay",
      content: "计算机网络体系结构",
      answer: "分层协议",
      contentHash: "fts-sync-question",
    })

    expect((await queries.getQuestions({ search: "网络体系" })).data).toHaveLength(1)

    await queries.updateQuestion(question.id, { content: "数据库事务隔离级别" })
    expect((await queries.getQuestions({ search: "网络体系" })).data).toHaveLength(0)
    expect((await queries.getQuestions({ search: "事务隔离" })).data).toHaveLength(1)

    await queries.deleteQuestion(question.id)
    expect((await queries.getQuestions({ search: "事务隔离" })).data).toHaveLength(0)
  })

  it("短关键词继续使用 LIKE 并支持引号", async () => {
    await queries.createQuestion({
      type: "essay",
      content: 'C语言中的"指针"',
      contentHash: "fts-quotes-question",
    })

    expect((await queries.getQuestions({ search: "指针" })).data).toHaveLength(1)
    await expect(queries.getQuestions({ search: '语言中的"指' })).resolves.toMatchObject({ total: 1 })
  })
})
