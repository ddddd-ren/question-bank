"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, BookOpen, CheckCircle, HelpCircle, Loader2, Pencil, RefreshCw, Save, Sparkles, Trash2, X } from "lucide-react"
import { AiResponseCard } from "@/components/ai-response-card"
import { FavoriteButton } from "@/components/favorite-button"
import { showToast } from "@/components/toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAiStream } from "@/hooks/use-ai-stream"
import { typeColors, typeLabels } from "@/lib/constants"
import { parseOptionText, getOptionLetter } from "@/lib/utils"
import type { QuestionType } from "@/lib/types"

interface Question {
  id: number
  type: QuestionType
  content: string
  options: string[] | null
  answer: string | null
  explanation: string | null
  createdAt: string
}

const questionTypeOptions: { value: QuestionType; label: string }[] = [
  { value: "single", label: "单选题" },
  { value: "multiple", label: "多选题" },
  { value: "truefalse", label: "判断题" },
  { value: "fill", label: "填空题" },
  { value: "calculation", label: "计算题" },
  { value: "essay", label: "论述题" },
  { value: "code", label: "编程题" },
]

function normalizeOptions(options: unknown): string[] | null {
  if (!options) return null
  if (Array.isArray(options)) return options.filter((item): item is string => typeof item === "string")
  if (typeof options === "string") {
    try {
      const parsed = JSON.parse(options) as unknown
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : null
    } catch {
      return null
    }
  }
  return null
}

