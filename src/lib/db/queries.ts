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
import { eq, and, like, desc, sql, count, inArray, isNull } from "drizzle-orm"
import { type QuestionType, isQuestionType } from "@/lib/types"
import { shouldUseFullTextSearch, toFtsPhrase } from "./search"
import { questionFingerprint } from "@/lib/question-fingerprint"

const SQLITE_IN_CHUNK_SIZE = 500
const SQLITE_INSERT_CHUNK_SIZE = 400

const QUESTION_COLUMNS = [
  "id",
  "type",
  "content",
  "options",
  "answer",
  "explanation",
  "category_id AS categoryId",
  "subject_id AS subjectId",
  "knowledge_point_id AS knowledgePointId",
  "difficulty",
  "tags",
  "content_hash AS contentHash",
  "fingerprint",
  "archived_at AS archivedAt",
  "source_file AS sourceFile",
  "source_page AS sourcePage",
  "created_at AS createdAt",
  "updated_at AS updatedAt",
]

const QUESTION_SELECT_COLUMNS = QUESTION_COLUMNS.join(", ")

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

// Questions CRUD
export async function createQuestion(data: NewQuestion): Promise<Question> {
  const [result] = await db.insert(questions).values({
    ...data,
    contentHash: questionFingerprint(data),
    fingerprint: questionFingerprint(data),
  }).returning()
  return result
}

export async function createQuestionsBatch(data: NewQuestion[]): Promise<Question[]> {
  return insertQuestionsBatch(data)
}

export function insertQuestionsBatch(data: NewQuestion[]): Question[] {
  if (data.length === 0) return []

  const created: Question[] = []
  const insertAll = sqliteDb.transaction((items: NewQuestion[]) => {
    for (const batch of chunkArray(items, SQLITE_INSERT_CHUNK_SIZE)) {
      created.push(...db.insert(questions).values(batch.map((item) => ({
        ...item,
        contentHash: questionFingerprint(item),
        fingerprint: questionFingerprint(item),
      }))).returning().prepare().all())
    }
  })
  insertAll(data)
  return created
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
  difficulty?: number
}): Promise<{ data: Question[]; total: number }> {
  const { type, categoryId, subjectId, knowledgePointId, search, page = 1, pageSize = 20 } = options || {}

  const whereConditions = [isNull(questions.archivedAt)]
  if (options?.difficulty) whereConditions.push(eq(questions.difficulty, options.difficulty))

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
    const normalizedSearch = search.trim()
    if (shouldUseFullTextSearch(normalizedSearch)) {
      whereConditions.push(sql`${questions.id} IN (
        SELECT rowid FROM questions_fts
        WHERE questions_fts MATCH ${toFtsPhrase(normalizedSearch)}
      )`)
    } else if (normalizedSearch) {
      whereConditions.push(like(questions.content, `%${normalizedSearch}%`))
    }
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
  difficulty?: number
  unansweredFirst?: boolean
}): Promise<Question[]> {
  const { type, categoryId, subjectId, knowledgePointId, count = 10 } = options || {}
  const limit = Math.min(100, Math.max(1, Math.floor(count)))

  if (type && !isQuestionType(type)) return []

  const conditions: string[] = ["archived_at IS NULL"]
  const params: (string | number)[] = []
  if (options?.difficulty) {
    conditions.push("difficulty = ?")
    params.push(options.difficulty)
  }
  if (type) {
    conditions.push("type = ?")
    params.push(type)
  }
  if (categoryId) {
    conditions.push("category_id = ?")
    params.push(categoryId)
  }
  if (subjectId) {
    conditions.push("subject_id = ?")
    params.push(subjectId)
  }
  if (knowledgePointId) {
    conditions.push("knowledge_point_id = ?")
    params.push(knowledgePointId)
  }

  const answered = options?.unansweredFirst
    ? "EXISTS(SELECT 1 FROM practice_records p WHERE p.question_id = questions.id)"
    : "0"
  return sqliteDb.prepare(`
    WITH picked AS MATERIALIZED (
      SELECT id AS picked_id, ${answered} AS answered, random() AS draw
      FROM questions WHERE ${conditions.join(" AND ")}
      ORDER BY answered, draw
      LIMIT ?
    )
    SELECT ${QUESTION_SELECT_COLUMNS}
    FROM picked JOIN questions ON questions.id = picked.picked_id
    ORDER BY picked.answered, picked.draw
  `).all(...params, limit) as Question[]
}

