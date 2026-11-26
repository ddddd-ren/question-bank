"use client"

import React from "react"
import { RichContent } from "@/components/rich-content"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, ChevronRight, ChevronLeft, Sparkles, Loader2, BookOpen, Flame, Brain } from "lucide-react"

interface PracticeResultProps {
  isCorrect: boolean | null
  correctAnswer: string | null
  streak: number
  isLastQuestion: boolean
  loadingAi: boolean
  onPrev: () => void
  onNext: () => void
  onFinish: () => void
  onAiExplain: () => void
  onAiReview?: () => void
  onSelfAssess: (correct: boolean) => void
  saving: boolean
  canPrev: boolean
}

export const PracticeResult = React.memo(function PracticeResult({
  isCorrect,
  correctAnswer,
  streak,
  isLastQuestion,
  loadingAi,
  onPrev,
  onNext,
  onFinish,
  onAiExplain,
  onAiReview,
  canPrev, onSelfAssess, saving,
}: PracticeResultProps) {
  return (
    <div className="space-y-4 animate-slide-up">
      <div className={`p-4 rounded-lg border ${
        isCorrect === true ? 'bg-green-500/10 border-green-500/20' :
        isCorrect === false ? 'bg-red-500/10 border-red-500/20' :
        'bg-blue-500/10 border-blue-500/20'
      }`}>
        <div className="flex items-center gap-3">
          {isCorrect === true ? (
            <>
              <div className="p-2 rounded-full bg-green-500">
                <CheckCircle className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-green-700">回答正确</p>
                {streak > 1 && (
                  <p className="text-xs text-green-600 mt-0.5">
                    <Flame className="inline h-3 w-3 mr-1" />
                    连续答对 {streak} 题
                  </p>
                )}
              </div>
            </>
          ) : isCorrect === false ? (
            <>
              <div className="p-2 rounded-full bg-red-500">
                <XCircle className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-red-700">回答错误</p>
                {correctAnswer && (
                  <div className="text-sm mt-1">正确答案：<RichContent content={correctAnswer} /></div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="p-2 rounded-full bg-blue-500">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-blue-700">已提交，待自评</p>
                {correctAnswer && (
                  <div className="text-sm mt-1">参考答案：<RichContent content={correctAnswer} /></div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {isCorrect === null && <div className="flex items-center gap-2">
        <span className="text-sm">对照参考答案自评：</span>
        <Button variant="outline" disabled={saving} onClick={() => onSelfAssess(true)}>我答对了</Button>
        <Button variant="outline" disabled={saving} onClick={() => onSelfAssess(false)}>还需复习</Button>
      </div>}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onPrev} disabled={!canPrev} className="flex-1">
          <ChevronLeft className="h-4 w-4 mr-1" />
          上一题
        </Button>
        {!isLastQuestion ? (
          <Button onClick={onNext} className="flex-1">
            下一题
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={onFinish} className="flex-1">
            查看结果
          </Button>
        )}
        {isCorrect === false && onAiReview && (
          <Button variant="outline" onClick={onAiReview} disabled={loadingAi} className="flex-1">
            {loadingAi ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Brain className="h-4 w-4 mr-1" />
            )}
            复盘分析
          </Button>
        )}
        <Button variant="outline" onClick={onAiExplain} disabled={loadingAi} className="flex-1">
          {loadingAi ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-1" />
          )}
          AI解答
        </Button>
      </div>
    </div>
  )
})