"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Upload, CheckCircle, FileUp, Save, FileJson, FileSpreadsheet, FileText, FileType, AlertTriangle, Info, Search, ChevronUp, HelpCircle, Trash2, CheckSquare, Square, History, File, Loader2 } from "lucide-react"
import { typeLabels, typeColors } from "@/lib/constants"
import { showToast } from "@/components/toast"
import { QuestionEditor } from "@/components/import/question-editor"
import { cn } from "@/lib/utils"
import type { EditableQuestion } from "@/lib/parser/question-templates"
import type { QuestionQuality } from "@/lib/parser/quality-checker"
import type { QuestionType } from "@/lib/types"

interface ParsedQuestion {
  index: number
  original: unknown
  editable: EditableQuestion
  preview: string
  quality?: QuestionQuality
}

const SUPPORTED_EXTENSIONS = [".docx", ".pdf", ".ppt", ".pptx", ".pptm", ".json", ".csv"] as const
const SUPPORTED_FILE_HINT = SUPPORTED_EXTENSIONS.join("、")

function getFileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".")
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ""
}

function isSupportedFile(file: File) {
  return SUPPORTED_EXTENSIONS.includes(getFileExtension(file.name) as typeof SUPPORTED_EXTENSIONS[number])
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([])
  const [result, setResult] = useState<{ imported: number; duplicates: number } | null>(null)
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload")
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<"all" | "errors" | "warnings" | "passed">("all")
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set())
  const [showHelp, setShowHelp] = useState(false)
  const [batches, setBatches] = useState<{ sourceFile: string; count: number; latest: string }[]>([])

  // Fetch import batches
  useEffect(() => {
    fetch("/api/import-batches")
      .then(r => r.json())
      .then(data => setBatches(data.batches || []))
      .catch(() => {})
  }, [])

  const selectFile = useCallback((selectedFile: File) => {
    if (!isSupportedFile(selectedFile)) {
      const msg = `暂不支持该文件格式，请上传 ${SUPPORTED_FILE_HINT} 文件`
      setFile(null)
      setError(msg)
      showToast(msg, "error")
      return
    }

    setFile(selectedFile)
    setParsedQuestions([])
    setResult(null)
    setStep("upload")
    setError(null)
    setSelectedQuestions(new Set())
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      selectFile(selectedFile)
    }
    e.target.value = ""
  }, [selectFile])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    }
    if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      selectFile(droppedFile)
    }
  }, [selectFile])

  const handleParse = useCallback(async () => {
    if (!file) return

    setParsing(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/questions/preview", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "解析失败")
      }

      const data = await res.json()
      if (!data.total || !Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error("未识别到题目，请检查文件内容是否包含题号、选项或答案")
      }

      setParsedQuestions(data.questions)
      setStep("preview")
      showToast(`解析成功，共 ${data.total} 道题目`, "success")
    } catch (error) {
      const msg = error instanceof Error ? error.message : "解析失败"
      setError(msg)
      showToast(msg, "error")
    } finally {
      setParsing(false)
    }
  }, [file])

  const handleSaveQuestion = useCallback((index: number, edited: EditableQuestion) => {
    setParsedQuestions(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], editable: edited }
      return updated
    })
    showToast("题目已更新", "success")
  }, [])

  const handleApplyTemplate = useCallback(async (index: number, targetType: QuestionType, draft: EditableQuestion) => {
    try {
      const res = await fetch("/api/questions/preview", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: draft,
          targetType,
          index,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "套用模板失败")
      }

      const data = await res.json() as {
        editable: EditableQuestion
        preview: string
        quality: QuestionQuality
      }

      setParsedQuestions(prev => {
        const updated = [...prev]
        updated[index] = {
          ...updated[index],
          editable: data.editable,
          preview: data.preview,
          quality: data.quality,
        }
        return updated
      })
      showToast(`已套用${typeLabels[targetType]}模板`, "success")
      return data.editable
    } catch (error) {
      const msg = error instanceof Error ? error.message : "套用模板失败"
      showToast(msg, "error")
    }
  }, [])

  const handleRemoveQuestion = useCallback((index: number) => {
    setParsedQuestions(prev => prev.filter((_, i) => i !== index))
    setSelectedQuestions(new Set())
  }, [])

  const handleImport = useCallback(async () => {
    const hasErrors = parsedQuestions.some(q => q.quality?.issueCount.error && q.quality.issueCount.error > 0)
    if (hasErrors) {
      setFilterType("errors")
      showToast("仍有题目存在错误，请修复后再导入", "error")
      return
    }

    setImporting(true)

    try {
      const questions = parsedQuestions.map(q => q.editable)

      const res = await fetch("/api/questions/preview", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions,
          sourceFile: file?.name,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "导入失败")
      }

      const data = await res.json()
      setResult({
        imported: data.imported,
        duplicates: data.duplicates,
      })
      setStep("done")
      showToast(`导入成功，共 ${data.imported} 道题目`, "success")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "导入失败", "error")
    } finally {
      setImporting(false)
    }
  }, [parsedQuestions, file])

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
      const res = await fetch("/api/templates?format=" + format)
      if (!res.ok) throw new Error("下载失败")

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "question-template." + format
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showToast("模板下载成功", "success")
    } catch {
      showToast("下载失败", "error")
    }
  }, [])

  const typeCounts = parsedQuestions.reduce((acc, q) => {
    const type = q.editable.type
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const qualitySummary = useMemo(() => {
    if (!parsedQuestions.length) return null

    const withErrors = parsedQuestions.filter(q => q.quality?.issueCount.error && q.quality.issueCount.error > 0).length
    const withWarnings = parsedQuestions.filter(q => q.quality?.issueCount.warning && q.quality.issueCount.warning > 0).length
    const withChanges = parsedQuestions.filter(q => q.quality?.question.changes && q.quality.question.changes.length > 0).length
    const passed = parsedQuestions.filter(q => q.quality && q.quality.issueCount.error === 0 && q.quality.issueCount.warning === 0).length

    return { withErrors, withWarnings, withChanges, passed }
  }, [parsedQuestions])

  const importBlockedByErrors = (qualitySummary?.withErrors ?? 0) > 0

  const filteredQuestions = useMemo(() => {
    return parsedQuestions.flatMap((question, index) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const content = question.editable.stem.toLowerCase()
        if (!content.includes(query)) return []
      }

      // Quality filter
      if (filterType === "errors" && !(question.quality?.issueCount.error && question.quality.issueCount.error > 0)) return []
      if (filterType === "warnings" && !(question.quality?.issueCount.warning && question.quality.issueCount.warning > 0)) return []
      if (filterType === "passed" && !(question.quality && question.quality.issueCount.error === 0 && question.quality.issueCount.warning === 0)) return []

      return [{ question, index }]
    })
  }, [parsedQuestions, searchQuery, filterType])

  const handleSelectAll = useCallback(() => {
    const visibleIndexes = filteredQuestions.map(q => q.index)
    if (visibleIndexes.length > 0 && visibleIndexes.every(index => selectedQuestions.has(index))) {
      setSelectedQuestions(new Set())
    } else {
      setSelectedQuestions(new Set(visibleIndexes))
    }
  }, [filteredQuestions, selectedQuestions])

  const handleDeleteSelected = useCallback(() => {
    if (selectedQuestions.size === 0) return
    setParsedQuestions(prev => prev.filter((_, i) => !selectedQuestions.has(i)))
    setSelectedQuestions(new Set())
    showToast(`已删除 ${selectedQuestions.size} 道题目`, "success")
  }, [selectedQuestions])

  const handleToggleSelect = useCallback((index: number) => {
    setSelectedQuestions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }, [])

  const getFileIcon = () => {
    if (!file) return <Upload className="h-8 w-8 text-primary" />
    const ext = file.name.split(".").pop()?.toLowerCase()
    switch (ext) {
      case "json": return <FileJson className="h-8 w-8 text-green-500" />
      case "csv": return <FileSpreadsheet className="h-8 w-8 text-blue-500" />
      case "pdf": return <FileType className="h-8 w-8 text-red-500" />
      case "ppt":
      case "pptx":
      case "pptm": return <FileText className="h-8 w-8 text-orange-500" />
      default: return <FileText className="h-8 w-8 text-primary" />
    }
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">导入题目</h1>
            <p className="text-muted-foreground mt-2">支持 Word、PDF、PPT、JSON、CSV 格式批量导入，支持预览编辑</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowHelp(!showHelp)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            帮助
          </Button>
        </div>
      </div>

      {/* Help Panel */}
      {showHelp && (
        <Card className="animate-slide-up">
          <CardContent className="p-4">
            <h3 className="font-medium mb-3">使用帮助</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-primary mb-2">导入流程</h4>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>选择或拖拽文件（支持 Word/PDF/PPT/JSON/CSV）</li>
                  <li>点击“开始解析”按钮</li>
                  <li>预览并编辑识别结果</li>
                  <li>点击“确认导入”完成</li>
                </ol>
              </div>
              <div>
                <h4 className="font-medium text-primary mb-2">质量检查</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>错误：必须修复才能导入</li>
                  <li>警告：建议检查确认</li>
                  <li>通过：识别正确</li>
                  <li>自动修复：已自动规范化</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step Indicator */}
      <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:justify-center sm:gap-4">
        {[
          { key: "upload", label: "选择文件", icon: FileUp },
          { key: "preview", label: "预览编辑", icon: CheckCircle },
          { key: "done", label: "导入完成", icon: Save },
        ].map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && <div className={`hidden h-0.5 w-8 sm:block ${step === s.key || step === "done" ? "bg-primary" : "bg-muted"}`} />}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
              step === s.key ? "bg-primary text-primary-foreground" : 
              (step === "preview" && s.key === "upload") || (step === "done") ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              <s.icon className="h-4 w-4" />
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {step === "upload" && (
        <Card className="animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5 text-primary" />
              选择文件
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 p-4 bg-muted/50 rounded-lg border border-border/70">
              <p className="text-sm font-medium mb-3">下载导入模板</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => handleDownloadTemplate("json")}>
                  <FileJson className="h-4 w-4 mr-2" />
                  JSON 模板
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDownloadTemplate("csv")}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  CSV 模板
                </Button>
              </div>
            </div>

            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                dragActive
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              )}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
            >
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".docx,.pdf,.ppt,.pptx,.pptm,.json,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-4">
                  {file ? (
                    <>
                      {getFileIcon()}
                      <div>
                        <p className="font-medium text-lg">{file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                        <p className="text-sm text-primary">点击或拖拽更换文件</p>
                      </>
                    ) : (
                    <>
                      <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Upload className="h-8 w-8 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-lg">
                          {dragActive ? "松开即可上传文件" : "点击选择或拖拽文件"}
                        </p>
                        <p className="text-sm text-muted-foreground">支持 {SUPPORTED_FILE_HINT} 格式</p>
                      </div>
                    </>
                  )}
                </div>
              </label>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="p-4 bg-muted/40 border border-border/70 rounded-lg">
                <h4 className="font-medium mb-2">Word 格式</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>使用章节标题（如“单选题”）</li>
                  <li>题号格式（如“1.”）</li>
                  <li>选项以 A. B. C. D. 开头</li>
                  <li>答案可用红色标记</li>
                </ul>
              </div>
              <div className="p-4 bg-muted/40 border border-border/70 rounded-lg">
                <h4 className="font-medium mb-2">PPT 格式</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>支持 .ppt / .pptx / .pptm</li>
                  <li>按幻灯片顺序读取文本</li>
                  <li>题号格式（如“1.”）</li>
                  <li>选项以 A. B. C. D. 开头</li>
                </ul>
              </div>
              <div className="p-4 bg-muted/40 border border-border/70 rounded-lg">
                <h4 className="font-medium mb-2">PDF 格式</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>支持文本型 PDF</li>
                  <li>自动过滤页码页眉</li>
                  <li>兼容 A. / A) / A、选项</li>
                  <li>扫描件需先 OCR</li>
                </ul>
              </div>
              <div className="p-4 bg-muted/40 border border-border/70 rounded-lg">
                <h4 className="font-medium mb-2">JSON 格式</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>下载模板填写</li>
                  <li>支持所有题型</li>
                  <li>可包含标签和解析</li>
                  <li>推荐大批量导入</li>
                </ul>
              </div>
              <div className="p-4 bg-muted/40 border border-border/70 rounded-lg">
                <h4 className="font-medium mb-2">CSV 格式</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>可直接用 Excel 编辑</li>
                  <li>选项用 | 分隔</li>
                  <li>标签用 | 分隔</li>
                  <li>适合简单批量导入</li>
                </ul>
              </div>
            </div>

            {file && (
              <div className="mt-6 flex justify-center">
                <Button onClick={handleParse} disabled={parsing} size="lg">
                  {parsing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {parsing ? "解析中..." : "开始解析"}
                </Button>
              </div>
            )}

            {error && (
              <div className="mt-4 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "preview" && (
        <div className="space-y-4 animate-slide-up">
          {/* Stats Card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <span className="text-sm font-medium">共 {parsedQuestions.length} 道题目</span>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(typeCounts).map(([type, count]) => (
                      <Badge key={type} className={`${typeColors[type] || "bg-gray-500"} text-white text-xs`}>
                        {typeLabels[type]}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleReset}>
                    重新上传
                  </Button>
                  <Button onClick={handleImport} disabled={importing || parsedQuestions.length === 0 || importBlockedByErrors}>
                    {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    {importing ? "导入中..." : `确认导入 ${parsedQuestions.length} 道`}
                  </Button>
                </div>
              </div>

              {qualitySummary && (
                <div className="mt-3 pt-3 border-t flex flex-wrap gap-4 text-sm">
                  <span className="text-green-600 flex items-center gap-1 cursor-pointer" onClick={() => setFilterType("passed")}>
                    <CheckCircle className="h-4 w-4" />
                    {qualitySummary.passed} 道通过
                  </span>
                  {qualitySummary.withErrors > 0 && (
                    <span className="text-red-600 flex items-center gap-1 cursor-pointer" onClick={() => setFilterType("errors")}>
                      <AlertTriangle className="h-4 w-4" />
                      {qualitySummary.withErrors} 道有错误
                    </span>
                  )}
                  {qualitySummary.withWarnings > 0 && (
                    <span className="text-amber-600 flex items-center gap-1 cursor-pointer" onClick={() => setFilterType("warnings")}>
                      <Info className="h-4 w-4" />
                      {qualitySummary.withWarnings} 道有警告
                    </span>
                  )}
                  {qualitySummary.withChanges > 0 && (
                    <span className="text-blue-600 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />
                      {qualitySummary.withChanges} 道已自动修复
                    </span>
                  )}
                </div>
              )}

              {importBlockedByErrors && (
                <div className="mt-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  有题目存在错误，请先修复或删除后再导入。
                </div>
              )}
            </CardContent>
          </Card>

          {/* Search and Filter Bar */}
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索题目内容..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "all", label: "全部" },
                    { key: "errors", label: "有错误" },
                    { key: "warnings", label: "有警告" },
                    { key: "passed", label: "通过" },
                  ].map((f) => (
                    <Button
                      key={f.key}
                      variant={filterType === f.key ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilterType(f.key as typeof filterType)}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleSelectAll}>
                    {filteredQuestions.length > 0 && filteredQuestions.every(q => selectedQuestions.has(q.index)) ? (
                      <CheckSquare className="h-4 w-4 mr-1" />
                    ) : (
                      <Square className="h-4 w-4 mr-1" />
                    )}
                    全选
                  </Button>
                  {selectedQuestions.size > 0 && (
                    <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      删除 ({selectedQuestions.size})
                    </Button>
                  )}
                </div>
              </div>
              {searchQuery && (
                <p className="text-xs text-muted-foreground mt-2">
                  找到 {filteredQuestions.length} 道匹配题目
                </p>
              )}
            </CardContent>
          </Card>

          {/* Questions List */}
          <div className="grid gap-4">
            {filteredQuestions.map(({ question, index }) => (
              <div key={question.index} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedQuestions.has(index)}
                  onChange={() => handleToggleSelect(index)}
                  className="mt-4 h-4 w-4"
                />
                <div className="flex-1">
                  <QuestionEditor
                    question={question.editable}
                    index={index}
                    quality={question.quality}
                    onSave={handleSaveQuestion}
                    onRemove={handleRemoveQuestion}
                    onApplyTemplate={handleApplyTemplate}
                  />
                </div>
              </div>
            ))}
          </div>

          {filteredQuestions.length === 0 && parsedQuestions.length > 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">没有找到匹配的题目</p>
                <Button variant="outline" className="mt-4" onClick={() => { setSearchQuery(""); setFilterType("all") }}>
                  清除筛选
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {step === "done" && result && (
        <Card className="animate-slide-up">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 rounded-lg bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold mb-2">导入完成</h2>
            <div className="flex justify-center gap-8 mb-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{result.imported}</p>
                <p className="text-sm text-muted-foreground">成功导入</p>
              </div>
              {result.duplicates > 0 && (
                <div className="text-center">
                  <p className="text-3xl font-bold text-amber-600">{result.duplicates}</p>
                  <p className="text-sm text-muted-foreground">跳过重复</p>
                </div>
              )}
            </div>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={handleReset}>
                继续导入
              </Button>
              <Button asChild>
                <Link href="/bank">查看题库</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}


      {/* Import History */}
      {step === "upload" && batches.length > 0 && (
        <Card className="animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" />
              历史导入 ({batches.length}次)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {batches.map((batch, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <File className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{batch.sourceFile}</p>
                    <p className="text-xs text-muted-foreground">
                      {batch.count} 道题目 · {new Date(batch.latest).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Back to Top Button */}
      {step === "preview" && (
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-6 right-6 rounded-lg shadow-lg"
          onClick={scrollToTop}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