const questionByHashStmt = sqliteDb.prepare(
  `SELECT ${QUESTION_SELECT_COLUMNS} FROM questions WHERE fingerprint = ?`
)

export async function getQuestionByHash(contentHash: string): Promise<Question | undefined> {
  return questionByHashStmt.get(contentHash) as Question | undefined
}

export async function getQuestionsByHashes(hashes: string[]): Promise<Question[]> {
  if (hashes.length === 0) return []

  const found: Question[] = []
  for (const batch of chunkArray(Array.from(new Set(hashes)), SQLITE_IN_CHUNK_SIZE)) {
    found.push(...await db.query.questions.findMany({
      where: inArray(questions.fingerprint, batch),
    }))
  }
  return found
}

export async function getQuestionsByIds(ids: number[]): Promise<Question[]> {
  if (ids.length === 0) return []

  const found: Question[] = []
  for (const batch of chunkArray(Array.from(new Set(ids)), SQLITE_IN_CHUNK_SIZE)) {
    found.push(...await db.query.questions.findMany({
      where: and(inArray(questions.id, batch), isNull(questions.archivedAt)),
    }))
  }
  return found
}

export async function updateQuestion(id: number, data: Partial<NewQuestion>): Promise<Question | undefined> {
  return sqliteDb.transaction(() => {
    const current = sqliteDb.prepare(`SELECT ${QUESTION_SELECT_COLUMNS} FROM questions WHERE id = ?`).get(id) as Question | undefined
    if (!current) return undefined
    const definedData = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
    const fingerprint = questionFingerprint({ ...current, ...definedData })
    // 旧唯一键附带 ID，既释放编辑前键值，也不合并已有重复历史题。
    return db.update(questions)
      .set({ ...definedData, fingerprint, contentHash: `${fingerprint}:${id}`, updatedAt: new Date().toISOString() })
      .where(eq(questions.id, id)).returning().prepare().all()[0]
  })()
}

export async function deleteQuestion(id: number): Promise<boolean> {
  const result = await db.update(questions).set({ archivedAt: new Date().toISOString() }).where(eq(questions.id, id))
  return result.changes > 0
}

export async function clearQuestions(): Promise<number> {
  return sqliteDb.transaction(() => {
    sqliteDb.prepare("DELETE FROM question_learning").run()
    sqliteDb.prepare("DELETE FROM practice_records").run()
    sqliteDb.prepare("DELETE FROM ai_cache").run()
    sqliteDb.prepare("DELETE FROM favorites").run()
    return (sqliteDb.prepare("DELETE FROM questions").run() as { changes: number }).changes
  })()
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
  "SELECT count(*) AS total, count(is_correct) AS graded, sum(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct FROM practice_records"
)

export async function getPracticeStats(): Promise<{
  total: number
  correct: number
  accuracy: number
  graded: number
  pending: number
}> {
  const result = practiceStatsStmt.get() as { total: number; graded: number; correct: number | null }

  const total = result.total
  const correct = result.correct || 0
  const accuracy = result.graded > 0 ? Math.round((correct / result.graded) * 100) : 0

  return { total, correct, accuracy, graded: result.graded, pending: total - result.graded }
}

// AI Cache
export async function getAiCache(questionId: number, cacheKey: string) {
  return await db.query.aiCache.findFirst({
    where: and(
      eq(aiCache.questionId, questionId),
      eq(aiCache.cacheKey, cacheKey),
    ),
  })
}

