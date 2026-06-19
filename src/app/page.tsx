"use client"

import Link from "next/link"
import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, Clock, Flame, PenTool, RefreshCw, Target, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { typeLabels } from "@/lib/constants"
import { useDashboard } from "@/hooks/use-swr-fetcher"

export default function Dashboard() {
  const { data, error, isLoading, mutate } = useDashboard()

  if (error) {
    return (
      <div className="space-y-8">
        <div className="page-header">
          <h1 className="text-3xl font-bold">仪表盘</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <div>
              <h2 className="text-lg font-semibold">仪表盘数据加载失败</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {error.message || "获取数据失败"}
              </p>
            </div>
            <Button onClick={() => mutate()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              重新加载
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="page-header">
          <h1 className="text-3xl font-bold">仪表盘</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="skeleton h-32" />
          ))}
        </div>
      </div>
    )
  }

  const stats = data?.questions
  const practiceStats = data?.practice
  const recentActivity = data?.recentActivity || []
  const wrongCount = data?.wrongCount || 0

  const statCards = [
    { title: "题目总数", value: stats?.total || 0, icon: BookOpen, color: "text-primary", bgColor: "bg-primary/10" },
    { title: "已练习", value: practiceStats?.total || 0, icon: PenTool, color: "text-green-600", bgColor: "bg-green-500/10" },
    { title: "正确率", value: `${practiceStats?.accuracy || 0}%`, icon: Target, color: "text-amber-600", bgColor: "bg-amber-500/10" },
    { title: "待复盘错题", value: wrongCount, icon: XCircle, color: "text-red-600", bgColor: "bg-red-500/10" },
  ]

  return (
    <div className="space-y-8">
      <div className="page-header">
        <h1 className="text-3xl font-bold">仪表盘</h1>
        <p className="text-muted-foreground mt-2">欢迎回来，继续你的学习之旅</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <Card key={stat.title} className="card-hover animate-slide-up" style={{ animationDelay: `${index * 100}ms` }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="animate-slide-up" style={{ animationDelay: "400ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-primary" />
              今日复盘
            </CardTitle>
          </CardHeader>
          <CardContent>
            {wrongCount > 0 ? (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  你有 <span className="font-bold text-foreground">{wrongCount}</span> 道错题需要复盘
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button asChild className="flex-1">
                    <Link href="/practice?mode=mistakes">
                      <XCircle className="h-4 w-4 mr-2" />
                      错题重练
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="flex-1">
                    <Link href="/mistakes">查看错题</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <CheckCircle2 className="h-10 w-10 mx-auto text-green-500 mb-2" />
                <p className="text-muted-foreground">没有待复盘的错题，继续保持！</p>
                <Button asChild variant="link" className="mt-2">
                  <Link href="/practice">开始练习</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="animate-slide-up" style={{ animationDelay: "500ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              最近答题
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((item: { id: number; questionContent: string | null; questionType: string | null; isCorrect: boolean; timeSpent: number }) => (
                  <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className={`p-1.5 rounded-lg ${item.isCorrect ? "bg-green-500/10" : "bg-red-500/10"}`}>
                      {item.isCorrect ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-1">{item.questionContent || "题目内容"}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.questionType && (typeLabels[item.questionType] || item.questionType)}
                        {item.timeSpent > 0 && ` · ${item.timeSpent}s`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">暂无答题记录</p>
                <Button asChild variant="link" className="mt-2">
                  <Link href="/practice">开始练习</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-slide-up" style={{ animationDelay: "600ms" }}>
        <Link href="/import">
          <div className="group p-4 rounded-lg border border-dashed hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer text-center">
            <p className="font-medium">导入题目</p>
            <p className="text-xs text-muted-foreground mt-1">从 Word/PPT/JSON/CSV 批量导入</p>
          </div>
        </Link>
        <Link href="/practice">
          <div className="group p-4 rounded-lg border border-dashed hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer text-center">
            <p className="font-medium">开始刷题</p>
            <p className="text-xs text-muted-foreground mt-1">随机抽取练习</p>
          </div>
        </Link>
        <Link href="/bank">
          <div className="group p-4 rounded-lg border border-dashed hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer text-center">
            <p className="font-medium">浏览题库</p>
            <p className="text-xs text-muted-foreground mt-1">查看所有题目</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
