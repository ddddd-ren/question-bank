"use client"

import { Suspense, useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RotateCcw, Loader2, Target, Flame, Play, Terminal, Zap, AlertTriangle } from "lucide-react"
import { useAiStream } from "@/hooks/use-ai-stream"
import { usePracticeSession } from "@/hooks/use-practice-session"
import { showToast } from "@/components/toast"
import dynamic from "next/dynamic"

const AiResponseCard = dynamic(() => import("@/components/ai-response-card").then(m => ({ default: m.AiResponseCard })), {
  loading: () => <div className="skeleton h-32" />,
  ssr: false,
})
const PracticeQuestion = dynamic(() => import("@/components/practice/practice-question").then(m => ({ default: m.PracticeQuestion })), {
  loading: () => <div className="skeleton h-64" />,
  ssr: false,
})
const PracticeResult = dynamic(() => import("@/components/practice/practice-result").then(m => ({ default: m.PracticeResult })), {
  loading: () => <div className="skeleton h-48" />,
  ssr: false,
})
const PracticeReview = dynamic(() => import("@/components/practice/practice-review").then(m => ({ default: m.PracticeReview })), {
  loading: () => <div className="skeleton h-96" />,
  ssr: false,
})
const PracticeTimer = dynamic(() => import("@/components/practice/practice-timer").then(m => ({ default: m.PracticeTimer })), {
  loading: () => <div className="skeleton h-8 w-20" />,
  ssr: false,
})
const KeyboardHints = dynamic(() => import("@/components/practice/keyboard-hints").then(m => ({ default: m.KeyboardHints })), {
  loading: () => <div className="skeleton h-10" />,
  ssr: false,
})

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="text-center"><p className="text-muted-foreground">加载中...</p></div></div>}>
      <PracticeContent />
    </Suspense>
  )
}

