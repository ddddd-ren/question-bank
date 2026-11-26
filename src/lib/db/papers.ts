import { randomUUID } from "node:crypto"
import { sqliteDb } from "./index"
import type { SerializedQuestion } from "./serialize"
import { ApiError } from "../api-error"
import { gradePracticeAnswer } from "../answer-grading"
import { saveLearningRecord } from "./learning"
import type { PaperTemplateSnapshot } from "../paper/template"
import { PaperSaveConflict, type PaperSave } from "../paper/autosave"

export interface SavedPaper { id: string; title: string; questions: SerializedQuestion[]; createdAt: number; template?: PaperTemplateSnapshot }
export interface PaperAttempt {
  id: string; paperId: string; mode: "practice" | "exam"; startedAt: number; expiresAt: number | null
  submittedAt: number | null; answers: Record<string, string>; marked: number[]
  results: Record<string, { value: string; isCorrect: boolean | null }> | null
  paper: SavedPaper; serverNow: number
}
type AttemptRow = Omit<PaperAttempt, "answers" | "marked" | "results" | "paper" | "serverNow"> & { answers: string; marked: string; results: string | null }

export function savePaper(title: string, questions: SerializedQuestion[], template?: PaperTemplateSnapshot): SavedPaper {
  const id = randomUUID(), createdAt = Date.now()
  sqliteDb.prepare("INSERT INTO papers(id,title,snapshot,created_at,template) VALUES(?,?,?,?,?)").run(id, title, JSON.stringify(questions), createdAt, template ? JSON.stringify(template) : null)
  return getPaper(id)
}
export function getPaper(id: string): SavedPaper {
  const row = sqliteDb.prepare("SELECT id,title,snapshot,created_at AS createdAt,template FROM papers WHERE id=?").get(id) as { id: string; title: string; snapshot: string; createdAt: number; template: string | null } | undefined
  if (!row) throw new ApiError(404, "试卷不存在")
  return { id: row.id, title: row.title, createdAt: row.createdAt, questions: JSON.parse(row.snapshot), ...(row.template && { template: JSON.parse(row.template) }) }
}
export function listPapers() {
  return sqliteDb.prepare("SELECT id,title,created_at AS createdAt,json_array_length(snapshot) AS total FROM papers ORDER BY created_at DESC").all()
}
export function listAttempts(paperId: string) {
  return sqliteDb.prepare("SELECT id,mode,started_at AS startedAt,submitted_at AS submittedAt FROM paper_attempts WHERE paper_id=? ORDER BY started_at DESC").all(paperId)
}
export function startAttempt(paperId: string, mode: "practice" | "exam", minutes = 60) {
  getPaper(paperId)
  const id = randomUUID(), now = Date.now()
  sqliteDb.prepare("INSERT INTO paper_attempts(id,paper_id,mode,started_at,expires_at) VALUES(?,?,?,?,?)").run(id, paperId, mode, now, mode === "exam" ? now + minutes * 60000 : null)
  return getAttempt(id)
}
export function getAttempt(id: string): PaperAttempt { return updateAttempt(id, {}) }

export function updateAttempt(id: string, change: PaperSave & { selfAssessment?: { questionId: number; isCorrect: boolean } }): PaperAttempt {
  return sqliteDb.transaction(() => {
    const row = sqliteDb.prepare("SELECT id,paper_id AS paperId,mode,started_at AS startedAt,expires_at AS expiresAt,submitted_at AS submittedAt,answers,marked,results FROM paper_attempts WHERE id=?").get(id) as AttemptRow | undefined
    if (!row) throw new ApiError(404, "作答记录不存在")
    const paper = getPaper(row.paperId), now = Date.now()
    const answers: Record<string, string> = JSON.parse(row.answers)
    const marked = new Set<number>(JSON.parse(row.marked))
    let results: PaperAttempt["results"] = row.results ? JSON.parse(row.results) : null
    const expired = row.expiresAt !== null && now >= row.expiresAt
    if (change.selfAssessment) {
      if (!row.submittedAt || !results) throw new ApiError(400, "交卷后才能自评")
      const { questionId, isCorrect } = change.selfAssessment
      const question = paper.questions.find(q => q.id === questionId)
      const result = results[questionId]
      if (!question || !result || !["calculation", "essay", "code"].includes(question.type) || gradePracticeAnswer(question.type, question.answer, result.value) !== null) {
        throw new ApiError(400, "仅支持对已交卷的待评主观题自评")
      }
      if (result.isCorrect !== null) {
        if (result.isCorrect !== isCorrect) throw new ApiError(409, "本题已经完成自评")
      } else {
        saveLearningRecord({ attemptKey: `paper:${id}:${questionId}`, questionId, userAnswer: result.value, isCorrect: null, selfAssessment: isCorrect })
        result.isCorrect = isCorrect
        sqliteDb.prepare("UPDATE paper_attempts SET results=? WHERE id=?").run(JSON.stringify(results), id)
      }
    }
    if (!row.submittedAt) {
      const edits = expired ? [] : change.edits ?? []
      if (edits.length) {
        const ids = new Set(paper.questions.map(q => q.id))
        for (const edit of edits) {
          if (!ids.has(edit.questionId)) throw new ApiError(400, "改动包含试卷外的题目")
          if (edit.answer) {
            const current = answers[edit.questionId] ?? ""
            if (current !== edit.answer.from && current !== edit.answer.to) {
              throw new PaperSaveConflict(edit.questionId, current)
            }
            answers[edit.questionId] = edit.answer.to
          }
          if (edit.marked === true) marked.add(edit.questionId)
          if (edit.marked === false) marked.delete(edit.questionId)
        }
      }
      if (expired || change.submit) {
        results = {}
        for (const q of paper.questions) {
          const value = answers[q.id] || ""
          const isCorrect = gradePracticeAnswer(q.type, q.answer, value)
          results[q.id] = { value, isCorrect }
          saveLearningRecord({ attemptKey: `paper:${id}:${q.id}`, questionId: q.id, userAnswer: value, isCorrect, timeSpent: Math.floor((Math.min(now, row.expiresAt ?? now) - row.startedAt) / 1000 / paper.questions.length) })
        }
        row.submittedAt = expired ? row.expiresAt : now
      }
      if (edits.length || row.submittedAt !== null) {
        sqliteDb.prepare("UPDATE paper_attempts SET answers=?,marked=?,results=?,submitted_at=? WHERE id=?").run(JSON.stringify(answers), JSON.stringify([...marked]), results ? JSON.stringify(results) : null, row.submittedAt, id)
      }
    }
    return { ...row, answers, marked: [...marked], results, paper: { ...paper, questions: paper.questions.map(q => row.submittedAt ? q : { ...q, answer: null, explanation: null }) }, serverNow: now }
  }).immediate()
}
