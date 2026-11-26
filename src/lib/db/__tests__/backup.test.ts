import { afterEach, describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { backupDatabase, restoreDatabase, verifyDatabase } from "../backup.mjs"

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "question-bank-backup-test-"))
  directories.push(directory)
  const source = path.join(directory, "source.db")
  const db = new Database(source)
  db.pragma("journal_mode = WAL")
  db.exec("CREATE TABLE questions(id INTEGER PRIMARY KEY, type TEXT, content TEXT, options TEXT, answer TEXT, explanation TEXT, category_id INTEGER, difficulty INTEGER, tags TEXT, content_hash TEXT, source_file TEXT, created_at TEXT, updated_at TEXT); CREATE TABLE practice_records(id INTEGER PRIMARY KEY, question_id INTEGER REFERENCES questions(id), user_answer TEXT, is_correct INTEGER, time_spent INTEGER, created_at TEXT); CREATE TABLE favorites(id INTEGER PRIMARY KEY, question_id INTEGER, created_at TEXT); INSERT INTO questions(id,content) VALUES(1,'备份题目'); INSERT INTO practice_records(id,question_id) VALUES(1,1)")
  return { directory, source, db }
}

describe("完整题库备份", () => {
  it("在线备份包含尚在 WAL 中的题目与作答，且拒绝覆盖文件", async () => {
    const { directory, source, db } = fixture()
    try {
      const destination = path.join(directory, "backup.db")
      await backupDatabase(source, destination)
      expect(verifyDatabase(destination).questions).toBe(1)
      const restored = new Database(destination, { readonly: true })
      expect(restored.prepare("SELECT count(*) AS total FROM practice_records").get()).toEqual({ total: 1 })
      restored.close()
      await expect(backupDatabase(source, destination)).rejects.toThrow("已存在")
    } finally { db.close() }
  })

  it("停服恢复保留原库，并拒绝未确认停服和仍有 WAL 的目标", async () => {
    const { directory, source, db } = fixture()
    const backup = path.join(directory, "backup.db")
    await backupDatabase(source, backup)
    await expect(restoreDatabase(backup, source)).rejects.toThrow("停服")
    await expect(restoreDatabase(backup, source, { stopped: true })).rejects.toThrow("WAL")
    db.prepare("INSERT INTO questions(id,content) VALUES(2,'恢复前原库')").run()
    db.close()
    const result = await restoreDatabase(backup, source, { stopped: true })
    expect(verifyDatabase(source).questions).toBe(1)
    if (!result.previousPath) throw new Error("恢复前原库未保留")
    expect(verifyDatabase(result.previousPath).questions).toBe(2)
  })

  it("损坏备份不会覆盖原数据库", async () => {
    const { directory, source, db } = fixture()
    db.close()
    const invalid = path.join(directory, "bad.db")
    writeFileSync(invalid, "不是数据库", "utf8")
    const before = readFileSync(source)
    await expect(restoreDatabase(invalid, source, { stopped: true })).rejects.toThrow()
    expect(readFileSync(source)).toEqual(before)
    expect(existsSync(source)).toBe(true)
  })

  it("拒绝仅伪造表名而缺少应用必要字段的数据库", async () => {
    const { directory, source, db } = fixture()
    db.close()
    const invalid = path.join(directory, "wrong-schema.db")
    const wrong = new Database(invalid)
    wrong.exec("CREATE TABLE questions(id INTEGER); CREATE TABLE practice_records(id INTEGER); CREATE TABLE favorites(id INTEGER)")
    wrong.close()
    const before = readFileSync(source)
    await expect(restoreDatabase(invalid, source, { stopped: true })).rejects.toThrow("必要字段")
    expect(readFileSync(source)).toEqual(before)
  })
})