export async function setAiCache(questionId: number, model: string, cacheKey: string, response: string) {
  return await db.insert(aiCache).values({ questionId, model, cacheKey, response })
}

// Stats
export async function getQuestionStats() {
  const totalStmt = sqliteDb.prepare("SELECT count(*) AS count FROM questions WHERE archived_at IS NULL")
  const typeStmt = sqliteDb.prepare("SELECT type, count(*) AS count FROM questions WHERE archived_at IS NULL GROUP BY type")
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

  const conditions = [isNull(questions.archivedAt)]
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

  const conditions = [eq(practiceRecords.isCorrect, false),
    sql`${questions.archivedAt} IS NULL`,
    sql`EXISTS (SELECT 1 FROM question_learning l WHERE l.question_id=${questions.id} AND l.status='learning')`,
    sql`${practiceRecords.id} = (SELECT max(p.id) FROM practice_records p WHERE p.question_id=${questions.id} AND p.is_correct=0)`]
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

// Wrong questions for re-practice
export async function getWrongQuestions(options?: { type?: string; count?: number }): Promise<Question[]> {
  const { getReviewQuestions } = await import("./learning")
  return getReviewQuestions({ ...options, count: options?.count ?? 20, mode: "mistakes" })
}

export async function getWrongQuestionCount(): Promise<number> {
  return (sqliteDb.prepare(`SELECT count(*) AS count FROM question_learning l JOIN questions q ON q.id=l.question_id
    WHERE q.archived_at IS NULL AND l.status='learning' AND EXISTS(SELECT 1 FROM practice_records p WHERE p.question_id=q.id AND p.is_correct=0)`).get() as { count: number }).count
}

export async function getSubjectStats() {
  return sqliteDb.prepare(`
    SELECT 
      s.id,
      s.name,
      s.code,
      count(q.id) AS questionCount,
      sum(CASE WHEN q.answer IS NOT NULL AND q.answer != '' THEN 1 ELSE 0 END) AS withAnswer
    FROM subjects s
    LEFT JOIN questions q ON q.subject_id = s.id AND q.archived_at IS NULL
    GROUP BY s.id, s.name, s.code
    ORDER BY questionCount DESC
  `).all() as { id: number; name: string; code: string | null; questionCount: number; withAnswer: number }[]
}

export async function getKnowledgePointStats() {
  return sqliteDb.prepare(`
    SELECT 
      kp.id,
      kp.name,
      kp.subject_id AS subjectId,
      s.name AS subjectName,
      count(q.id) AS questionCount
    FROM knowledge_points kp
    LEFT JOIN questions q ON q.knowledge_point_id = kp.id AND q.archived_at IS NULL
    LEFT JOIN subjects s ON s.id = kp.subject_id
    GROUP BY kp.id, kp.name, kp.subject_id, s.name
    ORDER BY questionCount DESC
    LIMIT 20
  `).all() as { id: number; name: string; subjectId: number; subjectName: string; questionCount: number }[]
}

export async function getDifficultyStats() {
  return sqliteDb.prepare(`
    SELECT 
      difficulty,
      count(*) AS count,
      sum(CASE WHEN answer IS NOT NULL AND answer != '' THEN 1 ELSE 0 END) AS withAnswer
    FROM questions
    WHERE archived_at IS NULL
    GROUP BY difficulty
    ORDER BY difficulty
  `).all() as { difficulty: number; count: number; withAnswer: number }[]
}

export async function getPracticeTrend(days = 30) {
  return sqliteDb.prepare(`
    SELECT 
      date(created_at) AS date,
      count(*) AS total,
      sum(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct,
      round(avg(time_spent), 0) AS avgTime
    FROM practice_records
    WHERE created_at >= datetime('now', ?)
    GROUP BY date(created_at)
    ORDER BY date(created_at)
  `).all(`-${days} days`) as { date: string; total: number; correct: number | null; avgTime: number | null }[]
}
