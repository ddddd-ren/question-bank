import { db, sqliteDb } from "."
import {
  questions,
  categories,
  subjects,
  knowledgePoints,
  practiceRecords,
  aiCache,
  favorites,
  type Question,
  type NewQuestion,
  type Category,
  type NewCategory,
  type Subject,
  type NewSubject,
  type KnowledgePoint,
  type NewKnowledgePoint,
  type PracticeRecord,
  type NewPracticeRecord,
} from "./schema"
import { eq, and, like, desc, sql, count, inArray } from "drizzle-orm"
import { type QuestionType, isQuestionType } from "@/lib/types"

// Questions CRUD
export async function createQuestion(data: NewQuestion): Promise<Question> {
  const [result] = await db.insert(questions).values(data).returning()
  return result
}

export async function createQuestionsBatch(data: NewQuestion[]): Promise<Question[]> {
  return await db.insert(questions).values(data).returning()
}

export async function getQuestionById(id: number): Promise<Question | undefined> {
  return await db.query.questions.findFirst({
    where: eq(questions.id, id),
  })
}

export async function getQuestions(options?: {
  type?: string
  categoryId?: number
  subjectId?: number
  knowledgePointId?: number
  search?: string
  page?: number
  pageSize?: number
  hasAnswer?: boolean
  recentDays?: number
}): Promise<{ data: Question[]; total: number }> {
  const { type, categoryId, subjectId, knowledgePointId, search, page = 1, pageSize = 20 } = options || {}

  const whereConditions = []

  if (type) {
    whereConditions.push(eq(questions.type, type as QuestionType))
  }
  if (categoryId) {
    whereConditions.push(eq(questions.categoryId, categoryId))
  }
  if (subjectId) {
    whereConditions.push(eq(questions.subjectId, subjectId))
  }
  if (knowledgePointId) {
    whereConditions.push(eq(questions.knowledgePointId, knowledgePointId))
  }
  if (search) {
    whereConditions.push(like(questions.content, `%${search}%`))
  }
  if (options?.hasAnswer) {
    whereConditions.push(sql`${questions.answer} IS NOT NULL AND ${questions.answer} != ''`)
  }
  if (options?.recentDays) {
    whereConditions.push(sql`${questions.createdAt} >= datetime('now', '-${options.recentDays} days')`)
  }

  const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined

  const [totalResult] = await db
    .select({ count: count() })
    .from(questions)
    .where(whereClause)

  const data = await db.query.questions.findMany({
    where: whereClause,
    orderBy: [desc(questions.createdAt)],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })

  return { data, total: totalResult.count }
}

