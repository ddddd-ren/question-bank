"use client"

import React from "react"
import { Badge } from "@/components/ui/badge"
import { Eye, EyeOff } from "lucide-react"
import { typeLabels, typeColors } from "@/lib/constants"
import { parseOptionText, getOptionLetter } from "@/lib/utils"
import { CheckCircle, XCircle } from "lucide-react"
import { CodeBlock } from "@/components/code-block"

interface PracticeQuestionProps {
  question: {
    id: number
    type: string
    content: string
    options: string[] | null
    answer: string | null
  }
  showAnswer: boolean
  onToggleAnswer: () => void
  showResult: boolean
  selectedAnswer: string | null
  onAnswer: (answer: string) => void
}

export const PracticeQuestion = React.memo(function PracticeQuestion({
  question,
  showAnswer,
  onToggleAnswer,
  showResult,
  selectedAnswer,
  onAnswer,
}: PracticeQuestionProps) {
  const hasOptions = question.options && question.options.length > 0

  return (
    <>
      {/* Question Header */}
      <div className="px-6 py-4 bg-muted/30 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className={`${typeColors[question.type] || 'bg-gray-500'} text-white`}>
            {typeLabels[question.type] || question.type}
          </Badge>
          <span className="text-xs text-muted-foreground">#{question.id}</span>
        </div>
        {!showResult && question.answer && (
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={onToggleAnswer}
          >
            {showAnswer ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showAnswer ? "隐藏答案" : "查看答案"}
          </button>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Question Content */}
        {question.type === "code" ? (
          <CodeBlock code={question.content} language="java" />
        ) : (
          <div className="text-base leading-relaxed whitespace-pre-wrap">
            {question.content}
          </div>
        )}

        {/* Answer Preview */}
        {showAnswer && question.answer && !showResult && (
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 animate-slide-up">
            <p className="text-sm text-blue-700">
              <Eye className="inline h-3 w-3 mr-1" />
              答案: <span className="font-medium">{question.answer}</span>
            </p>
          </div>
        )}

        {/* Options */}
        {hasOptions && (
          <div className="grid gap-2">
            {question.options!.map((opt, idx) => {
              const letter = getOptionLetter(opt)
              const text = parseOptionText(opt)
              const isSelected = selectedAnswer === letter
              const isCorrectAnswer = (question.answer || "").toUpperCase().includes(letter.toUpperCase())

              let extraClass = ""
              if (showResult) {
                if (isCorrectAnswer) {
                  extraClass = "border-green-500 bg-green-500/10"
                } else if (isSelected && !isCorrectAnswer) {
                  extraClass = "border-red-500 bg-red-500/10"
                } else {
                  extraClass = "opacity-50"
                }
              } else if (isSelected) {
                extraClass = "border-primary bg-primary/5"
              }

              return (
                <button
                  key={idx}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${extraClass} ${
                    showResult ? 'cursor-default' : 'cursor-pointer hover:border-primary/50 hover:shadow-sm'
                  }`}
                  onClick={() => !showResult && onAnswer(letter)}
                  disabled={showResult}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      showResult && isCorrectAnswer ? 'bg-green-500 text-white' :
                      showResult && isSelected && !isCorrectAnswer ? 'bg-red-500 text-white' :
                      isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      {letter}
                    </span>
                    <span className="flex-1">{text}</span>
                    {showResult && isCorrectAnswer && (
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                    )}
                    {showResult && isSelected && !isCorrectAnswer && (
                      <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* True/False Buttons */}
        {question.type === "truefalse" && !hasOptions && !showResult && (
          <div className="grid grid-cols-2 gap-3">
            <button
              className={`p-4 rounded-lg border-2 text-center transition-all ${
                selectedAnswer === "对" ? 'border-green-500 bg-green-500/10' : 'hover:border-green-500/50'
              }`}
              onClick={() => onAnswer("对")}
            >
              <CheckCircle className="h-6 w-6 mx-auto mb-1 text-green-500" />
              <span className="font-medium">正确</span>
            </button>
            <button
              className={`p-4 rounded-lg border-2 text-center transition-all ${
                selectedAnswer === "错" ? 'border-red-500 bg-red-500/10' : 'hover:border-red-500/50'
              }`}
              onClick={() => onAnswer("错")}
            >
              <XCircle className="h-6 w-6 mx-auto mb-1 text-red-500" />
              <span className="font-medium">错误</span>
            </button>
          </div>
        )}
      </div>
    </>
  )
})