"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BookOpen, CheckCircle2, Download, FileText, ListChecks, Play, Plus, RefreshCw, RotateCcw, Search, Trash2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { showToast } from "@/components/toast"
import { typeColors } from "@/lib/constants"
import { getOptionLetter, parseOptionText } from "@/lib/utils"
import type { QuestionType } from "@/lib/types"

interface Question {
  id: number
  type: QuestionType
  content: string
  options: string[] | null
  answer: string | null
  explanation?: string | null
}

interface PaperSection {
  type: QuestionType
  questions: Question[]
}

interface PaperAnswer {
  questionId: number
  value: string
  isCorrect: boolean | null
}

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: "single", label: "单选题" },
  { value: "multiple", label: "多选题" },
  { value: "truefalse", label: "判断题" },
  { value: "fill", label: "填空题" },
  { value: "calculation", label: "计算题" },
  { value: "essay", label: "论述题" },
  { value: "code", label: "编程题" },
]

const localTypeLabels = Object.fromEntries(questionTypes.map((item) => [item.value, item.label])) as Record<QuestionType, string>

type Mode = "random" | "manual"
type ViewMode = "compose" | "practice" | "finished"

function normalizeAnswer(value: string | null | undefined) {
  return (value || "")
    .trim()
    .replace(/[，,、\s]+/g, "")
    .replace(/正确|对|√/g, "TRUE")
    .replace(/错误|错|×/g, "FALSE")
    .toUpperCase()
}

function splitAnswer(value: string | null | undefined) {
  return normalizeAnswer(value).split("").filter(Boolean).sort().join("")
}

function checkAnswer(question: Question, value: string): boolean | null {
  if (!question.answer) return null

  if (question.type === "multiple") {
    return splitAnswer(value) === splitAnswer(question.answer)
  }

  if (question.type === "single" || question.type === "truefalse") {
    return normalizeAnswer(value) === normalizeAnswer(question.answer)
  }

  return normalizeAnswer(value) === normalizeAnswer(question.answer)
}

function flattenSections(sections: PaperSection[]) {
  return sections.flatMap((section) => section.questions)
}