export async function getRandomQuestions(options?: {
  type?: string
  categoryId?: number
  subjectId?: number
  knowledgePointId?: number
  count?: number
}): Promise<Question[]> {
  const { type, categoryId, subjectId, knowledgePointId, count: limit = 10 } = options || {}

  const conditions = []
  if (type) {
    conditions.push(`type = '${type.replace(/'/g, "''")}'`)
  }
  if (categoryId) {
    conditions.push(`category_id = ${categoryId}`)
  }
  if (subjectId) {
    conditions.push(`subject_id = ${subjectId}`)
  }
  if (knowledgePointId) {
    conditions.push(`knowledge_point_id = ${knowledgePointId}`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const rows = sqliteDb
    .prepare(`SELECT * FROM questions ${whereClause} ORDER BY RANDOM() LIMIT ?`)
    .all(limit) as Question[]

  return rows
}

const questionByHashStmt = sqliteDb.prepare(
  "SELECT * FROM questions WHERE content_hash = ?"
)

export async function getQuestionByHash(contentHash: string): Promise<Question | undefined> {
  return questionByHashStmt.get(contentHash) as Question | undefined
}

export async function getQuestionsByHashes(hashes: string[]): Promise<Question[]> {
  if (hashes.length === 0) return []
  return await db.query.questions.findMany({
    where: inArray(questions.contentHash, hashes),
  })
}

export async function getQuestionsByIds(ids: number[]): Promise<Question[]> {
  if (ids.length === 0) return []
  return await db.query.questions.findMany({
    where: inArray(questions.id, ids),
  })
}

export async function updateQuestion(id: number, data: Partial<NewQuestion>): Promise<Question | undefined> {
  const [result] = await db
    .update(questions)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(questions.id, id))
    .returning()
  return result
}

export async function deleteQuestion(id: number): Promise<boolean> {
  const result = await db.delete(questions).where(eq(questions.id, id))
  return result.changes > 0
}

// Categories CRUD
export async function createCategory(data: NewCategory): Promise<Category> {
  const [result] = await db.insert(categories).values(data).returning()
  return result
}

export async function getCategories(): Promise<Category[]> {
  return await db.query.categories.findMany({
    orderBy: [categories.name],
  })
}

export async function getCategoryById(id: number): Promise<Category | undefined> {
  return await db.query.categories.findFirst({
    where: eq(categories.id, id),
  })
}

export async function deleteCategory(id: number): Promise<boolean> {
  const result = await db.delete(categories).where(eq(categories.id, id))
  return result.changes > 0
}

// Subjects CRUD
export async function createSubject(data: NewSubject): Promise<Subject> {
  const [result] = await db.insert(subjects).values(data).returning()
  return result
}

export async function getSubjects(): Promise<Subject[]> {
  return await db.query.subjects.findMany({
    orderBy: [subjects.name],
  })
}

export async function getSubjectById(id: number): Promise<Subject | undefined> {
  return await db.query.subjects.findFirst({
    where: eq(subjects.id, id),
  })
}

export async function updateSubject(id: number, data: Partial<NewSubject>): Promise<Subject | undefined> {
  const [result] = await db
    .update(subjects)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(subjects.id, id))
    .returning()
  return result
}

export async function getSubjectUsage(id: number): Promise<{ knowledgePointCount: number; questionCount: number }> {
  const knowledgePointCount = sqliteDb
    .prepare("SELECT count(*) AS count FROM knowledge_points WHERE subject_id = ?")
    .get(id) as { count: number }

  const questionCount = sqliteDb
    .prepare("SELECT count(*) AS count FROM questions WHERE subject_id = ?")
    .get(id) as { count: number }

  return {
    knowledgePointCount: knowledgePointCount.count,
    questionCount: questionCount.count,
  }
}

export async function deleteSubject(id: number): Promise<boolean> {
  const result = await db.delete(subjects).where(eq(subjects.id, id))
  return result.changes > 0
}

// Knowledge Points CRUD
export async function createKnowledgePoint(data: NewKnowledgePoint): Promise<KnowledgePoint> {
  const [result] = await db.insert(knowledgePoints).values(data).returning()
  return result
}

export async function getKnowledgePoints(options?: { subjectId?: number }): Promise<KnowledgePoint[]> {
  const whereClause = options?.subjectId ? eq(knowledgePoints.subjectId, options.subjectId) : undefined

  return await db.query.knowledgePoints.findMany({
    where: whereClause,
    orderBy: [knowledgePoints.subjectId, knowledgePoints.parentId, knowledgePoints.name],
  })
}

export async function getKnowledgePointById(id: number): Promise<KnowledgePoint | undefined> {
  return await db.query.knowledgePoints.findFirst({
    where: eq(knowledgePoints.id, id),
  })
}

export async function updateKnowledgePoint(id: number, data: Partial<NewKnowledgePoint>): Promise<KnowledgePoint | undefined> {
  const [result] = await db
    .update(knowledgePoints)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(knowledgePoints.id, id))
    .returning()
  return result
}