function PracticeContent() {
  const searchParams = useSearchParams()
  const practiceMode = searchParams.get("mode") || "normal"

  const [typeFilter, setTypeFilter] = useState<string>("all")

  // Code execution state
  const [codeOutput, setCodeOutput] = useState<string>("")
  const [codeRunning, setCodeRunning] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)

  const { response: aiResponse, loading: loadingAi, startStream: startAiStream, reset: resetAi } = useAiStream()

  const {
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
    fetchQuestions: fetchSessionQuestions,
    submitAnswer,
    goNext,
    goPrev,
    toggleAnswer,
    toggleReview,
  } = usePracticeSession()

  const fetchQuestions = useCallback(async () => {
    const success = await fetchSessionQuestions(typeFilter, practiceMode)
    if (success) {
      resetAi()
    }
  }, [fetchSessionQuestions, typeFilter, practiceMode, resetAi])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchQuestions()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchQuestions])

  const handleAnswer = useCallback((answer: string) => {
    if (showResult || !currentQuestion) return
    submitAnswer(answer, currentQuestionTime)
  }, [showResult, currentQuestion, submitAnswer, currentQuestionTime])

  const handleTextSubmit = useCallback(() => {
    if (showResult || !currentQuestion || !textAnswer.trim()) return

    // For fill questions, check correctness locally before submitting
    const answer = textAnswer.trim()
    if (currentQuestion.type === "fill") {
      // Submit as-is; hook will compare
    }
    submitAnswer(answer, currentQuestionTime)
  }, [showResult, currentQuestion, textAnswer, submitAnswer, currentQuestionTime])

  const handleNext = useCallback(() => {
    goNext()
    resetAi()
    setCodeOutput("")
    setCodeError(null)
  }, [goNext, resetAi])

  const handlePrev = useCallback(() => {
    goPrev()
    resetAi()
    setCodeOutput("")
    setCodeError(null)
  }, [goPrev, resetAi])

  const handleRestart = useCallback(() => {
    resetAi()
    setCodeOutput("")
    setCodeError(null)
    void fetchQuestions()
  }, [fetchQuestions, resetAi])

  const handleAiReview = useCallback(() => {
    if (!currentQuestion) return
    startAiStream({
      questionId: currentQuestion.id,
      question: currentQuestion.content,
      options: currentQuestion.options,
      answer: currentQuestion.answer,
      type: currentQuestion.type,
      mode: "review",
      userAnswer: selectedAnswer || textAnswer,
    })
  }, [currentQuestion, startAiStream, selectedAnswer, textAnswer])

  const handleAiExplain = useCallback(() => {
    if (!currentQuestion) return
    startAiStream({
      questionId: currentQuestion.id,
      question: currentQuestion.content,
      options: currentQuestion.options,
      answer: currentQuestion.answer,
      type: currentQuestion.type,
    })
  }, [currentQuestion, startAiStream])

  const handleRunCode = useCallback(async () => {
    if (!textAnswer.trim()) return

    setCodeRunning(true)
    setCodeOutput("")
    setCodeError(null)

    try {
      const res = await fetch("/api/code/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: textAnswer, language: "auto" }),
      })

      const data = await res.json()

      if (data.error) {
        setCodeError(data.error + (data.details ? `: ${data.details}` : ""))
      } else {
        const output = []
        if (data.compile?.stderr) output.push(`[编译错误]\n${data.compile.stderr}`)
        if (data.stderr) output.push(`[错误]\n${data.stderr}`)
        if (data.stdout) output.push(data.stdout)
        if (!data.stdout && !data.stderr && !data.compile?.stderr) output.push("(无输出)")
        setCodeOutput(output.join("\n"))
      }
    } catch {
      setCodeError("执行请求失败")
    } finally {
      setCodeRunning(false)
    }
  }, [textAnswer])

  const handleJumpToQuestion = useCallback((questionId: number) => {
    const idx = questions.findIndex(q => q.id === questionId)
    if (idx !== -1) {
      // Navigate to question and show result
      // The hook doesn't expose direct index setter, so we use goNext/goPrev pattern
      // For simplicity, restart and let user navigate
      showToast("请使用上一题/下一题按钮导航", "info")
    }
  }, [questions])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showResult && (e.key === "Enter" || e.key === " ") && !e.shiftKey) {
        e.preventDefault()
        handleNext()
        return
      }
      if (!showResult && currentQuestion?.options) {
        const keyMap: Record<string, number> = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5 }
        const idx = keyMap[e.key]
        if (idx !== undefined && idx < currentQuestion.options.length) {
          handleAnswer(currentQuestion.options[idx].charAt(0))
        }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [showResult, currentQuestion, handleAnswer, handleNext])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">加载题目中...</p>
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    const isLoadError = Boolean(loadError)

    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <div className="p-8 text-center">
            {isLoadError ? (
              <AlertTriangle className="h-16 w-16 mx-auto text-destructive/70 mb-4" />
            ) : (
              <Target className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            )}
            <h2 className="text-xl font-semibold mb-2">
              {isLoadError ? "题目加载失败" : practiceMode === "mistakes" ? "没有错题" : "暂无题目"}
            </h2>
            <p className="text-muted-foreground mb-6">
              {isLoadError ? loadError : practiceMode === "mistakes" ? "太棒了，你没有错题需要重练！" : "请先导入一些题目开始练习"}
            </p>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              {isLoadError ? null : practiceMode === "mistakes" ? (
                <Button asChild>
                  <Link href="/practice">开始普通练习</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/import">导入题目</Link>
                </Button>
              )}
              <Button variant="outline" onClick={handleRestart}>
                <RotateCcw className="h-4 w-4 mr-2" />
                重新加载
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (showReview) {
    return (
      <PracticeReview
        records={records}
        totalCorrect={totalCorrect}
        onRestart={handleRestart}
        onJumpToQuestion={handleJumpToQuestion}
      />
    )
  }

  const progress = ((currentIndex + 1) / questions.length) * 100
  const hasOptions = currentQuestion.options && currentQuestion.options.length > 0
  const isTextType = ["fill", "calculation", "essay", "code"].includes(currentQuestion.type)
  const isCodeType = currentQuestion.type === "code"

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{practiceMode === "mistakes" ? "错题重练" : "刷题练习"}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {practiceMode === "mistakes" ? "消灭错题 " : ""}第 {currentIndex + 1} / {questions.length} 题
            {streak > 1 && (
              <span className="ml-3 text-amber-600">
                <Flame className="inline h-3 w-3 mr-1" />
                连对 {streak}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PracticeTimer isRunning={timerRunning} onTimeUpdate={setCurrentQuestionTime} />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue placeholder="题型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="single">单选</SelectItem>
              <SelectItem value="multiple">多选</SelectItem>
              <SelectItem value="truefalse">判断</SelectItem>
              <SelectItem value="fill">填空</SelectItem>
              <SelectItem value="code">编程</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8" onClick={handleRestart}>
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <Progress value={progress} className="h-1.5" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{Math.round(progress)}%</span>
          <span>{totalCorrect}/{currentIndex + (showResult ? 1 : 0)} 正确</span>
        </div>
      </div>

      {/* Question Card */}
      <Card className="overflow-hidden">
        <PracticeQuestion
          question={currentQuestion}
          showAnswer={showAnswer}
          onToggleAnswer={toggleAnswer}
          showResult={showResult}
          selectedAnswer={selectedAnswer}
          onAnswer={handleAnswer}
        />

        <div className="px-6 pb-6 space-y-4">
          {/* Text Input */}
          {isTextType && !hasOptions && (
            <div className="space-y-3">
              {isCodeType ? (
                <>
                  <div className="relative">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-t-lg border border-b-0 text-xs text-muted-foreground">
                      <span className="font-mono">代码编辑器</span>
                      <span>Tab 缩进</span>
                    </div>
                    <textarea
                      placeholder={"// 请编写代码...\n#include <stdio.h>\n\nint main() {\n    // 你的代码\n    return 0;\n}"}
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Tab") {
                          e.preventDefault()
                          const start = e.currentTarget.selectionStart
                          const end = e.currentTarget.selectionEnd
                          const value = e.currentTarget.value
                          if (e.shiftKey) {
                            const lineStart = value.lastIndexOf("\n", start - 1) + 1
                            if (value.substring(lineStart, lineStart + 2) === "  ") {
                              setTextAnswer(value.substring(0, lineStart) + value.substring(lineStart + 2))
                              setTimeout(() => {
                                e.currentTarget.selectionStart = Math.max(lineStart, start - 2)
                                e.currentTarget.selectionEnd = Math.max(lineStart, end - 2)
                              }, 0)
                            }
                          } else {
                            setTextAnswer(value.substring(0, start) + "  " + value.substring(end))
                            setTimeout(() => {
                              e.currentTarget.selectionStart = start + 2
                              e.currentTarget.selectionEnd = start + 2
                            }, 0)
                          }
                        }
                      }}
                      disabled={showResult}
                      className="min-h-[200px] font-mono text-sm leading-relaxed p-4 rounded-b-lg border resize-y w-full bg-card focus:outline-none focus:ring-1 focus:ring-ring"
                      spellCheck={false}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleRunCode}
                      disabled={!textAnswer.trim() || codeRunning}
                      className="flex-1"
                    >
                      {codeRunning ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      {codeRunning ? "运行中..." : "运行代码"}
                    </Button>
                    {!showResult && (
                      <Button onClick={handleTextSubmit} disabled={!textAnswer.trim()} className="flex-1">
                        <Zap className="h-4 w-4 mr-2" />
                        提交答案
                      </Button>
                    )}
                  </div>

                  {(codeOutput || codeError) && (
                    <Card className="animate-slide-up">
                      <div className="px-4 py-2 border-b">
                        <span className="text-sm flex items-center gap-2">
                          <Terminal className="h-4 w-4" />
                          运行结果
                        </span>
                      </div>
                      <div className="p-4">
                        <pre className={`text-sm font-mono whitespace-pre-wrap p-3 rounded-lg ${
                          codeError ? 'bg-red-500/10 text-red-700' : 'bg-muted'
                        }`}>
                          {codeError || codeOutput}
                        </pre>
                      </div>
                    </Card>
                  )}
                </>
              ) : (
                <Textarea
                  placeholder={
                    currentQuestion.type === "fill" ? "请输入答案.." :
                    currentQuestion.type === "calculation" ? "请输入计算过程和结果..." :
                    "请输入你的论述..."
                  }
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  disabled={showResult}
                  className="min-h-[120px] text-base"
                />
              )}
              {!showResult && !isCodeType && (
                <Button onClick={handleTextSubmit} disabled={!textAnswer.trim()} className="w-full">
                  <Zap className="h-4 w-4 mr-2" />
                  提交答案
                </Button>
              )}
            </div>
          )}

          {/* Result */}
          {showResult && (
            <PracticeResult
              isCorrect={isCorrect}
              correctAnswer={currentQuestion.answer}
              streak={streak}
              isLastQuestion={isLastQuestion}
              loadingAi={loadingAi}
              onPrev={handlePrev}
              onNext={handleNext}
              onFinish={toggleReview}
              onAiExplain={handleAiExplain}
              onAiReview={handleAiReview}
              canPrev={currentIndex > 0}
            />
          )}
        </div>
      </Card>

      {/* Keyboard Hints */}
      {!showResult && <KeyboardHints />}

      {/* AI Response */}
      <AiResponseCard response={aiResponse} loading={loadingAi} />
    </div>
  )
}