export default function PaperPage() {
  const [title, setTitle] = useState("题库试卷")
  const [mode, setMode] = useState<Mode>("random")
  const [rules, setRules] = useState<Record<QuestionType, number>>({
    single: 5,
    multiple: 3,
    truefalse: 5,
    fill: 5,
    calculation: 0,
    essay: 0,
    code: 0,
  })
  const [includeAnswers, setIncludeAnswers] = useState(true)
  const [sections, setSections] = useState<PaperSection[]>([])
  const [loadingPaper, setLoadingPaper] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [bankQuestions, setBankQuestions] = useState<Question[]>([])
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loadingBank, setLoadingBank] = useState(false)

  const [viewMode, setViewMode] = useState<ViewMode>("compose")
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, PaperAnswer>>({})
  const [draftAnswer, setDraftAnswer] = useState("")
  const [showCurrentResult, setShowCurrentResult] = useState(false)

  const paperQuestions = useMemo(() => flattenSections(sections), [sections])
  const totalQuestions = paperQuestions.length
  const currentQuestion = paperQuestions[currentIndex]
  const currentSavedAnswer = currentQuestion ? answers[currentQuestion.id] : undefined
  const finishedCount = Object.keys(answers).length
  const correctCount = Object.values(answers).filter((answer) => answer.isCorrect === true).length
  const progress = totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0

  const fetchBankQuestions = useCallback(async () => {
    setLoadingBank(true)
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "100" })
      if (search) params.set("search", search)
      if (typeFilter !== "all") params.set("type", typeFilter)
      const res = await fetch(`/api/questions?${params}`)
      if (!res.ok) throw new Error("获取题目失败")
      const data = await res.json()
      setBankQuestions(data.data || [])
    } catch (error) {
      showToast(error instanceof Error ? error.message : "获取题目失败", "error")
    } finally {
      setLoadingBank(false)
    }
  }, [search, typeFilter])

  useEffect(() => {
    if (mode !== "manual") return
    const timer = window.setTimeout(() => {
      void fetchBankQuestions()
    }, 150)
    return () => window.clearTimeout(timer)
  }, [mode, fetchBankQuestions])

  const requestPaper = useCallback(async (format: "json" | "docx") => {
    const body = mode === "manual"
      ? {
          title,
          mode,
          questionIds: Array.from(selectedIds),
          includeAnswers,
          format,
        }
      : {
          title,
          mode,
          rules: questionTypes.map((type) => ({ type: type.value, count: rules[type.value] || 0 })),
          includeAnswers,
          format,
        }

    const res = await fetch("/api/papers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "组卷失败")
    }

    return res
  }, [includeAnswers, mode, rules, selectedIds, title])

  const handleGenerate = useCallback(async () => {
    setLoadingPaper(true)
    try {
      const res = await requestPaper("json")
      const data = await res.json()
      setSections(data.sections || [])
      setViewMode("compose")
      setAnswers({})
      setCurrentIndex(0)
      showToast(`已生成 ${data.total} 道题`, "success")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "组卷失败", "error")
    } finally {
      setLoadingPaper(false)
    }
  }, [requestPaper])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const res = await requestPaper("docx")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${title || "题库试卷"}.docx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast("Word 试卷已导出", "success")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "导出失败", "error")
    } finally {
      setExporting(false)
    }
  }, [requestPaper, title])

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const startPractice = () => {
    if (paperQuestions.length === 0) {
      showToast("请先生成试卷", "error")
      return
    }
    setCurrentIndex(0)
    setAnswers({})
    setDraftAnswer("")
    setShowCurrentResult(false)
    setViewMode("practice")
  }

  const submitCurrentAnswer = () => {
    if (!currentQuestion || !draftAnswer.trim()) return
    const isCorrect = checkAnswer(currentQuestion, draftAnswer)
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        questionId: currentQuestion.id,
        value: draftAnswer.trim(),
        isCorrect,
      },
    }))
    setShowCurrentResult(true)
  }

  const goToQuestion = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= paperQuestions.length) return
    const nextQuestion = paperQuestions[nextIndex]
    const saved = answers[nextQuestion.id]
    setCurrentIndex(nextIndex)
    setDraftAnswer(saved?.value || "")
    setShowCurrentResult(Boolean(saved))
  }

  const finishPractice = () => {
    setViewMode("finished")
  }

  const resetPaper = () => {
    setSections([])
    setSelectedIds(new Set())
    setViewMode("compose")
    setAnswers({})
    setCurrentIndex(0)
    setDraftAnswer("")
    setShowCurrentResult(false)
  }

  if (viewMode === "practice" && currentQuestion) {
    const hasOptions = currentQuestion.options && currentQuestion.options.length > 0
    const isMultiple = currentQuestion.type === "multiple"
    const isTextType = ["fill", "calculation", "essay", "code"].includes(currentQuestion.type)

    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              在线作答，第 {currentIndex + 1} / {totalQuestions} 题，已提交 {finishedCount} 题
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setViewMode("compose")}>
              返回组卷
            </Button>
            <Button onClick={finishPractice}>
              交卷
            </Button>
          </div>
        </div>

        <Progress value={progress} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Badge className={`${typeColors[currentQuestion.type] || "bg-gray-500"} text-white`}>
                  {localTypeLabels[currentQuestion.type]}
                </Badge>
                <span>#{currentQuestion.id}</span>
              </span>
              {currentSavedAnswer && (
                currentSavedAnswer.isCorrect === true ? (
                  <span className="flex items-center gap-1 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    已答对
                  </span>
                ) : currentSavedAnswer.isCorrect === false ? (
                  <span className="flex items-center gap-1 text-sm text-red-600">
                    <XCircle className="h-4 w-4" />
                    已答错
                  </span>
                ) : (
                  <span className="text-sm text-blue-600">已提交</span>
                )
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="whitespace-pre-wrap text-base leading-relaxed">{currentQuestion.content}</div>

            {hasOptions && (
              <div className="space-y-2">
                {currentQuestion.options!.map((option, optionIndex) => {
                  const letter = getOptionLetter(option)
                  const selected = isMultiple
                    ? splitAnswer(draftAnswer).includes(letter)
                    : normalizeAnswer(draftAnswer) === letter
                  const correct = splitAnswer(currentQuestion.answer).includes(letter)
                  const optionClass = showCurrentResult
                    ? correct
                      ? "border-green-500 bg-green-500/10"
                      : selected
                        ? "border-red-500 bg-red-500/10"
                        : "opacity-60"
                    : selected
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/50"

                  return (
                    <button
                      key={`${currentQuestion.id}-${optionIndex}`}
                      type="button"
                      disabled={showCurrentResult}
                      onClick={() => {
                        if (isMultiple) {
                          const current = new Set(splitAnswer(draftAnswer).split("").filter(Boolean))
                          if (current.has(letter)) current.delete(letter)
                          else current.add(letter)
                          setDraftAnswer(Array.from(current).sort().join(""))
                        } else {
                          setDraftAnswer(letter)
                        }
                      }}
                      className={`w-full rounded-lg border-2 p-4 text-left transition-colors ${optionClass}`}
                    >
                      <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-sm font-medium">
                        {letter}
                      </span>
                      {parseOptionText(option)}
                    </button>
                  )
                })}
              </div>
            )}

            {currentQuestion.type === "truefalse" && !hasOptions && (
              <div className="grid grid-cols-2 gap-3">
                <Button variant={draftAnswer === "TRUE" ? "default" : "outline"} disabled={showCurrentResult} onClick={() => setDraftAnswer("TRUE")}>
                  正确
                </Button>
                <Button variant={draftAnswer === "FALSE" ? "default" : "outline"} disabled={showCurrentResult} onClick={() => setDraftAnswer("FALSE")}>
                  错误
                </Button>
              </div>
            )}

            {isTextType && (
              <Textarea
                value={draftAnswer}
                disabled={showCurrentResult}
                onChange={(event) => setDraftAnswer(event.target.value)}
                placeholder="在这里输入你的答案"
                className="min-h-[140px]"
              />
            )}

            {showCurrentResult && (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <div className="font-medium">
                  你的答案：<span className="text-foreground">{draftAnswer || "未作答"}</span>
                </div>
                {currentQuestion.answer && (
                  <div className="mt-1 font-medium">
                    参考答案：<span className="text-foreground">{currentQuestion.answer}</span>
                  </div>
                )}
                {currentQuestion.explanation && (
                  <div className="mt-2 text-muted-foreground whitespace-pre-wrap">{currentQuestion.explanation}</div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <Button variant="outline" disabled={currentIndex === 0} onClick={() => goToQuestion(currentIndex - 1)}>
                  上一题
                </Button>
                <Button variant="outline" disabled={currentIndex >= totalQuestions - 1} onClick={() => goToQuestion(currentIndex + 1)}>
                  下一题
                </Button>
              </div>
              <div className="flex gap-2">
                {!showCurrentResult ? (
                  <Button onClick={submitCurrentAnswer} disabled={!draftAnswer.trim()}>
                    提交本题
                  </Button>
                ) : currentIndex >= totalQuestions - 1 ? (
                  <Button onClick={finishPractice}>
                    查看结果
                  </Button>
                ) : (
                  <Button onClick={() => goToQuestion(currentIndex + 1)}>
                    继续下一题
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (viewMode === "finished") {
    const accuracy = finishedCount > 0 ? Math.round((correctCount / finishedCount) * 100) : 0

    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">交卷结果</h1>
            <p className="mt-1 text-sm text-muted-foreground">{title}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={startPractice}>
              <RotateCcw className="mr-2 h-4 w-4" />
              重新作答
            </Button>
            <Button onClick={() => setViewMode("compose")}>
              返回组卷
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="text-sm text-muted-foreground">已提交</div>
              <div className="mt-2 text-3xl font-semibold">{finishedCount} / {totalQuestions}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-sm text-muted-foreground">答对</div>
              <div className="mt-2 text-3xl font-semibold text-green-600">{correctCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-sm text-muted-foreground">正确率</div>
              <div className="mt-2 text-3xl font-semibold">{accuracy}%</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">逐题回看</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {paperQuestions.map((question, index) => {
              const answer = answers[question.id]
              return (
                <div key={question.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`${typeColors[question.type] || "bg-gray-500"} text-white`}>
                      {localTypeLabels[question.type]}
                    </Badge>
                    <span className="font-medium">第 {index + 1} 题</span>
                    {answer?.isCorrect === true && <span className="text-sm text-green-600">正确</span>}
                    {answer?.isCorrect === false && <span className="text-sm text-red-600">错误</span>}
                    {!answer && <span className="text-sm text-muted-foreground">未提交</span>}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{question.content}</p>
                  <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                    <span>你的答案：{answer?.value || "未作答"}</span>
                    <span>参考答案：{question.answer || "无"}</span>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="text-3xl font-bold">组卷</h1>
        <p className="mt-2 text-muted-foreground">随机抽题或手动选题，生成后可在线作答，也可以导出 Word 试卷</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" />
                组卷设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">试卷名称</label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">组卷方式</label>
                <Select value={mode} onValueChange={(value) => setMode(value as Mode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="random">随机抽题</SelectItem>
                    <SelectItem value="manual">自主选题</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeAnswers}
                  onChange={(event) => setIncludeAnswers(event.target.checked)}
                  className="h-4 w-4"
                />
                导出时包含参考答案与解析
              </label>

              {mode === "random" ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">题型与数量</div>
                  {questionTypes.map((type) => (
                    <div key={type.value} className="flex items-center gap-3">
                      <span className="w-20 text-sm text-muted-foreground">{type.label}</span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={rules[type.value]}
                        onChange={(event) => setRules((prev) => ({ ...prev, [type.value]: Math.max(0, Number(event.target.value) || 0) }))}
                        className="w-24"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="搜索题目"
                        className="pl-9"
                      />
                    </div>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="w-[128px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部题型</SelectItem>
                        {questionTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="max-h-[420px] overflow-auto rounded-lg border bg-card">
                    {loadingBank ? (
                      <div className="p-4 text-sm text-muted-foreground">加载中...</div>
                    ) : bankQuestions.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">没有匹配题目</div>
                    ) : (
                      bankQuestions.map((question) => (
                        <button
                          key={question.id}
                          type="button"
                          onClick={() => toggleSelected(question.id)}
                          className="w-full border-b p-3 text-left transition-colors last:border-b-0 hover:bg-muted"
                        >
                          <div className="flex items-start gap-2">
                            <input type="checkbox" checked={selectedIds.has(question.id)} readOnly className="mt-1 h-4 w-4" />
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex items-center gap-2">
                                <Badge className={`${typeColors[question.type] || "bg-gray-500"} text-xs text-white`}>
                                  {localTypeLabels[question.type]}
                                </Badge>
                                <span className="text-xs text-muted-foreground">#{question.id}</span>
                              </div>
                              <p className="line-clamp-2 text-sm">{question.content}</p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleGenerate} disabled={loadingPaper} className="flex-1">
                  {loadingPaper ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  生成试卷
                </Button>
                <Button variant="outline" onClick={handleExport} disabled={exporting}>
                  <Download className="mr-2 h-4 w-4" />
                  Word
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                试卷预览
              </span>
              <span className="text-sm text-muted-foreground">共 {totalQuestions} 题</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sections.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground">
                先设置题型数量或选择题目，然后点击“生成试卷”
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={startPractice}>
                    <Play className="mr-2 h-4 w-4" />
                    开始在线做题
                  </Button>
                  <Button variant="outline" size="sm" onClick={resetPaper}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    清空
                  </Button>
                </div>

                {sections.map((section) => (
                  <section key={section.type} className="space-y-3">
                    <h2 className="flex items-center gap-2 font-semibold">
                      <ListChecks className="h-4 w-4 text-primary" />
                      {localTypeLabels[section.type]}（{section.questions.length} 题）
                    </h2>
                    <div className="space-y-3">
                      {section.questions.map((question, index) => (
                        <div key={question.id} className="rounded-lg border bg-card p-4">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{index + 1}. {question.content}</p>
                          {question.options && question.options.length > 0 && (
                            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                              {question.options.map((option, optionIndex) => (
                                <div key={optionIndex}>{option}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
