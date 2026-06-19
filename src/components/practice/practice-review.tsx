"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RotateCcw, XCircle, Clock, Flame } from "lucide-react"

interface AnswerRecord {
  questionId: number
  questionContent: string
  userAnswer: string
  correctAnswer: string | null
  isCorrect: boolean
  timeSpent: number
}

interface PracticeReviewProps {
  records: AnswerRecord[]
  totalCorrect: number
  onRestart: () => void
  onJumpToQuestion: (questionId: number) => void
}

export function PracticeReview({
  records,
  totalCorrect,
  onRestart,
  onJumpToQuestion,
}: PracticeReviewProps) {
  const wrongRecords = records.filter(r => !r.isCorrect)
  const totalTime = records.reduce((sum, r) => sum + r.timeSpent, 0)
  const avgTime = records.length > 0 ? Math.round(totalTime / records.length) : 0
  const accuracy = records.length > 0 ? Math.round((totalCorrect / records.length) * 100) : 0

  // Calculate max streak
  let maxStreak = 0
  let currentStreak = 0
  for (const r of records) {
    if (r.isCorrect) { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak) }
    else { currentStreak = 0 }
  }

  const slowest = [...records].sort((a, b) => b.timeSpent - a.timeSpent).slice(0, 3)

  const grade = accuracy >= 90 ? "S" : accuracy >= 80 ? "A" : accuracy >= 70 ? "B" : accuracy >= 60 ? "C" : "D"
  const gradeColor = { S: "text-amber-500", A: "text-green-500", B: "text-blue-500", C: "text-orange-500", D: "text-red-500" }[grade]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="page-header">
        <h1 className="text-2xl font-bold">练习回顾</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>答题统计</span>
            <span className={"text-4xl font-bold " + gradeColor}>{grade}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 rounded-lg bg-muted">
              <p className="text-2xl font-bold">{records.length}</p>
              <p className="text-sm text-muted-foreground">总题数</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-green-500/10">
              <p className="text-2xl font-bold text-green-600">{accuracy}%</p>
              <p className="text-sm text-muted-foreground">正确率</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-blue-500/10">
              <p className="text-2xl font-bold text-blue-600 flex items-center justify-center gap-1">
                <Clock className="h-5 w-5" />
                {avgTime}s
              </p>
              <p className="text-sm text-muted-foreground">平均用时</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-amber-500/10">
              <p className="text-2xl font-bold text-amber-600 flex items-center justify-center gap-1">
                <Flame className="h-5 w-5" />
                {maxStreak}
              </p>
              <p className="text-sm text-muted-foreground">最大连对</p>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-medium mb-3">答题情况</h3>
            <div className="flex flex-wrap gap-2">
              {records.map((r, i) => (
                <div
                  key={i}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-medium cursor-pointer transition-transform hover:scale-110 ${r.isCorrect ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}
                  title={`第${i + 1}题: ${r.isCorrect ? "正确" : "错误"} | ${r.timeSpent}s`}
                  onClick={() => onJumpToQuestion(r.questionId)}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </div>

          {slowest.length > 0 && slowest[0].timeSpent > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                最耗时题目
              </h3>
              <div className="space-y-2">
                {slowest.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 text-sm">
                    <span className="text-muted-foreground w-6">{i + 1}.</span>
                    <span className="flex-1 truncate">{r.questionContent}...</span>
                    <span className="text-muted-foreground">{r.timeSpent}s</span>
                    <span className={r.isCorrect ? "text-green-500" : "text-red-500"}>
                      {r.isCorrect ? "对" : "错"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {wrongRecords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              错题回顾 ({wrongRecords.length}道)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {wrongRecords.map((r, i) => (
                <div key={i} className="p-3 rounded-lg border bg-red-500/5">
                  <p className="text-sm mb-2 line-clamp-2">{r.questionContent}...</p>
                  <div className="flex gap-4 text-xs">
                    <span className="text-red-600">你的答案: {r.userAnswer}</span>
                    {r.correctAnswer && (
                      <span className="text-green-600">正确答案: {r.correctAnswer}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button onClick={onRestart} className="flex-1">
          <RotateCcw className="h-4 w-4 mr-2" />
          再来一组
        </Button>
      </div>
    </div>
  )
}