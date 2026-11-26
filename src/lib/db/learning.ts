import { sqliteDb } from "."
import { gradePracticeAnswer } from "@/lib/answer-grading"
import { ApiError } from "@/lib/api-error"
import { isQuestionType } from "@/lib/types"
import type { PracticeRecord, Question } from "./schema"

interface LearningInput {
  attemptKey: string
  questionId: number
  userAnswer: string
  timeSpent?: number
  selfAssessment?: boolean
  isCorrect?: boolean | null
}

const recordColumns = "id, question_id AS questionId, user_answer AS userAnswer, is_correct AS isCorrect, time_spent AS timeSpent, created_at AS createdAt, attempt_key AS attemptKey"

export function saveLearningRecord(input: LearningInput): PracticeRecord {
  return sqliteDb.transaction(() => {
    const existing = sqliteDb.prepare(`SELECT ${recordColumns} FROM practice_records WHERE attempt_key=?`).get(input.attemptKey) as PracticeRecord | undefined
    const question = sqliteDb.prepare("SELECT id,type,answer FROM questions WHERE id=?").get(input.questionId) as Pick<Question, "id" | "type" | "answer"> | undefined
    if (!question && input.isCorrect === undefined) throw new ApiError(404, "题目不存在")
    if (existing && (existing.questionId !== (question?.id ?? null) || existing.userAnswer !== input.userAnswer)) {
      throw new ApiError(409, "答题标识已用于另一份答案")
    }
    const automatic = input.isCorrect !== undefined ? input.isCorrect : question && isQuestionType(question.type)
      ? gradePracticeAnswer(question.type, question.answer, input.userAnswer) : null
    const grade = automatic === null && input.selfAssessment !== undefined ? input.selfAssessment : automatic
    let id: number
    if (existing) {
      if (existing.isCorrect !== null || grade === null) return { ...existing, isCorrect: existing.isCorrect === null ? null : Boolean(existing.isCorrect) }
      sqliteDb.prepare("UPDATE practice_records SET is_correct=? WHERE id=? AND is_correct IS NULL").run(Number(grade), existing.id)
      id = existing.id
    } else {
      id = Number(sqliteDb.prepare("INSERT INTO practice_records(question_id,user_answer,is_correct,time_spent,attempt_key) VALUES(?,?,?,?,?)")
        .run(question?.id ?? null, input.userAnswer, grade === null ? null : Number(grade), input.timeSpent ?? 0, input.attemptKey).lastInsertRowid)
    }
    const newerGrade = question && sqliteDb.prepare("SELECT 1 FROM practice_records WHERE question_id=? AND id>? AND is_correct IS NOT NULL LIMIT 1").get(question.id, id)
    if (question && grade !== null && !newerGrade) {
      // 简单复习间隔：答错次日，答对三日；不改写任何历史作答。
      sqliteDb.prepare(`INSERT INTO question_learning(question_id,status,next_review_at,updated_at)
        VALUES(?,?,datetime('now',?),CURRENT_TIMESTAMP)
        ON CONFLICT(question_id) DO UPDATE SET status=excluded.status,next_review_at=excluded.next_review_at,updated_at=excluded.updated_at`)
        .run(question.id, grade ? "mastered" : "learning", grade ? "+3 days" : "+1 day")
    }
    const result = sqliteDb.prepare(`SELECT ${recordColumns} FROM practice_records WHERE id=?`).get(id) as PracticeRecord
    return { ...result, isCorrect: result.isCorrect === null ? null : Boolean(result.isCorrect) }
  })()
}

export function setLearningStatus(questionId: number, status: "mastered" | "archived") {
  const question = sqliteDb.prepare("SELECT id FROM questions WHERE id=? AND archived_at IS NULL").get(questionId)
  if (!question) throw new ApiError(404, "题目不存在")
  sqliteDb.prepare(`INSERT INTO question_learning(question_id,status,next_review_at,updated_at)
    VALUES(?,?,CASE WHEN ?='mastered' THEN datetime('now','+3 days') ELSE NULL END,CURRENT_TIMESTAMP)
    ON CONFLICT(question_id) DO UPDATE SET status=excluded.status,next_review_at=excluded.next_review_at,updated_at=excluded.updated_at`)
    .run(questionId, status, status)
}

export function getDueReviewCount(): number {
  return (sqliteDb.prepare(`SELECT count(*) AS count FROM question_learning l JOIN questions q ON q.id=l.question_id
    WHERE q.archived_at IS NULL AND l.status!='archived' AND date(l.next_review_at)<=date('now')`).get() as { count: number }).count
}

export function getReviewQuestions(options: { type?: string; subjectId?: number; knowledgePointId?: number; difficulty?: number; count: number; mode: "due" | "mistakes" }): Question[] {
  const conditions = ["q.archived_at IS NULL", "l.status!='archived'"]
  const values: (number | string)[] = []
  if (options.mode === "due") conditions.push("date(l.next_review_at)<=date('now')")
  else conditions.push("l.status='learning'", "EXISTS(SELECT 1 FROM practice_records p WHERE p.question_id=q.id AND p.is_correct=0)")
  for (const [field, value] of [["type", options.type], ["subject_id", options.subjectId], ["knowledge_point_id", options.knowledgePointId], ["difficulty", options.difficulty]] as const) {
    if (value !== undefined && value !== "all") { conditions.push(`q.${field}=?`); values.push(value) }
  }
  const rows = sqliteDb.prepare(`SELECT q.* FROM questions q JOIN question_learning l ON l.question_id=q.id WHERE ${conditions.join(" AND ")} ORDER BY l.next_review_at,q.id LIMIT ?`).all(...values, options.count) as Record<string, unknown>[]
  return rows.map((q) => ({ ...q, subjectId: q.subject_id, knowledgePointId: q.knowledge_point_id, categoryId: q.category_id, contentHash: q.content_hash, sourceFile: q.source_file, sourcePage: q.source_page, randomKey: q.random_key, createdAt: q.created_at, updatedAt: q.updated_at, archivedAt: q.archived_at })) as Question[]
}

export function getWeakKnowledgePoints() {
  return sqliteDb.prepare(`SELECT k.id,k.name,k.subject_id AS subjectId,count(*) AS graded,
    sum(CASE WHEN p.is_correct=0 THEN 1 ELSE 0 END) AS wrong
    FROM practice_records p JOIN questions q ON q.id=p.question_id JOIN knowledge_points k ON k.id=q.knowledge_point_id
    WHERE p.is_correct IS NOT NULL AND q.archived_at IS NULL GROUP BY k.id
    HAVING sum(CASE WHEN p.is_correct=0 THEN 1 ELSE 0 END)>0
    ORDER BY 1.0*sum(CASE WHEN p.is_correct=0 THEN 1 ELSE 0 END)/count(*) DESC LIMIT 5`).all()
}
