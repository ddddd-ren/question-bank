import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { PHASE_PRODUCTION_BUILD } from "next/constants"
import * as schema from "./schema"
import path from "path"
import { questionFingerprint } from "../question-fingerprint"

// 构建进程并行加载 API 模块，各自使用内存库，避免初始化时争用磁盘数据库。
const DB_PATH = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
  ? ":memory:"
  : process.env.DATABASE_PATH || path.join(process.cwd(), "data", "question-bank.db")

// Ensure data directory exists
import fs from "fs"
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const sqlite = new Database(DB_PATH)
sqlite.function("question_fingerprint", { deterministic: true }, (type: string, content: string, options: string | null) =>
  questionFingerprint({ type, content, options }))
sqlite.pragma("journal_mode = WAL")
sqlite.pragma("foreign_keys = ON")
sqlite.pragma("synchronous = NORMAL")
sqlite.pragma("cache_size = -64000")
sqlite.pragma("temp_store = MEMORY")

export const db = drizzle(sqlite, { schema })
export const sqliteDb = sqlite

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    code TEXT UNIQUE,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS knowledge_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES knowledge_points(id),
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('single', 'multiple', 'truefalse', 'fill', 'calculation', 'essay', 'code')),
    content TEXT NOT NULL,
    options TEXT,
    answer TEXT,
    explanation TEXT,
    category_id INTEGER REFERENCES categories(id),
    subject_id INTEGER REFERENCES subjects(id),
    knowledge_point_id INTEGER REFERENCES knowledge_points(id),
    difficulty INTEGER DEFAULT 1 CHECK(difficulty BETWEEN 1 AND 5),
    tags TEXT,
    content_hash TEXT NOT NULL UNIQUE,
    source_file TEXT,
    random_key INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS practice_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER REFERENCES questions(id),
    user_answer TEXT,
    is_correct INTEGER,
    time_spent INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ai_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER REFERENCES questions(id),
    model TEXT NOT NULL,
    cache_key TEXT,
    response TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER REFERENCES questions(id) UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type);
  CREATE INDEX IF NOT EXISTS idx_questions_type_created_at ON questions(type, created_at);
  CREATE INDEX IF NOT EXISTS idx_questions_category_id ON questions(category_id);
  CREATE INDEX IF NOT EXISTS idx_questions_content_hash ON questions(content_hash);
  CREATE INDEX IF NOT EXISTS idx_questions_created_at ON questions(created_at);
  CREATE INDEX IF NOT EXISTS idx_subjects_name ON subjects(name);
  CREATE INDEX IF NOT EXISTS idx_subjects_code ON subjects(code);
  CREATE INDEX IF NOT EXISTS idx_knowledge_points_subject_id ON knowledge_points(subject_id);
  CREATE INDEX IF NOT EXISTS idx_knowledge_points_parent_id ON knowledge_points(parent_id);
  CREATE INDEX IF NOT EXISTS idx_practice_records_question_id ON practice_records(question_id);
  CREATE INDEX IF NOT EXISTS idx_practice_records_is_correct ON practice_records(is_correct);
  CREATE INDEX IF NOT EXISTS idx_practice_records_is_correct_created_at ON practice_records(is_correct, created_at);
  CREATE INDEX IF NOT EXISTS idx_practice_records_question_id_is_correct ON practice_records(question_id, is_correct);
  CREATE INDEX IF NOT EXISTS idx_practice_records_created_at ON practice_records(created_at);
  CREATE INDEX IF NOT EXISTS idx_ai_cache_question_model ON ai_cache(question_id, model);
  CREATE INDEX IF NOT EXISTS idx_favorites_question_id ON favorites(question_id);
`)

function ensureColumn(table: string, column: string, definition: string) {
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, '')
  const safeColumn = column.replace(/[^a-zA-Z0-9_]/g, '')
  const columns = sqlite.prepare(`PRAGMA table_info(${safeTable})`).all() as { name: string }[]
  if (!columns.some((item) => item.name === safeColumn)) {
    sqlite.exec(`ALTER TABLE ${safeTable} ADD COLUMN ${definition}`)
  }
}

ensureColumn("questions", "subject_id", "subject_id INTEGER REFERENCES subjects(id)")
ensureColumn("questions", "knowledge_point_id", "knowledge_point_id INTEGER REFERENCES knowledge_points(id)")
ensureColumn("ai_cache", "cache_key", "cache_key TEXT")
ensureColumn("questions", "random_key", "random_key INTEGER")
ensureColumn("questions", "archived_at", "archived_at TEXT")
ensureColumn("questions", "source_page", "source_page INTEGER")
ensureColumn("questions", "fingerprint", "fingerprint TEXT")
ensureColumn("practice_records", "attempt_key", "attempt_key TEXT")
sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_questions_fingerprint ON questions(fingerprint);
  CREATE INDEX IF NOT EXISTS idx_questions_archived_at ON questions(archived_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_records_attempt_key ON practice_records(attempt_key);
  CREATE TABLE IF NOT EXISTS question_learning (
    question_id INTEGER PRIMARY KEY REFERENCES questions(id),
    status TEXT NOT NULL DEFAULT 'learning' CHECK(status IN ('learning', 'mastered', 'archived')),
    next_review_at TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, snapshot TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS paper_templates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, sections TEXT NOT NULL, file BLOB NOT NULL
  );
  CREATE TABLE IF NOT EXISTS paper_attempts (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id),
    mode TEXT NOT NULL CHECK(mode IN ('practice', 'exam')),
    started_at INTEGER NOT NULL,
    expires_at INTEGER,
    submitted_at INTEGER,
    answers TEXT NOT NULL DEFAULT '{}',
    marked TEXT NOT NULL DEFAULT '[]',
    results TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_paper_attempts_paper_started ON paper_attempts(paper_id, started_at);
`)
ensureColumn("papers", "template", "template TEXT")