export async function getKnowledgePointUsage(id: number): Promise<{ childCount: number; questionCount: number }> {
  const childCount = sqliteDb
    .prepare("SELECT count(*) AS count FROM knowledge_points WHERE parent_id = ?")
    .get(id) as { count: number }

  const questionCount = sqliteDb
    .prepare("SELECT count(*) AS count FROM questions WHERE knowledge_point_id = ?")
    .get(id) as { count: number }

  return {
    childCount: childCount.count,
    questionCount: questionCount.count,
  }
}

export async function deleteKnowledgePoint(id: number): Promise<boolean> {
  const result = await db.delete(knowledgePoints).where(eq(knowledgePoints.id, id))
  return result.changes > 0
}

// Practice Records
export async function createPracticeRecord(data: NewPracticeRecord): Promise<PracticeRecord> {
  const [result] = await db.insert(practiceRecords).values(data).returning()
  return result
}

const practiceStatsStmt = sqliteDb.prepare(
  "SELECT count(*) AS total, sum(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct FROM practice_records"
)

export async function getPracticeStats(): Promise<{
  total: number
  correct: number
  accuracy: number
}> {
  const result = practiceStatsStmt.get() as { total: number; correct: number | null }

  const total = result.total
  const correct = result.correct || 0
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0

  return { total, correct, accuracy }
}

// AI Cache
export async function getAiCache(questionId: number, model: string) {
  return await db.query.aiCache.findFirst({
    where: and(
      eq(aiCache.questionId, questionId),
      eq(aiCache.model, model)
    ),
  })
}

export async function setAiCache(questionId: number, model: string, response: string) {
  return await db.insert(aiCache).values({ questionId, model, response })
}

// Stats
export async function getQuestionStats() {
  const totalStmt = sqliteDb.prepare("SELECT count(*) AS count FROM questions")
  const typeStmt = sqliteDb.prepare("SELECT type, count(*) AS count FROM questions GROUP BY type")
  const categoryStmt = sqliteDb.prepare("SELECT count(*) AS count FROM categories")

  const totalResult = totalStmt.get() as { count: number }
  const typeStats = typeStmt.all() as { type: QuestionType; count: number }[]
  const categoryCount = categoryStmt.get() as { count: number }

  return {
    total: totalResult.count,
    byType: typeStats,
    categoryCount: categoryCount.count,
  }
}

// Recent activity
export async function getRecentActivity(limit = 5) {
  return await db
    .select({
      id: practiceRecords.id,
      questionId: practiceRecords.questionId,
      isCorrect: practiceRecords.isCorrect,
      timeSpent: practiceRecords.timeSpent,
      createdAt: practiceRecords.createdAt,
      questionContent: sql<string>`substr(${questions.content}, 1, 80)`,
      questionType: questions.type,
    })
    .from(practiceRecords)
    .leftJoin(questions, eq(practiceRecords.questionId, questions.id))
    .orderBy(desc(practiceRecords.createdAt))
    .limit(limit)
}

// Daily practice stats for the last 7 days
export async function getDailyStats(days = 7) {
  return sqliteDb
    .prepare(`
      SELECT
        date(created_at) AS date,
        count(*) AS total,
        sum(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
      FROM practice_records
      WHERE created_at >= datetime('now', ?)
      GROUP BY date(created_at)
      ORDER BY date(created_at)
    `)
    .all(`-${days} days`) as { date: string; total: number; correct: number | null }[]
}

// Favorites
const favoriteByQuestionStmt = sqliteDb.prepare(
  "SELECT * FROM favorites WHERE question_id = ?"
)

export async function getFavoriteByQuestionId(questionId: number) {
  return favoriteByQuestionStmt.get(questionId) as { id: number; questionId: number; createdAt: string } | undefined
}

export async function toggleFavorite(questionId: number): Promise<boolean> {
  const existing = await getFavoriteByQuestionId(questionId)
  if (existing) {
    await db.delete(favorites).where(eq(favorites.questionId, questionId))
    return false
  }
  await db.insert(favorites).values({ questionId })
  return true
}

