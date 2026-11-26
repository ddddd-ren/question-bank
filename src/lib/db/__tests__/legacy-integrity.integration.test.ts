import { afterAll, beforeAll, expect, it, vi } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { questionFingerprint } from "@/lib/question-fingerprint"

let directory: string
let originalPath: string | undefined
let sqliteDb: typeof import("../index")["sqliteDb"]

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "legacy-integrity-"))
  originalPath = process.env.DATABASE_PATH
  process.env.DATABASE_PATH = path.join(directory, "legacy.db")
  const legacy = new Database(process.env.DATABASE_PATH)
  legacy.exec(`
    CREATE TABLE questions (
      id INTEGER PRIMARY KEY, type TEXT NOT NULL, content TEXT NOT NULL, options TEXT,
      answer TEXT, explanation TEXT, category_id INTEGER, difficulty INTEGER DEFAULT 1,
      tags TEXT, content_hash TEXT NOT NULL UNIQUE, source_file TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO questions(id,type,content,content_hash) VALUES
      (41,'essay','旧题干内容','old-hash-one'), (42,'essay','旧题干内容','old-hash-two');
    CREATE TABLE practice_records (
      id INTEGER PRIMARY KEY, question_id INTEGER REFERENCES questions(id), user_answer TEXT,
      is_correct INTEGER, time_spent INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO practice_records(id,question_id,is_correct) VALUES(7,41,0);
    INSERT INTO practice_records(id,question_id,is_correct) VALUES(8,42,0),(9,42,1);
  `)
  legacy.close()
  vi.resetModules()
  sqliteDb = (await import("../index")).sqliteDb
})

afterAll(() => {
  sqliteDb?.close()
  rmSync(directory, { recursive: true, force: true })
  if (originalPath === undefined) delete process.env.DATABASE_PATH
  else process.env.DATABASE_PATH = originalPath
})

it("兼容迁移保留重复历史题和学习记录，回填指纹后不再依赖旧哈希", async () => {
  const queries = await import("../queries")
  const fingerprint = questionFingerprint({ type: "essay", content: "旧题干内容" })
  expect((await queries.getQuestionsByHashes([fingerprint])).map(q => q.id)).toEqual([41, 42])
  expect(await queries.getQuestionByHash("old-hash-one")).toBeUndefined()
  expect(sqliteDb.prepare("SELECT id, question_id FROM practice_records ORDER BY id").all()).toEqual([{ id: 7, question_id: 41 }, { id: 8, question_id: 42 }, { id: 9, question_id: 42 }])
  expect(sqliteDb.prepare("SELECT question_id, status FROM question_learning").all()).toEqual([{ question_id: 41, status: "learning" }])
  expect((await queries.getQuestionById(41))?.archivedAt).toBeNull()
  await queries.updateQuestion(41, { content: "已改写的新题干" })
  expect((await queries.getQuestionsByHashes([fingerprint])).map(q => q.id)).toEqual([42])
})
