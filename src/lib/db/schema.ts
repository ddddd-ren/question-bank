import { sqliteTable, text, integer, blob, primaryKey, unique } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
})

export const subjects = sqliteTable("subjects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  code: text("code").unique(),
  description: text("description"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
})

export const knowledgePoints = sqliteTable("knowledge_points", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subjectId: integer("subject_id").notNull().references(() => subjects.id),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  description: text("description"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
})

export const questions = sqliteTable("questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"] }).notNull(),
  content: text("content").notNull(),
  options: text("options"), // JSON string
  answer: text("answer"),
  explanation: text("explanation"),
  categoryId: integer("category_id").references(() => categories.id),
  subjectId: integer("subject_id").references(() => subjects.id),
  knowledgePointId: integer("knowledge_point_id").references(() => knowledgePoints.id),
  difficulty: integer("difficulty").default(1), // 1-5
  tags: text("tags"), // JSON string
  contentHash: text("content_hash").notNull().unique(),
  fingerprint: text("fingerprint"),
  archivedAt: text("archived_at"),
  sourceFile: text("source_file"),
  sourcePage: integer("source_page"),
  randomKey: integer("random_key"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
})

export const practiceRecords = sqliteTable("practice_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: integer("question_id").references(() => questions.id),
  userAnswer: text("user_answer"),
  isCorrect: integer("is_correct", { mode: "boolean" }),
  timeSpent: integer("time_spent"), // seconds
  attemptKey: text("attempt_key").unique(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
})

export const questionLearning = sqliteTable("question_learning", {
  questionId: integer("question_id").primaryKey().references(() => questions.id),
  status: text("status", { enum: ["learning", "mastered", "archived"] }).notNull().default("learning"),
  nextReviewAt: text("next_review_at"),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
})

export const papers = sqliteTable("papers", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  snapshot: text("snapshot").notNull(),
  template: text("template"),
  createdAt: integer("created_at").notNull(),
})

export const paperTemplates = sqliteTable("paper_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sections: text("sections").notNull(),
  file: blob("file", { mode: "buffer" }).notNull(),
})

export const textbooks = sqliteTable("textbooks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  edition: text("edition").notNull(),
  format: text("format", { enum: ["pdf", "epub", "docx"] }).notNull(),
  unitCount: integer("unit_count").notNull(),
  fileHash: text("file_hash").notNull(),
  filename: text("filename").notNull(),
  file: blob("file", { mode: "buffer" }).notNull(),
}, table => [unique().on(table.fileHash, table.edition)])

export const textbookSegments = sqliteTable("textbook_segments", {
  bookId: text("book_id").notNull().references(() => textbooks.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  text: text("text").notNull(),
}, table => [primaryKey({ columns: [table.bookId, table.position] })])

export const textbookChapters = sqliteTable("textbook_chapters", {
  id: text("id").primaryKey(),
  bookId: text("book_id").notNull().references(() => textbooks.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),
  title: text("title").notNull(),
  level: integer("level").notNull(),
  start: integer("start").notNull(),
  end: integer("end").notNull(),
  learnedTo: integer("learned_to"),
  recentFrom: integer("recent_from"),
  skipped: integer("skipped", { mode: "boolean" }).notNull().default(false),
})

export const textbookQuestionLinks = sqliteTable("textbook_question_links", {
  questionId: integer("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  chapterId: text("chapter_id").notNull().references(() => textbookChapters.id),
  through: integer("through"),
}, table => [primaryKey({ columns: [table.questionId, table.chapterId] })])

export const paperAttempts = sqliteTable("paper_attempts", {
  id: text("id").primaryKey(),
  paperId: text("paper_id").notNull().references(() => papers.id),
  mode: text("mode", { enum: ["practice", "exam"] }).notNull(),
  startedAt: integer("started_at").notNull(),
  expiresAt: integer("expires_at"),
  submittedAt: integer("submitted_at"),
  answers: text("answers").notNull().default("{}"),
  marked: text("marked").notNull().default("[]"),
  results: text("results"),
})

export const aiCache = sqliteTable("ai_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: integer("question_id").references(() => questions.id),
  model: text("model").notNull(),
  cacheKey: text("cache_key"),
  response: text("response").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
})

export const favorites = sqliteTable("favorites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: integer("question_id").references(() => questions.id).unique(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
})

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type Subject = typeof subjects.$inferSelect
export type NewSubject = typeof subjects.$inferInsert
export type KnowledgePoint = typeof knowledgePoints.$inferSelect
export type NewKnowledgePoint = typeof knowledgePoints.$inferInsert
export type Question = typeof questions.$inferSelect
export type NewQuestion = typeof questions.$inferInsert
export type PracticeRecord = typeof practiceRecords.$inferSelect
export type NewPracticeRecord = typeof practiceRecords.$inferInsert
export type AiCache = typeof aiCache.$inferSelect
export type NewAiCache = typeof aiCache.$inferInsert
export type Favorite = typeof favorites.$inferSelect
export type NewFavorite = typeof favorites.$inferInsert
