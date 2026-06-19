"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, ChevronLeft, ChevronRight, Eye, BookOpen, Filter, RefreshCw, Loader2, Download } from "lucide-react"
import { typeLabels, typeColors } from "@/lib/constants"
import { showToast } from "@/components/toast"
import { useQuestions } from "@/hooks/use-swr-fetcher"
import { useDebounce } from "@/hooks/use-debounce"

export default function BankPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [hasAnswer, setHasAnswer] = useState(false)
  const [recentOnly, setRecentOnly] = useState(false)
  const [reparsing, setReparsing] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  const { data, error, isLoading, mutate } = useQuestions({
    page,
    pageSize: 20,
    type: typeFilter,
    search: debouncedSearch,
    hasAnswer,
    recentDays: recentOnly ? 7 : undefined,
  })

  const questions = data?.data || []
  const total = data?.total || 0
  const totalPages = data?.totalPages || 1

  const handleClearFilters = useCallback(() => {
    setSearch("")
    setTypeFilter("all")
    setHasAnswer(false)
    setRecentOnly(false)
    setPage(1)
  }, [])

  const handleExport = useCallback((format: "json" | "csv") => {
    window.open(`/api/export?format=${format}`, "_blank")
  }, [])

  const handleReparseAll = useCallback(async () => {
    setReparsing(true)
    try {
      const res = await fetch("/api/questions/reparse", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reparse" }),
      })
      if (!res.ok) throw new Error("重新识别失败")
      const result = await res.json()
      showToast(`重新识别完成，更新 ${result.updated} 道题目`, "success")
      await mutate()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "重新识别失败", "error")
    } finally {
      setReparsing(false)
    }
  }, [mutate])

  if (error) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="text-3xl font-bold">题库浏览</h1>
        </div>
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">加载题目失败</p>
            <Button onClick={() => mutate()}>重新加载</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="page-header">
          <h1 className="text-3xl font-bold">题库浏览</h1>
          <p className="text-muted-foreground mt-2">查看和管理所有题目</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("json")}>
            <Download className="h-4 w-4 mr-1" />
            导出 JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
            <Download className="h-4 w-4 mr-1" />
            导出 CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleReparseAll} disabled={reparsing}>
            {reparsing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            批量重新识别
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="animate-slide-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4 text-primary" />
            筛选条件
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-1 gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索题目内容..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="题型筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部题型</SelectItem>
                  <SelectItem value="single">单选题</SelectItem>
                  <SelectItem value="multiple">多选题</SelectItem>
                  <SelectItem value="truefalse">判断题</SelectItem>
                  <SelectItem value="fill">填空题</SelectItem>
                  <SelectItem value="calculation">计算题</SelectItem>
                  <SelectItem value="essay">论述题</SelectItem>
                  <SelectItem value="code">编程题</SelectItem>
                </SelectContent>
              </Select>
              <Button variant={hasAnswer ? "default" : "outline"} size="sm" onClick={() => { setHasAnswer(!hasAnswer); setPage(1) }}>
                有答案
              </Button>
              <Button variant={recentOnly ? "default" : "outline"} size="sm" onClick={() => { setRecentOnly(!recentOnly); setPage(1) }}>
                近7天
              </Button>
              {(search || typeFilter !== "all" || hasAnswer || recentOnly) && (
                <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                  清除筛选
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats & Pagination */}
      <div className="flex items-center justify-between animate-slide-up" style={{ animationDelay: "100ms" }}>
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            共 <span className="font-bold text-foreground">{total}</span> 道题目
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm px-3 py-1 rounded-md bg-muted">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Question List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="skeleton h-24" />
            ))}
          </div>
        ) : questions.length === 0 ? (
          <Card className="animate-slide-up">
            <CardContent className="p-12 text-center">
              <BookOpen className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
              <h2 className="text-xl font-semibold mb-2">暂无题目</h2>
              <p className="text-muted-foreground mb-4">
                {search || typeFilter !== "all" || hasAnswer || recentOnly ? "没有找到匹配的题目" : "题库为空，请先导入题目"}
              </p>
              {search || typeFilter !== "all" || hasAnswer || recentOnly ? (
                <Button variant="outline" onClick={handleClearFilters}>
                  清除筛选
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/import">导入题目</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          questions.map((q: { id: number; type: string; content: string; answer: string | null }, idx: number) => (
            <Card
              key={q.id}
              className="card-hover animate-slide-up card-list-item"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <span className="number-badge">{q.id}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={`${typeColors[q.type] || 'bg-gray-500'} text-white text-xs`}>
                        {typeLabels[q.type] || q.type}
                      </Badge>
                      {q.answer && (
                        <Badge variant="outline" className="text-xs">
                          有答案
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm line-clamp-2 text-muted-foreground leading-relaxed">
                      {q.content}
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="flex-shrink-0">
                    <Link href={`/bank/${q.id}`}>
                      <Eye className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">查看</span>
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}