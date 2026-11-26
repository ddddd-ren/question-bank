"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Save, X, AlertTriangle, CheckCircle, Info, Wand2 } from "lucide-react"
import { typeLabels, typeColors } from "@/lib/constants"
import type { EditableQuestion, BlankSlot } from "@/lib/parser/question-templates"
import type { QuestionType } from "@/lib/parser/question-extractor"
import type { QuestionQuality } from "@/lib/parser/quality-checker"

interface QuestionEditorProps {
  question: EditableQuestion
  index: number
  quality?: QuestionQuality
  onSave: (index: number, question: EditableQuestion) => Promise<boolean>
  onRemove: (index: number) => void
  onEditingChange?: (index: number, editing: boolean) => void
  onApplyTemplate?: (index: number, targetType: QuestionType, draft: EditableQuestion) => Promise<EditableQuestion | void>
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

export function QuestionEditor({ question, index, quality, onSave, onRemove, onApplyTemplate, onEditingChange }: QuestionEditorProps) {
  const [editing, setEditing] = useState(false)
  const [edited, setEdited] = useState<EditableQuestion>({ ...question })
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!editing || !onEditingChange) return
    onEditingChange(index, true)
    return () => onEditingChange(index, false)
  }, [editing, index, onEditingChange])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (await onSave(index, edited)) setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEdited({ ...question })
    setEditing(false)
  }

  const handleApplyTemplate = async () => {
    if (!onApplyTemplate) return
    setApplyingTemplate(true)
    try {
      const updated = await onApplyTemplate(index, edited.type, edited)
      if (updated) {
        setEdited(updated)
      }
    } finally {
      setApplyingTemplate(false)
    }
  }

  const handleTypeChange = async (targetType: QuestionType) => {
    if (!onApplyTemplate) {
      setEdited({ ...edited, type: targetType })
      return
    }
    setApplyingTemplate(true)
    try {
      const updated = await onApplyTemplate(index, targetType, edited)
      if (updated) {
        setEdited(updated)
      }
    } finally {
      setApplyingTemplate(false)
    }
  }

  const addOption = () => {
    const options = edited.options || []
    const letter = String.fromCharCode(65 + options.length)
    setEdited({
      ...edited,
      options: [...options, `${letter}. `],
    })
  }

  const removeOption = (optIdx: number) => {
    const options = (edited.options || []).filter((_, i) => i !== optIdx)
    setEdited({ ...edited, options })
  }

  const updateOption = (optIdx: number, value: string) => {
    const options = [...(edited.options || [])]
    options[optIdx] = value
    setEdited({ ...edited, options })
  }

  const addBlank = () => {
    const blanks = edited.blanks || []
    setEdited({
      ...edited,
      blanks: [...blanks, { id: blanks.length + 1, placeholder: "____", answer: "" }],
    })
  }

  const removeBlank = (blankIdx: number) => {
    const blanks = (edited.blanks || []).filter((_, i) => i !== blankIdx)
    setEdited({ ...edited, blanks })
  }

  const updateBlank = (blankIdx: number, field: keyof BlankSlot, value: string) => {
    const blanks = [...(edited.blanks || [])]
    blanks[blankIdx] = { ...blanks[blankIdx], [field]: value }
    setEdited({ ...edited, blanks })
  }

  const isChoice = edited.type === "single" || edited.type === "multiple"
  const isFill = edited.type === "fill"

  const hasErrors = quality?.issueCount.error && quality.issueCount.error > 0
  const hasWarnings = quality?.issueCount.warning && quality.issueCount.warning > 0
  const hasChanges = quality?.question.changes && quality.question.changes.length > 0
  const recognition = quality?.recognition
  const preservedLabel = edited.preserved
    ? typeLabels[edited.preserved.sourceType] || edited.preserved.sourceType
    : null
  const preservedSummary = edited.preserved
    ? [
        edited.preserved.options?.length ? `${edited.preserved.options.length} 个选项` : null,
        edited.preserved.blanks?.length ? `${edited.preserved.blanks.length} 个填空位` : null,
        edited.preserved.answer ? "答案" : null,
      ].filter(Boolean).join("、")
    : ""

  if (!editing) {
    return (
      <Card className={`card-hover ${hasErrors ? 'border-red-300' : hasWarnings ? 'border-amber-300' : ''}`}>
        <CardHeader className="py-3 px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {onApplyTemplate ? (
                <Select
                  value={edited.type}
                  onValueChange={(value) => void handleTypeChange(value as QuestionType)}
                  disabled={applyingTemplate || saving}
                >
                  <SelectTrigger className="h-8 w-[118px] text-xs">
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
              ) : (
                <Badge className={`${typeColors[edited.type] || 'bg-gray-500'} text-white text-xs`}>
                  {typeLabels[edited.type] || edited.type}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">#{index + 1}</span>
              {quality && (
                <Badge variant="outline" className="text-xs">
                  {quality.confidence}%
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {hasErrors && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {quality?.issueCount.error} 个错误
                </Badge>
              )}
              {hasWarnings && (
                <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                  <Info className="h-3 w-3 mr-1" />
                  {quality?.issueCount.warning} 个警告
                </Badge>
              )}
              {!hasErrors && !hasWarnings && (
                <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  通过
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                编辑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(index)}
                className="text-red-500"
                aria-label={`删除第 ${index + 1} 题`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {recognition && recognition.confidence < 80 && (
            <div className={`mb-2 text-xs ${recognition.confidence < 50 ? "text-red-600" : "text-amber-600"}`}>
              {recognition.confidence < 50 ? "识别置信度较低，请核对题型和字段" : "识别结果建议检查"}
              {recognition.evidence.length > 0 && (
                <details className="mt-1 text-muted-foreground">
                  <summary className="cursor-pointer">查看识别依据</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {recognition.evidence.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
          {edited.preserved && (
            <div className="mb-2 text-xs text-blue-600">
              已保留原{preservedLabel}的{preservedSummary || "模板数据"}，切回可恢复
            </div>
          )}
          <div className="break-words text-sm whitespace-pre-wrap">{edited.stem}</div>
          {isChoice && edited.options && edited.options.length > 0 && (
            <div className="mt-2 pl-4 space-y-1">
              {edited.options.map((opt, i) => (
                <div key={i} className="break-words text-xs text-muted-foreground">{opt}</div>
              ))}
            </div>
          )}
          {edited.answer && (
            <div className="mt-2 text-xs">
              <span className="text-green-600 font-medium">答案：{edited.answer}</span>
            </div>
          )}
          {hasChanges && quality?.question.changes && (
            <div className="mt-2 text-xs text-blue-600">
              <span className="font-medium">自动修复：</span>
              {quality.question.changes.map((change, i) => (
                <span key={i} className="ml-1">✓ {change}</span>
              ))}
            </div>
          )}
          {quality?.question.issues && quality.question.issues.length > 0 && (
            <div className="mt-2 space-y-1">
              {quality.question.issues.map((issue, i) => (
                <div key={i} className={`text-xs flex items-center gap-1 ${
                  issue.severity === 'error' ? 'text-red-600' : 
                  issue.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'
                }`}>
                  {issue.severity === 'error' ? <AlertTriangle className="h-3 w-3" /> :
                   issue.severity === 'warning' ? <Info className="h-3 w-3" /> :
                   <CheckCircle className="h-3 w-3" />}
                  {issue.message}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-primary">
      <CardHeader className="py-3 px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={edited.type}
              onValueChange={(value) => void handleTypeChange(value as QuestionType)}
              disabled={applyingTemplate || saving}
            >
              <SelectTrigger className="w-[120px] h-7 text-xs">
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
            <span className="text-xs text-muted-foreground">#{index + 1}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleSave} disabled={saving || applyingTemplate}>
              <Save className="h-4 w-4 mr-1" />
              保存
            </Button>
            {onApplyTemplate && (
              <Button variant="outline" size="sm" onClick={handleApplyTemplate} disabled={applyingTemplate || saving}>
                <Wand2 className="h-4 w-4 mr-1" />
                {applyingTemplate ? "套用中" : "套用模板"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving} aria-label="取消编辑">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <fieldset disabled={saving || applyingTemplate} className="space-y-3">
        {edited.preserved && (
          <div className="text-xs text-blue-600">
            已保留原{preservedLabel}的{preservedSummary || "模板数据"}，切回可恢复
          </div>
        )}
        {/* 题干 */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">题干</label>
          <Textarea
            value={edited.stem}
            onChange={(e) => setEdited({ ...edited, stem: e.target.value })}
            className="min-h-[80px] text-sm"
          />
        </div>

        {/* 选项（选择题） */}
        {isChoice && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">选项</label>
              <Button variant="ghost" size="sm" onClick={addOption} className="h-6 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                添加
              </Button>
            </div>
            <div className="space-y-1">
              {(edited.options || []).map((opt, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    className="h-7 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOption(i)}
                    className="h-7 w-7 p-0 text-red-500"
                    aria-label={`删除选项 ${i + 1}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 填空位置（填空题） */}
        {isFill && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">填空答案</label>
              <Button variant="ghost" size="sm" onClick={addBlank} className="h-6 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                添加空
              </Button>
            </div>
            <div className="space-y-1">
              {(edited.blanks || []).map((blank, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground w-8">#{blank.id}</span>
                  <Input
                    value={blank.answer || ""}
                    onChange={(e) => updateBlank(i, "answer", e.target.value)}
                    placeholder="答案"
                    className="h-7 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeBlank(i)}
                    className="h-7 w-7 p-0 text-red-500"
                    aria-label={`删除填空 ${i + 1}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 答案 */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">答案</label>
          <Input
            value={edited.answer || ""}
            onChange={(e) => setEdited({ ...edited, answer: e.target.value })}
            className="h-7 text-xs"
          />
        </div>

        {/* 解析 */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">解析</label>
          <Textarea
            value={edited.explanation || ""}
            onChange={(e) => setEdited({ ...edited, explanation: e.target.value })}
            className="min-h-[60px] text-xs"
          />
        </div>
        </fieldset>
      </CardContent>
    </Card>
  )
}