export async function getFavorites(options?: {
  type?: string
  search?: string
  page?: number
  pageSize?: number
}) {
  const { type, search, page = 1, pageSize = 20 } = options || {}

  const conditions = []
  if (type && type !== "all" && isQuestionType(type)) {
    conditions.push(eq(questions.type, type))
  }
  if (search) {
    conditions.push(like(questions.content, `%${search}%`))
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const data = await db
    .select({
      id: favorites.id,
      questionId: favorites.questionId,
      createdAt: favorites.createdAt,
      questionContent: questions.content,
      questionType: questions.type,
      questionAnswer: questions.answer,
    })
    .from(favorites)
    .leftJoin(questions, eq(favorites.questionId, questions.id))
    .where(whereClause)
    .orderBy(desc(favorites.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(favorites)
    .leftJoin(questions, eq(favorites.questionId, questions.id))
    .where(whereClause)

  return { data, total: totalResult.count, page, pageSize, totalPages: Math.max(1, Math.ceil(totalResult.count / pageSize)) }
}

// Mistakes (wrong practice records)
export async function getMistakes(options?: {
  type?: string
  search?: string
  page?: number
  pageSize?: number
}) {
  const { type, search, page = 1, pageSize = 20 } = options || {}

  const conditions = [eq(practiceRecords.isCorrect, false)]
  if (type && type !== "all" && isQuestionType(type)) {
    conditions.push(eq(questions.type, type))
  }
  if (search) {
    conditions.push(like(questions.content, `%${search}%`))
  }
  const whereClause = and(...conditions)

  const data = await db
    .select({
      id: practiceRecords.id,
      questionId: practiceRecords.questionId,
      userAnswer: practiceRecords.userAnswer,
      timeSpent: practiceRecords.timeSpent,
      createdAt: practiceRecords.createdAt,
      questionContent: questions.content,
      questionType: questions.type,
      questionOptions: questions.options,
      questionAnswer: questions.answer,
    })
    .from(practiceRecords)
    .leftJoin(questions, eq(practiceRecords.questionId, questions.id))
    .where(whereClause)
    .orderBy(desc(practiceRecords.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(practiceRecords)
    .leftJoin(questions, eq(practiceRecords.questionId, questions.id))
    .where(whereClause)

  return { data, total: totalResult.count, page, pageSize, totalPages: Math.max(1, Math.ceil(totalResult.count / pageSize)) }
}

export async function deletePracticeRecord(id: number): Promise<boolean> {
  const result = await db.delete(practiceRecords).where(eq(practiceRecords.id, id))
  return result.changes > 0
}


// Wrong questions for re-practice
export async function getWrongQuestions(options?: {
  type?: string
  count?: number
}): Promise<Question[]> {
  const { type, count: limit = 20 } = options || {}

  let query = `
    SELECT q.* FROM questions q
    INNER JOIN (
      SELECT question_id, MAX(created_at) as latest
      FROM practice_records
      WHERE is_correct = 0
      GROUP BY question_id
      ORDER BY latest DESC
      LIMIT ?
    ) pr ON q.id = pr.question_id
  `

  const params: (string | number)[] = [limit]

  if (type && type !== "all") {
    query = `
      SELECT q.* FROM questions q
      INNER JOIN (
        SELECT question_id, MAX(created_at) as latest
        FROM practice_records
        WHERE is_correct = 0
        GROUP BY question_id
        ORDER BY latest DESC
      ) pr ON q.id = pr.question_id
      WHERE q.type = ?
      LIMIT ?
    `
    params.unshift(type)
  }

  return sqliteDb.prepare(query).all(...params) as Question[]
}

const wrongQuestionCountStmt = sqliteDb.prepare(
  "SELECT count(DISTINCT question_id) AS count FROM practice_records WHERE is_correct = 0"
)

export async function getWrongQuestionCount(): Promise<number> {
  const result = wrongQuestionCountStmt.get() as { count: number }
  return result.count
}