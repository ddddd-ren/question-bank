"use client"

import { useState, useCallback, useRef } from "react"

export interface Question {
  id: number
  type: string
  content: string
  options: string[] | null
  answer: string | null
  explanation?: string | null
}

interface RawQuestion extends Omit<Question, "options"> {
  options: string[] | string | null
}

export interface AnswerRecord {
  questionId: number
  questionContent: string
  userAnswer: string
  correctAnswer: string | null
  isCorrect: boolean
  timeSpent: number
}

export function usePracticeSession() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [textAnswer, setTextAnswer] = useState("")
  const [showResult, setShowResult] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [streak, setStreak] = useState(0)
  const [totalCorrect, setTotalCorrect] = useState(0)
  const [records, setRecords] = useState<AnswerRecord[]>([])
  const [showReview, setShowReview] = useState(false)
  const [practiceMode, setPracticeMode] = useState<string>("normal")
  const [timerRunning, setTimerRunning] = useState(false)
  const [currentQuestionTime, setCurrentQuestionTime] = useState(0)
  const questionStartTime = useRef<number>(0)

  const currentQuestion = questions[currentIndex]
  const isLastQuestion = currentIndex >= questions.length - 1

  const fetchQuestions = useCallback(async (typeFilter: string, mode?: string) => {
    setPracticeMode(mode || "normal")
    setLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams({ count: "20" })
      if (mode) params.set("mode", mode)
      if (typeFilter && typeFilter !== "all") params.set("type", typeFilter)

      const response = await fetch(`/api/practice?${params}`)
      if (!response.ok) throw new Error("获取题目失败")

      const data = await response.json()
      const parsedQuestions = data.data.map((q: RawQuestion) => ({
        ...q,
        options: Array.isArray(q.options) ? q.options : (q.options ? JSON.parse(q.options) : null),
      }))
      setQuestions(parsedQuestions)
      setCurrentIndex(0)
      setSelectedAnswer(null)
      setTextAnswer("")
      setShowResult(false)
      setShowAnswer(false)
      setIsCorrect(null)
      setStreak(0)
      setTotalCorrect(0)
      setRecords([])
      setShowReview(false)
      setTimerRunning(true)
      questionStartTime.current = Date.now()
      setCurrentQuestionTime(0)
      return true
    } catch (error) {
      console.error("Failed to fetch questions:", error)
      setLoadError(error instanceof Error ? error.message : "获取题目失败")
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const submitAnswer = useCallback((answer: string, timeSpent: number) => {
    if (showResult || !currentQuestion) return

    setSelectedAnswer(answer)
    setShowResult(true)
    setTimerRunning(false)

    const correct = currentQuestion.answer?.toUpperCase().includes(answer.toUpperCase()) ?? false
    setIsCorrect(correct)

    if (correct) {
      setStreak(prev => prev + 1)
      setTotalCorrect(prev => prev + 1)
    } else {
      setStreak(0)
    }

    const record: AnswerRecord = {
      questionId: currentQuestion.id,
      questionContent: currentQuestion.content.substring(0, 50),
      userAnswer: answer,
      correctAnswer: currentQuestion.answer,
      isCorrect: correct,
      timeSpent,
    }
    setRecords(prev => [...prev, record])

    fetch("/api/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: currentQuestion.id,
        userAnswer: answer,
        isCorrect: correct,
        timeSpent,
      }),
    }).catch(console.error)
  }, [showResult, currentQuestion])

  const goNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1)
      setSelectedAnswer(null)
      setTextAnswer("")
      setShowResult(false)
      setShowAnswer(false)
      setIsCorrect(null)
      setTimerRunning(true)
      questionStartTime.current = Date.now()
      setCurrentQuestionTime(0)
    }
  }, [currentIndex, questions.length])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
      setSelectedAnswer(null)
      setTextAnswer("")
      setShowResult(false)
      setShowAnswer(false)
      setIsCorrect(null)
    }
  }, [currentIndex])

  const toggleAnswer = useCallback(() => {
    setShowAnswer(prev => !prev)
  }, [])

  const toggleReview = useCallback(() => {
    setShowReview(prev => !prev)
  }, [])

  return {
    questions,
    currentIndex,
    currentQuestion,
    isLastQuestion,
    selectedAnswer,
    textAnswer,
    setTextAnswer,
    showResult,
    showAnswer,
    isCorrect,
    loading,
    loadError,
    streak,
    totalCorrect,
    records,
    showReview,
    timerRunning,
    currentQuestionTime,
    setCurrentQuestionTime,
    practiceMode,
    fetchQuestions,
    submitAnswer,
    goNext,
    goPrev,
    toggleAnswer,
    toggleReview,
  }
}