export default function QuestionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [question, setQuestion] = useState<Question | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    type: "essay" as QuestionType,
    content: "",
    options: "",
    answer: "",
    explanation: "",
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reparsing, setReparsing] = useState(false)

  const { response: aiResponse, loading: loadingAi, startStream: startAiStream } = useAiStream()

  const applyQuestion = useCallback((data: Question | Record<string, unknown>) => {
    const parsedQuestion = {
      ...data,
      options: normalizeOptions(data.options),
    } as Question

    setQuestion(parsedQuestion)
    setEditForm({
      type: parsedQuestion.type,
      content: parsedQuestion.content || "",
      options: parsedQuestion.options ? parsedQuestion.options.join("\n") : "",
      answer: parsedQuestion.answer || "",
      explanation: parsedQuestion.explanation || "",
    })
  }, [])

  useEffect(() => {
    fetch(`/api/questions/${params.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("获取题目失败")
        return res.json()
      })
      .then(applyQuestion)
      .catch((error) => {
        console.error(error)
        showToast("获取题目失败", "error")
      })
      .finally(() => setLoading(false))
  }, [params.id, applyQuestion])

  const handleAiExplain = useCallback(() => {
    if (!question) return
    startAiStream({
      questionId: question.id,
      question: question.content,
      options: question.options,
      answer: question.answer,
      type: question.type,
    })
  }, [question, startAiStream])

  const handleSave = useCallback(async () => {
    if (!question) return
    setSaving(true)
    try {
      const options = editForm.options.split("\n").map((item) => item.trim()).filter(Boolean)
      const res = await fetch(`/api/questions/${question.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: editForm.type,
          content: editForm.content,
          options: options.length > 0 ? options : null,
          answer: editForm.answer || null,
          explanation: editForm.explanation || null,
        }),
      })
      if (!res.ok) throw new Error("保存失败")

      const updated = await res.json()
      applyQuestion(updated)
      setEditing(false)
      showToast("保存成功", "success")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存失败", "error")
    } finally {
      setSaving(false)
    }
  }, [question, editForm, applyQuestion])

  const handleDelete = useCallback(async () => {
    if (!question) return
    if (!confirm("确定要删除这道题目吗？此操作不可撤销。")) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/questions/${question.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("删除失败")
      showToast("删除成功", "success")
      router.push("/bank")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "删除失败", "error")
      setDeleting(false)
    }
  }, [question, router])

  const handleReparse = useCallback(async () => {
    if (!question) return
    setReparsing(true)
    try {
      const res = await fetch("/api/questions/reparse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id }),
      })
      if (!res.ok) throw new Error("重新识别失败")

      const data = await res.json()
      setEditForm({
        type: data.editable.type,
        content: data.editable.stem,
        options: data.editable.options?.join("\n") || "",
        answer: data.editable.answer || "",
        explanation: data.editable.explanation || "",
      })
      setEditing(true)
      showToast("已生成重新识别结果，请确认后保存", "success")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "重新识别失败", "error")
    } finally {
      setReparsing(false)
    }
  }, [question])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-10 w-32" />
        <div className="skeleton h-64" />
      </div>
    )
  }

  if (!question) {
    return (
      <div className="text-center py-12">
        <HelpCircle className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold mb-2">题目不存在</h2>
        <p className="text-muted-foreground mb-4">该题目可能已经被删除</p>
        <Button asChild><Link href="/bank">返回题库</Link></Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 animate-slide-up sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/bank"><ArrowLeft className="h-4 w-4 mr-2" />返回</Link>
          </Button>
          <div className="page-header">
            <h1 className="text-2xl font-bold">题目详情</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing ? (
            <>
              <FavoriteButton questionId={Number(params.id)} />
              <Button variant="outline" size="sm" onClick={handleReparse} disabled={reparsing}>
                {reparsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                重新识别
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4 mr-1" />编辑
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                删除
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                <X className="h-4 w-4 mr-1" />取消
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                保存
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="animate-slide-up">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`${typeColors[question.type] || "bg-gray-500"} text-white`}>
              {typeLabels[question.type] || question.type}
            </Badge>
            <span className="text-sm text-muted-foreground">#{question.id}</span>
            {question.answer && (
              <Badge variant="outline" className="sm:ml-auto">
                <CheckCircle className="h-3 w-3 mr-1" />有答案
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">题型</label>
                  <Select value={editForm.type} onValueChange={(value) => setEditForm((prev) => ({ ...prev, type: value as QuestionType }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {questionTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">题目内容</label>
                <Textarea
                  value={editForm.content}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, content: e.target.value }))}
                  className="min-h-[100px]"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">选项（每行一个，如 A. xxx）</label>
                <Textarea
                  value={editForm.options}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, options: e.target.value }))}
                  placeholder={"A. 选项一\nB. 选项二\nC. 选项三\nD. 选项四"}
                  className="min-h-[100px]"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">答案</label>
                <Input
                  value={editForm.answer}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, answer: e.target.value }))}
                  placeholder="如 A、AB、√、填空答案"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">解析</label>
                <Textarea
                  value={editForm.explanation}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, explanation: e.target.value }))}
                  placeholder="可选：添加解析说明"
                  className="min-h-[80px]"
                />
              </div>
            </div>
          ) : (
            <>
              <div>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />题目内容
                </h3>
                <div className="p-4 rounded-lg bg-muted/50 leading-relaxed">{question.content}</div>
              </div>

              {question.options && question.options.length > 0 && (
                <div>
                  <h3 className="font-medium mb-3">选项</h3>
                  <div className="grid gap-2">
                    {question.options.map((option, index) => {
                      const letter = getOptionLetter(option)
                      const isCorrect = (question.answer || "").toUpperCase().includes(letter.toUpperCase())
                      return (
                        <div key={index} className={`p-3 rounded-lg border ${isCorrect ? "border-green-500 bg-green-500/10" : "border-muted bg-card"}`}>
                          <div className="flex items-center gap-3">
                            <span className={`number-badge ${isCorrect ? "bg-green-500 text-white" : ""}`}>{letter}</span>
                            <span className="flex-1">{parseOptionText(option)}</span>
                            {isCorrect && <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {question.answer && (
                <div>
                  <h3 className="font-medium mb-3">参考答案</h3>
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="font-medium text-green-700 dark:text-green-300">{question.answer}</p>
                  </div>
                </div>
              )}

              {question.explanation && (
                <div>
                  <h3 className="font-medium mb-3">解析</h3>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="leading-relaxed">{question.explanation}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div>
        {!aiResponse && (
          <div className="flex justify-center mb-4">
            <Button onClick={handleAiExplain} disabled={loadingAi}>
              {loadingAi ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {loadingAi ? "生成中..." : "获取 AI 解答"}
            </Button>
          </div>
        )}
        <AiResponseCard response={aiResponse} loading={loadingAi} />
      </div>
    </div>
  )
}
