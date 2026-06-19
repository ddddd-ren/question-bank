import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"
import path from "path"

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "question-bank.db")

// Ensure data directory exists
import fs from "fs"
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const sqlite = new Database(DB_PATH)
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

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_questions_subject_id ON questions(subject_id);
  CREATE INDEX IF NOT EXISTS idx_questions_knowledge_point_id ON questions(knowledge_point_id);
  CREATE INDEX IF NOT EXISTS idx_questions_subject_type ON questions(subject_id, type);
  CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at);
`)