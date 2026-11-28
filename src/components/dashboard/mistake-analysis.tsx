"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import useSWR from "swr"
import { AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetcher, useSubjects } from "@/hooks/use-swr-fetcher"

interface MistakeAnalysisItem {
  subjectId: number | null
  subjectName: string
  knowledgePointId: number | null
  knowledgePointName: string
  graded: number
  correct: number
  wrong: number
  wrongQuestions: number
}

interface SubjectMistakeSummary {
  subjectId: number | null
  subjectName: string
  graded: number
  correct: number
  wrong: number
}

const EMPTY_MISTAKE_STATS: MistakeAnalysisItem[] = []

export function MistakeAnalysis() {
  const [subjectId, setSubjectId] = useState("all")
  const [period, setPeriod] = useState("30")
  const { data: subjects = [] } = useSubjects()
  const query = new URLSearchParams({ period })
  if (subjectId !== "all") query.set("subjectId", subjectId)

  const { data, error, isLoading } = useSWR<MistakeAnalysisItem[]>(
    `/api/analytics/mistakes?${query.toString()}`,
    fetcher,
  )

  const stats = data ?? EMPTY_MISTAKE_STATS
  const chartItems = useMemo(() => [...stats].sort((left, right) => {
    const leftLowSample = left.graded < 3
    const rightLowSample = right.graded < 3
    if (leftLowSample !== rightLowSample) return Number(leftLowSample) - Number(rightLowSample)
    const rateDifference = right.wrong / right.graded - left.wrong / left.graded
    return rateDifference || right.wrong - left.wrong
  }).slice(0, 10), [stats])
  const subjectItems = useMemo(() => {
    const summary = new Map<number | null, SubjectMistakeSummary>()
    for (const item of stats) {
      const subject = summary.get(item.subjectId) ?? {
        subjectId: item.subjectId,
        subjectName: item.subjectName,
        graded: 0,
        correct: 0,
        wrong: 0,
      }
      subject.graded += item.graded
      subject.correct += item.correct
      subject.wrong += item.wrong
      summary.set(item.subjectId, subject)
    }
    return [...summary.values()].sort((left, right) => {
      const rateDifference = right.wrong / right.graded - left.wrong / left.graded
      return rateDifference || right.wrong - left.wrong
    })
  }, [stats])
  const maximumAttempts = Math.max(...chartItems.map((item) => item.graded), 1)
  const maximumSubjectAttempts = Math.max(...subjectItems.map((item) => item.graded), 1)
  const highestWrongCounts = stats.filter((item) => item.wrong > 0)
    .sort((left, right) => right.wrong - left.wrong)
    .slice(0, 3)
  const totalWrongAttempts = stats.reduce((total, item) => total + item.wrong, 0)
  const totalWrongQuestions = stats.reduce((total, item) => total + item.wrongQuestions, 0)

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>错题分析</CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger aria-label="按学科筛选错题分析" className="sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部学科</SelectItem>
              {subjects.map((subject: { id: number; name: string }) => (
                <SelectItem key={subject.id} value={String(subject.id)}>{subject.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger aria-label="选择错题分析时间范围" className="sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">近 30 天</SelectItem>
              <SelectItem value="all">全部时间</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && !data ? (
          <div role="alert" className="flex items-center gap-2 py-8 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            错题分析加载失败，请稍后重试
          </div>
        ) : isLoading && !data ? (
          <div className="skeleton h-40 rounded-lg" aria-label="正在加载错题分析" />
        ) : stats.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">所选范围内暂无已判分答题记录</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">答错次数</p>
                <p className="mt-1 text-2xl font-semibold">{totalWrongAttempts}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">涉及错题</p>
                <p className="mt-1 text-2xl font-semibold">{totalWrongQuestions}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="图例">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" />答错</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-green-500" />答对</span>
              <span>条形长度表示作答次数，红绿表示答错与答对比例</span>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">按学科</p>
              {subjectItems.map((subject) => {
                const wrongWidth = (subject.wrong / subject.graded) * 100
                const selected = subject.subjectId !== null && subjectId === String(subject.subjectId)
                const content = (
                  <>
                    <span className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{subject.subjectName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {subject.wrong}/{subject.graded} 次答错 · {Math.round(wrongWidth)}%
                      </span>
                    </span>
                    <span className="block h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <span className="flex h-full" style={{ width: `${(subject.graded / maximumSubjectAttempts) * 100}%` }}>
                        {subject.wrong > 0 && <span className="h-full bg-red-500" style={{ width: `${wrongWidth}%` }} />}
                        {subject.correct > 0 && <span className="h-full bg-green-500" style={{ width: `${100 - wrongWidth}%` }} />}
                      </span>
                    </span>
                  </>
                )
                const className = `block w-full rounded-lg p-2 text-left transition-colors ${selected ? "bg-muted" : ""}`

                if (subject.subjectId === null) {
                  return <div key="unassigned-subject" className={className}>{content}</div>
                }

                return (
                  <button
                    key={subject.subjectId}
                    type="button"
                    onClick={() => setSubjectId(selected ? "all" : String(subject.subjectId))}
                    className={`${className} hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                    aria-pressed={selected}
                  >
                    {content}
                  </button>
                )
              })}
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">按知识点</p>
              {chartItems.map((item) => {
                const wrongWidth = (item.wrong / item.graded) * 100
                const correctWidth = (item.correct / item.graded) * 100
                const wrongRate = Math.round(wrongWidth)
                const target = item.knowledgePointId
                  ? `/practice?mode=mistakes&subjectId=${item.subjectId}&knowledgePointId=${item.knowledgePointId}`
                  : "/practice?mode=mistakes"

                return (
                  <Link
                    key={`${item.subjectId ?? "none"}-${item.knowledgePointId ?? "none"}`}
                    href={target}
                    className="block rounded-lg p-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`${item.subjectName}，${item.knowledgePointName}，已判分 ${item.graded} 次，答错 ${item.wrong} 次，错误率 ${wrongRate}%，点击查看相关练习`}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {item.knowledgePointName}
                        {subjectId === "all" && <span className="ml-2 font-normal text-muted-foreground">{item.subjectName}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {item.wrong}/{item.graded} 次答错 · {wrongRate}%
                        {item.graded < 3 && <span className="ml-2 text-amber-700 dark:text-amber-400">样本较少</span>}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`答错 ${item.wrong} 次，答对 ${item.correct} 次`}>
                      <div className="flex h-full" style={{ width: `${(item.graded / maximumAttempts) * 100}%` }}>
                        {item.wrong > 0 && <span className="h-full bg-red-500" style={{ width: `${wrongWidth}%` }} />}
                        {item.correct > 0 && <span className="h-full bg-green-500" style={{ width: `${correctWidth}%` }} />}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
            {stats.length > chartItems.length && (
              <p className="text-xs text-muted-foreground">图表最多显示 {chartItems.length} 个知识点，样本少于 3 次的排在后面</p>
            )}
            {highestWrongCounts.length > 0 && (
              <div className="border-t pt-4">
                <p className="mb-2 text-sm font-medium">答错次数较多</p>
                <div className="flex flex-wrap gap-2">
                  {highestWrongCounts.map((item) => (
                    <Link
                      key={`${item.subjectId ?? "none"}-${item.knowledgePointId ?? "none"}`}
                      href={item.knowledgePointId
                        ? `/practice?mode=mistakes&subjectId=${item.subjectId}&knowledgePointId=${item.knowledgePointId}`
                        : "/practice?mode=mistakes"}
                      className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.knowledgePointName} · {item.wrongQuestions} 道错题
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
