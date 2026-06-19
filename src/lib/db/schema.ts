import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
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
  sourceFile: text("source_file"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
})

export const practiceRecords = sqliteTable("practice_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: integer("question_id").references(() => questions.id),
  userAnswer: text("user_answer"),
  isCorrect: integer("is_correct", { mode: "boolean" }),
  timeSpent: integer("time_spent"), // seconds
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
})

export const aiCache = sqliteTable("ai_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: integer("question_id").references(() => questions.id),
  model: text("model").notNull(),
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
