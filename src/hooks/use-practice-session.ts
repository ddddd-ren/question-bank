"use client"

import { useState, useCallback, useRef } from "react"
import { showToast } from "@/components/toast"
import { toggleChoiceSelection } from "@/lib/answer-grading"
import { parsePracticeDraft, recordAnswer, createAnswerRecord, PRACTICE_DRAFT_KEY, type PracticeDraft, type AnswerRecord } from "@/lib/practice-draft"
import type { QuestionType } from "@/lib/types"
export type { Question, AnswerRecord } from "@/lib/practice-draft"

export interface PracticeFilters { subjectId?: number; knowledgePointId?: number; difficulty?: number; count?: number; unansweredFirst?: boolean }

export function usePracticeSession() {
  const [draft, setDraft] = useState<PracticeDraft | null>(null)
  const draftRef = useRef<PracticeDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [storageError, setStorageError] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const [currentQuestionTime, setCurrentQuestionTime] = useState(0)
  const [saving, setSaving] = useState(false)
  const requestId = useRef(0)
  const pending = useRef(new Set<string>())

  const update = useCallback((next: PracticeDraft) => {
    draftRef.current = next
    setDraft(next)
    try { localStorage.setItem(PRACTICE_DRAFT_KEY, JSON.stringify(next)); setStorageError(false) }
    catch { setStorageError(true) }
  }, [])

  const persist = useCallback(async (record: AnswerRecord, sessionId: string) => {
    const key = `practice:${sessionId}:${record.questionId}`
    if (pending.current.has(key)) return
    pending.current.add(key)
    setSaving(true)
    try {
      const response = await fetch("/api/practice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptKey: key, questionId: record.questionId, userAnswer: record.userAnswer, timeSpent: record.timeSpent, selfAssessment: record.selfAssessment }),
      })
      if (!response.ok) throw new Error("保存失败")
      const result = await response.json()
      const current = draftRef.current
      let stillStored = true
      try { stillStored = parsePracticeDraft(localStorage.getItem(PRACTICE_DRAFT_KEY))?.sessionId === sessionId } catch { /* 无存储权限时仍保留当前内存会话。 */ }
      if (current?.sessionId === sessionId && stillStored) {
        update({ ...current, records: recordAnswer(current.records, { ...record, saved: true, isCorrect: result.isCorrect }, true) })
      }
    } catch { showToast("答题记录尚未保存，可点击重试", "error") }
    finally { pending.current.delete(key); setSaving(pending.current.size > 0) }
  }, [update])

  const fetchQuestions = useCallback(async (typeFilter: string, mode = "normal", filters: PracticeFilters = {}, resume = false) => {
    const params = new URLSearchParams({ count: String(filters.count ?? 20), mode })
    if (typeFilter !== "all") params.set("type", typeFilter)
    for (const [key, value] of Object.entries(filters)) if (value !== undefined) params.set(key, String(value))
    const context = params.toString()
    if (!resume && draftRef.current?.records.some(r => !r.saved)) {
      showToast("请先重试保存未同步的答案，再开始新练习", "error")
      return false
    }
    const token = ++requestId.current
    setLoading(true)
    setLoadError(null)
    try {
      if (resume) {
        let saved: PracticeDraft | null = null
        try {
          const raw = localStorage.getItem(PRACTICE_DRAFT_KEY)
          saved = parsePracticeDraft(raw)
          if (raw && !saved) { localStorage.removeItem(PRACTICE_DRAFT_KEY); showToast("练习草稿已损坏，已重新加载题目", "info") }
        } catch { setStorageError(true) }
        const previous = new URLSearchParams(saved?.context)
        const sameScope = previous.get("mode") === mode
          && previous.get("subjectId") === params.get("subjectId")
          && previous.get("knowledgePointId") === params.get("knowledgePointId")
        if (saved && (sameScope || mode === "resume" || saved.records.some(r => !r.saved))) {
          update(saved)
          if (!sameScope && mode !== "resume") showToast("上次练习有未保存答案，已恢复；请先完成保存", "info")
          for (const record of saved.records.filter(r => !r.saved)) void persist(record, saved.sessionId)
          return true
        }
      }
      const response = await fetch(`/api/practice?${params}`, { cache: "no-store" })
      if (!response.ok) throw new Error("获取题目失败")
      const data = await response.json()
      if (token !== requestId.current) return false
      const questions = data.data.map((q: { options: string | string[] | null }) => ({ ...q, options: Array.isArray(q.options) ? q.options : q.options ? JSON.parse(q.options) : null }))
      if (!questions.length) { setLoadError("当前条件没有可练习题目，请调整筛选"); return false }
      update({ version: 1, sessionId: crypto.randomUUID(), context, questions, currentIndex: 0, records: [], inputs: {}, showReview: false })
      setShowAnswer(false)
      setCurrentQuestionTime(0)
      return true
    } catch (error) {
      if (token === requestId.current) setLoadError(error instanceof Error ? error.message : "获取题目失败")
      return false
    } finally { if (token === requestId.current) setLoading(false) }
  }, [persist, update])

  const questions = draft?.questions ?? []
  const currentIndex = draft?.currentIndex ?? 0
  const currentQuestion = questions[currentIndex]
  const currentRecord = draft?.records.find(r => r.questionId === currentQuestion?.id)
  const records = draft?.records ?? []
  const selectedAnswer = currentRecord?.userAnswer ?? draft?.inputs[String(currentQuestion?.id)] ?? null
  const textAnswer = selectedAnswer ?? ""
  const showResult = Boolean(currentRecord)
  const setTextAnswer = useCallback((answer: string) => {
    const current = draftRef.current
    if (!current) return
    const id = current.questions[current.currentIndex].id
    if (current.records.some(r => r.questionId === id)) return
    update({ ...current, inputs: { ...current.inputs, [id]: answer } })
  }, [update])
  const submitAnswer = useCallback((answer: string, timeSpent: number) => {
    const current = draftRef.current
    if (!current) return
    const question = current.questions[current.currentIndex]
    if (current.records.some(r => r.questionId === question.id)) return
    let record: AnswerRecord
    try { record = createAnswerRecord(question, answer, timeSpent) }
    catch (error) {
      const message = error && typeof error === "object" && "issues" in error
        ? (error.issues as { message: string }[])[0]?.message : "答案格式无效，请检查后重试"
      showToast(message || "答案格式无效，请检查后重试", "error")
      return
    }
    update({ ...current, records: recordAnswer(current.records, record) })
    void persist(record, current.sessionId)
  }, [persist, update])
  const selectAnswer = useCallback((answer: string) => {
    if (!currentQuestion || showResult) return
    setTextAnswer(toggleChoiceSelection(currentQuestion.type as QuestionType, selectedAnswer, answer) ?? "")
  }, [currentQuestion, selectedAnswer, setTextAnswer, showResult])
  const goTo = useCallback((index: number) => {
    const current = draftRef.current
    if (!current || index < 0 || index >= current.questions.length) return
    update({ ...current, currentIndex: index, showReview: false })
    setShowAnswer(false)
    setCurrentQuestionTime(0)
  }, [update])
  const selfAssess = useCallback((correct: boolean) => {
    const current = draftRef.current
    if (!current) return
    const record = current.records.find(r => r.questionId === current.questions[current.currentIndex].id)
    if (!record || record.isCorrect !== null || pending.current.size) return
    const assessed = { ...record, isCorrect: correct, selfAssessment: correct, saved: false }
    update({ ...current, records: recordAnswer(current.records, assessed, true) })
    void persist(assessed, current.sessionId)
  }, [persist, update])
  const retrySave = useCallback(() => {
    const current = draftRef.current
    if (!current) return
    update(current)
    for (const record of current.records.filter(r => !r.saved)) void persist(record, current.sessionId)
  }, [persist, update])
  const totalCorrect = records.filter(r => r.isCorrect === true).length
  let streak = 0
  for (const record of records) streak = record.isCorrect === true ? streak + 1 : 0
  return {
    questions, currentIndex, currentQuestion, isLastQuestion: currentIndex >= questions.length - 1,
    selectedAnswer, textAnswer, setTextAnswer, showResult, showAnswer, isCorrect: currentRecord?.isCorrect ?? null,
    loading, loadError, storageError, saving, unsavedCount: records.filter(r => !r.saved).length, retrySave, selfAssess,
    streak, totalCorrect, gradedCount: records.filter(r => r.isCorrect !== null).length, records,
    showReview: draft?.showReview ?? false, timerRunning: !!currentQuestion && !showResult && !draft?.showReview,
    currentQuestionTime, setCurrentQuestionTime, fetchQuestions, submitAnswer, selectAnswer,
    goNext: () => goTo(currentIndex + 1), goPrev: () => goTo(currentIndex - 1), goTo,
    toggleAnswer: () => setShowAnswer(value => !value),
    toggleReview: () => { if (draftRef.current) update({ ...draftRef.current, showReview: !draftRef.current.showReview }) },
  }
}
