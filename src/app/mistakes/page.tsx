"use client"

import Link from "next/link"
import { useState } from "react"
import { showToast } from "@/components/toast"
import { BookOpen, ChevronLeft, ChevronRight, Clock, Eye, RotateCcw, Search, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { typeColors, typeLabels } from "@/lib/constants"
import { usePaginatedFilter } from "@/hooks/use-paginated-filter"
import { useMistakes } from "@/hooks/use-swr-fetcher"

const questionTypeOptions = [
  { value: "all", label: "全部题型" },
  { value: "single", label: "单选题" },
  { value: "multiple", label: "多选题" },
  { value: "truefalse", label: "判断题" },
  { value: "fill", label: "填空题" },
  { value: "calculation", label: "计算题" },
  { value: "essay", label: "论述题" },
  { value: "code", label: "编程题" },
]

export default function MistakesPage() {
  const {
    page,
    setPage,
    typeFilter,
    setTypeFilter,
    searchInput,
    setSearchInput,
    committedSearch,
    clearFilters,
  } = usePaginatedFilter()
  const [updating, setUpdating] = useState<number | null>(null)
  const { data, error, isLoading, mutate } = useMistakes({
    page,
    pageSize: 20,
    type: typeFilter,
    search: committedSearch,
  })
  const mistakes = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const markStatus = async (questionId: number, status: "mastered" | "archived") => {
    setUpdating(questionId)
    try {
      const response = await fetch("/api/mistakes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId, status }) })
      if (!response.ok) throw new Error("更新失败")
      await mutate()
      showToast(status === "mastered" ? "已标记掌握，保留历史并安排后续复习" : "已归档，答题历史保留", "success")
    } catch { showToast("更新失败，请重试", "error") }
    finally { setUpdating(null) }
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="text-3xl font-bold">错题本</h1>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-32" />
          ))}
        </div>
      </div>
    )
  }

  const hasFilters = Boolean(searchInput || typeFilter !== "all")

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="page-header">
          <h1 className="text-3xl font-bold">错题本</h1>
          <p className="text-muted-foreground mt-2">共 {total} 道错题</p>
        </div>
        {total > 0 && (
          <Button asChild>
            <Link href="/practice?mode=mistakes">
              <RotateCcw className="h-4 w-4 mr-2" />
              错题重练
            </Link>
          </Button>
        )}
      </div>

      <Card className="animate-slide-up">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索错题内容..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(value) => { setTypeFilter(value); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="题型筛选" />
              </SelectTrigger>
              <SelectContent>
                {questionTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" onClick={clearFilters}>
                清除筛选
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {error && <p role="alert" className="text-sm text-destructive">获取错题失败，请稍后重试</p>}

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          第 {page} / {totalPages} 页
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {mistakes.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-semibold mb-2">暂无错题</h2>
            <p className="text-muted-foreground mb-4">
              {hasFilters ? "没有找到匹配的错题" : "继续练习，错题会自动记录到这里"}
            </p>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              {hasFilters && (
                <Button variant="outline" onClick={clearFilters}>
                  清除筛选
                </Button>
              )}
              <Button asChild>
                <Link href="/practice">开始练习</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {mistakes.map((mistake) => (
            <Card key={mistake.id} className="card-hover card-list-item">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <XCircle className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={`${typeColors[mistake.questionType] || "bg-gray-500"} text-white text-xs`}>
                        {typeLabels[mistake.questionType] || mistake.questionType}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {mistake.timeSpent}s
                      </span>
                    </div>
                    <p className="text-sm mb-2 line-clamp-2">{mistake.questionContent}</p>
                    <div className="flex flex-col gap-1 text-xs sm:flex-row sm:gap-4">
                      <span className="text-red-600">你的答案：{mistake.userAnswer}</span>
                      {mistake.questionAnswer && (
                        <span className="text-green-600">正确答案：{mistake.questionAnswer}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" disabled={updating !== null} onClick={() => markStatus(mistake.questionId, "mastered")}>已掌握</Button>
                    <Button variant="ghost" size="sm" disabled={updating !== null} onClick={() => markStatus(mistake.questionId, "archived")}>归档</Button>
                  </div>
                  <Button asChild variant="ghost" size="sm" aria-label="查看题目详情">
                    <Link href={`/bank/${mistake.questionId}`}>
                      <Eye className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">查看</span>
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
