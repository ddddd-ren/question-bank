import Database from "better-sqlite3"
import { closeSync, existsSync, mkdirSync, openSync, renameSync, rmSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

const textbookColumns = {
  textbooks: ["id", "title", "edition", "format", "unit_count", "file_hash", "filename", "file"],
  textbook_segments: ["book_id", "position", "text"],
  textbook_chapters: ["id", "book_id", "ordinal", "title", "level", "start", "end", "learned_to", "recent_from"],
  textbook_question_links: ["question_id", "chapter_id", "through"],
}

const requiredColumns = {
  questions: ["id", "type", "content", "options", "answer", "explanation", "category_id", "difficulty", "tags", "content_hash", "source_file", "created_at", "updated_at"],
  practice_records: ["id", "question_id", "user_answer", "is_correct", "time_spent", "created_at"],
  favorites: ["id", "question_id", "created_at"],
  categories: ["id", "name", "parent_id", "created_at"],
  subjects: ["id", "name", "code", "description", "created_at", "updated_at"],
  knowledge_points: ["id", "subject_id", "name", "parent_id", "description", "created_at", "updated_at"],
  ai_cache: ["id", "question_id", "model", "response", "created_at"],
  ai_config: ["id", "name", "base_url", "api_key", "model", "max_tokens", "is_active"],
  question_learning: ["question_id", "status", "next_review_at", "updated_at"],
  papers: ["id", "title", "snapshot", "created_at"],
  paper_templates: ["id", "name", "sections", "file"],
  paper_attempts: ["id", "paper_id", "mode", "started_at", "expires_at", "submitted_at", "answers", "marked", "results"],
  app_meta: ["key", "value"],
  ...textbookColumns,
}

/** @param {string} file */
export function verifyDatabase(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    db.pragma("trusted_schema = OFF")
    const integrity = db.pragma("integrity_check")
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") throw new Error("数据库完整性检查失败")
    if (db.pragma("foreign_key_check").length) throw new Error("数据库存在无效关联，不能恢复")
    for (const table of ["questions", "practice_records", "favorites"]) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
        throw new Error("文件不是完整的题库备份")
      }
    }
    let textbookTableCount = 0
    for (const [table, columns] of Object.entries(requiredColumns)) {
      const existing = db.pragma(`table_info(${table})`).map((column) => column.name)
      if (existing.length && Object.hasOwn(textbookColumns, table)) textbookTableCount++
      if (existing.length && columns.some((column) => !existing.includes(column))) {
        throw new Error(`备份表 ${table} 缺少必要字段，不能恢复`)
      }
    }
    if (textbookTableCount && textbookTableCount !== Object.keys(textbookColumns).length) {
      throw new Error("备份缺少教材数据表，不能恢复")
    }
    return { questions: db.prepare("SELECT count(*) AS total FROM questions").get().total }
  } finally { db.close() }
}

/** @param {string} source @param {string} destination */
export async function backupDatabase(source, destination) {
  const target = path.resolve(destination)
  mkdirSync(path.dirname(target), { recursive: true })
  // 独占创建，避免备份命令意外覆盖用户已有文件。
  if (existsSync(target)) throw new Error("目标文件已存在，请指定新文件名")
  const db = new Database(source, { readonly: true, fileMustExist: true })
  let reserved = false
  try {
    closeSync(openSync(target, "wx"))
    reserved = true
    await db.backup(target)
    verifyDatabase(target)
    return target
  } catch (error) {
    if (reserved) rmSync(target, { force: true })
    throw error
  } finally { db.close() }
}

/** @param {string} target */
function requireStopped(target) {
  if (["-wal", "-shm", "-journal"].some((suffix) => existsSync(target + suffix))) {
    throw new Error("目标仍存在 WAL/SHM/日志文件，请先正常停止所有题库服务；不要删除活跃日志")
  }
}

/** @param {string} backup @param {string} destination @param {{stopped?: boolean}} options */
export async function restoreDatabase(backup, destination, options = {}) {
  if (!options.stopped) throw new Error("恢复前必须停服，并传入 --stopped 确认")
  const target = path.resolve(destination)
  const source = path.resolve(backup)
  if (source.toLowerCase() === target.toLowerCase()) throw new Error("备份文件与恢复目标不能相同")
  verifyDatabase(source)
  requireStopped(target)
  const staging = target + ".restore-" + randomUUID()
  let previousPath = null
  try {
    await backupDatabase(source, staging)
    requireStopped(target)
    if (existsSync(target)) {
      previousPath = target + ".before-restore-" + randomUUID() + ".db"
      renameSync(target, previousPath)
    }
    try { renameSync(staging, target) } catch (error) {
      if (previousPath) renameSync(previousPath, target)
      throw error
    }
    return { path: target, previousPath }
  } finally {
    if (existsSync(staging)) rmSync(staging, { force: true })
  }
}
