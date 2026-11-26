"use client"

import { useCallback } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Eye, Heart, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { showToast } from "@/components/toast"
import { typeColors, typeLabels } from "@/lib/constants"
import { usePaginatedFilter } from "@/hooks/use-paginated-filter"
import { useFavorites } from "@/hooks/use-swr-fetcher"

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

export default function FavoritesPage() {
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
  const { data, error, isLoading, mutate } = useFavorites({
    page,
    pageSize: 20,
    type: typeFilter,
    search: committedSearch,
  })
  const favorites = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const handleRemoveFavorite = useCallback(async (questionId: number) => {
    try {
      if (!data) return
      const optimisticData = {
        ...data,
        data: data.data.filter((item) => item.questionId !== questionId),
        total: Math.max(0, data.total - 1),
      }

      await mutate(async () => {
        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId }),
        })
        if (!res.ok) throw new Error("取消收藏失败")
        return optimisticData
      }, {
        optimisticData,
        rollbackOnError: true,
        revalidate: false,
      })

      showToast("已取消收藏", "success")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败", "error")
    }
  }, [data, mutate])

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="text-3xl font-bold">我的收藏</h1>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
      </div>
    )
  }

  const hasFilters = Boolean(searchInput || typeFilter !== "all")

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="text-3xl font-bold">我的收藏</h1>
        <p className="text-muted-foreground mt-2">共 {total} 道收藏题目</p>
      </div>

      <Card className="animate-slide-up">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索收藏内容..."
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

      {error && <p role="alert" className="text-sm text-destructive">获取收藏失败，请稍后重试</p>}

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

      {favorites.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Heart className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-semibold mb-2">暂无收藏</h2>
            <p className="text-muted-foreground mb-4">
              {hasFilters ? "没有找到匹配的收藏" : "在题目详情页点击收藏按钮添加"}
            </p>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              {hasFilters && (
                <Button variant="outline" onClick={clearFilters}>
                  清除筛选
                </Button>
              )}
              <Button asChild>
                <Link href="/bank">浏览题库</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {favorites.map((item) => (
            <Card key={item.id} className="card-hover card-list-item">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <Heart className="h-5 w-5 text-red-500 fill-current" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={`${typeColors[item.questionType] || "bg-gray-500"} text-white text-xs`}>
                        {typeLabels[item.questionType] || item.questionType}
                      </Badge>
                      {item.questionAnswer && (
                        <Badge variant="outline" className="text-xs">有答案</Badge>
                      )}
                    </div>
                    <p className="text-sm line-clamp-2">{item.questionContent}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/bank/${item.questionId}`} aria-label="查看题目详情">
                        <Eye className="h-4 w-4" />
                        <span className="ml-1 hidden sm:inline">查看</span>
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFavorite(item.questionId)}
                      aria-label="取消收藏"
                      className="text-red-500 hover:text-red-600"
                    >
                      <Heart className="h-4 w-4 fill-current" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