sqlite.transaction(() => sqlite.exec(`
  CREATE TABLE IF NOT EXISTS textbooks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, edition TEXT NOT NULL,
    format TEXT NOT NULL CHECK(format IN ('pdf','epub','docx')),
    unit_count INTEGER NOT NULL CHECK(unit_count > 0),
    file_hash TEXT NOT NULL, filename TEXT NOT NULL, file BLOB NOT NULL,
    UNIQUE(file_hash, edition)
  );
  CREATE TABLE IF NOT EXISTS textbook_segments (
    book_id TEXT NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position >= 1), text TEXT NOT NULL,
    PRIMARY KEY(book_id, position)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS textbook_chapters (
    id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL, title TEXT NOT NULL, level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 6),
    start INTEGER NOT NULL CHECK(start >= 1), end INTEGER NOT NULL CHECK(end >= start),
    learned_to INTEGER CHECK(learned_to BETWEEN start AND end),
    recent_from INTEGER CHECK(recent_from IS NULL OR (learned_to IS NOT NULL AND recent_from BETWEEN start AND learned_to)),
    skipped INTEGER NOT NULL DEFAULT 0 CHECK(skipped IN (0,1) AND (skipped=0 OR learned_to IS NULL))
  );
  CREATE INDEX IF NOT EXISTS idx_textbook_chapters_book ON textbook_chapters(book_id, ordinal);
  CREATE TABLE IF NOT EXISTS textbook_question_links (
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    chapter_id TEXT NOT NULL REFERENCES textbook_chapters(id),
    through INTEGER CHECK(through >= 1), PRIMARY KEY(question_id, chapter_id)
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS idx_textbook_question_links_chapter ON textbook_question_links(chapter_id);
`)).immediate()
ensureColumn("textbook_chapters", "skipped", "skipped INTEGER NOT NULL DEFAULT 0 CHECK(skipped IN (0,1) AND (skipped=0 OR learned_to IS NULL))")

// 保留旧唯一哈希及所有重复历史行，去重仅使用新指纹。
sqlite.transaction(() => {
  const rows = sqlite.prepare("SELECT id, type, content, options FROM questions WHERE fingerprint IS NULL").all() as { id: number; type: string; content: string; options: string | null }[]
  const update = sqlite.prepare("UPDATE questions SET fingerprint = ? WHERE id = ?")
  for (const row of rows) update.run(questionFingerprint(row), row.id)
})()
sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_questions_subject_id ON questions(subject_id);
  CREATE INDEX IF NOT EXISTS idx_questions_knowledge_point_id ON questions(knowledge_point_id);
  CREATE INDEX IF NOT EXISTS idx_questions_subject_type ON questions(subject_id, type);
  CREATE INDEX IF NOT EXISTS idx_ai_cache_question_cache_key ON ai_cache(question_id, cache_key);
  CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at);
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS questions_fts USING fts5(
    content,
    answer,
    tags,
    content='questions',
    content_rowid='id',
    tokenize='trigram'
  );

  CREATE TRIGGER IF NOT EXISTS questions_fts_insert AFTER INSERT ON questions BEGIN
    INSERT INTO questions_fts(rowid, content, answer, tags)
    VALUES (new.id, new.content, coalesce(new.answer, ''), coalesce(new.tags, ''));
  END;

  CREATE TRIGGER IF NOT EXISTS questions_fts_delete AFTER DELETE ON questions BEGIN
    INSERT INTO questions_fts(questions_fts, rowid, content, answer, tags)
    VALUES ('delete', old.id, old.content, coalesce(old.answer, ''), coalesce(old.tags, ''));
  END;

  CREATE TRIGGER IF NOT EXISTS questions_fts_update AFTER UPDATE ON questions BEGIN
    INSERT INTO questions_fts(questions_fts, rowid, content, answer, tags)
    VALUES ('delete', old.id, old.content, coalesce(old.answer, ''), coalesce(old.tags, ''));
    INSERT INTO questions_fts(rowid, content, answer, tags)
    VALUES (new.id, new.content, coalesce(new.answer, ''), coalesce(new.tags, ''));
  END;
`)

const ftsVersion = sqlite
  .prepare("SELECT value FROM app_meta WHERE key = 'questions_fts_version'")
  .get() as { value: string } | undefined

sqlite.transaction(() => {
  const migrated = sqlite.prepare("SELECT 1 FROM app_meta WHERE key = 'question_learning_version'").get()
  if (migrated) return
  sqlite.exec(`
    INSERT OR IGNORE INTO question_learning(question_id, status, next_review_at)
    SELECT p.question_id, 'learning', date('now') FROM practice_records p
    WHERE p.is_correct = 0 AND p.question_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM practice_records newer WHERE newer.question_id = p.question_id
        AND newer.is_correct IS NOT NULL
        AND (newer.created_at > p.created_at OR (newer.created_at = p.created_at AND newer.id > p.id))
      );
    INSERT INTO app_meta(key, value) VALUES ('question_learning_version', '1');
  `)
})()

if (ftsVersion?.value !== "1") {
  sqlite.exec("INSERT INTO questions_fts(questions_fts) VALUES ('rebuild')")
  sqlite.prepare(`
    INSERT INTO app_meta (key, value) VALUES ('questions_fts_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run()
}
