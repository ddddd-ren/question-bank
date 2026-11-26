"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { showToast } from "@/components/toast"
import { typeLabels } from "@/lib/constants"
import type { EditableQuestion } from "@/lib/parser/question-templates"
import type { QuestionQuality } from "@/lib/parser/quality-checker"
import type { QuestionType } from "@/lib/types"

export interface ParsedQuestion {
  index: number
  original: unknown
  editable: EditableQuestion
  preview: string
  quality?: QuestionQuality
}

export interface ImportBatch {
  sourceFile: string
  count: number
  latest: string
}

export interface QualitySummary {
  withErrors: number
  withWarnings: number
  withChanges: number
  passed: number
}

export type ImportStep = "upload" | "preview" | "done"
export type ImportFilter = "all" | "errors" | "warnings" | "passed"

export const SUPPORTED_EXTENSIONS = [".docx", ".pdf", ".ppt", ".pptx", ".pptm", ".json", ".csv"] as const
export const SUPPORTED_FILE_HINT = SUPPORTED_EXTENSIONS.join("、")

function getFileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".")
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ""
}

function isSupportedFile(file: File) {
  return SUPPORTED_EXTENSIONS.includes(getFileExtension(file.name) as typeof SUPPORTED_EXTENSIONS[number])
}

export function useImportWorkflow() {
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [pendingEdits, setPendingEdits] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([])
  const [result, setResult] = useState<{ imported: number; duplicates: number } | null>(null)
  const [step, setStep] = useState<ImportStep>("upload")
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<ImportFilter>("all")
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set())
  const [showHelp, setShowHelp] = useState(false)
  const [batches, setBatches] = useState<ImportBatch[]>([])

  useEffect(() => {
    fetch("/api/import-batches")
      .then((response) => response.json())
      .then((data) => setBatches(data.batches || []))
      .catch(() => {})
  }, [])

  const selectFile = useCallback((selectedFile: File) => {
    if (!isSupportedFile(selectedFile)) {
      const message = `暂不支持该文件格式，请上传 ${SUPPORTED_FILE_HINT} 文件`
      setFile(null)
      setError(message)
      showToast(message, "error")
      return
    }

    setFile(selectedFile)
    setParsedQuestions([])
    setResult(null)
    setStep("upload")
    setError(null)
    setSelectedQuestions(new Set())
  }, [])

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) selectFile(selectedFile)
    event.target.value = ""
  }, [selectFile])

  const handleDrag = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.type === "dragenter" || event.type === "dragover") setDragActive(true)
    if (event.type === "dragleave") setDragActive(false)
  }, [])

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    const droppedFile = event.dataTransfer.files?.[0]
    if (droppedFile) selectFile(droppedFile)
  }, [selectFile])

  const handleParse = useCallback(async () => {
    if (!file) return
    setParsing(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      const response = await fetch("/api/questions/preview", { method: "POST", body: formData })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "解析失败")
      if (!data.total || !Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error("未识别到题目，请检查文件内容是否包含题号、选项或答案")
      }
      setParsedQuestions(data.questions)
      setStep("preview")
      showToast(`解析成功，共 ${data.total} 道题目`, "success")
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "解析失败"
      setError(message)
      showToast(message, "error")
    } finally {
      setParsing(false)
    }
  }, [file])

  const handleSaveQuestion = useCallback(async (index: number, edited: EditableQuestion) => {
    const original = parsedQuestions[index]
    setPendingEdits(count => count + 1)
    try {
      const response = await fetch("/api/questions/preview", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: edited, index }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "保存失败")
      setParsedQuestions(previous => previous.map(question => question === original
        ? { ...question, editable: data.editable, preview: data.preview, quality: data.quality }
        : question))
      showToast("题目已更新", "success")
      return true
    } catch (caughtError) {
      showToast(caughtError instanceof Error ? caughtError.message : "保存失败", "error")
      return false
    } finally {
      setPendingEdits(count => count - 1)
    }
  }, [parsedQuestions])

  const handleApplyTemplate = useCallback(async (index: number, targetType: QuestionType, draft: EditableQuestion) => {
    const original = parsedQuestions[index]
    setPendingEdits(count => count + 1)
    try {
      const response = await fetch("/api/questions/preview", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: draft, targetType, index }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "套用模板失败")

      setParsedQuestions(previous => previous.map(question => question === original
        ? { ...question, editable: data.editable, preview: data.preview, quality: data.quality }
        : question))
      showToast(`已套用${typeLabels[targetType]}模板`, "success")
      return data.editable as EditableQuestion
    } catch (caughtError) {
      showToast(caughtError instanceof Error ? caughtError.message : "套用模板失败", "error")
    } finally {
      setPendingEdits(count => count - 1)
    }
  }, [parsedQuestions])

  const handleRemoveQuestion = useCallback((index: number) => {
    setParsedQuestions((previous) => previous.filter((_, itemIndex) => itemIndex !== index))
    setSelectedQuestions(new Set())
  }, [])

  const qualitySummary = useMemo<QualitySummary | null>(() => {
    if (!parsedQuestions.length) return null
    return {
      withErrors: parsedQuestions.filter((question) => (question.quality?.issueCount.error ?? 0) > 0).length,
      withWarnings: parsedQuestions.filter((question) => (question.quality?.issueCount.warning ?? 0) > 0).length,
      withChanges: parsedQuestions.filter((question) => (question.quality?.question.changes?.length ?? 0) > 0).length,
      passed: parsedQuestions.filter((question) => question.quality?.issueCount.error === 0 && question.quality.issueCount.warning === 0).length,
    }
  }, [parsedQuestions])

  const typeCounts = useMemo(() => parsedQuestions.reduce<Record<string, number>>((counts, question) => {
    counts[question.editable.type] = (counts[question.editable.type] || 0) + 1
    return counts
  }, {}), [parsedQuestions])

  const filteredQuestions = useMemo(() => parsedQuestions.flatMap((question, index) => {
    if (searchQuery && !question.editable.stem.toLowerCase().includes(searchQuery.toLowerCase())) return []
    if (filterType === "errors" && (question.quality?.issueCount.error ?? 0) === 0) return []
    if (filterType === "warnings" && (question.quality?.issueCount.warning ?? 0) === 0) return []
    if (filterType === "passed" && !(question.quality?.issueCount.error === 0 && question.quality.issueCount.warning === 0)) return []
    return [{ question, index }]
  }), [filterType, parsedQuestions, searchQuery])

  const handleImport = useCallback(async () => {
    if (pendingEdits > 0) return
    if ((qualitySummary?.withErrors ?? 0) > 0) {
      setFilterType("errors")
      showToast("仍有题目存在错误，请修复后再导入", "error")
      return
    }

    setImporting(true)
    try {
      const response = await fetch("/api/questions/preview", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: parsedQuestions.map((question) => question.editable), sourceFile: file?.name }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "导入失败")
      setResult({ imported: data.imported, duplicates: data.duplicates })
      setStep("done")
      showToast(`导入成功，共 ${data.imported} 道题目`, "success")
    } catch (caughtError) {
      showToast(caughtError instanceof Error ? caughtError.message : "导入失败", "error")
    } finally {
      setImporting(false)
    }
  }, [file, parsedQuestions, qualitySummary, pendingEdits])

  const handleReset = useCallback(() => {
    setFile(null)
    setParsedQuestions([])
    setResult(null)
    setStep("upload")
    setError(null)
    setSearchQuery("")
    setFilterType("all")
    setSelectedQuestions(new Set())
  }, [])

  const handleDownloadTemplate = useCallback(async (format: "json" | "csv") => {
    try {
      const response = await fetch(`/api/templates?format=${format}`)
      if (!response.ok) throw new Error("下载失败")
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `question-template.${format}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      showToast("模板下载成功", "success")
    } catch {
      showToast("下载失败", "error")
    }
  }, [])

  const handleSelectAll = useCallback(() => {
    const visibleIndexes = filteredQuestions.map((item) => item.index)
    const allSelected = visibleIndexes.length > 0 && visibleIndexes.every((index) => selectedQuestions.has(index))
    setSelectedQuestions(allSelected ? new Set() : new Set(visibleIndexes))
  }, [filteredQuestions, selectedQuestions])

  const handleDeleteSelected = useCallback(() => {
    if (selectedQuestions.size === 0) return
    setParsedQuestions((previous) => previous.filter((_, index) => !selectedQuestions.has(index)))
    showToast(`已删除 ${selectedQuestions.size} 道题目`, "success")
    setSelectedQuestions(new Set())
  }, [selectedQuestions])

  const handleToggleSelect = useCallback((index: number) => {
    setSelectedQuestions((previous) => {
      const updated = new Set(previous)
      if (updated.has(index)) updated.delete(index)
      else updated.add(index)
      return updated
    })
  }, [])

  return {
    file, parsing, importing, dragActive, parsedQuestions, result, step, error,
    searchQuery, setSearchQuery, filterType, setFilterType, selectedQuestions,
    showHelp, setShowHelp, batches, typeCounts, qualitySummary, filteredQuestions,
    importBlockedByErrors: pendingEdits > 0 || (qualitySummary?.withErrors ?? 0) > 0,
    handleFileChange, handleDrag, handleDrop, handleParse, handleSaveQuestion,
    handleApplyTemplate, handleRemoveQuestion, handleImport, handleReset,
    handleDownloadTemplate, handleSelectAll, handleDeleteSelected, handleToggleSelect,
  }
}
