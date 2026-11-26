"use client"

import Link from "next/link"
import { CheckCircle, ChevronUp, File, FileUp, HelpCircle, History, Save, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { QuestionEditor } from "@/components/import/question-editor"
import { ImportToolbar } from "@/components/import/import-toolbar"
import { ImportSummary } from "@/components/import/import-summary"
import { useImportWorkflow } from "@/hooks/use-import-workflow"

export default function ImportPage() {
  const workflow = useImportWorkflow()
  const allVisibleSelected = workflow.filteredQuestions.length > 0
    && workflow.filteredQuestions.every(({ index }) => workflow.selectedQuestions.has(index))

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-3xl font-bold">导入题目</h1><p className="mt-2 text-muted-foreground">支持 Word、PDF、PPT、JSON、CSV 格式批量导入，支持预览编辑</p></div>
          <Button variant="ghost" size="sm" onClick={() => workflow.setShowHelp(!workflow.showHelp)}><HelpCircle className="mr-2 h-4 w-4" />帮助</Button>
        </div>
      </div>

      {workflow.showHelp && <Card className="animate-slide-up"><CardContent className="p-4"><h3 className="mb-3 font-medium">使用帮助</h3><div className="grid gap-4 text-sm md:grid-cols-2"><div><h4 className="mb-2 font-medium text-primary">导入流程</h4><ol className="list-inside list-decimal space-y-1 text-muted-foreground"><li>选择或拖拽支持的文件</li><li>点击开始解析</li><li>预览并编辑识别结果</li><li>确认导入</li></ol></div><div><h4 className="mb-2 font-medium text-primary">质量检查</h4><ul className="space-y-1 text-muted-foreground"><li>错误必须修复后才能导入</li><li>警告建议人工确认</li><li>通过表示未发现问题</li><li>自动修复已完成格式规范化</li></ul></div></div></CardContent></Card>}

      <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:justify-center sm:gap-4">
        {[
          { key: "upload", label: "选择文件", icon: FileUp },
          { key: "preview", label: "预览编辑", icon: CheckCircle },
          { key: "done", label: "导入完成", icon: Save },
        ].map((item, index) => <div key={item.key} className="flex items-center gap-2">{index > 0 && <div className={`hidden h-0.5 w-8 sm:block ${workflow.step === item.key || workflow.step === "done" ? "bg-primary" : "bg-muted"}`} />}<div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${workflow.step === item.key ? "bg-primary text-primary-foreground" : (workflow.step === "preview" && item.key === "upload") || workflow.step === "done" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}><item.icon className="h-4 w-4" />{item.label}</div></div>)}
      </div>

      {workflow.step === "upload" && <ImportToolbar file={workflow.file} parsing={workflow.parsing} dragActive={workflow.dragActive} error={workflow.error} onFileChange={workflow.handleFileChange} onDrag={workflow.handleDrag} onDrop={workflow.handleDrop} onParse={workflow.handleParse} onDownloadTemplate={workflow.handleDownloadTemplate} />}

      {workflow.step === "preview" && <div className="space-y-4 animate-slide-up">
        <ImportSummary total={workflow.parsedQuestions.length} typeCounts={workflow.typeCounts} qualitySummary={workflow.qualitySummary} importing={workflow.importing} importBlockedByErrors={workflow.importBlockedByErrors} searchQuery={workflow.searchQuery} filterType={workflow.filterType} selectedCount={workflow.selectedQuestions.size} allVisibleSelected={allVisibleSelected} filteredCount={workflow.filteredQuestions.length} onReset={workflow.handleReset} onImport={workflow.handleImport} onSearchChange={workflow.setSearchQuery} onFilterChange={workflow.setFilterType} onSelectAll={workflow.handleSelectAll} onDeleteSelected={workflow.handleDeleteSelected} />
        <div className="grid gap-4">{workflow.filteredQuestions.map(({ question, index }) => <div key={question.index} className="flex items-start gap-3"><input type="checkbox" checked={workflow.selectedQuestions.has(index)} onChange={() => workflow.handleToggleSelect(index)} className="mt-4 h-4 w-4" /><div className="flex-1"><QuestionEditor question={question.editable} index={index} quality={question.quality} onSave={workflow.handleSaveQuestion} onRemove={workflow.handleRemoveQuestion} onApplyTemplate={workflow.handleApplyTemplate} /></div></div>)}</div>
        {workflow.filteredQuestions.length === 0 && workflow.parsedQuestions.length > 0 && <Card><CardContent className="p-8 text-center"><Search className="mx-auto mb-4 h-12 w-12 text-muted-foreground" /><p className="text-muted-foreground">没有找到匹配的题目</p><Button variant="outline" className="mt-4" onClick={() => { workflow.setSearchQuery(""); workflow.setFilterType("all") }}>清除筛选</Button></CardContent></Card>}
      </div>}

      {workflow.step === "done" && workflow.result && <Card className="animate-slide-up"><CardContent className="p-8 text-center"><div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-lg bg-green-500/10"><CheckCircle className="h-10 w-10 text-green-500" /></div><h2 className="mb-2 text-2xl font-bold">导入完成</h2><div className="mb-6 flex justify-center gap-8"><div><p className="text-3xl font-bold text-green-600">{workflow.result.imported}</p><p className="text-sm text-muted-foreground">成功导入</p></div>{workflow.result.duplicates > 0 && <div><p className="text-3xl font-bold text-amber-600">{workflow.result.duplicates}</p><p className="text-sm text-muted-foreground">跳过重复</p></div>}</div><div className="flex justify-center gap-3"><Button variant="outline" onClick={workflow.handleReset}>继续导入</Button><Button asChild><Link href="/bank">查看题库</Link></Button></div></CardContent></Card>}

      {workflow.step === "upload" && workflow.batches.length > 0 && <Card className="animate-slide-up"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-primary" />历史导入 ({workflow.batches.length}次)</CardTitle></CardHeader><CardContent><div className="space-y-2">{workflow.batches.map((batch) => <div key={`${batch.sourceFile}-${batch.latest}`} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"><File className="h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{batch.sourceFile}</p><p className="text-xs text-muted-foreground">{batch.count} 道题目 · {new Date(batch.latest).toLocaleDateString("zh-CN")}</p></div></div>)}</div></CardContent></Card>}

      {workflow.step === "preview" && <Button variant="outline" size="icon" className="fixed bottom-6 right-6 rounded-lg shadow-lg" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="返回顶部"><ChevronUp className="h-4 w-4" /></Button>}
    </div>
  )
}
