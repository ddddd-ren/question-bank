import { AlertTriangle, CheckCircle, CheckSquare, Info, Loader2, Save, Search, Square, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { typeColors, typeLabels } from "@/lib/constants"
import type { ImportFilter, QualitySummary } from "@/hooks/use-import-workflow"

interface ImportSummaryProps {
  total: number
  typeCounts: Record<string, number>
  qualitySummary: QualitySummary | null
  importing: boolean
  importBlockedByErrors: boolean
  searchQuery: string
  filterType: ImportFilter
  selectedCount: number
  allVisibleSelected: boolean
  filteredCount: number
  onReset: () => void
  onImport: () => void
  onSearchChange: (value: string) => void
  onFilterChange: (value: ImportFilter) => void
  onSelectAll: () => void
  onDeleteSelected: () => void
}

export function ImportSummary(props: ImportSummaryProps) {
  return (
    <>
      <Card><CardContent className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><span className="text-sm font-medium">共 {props.total} 道题目</span><div className="flex flex-wrap gap-2">{Object.entries(props.typeCounts).map(([type, count]) => <Badge key={type} className={`${typeColors[type] || "bg-gray-500"} text-xs text-white`}>{typeLabels[type]}: {count}</Badge>)}</div></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={props.onReset}>重新上传</Button><Button onClick={props.onImport} disabled={props.importing || props.total === 0 || props.importBlockedByErrors}>{props.importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{props.importing ? "导入中..." : `确认导入 ${props.total} 道`}</Button></div>
        </div>
        {props.qualitySummary && <div className="mt-3 flex flex-wrap gap-4 border-t pt-3 text-sm">
          <Button variant={props.filterType === "passed" ? "secondary" : "outline"} size="sm" className="gap-1 text-green-600" aria-pressed={props.filterType === "passed"} onClick={() => props.onFilterChange("passed")}><CheckCircle className="h-4 w-4" />{props.qualitySummary.passed} 道通过</Button>
          {props.qualitySummary.withErrors > 0 && <Button variant={props.filterType === "errors" ? "secondary" : "outline"} size="sm" className="gap-1 text-red-600" aria-pressed={props.filterType === "errors"} onClick={() => props.onFilterChange("errors")}><AlertTriangle className="h-4 w-4" />{props.qualitySummary.withErrors} 道有错误</Button>}
          {props.qualitySummary.withWarnings > 0 && <Button variant={props.filterType === "warnings" ? "secondary" : "outline"} size="sm" className="gap-1 text-amber-600" aria-pressed={props.filterType === "warnings"} onClick={() => props.onFilterChange("warnings")}><Info className="h-4 w-4" />{props.qualitySummary.withWarnings} 道有警告</Button>}
          {props.qualitySummary.withChanges > 0 && <span className="flex items-center gap-1 text-blue-600"><CheckCircle className="h-4 w-4" />{props.qualitySummary.withChanges} 道已自动修复</span>}
        </div>}
        {props.importBlockedByErrors && <div className="mt-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">有题目存在错误，请先修复或删除后再导入。</div>}
      </CardContent></Card>
      <Card><CardContent className="p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="搜索题目内容..." value={props.searchQuery} onChange={(event) => props.onSearchChange(event.target.value)} className="pl-9" /></div>
          <div className="flex flex-wrap gap-2">{(["all", "errors", "warnings", "passed"] as ImportFilter[]).map((filter) => <Button key={filter} variant={props.filterType === filter ? "default" : "outline"} size="sm" onClick={() => props.onFilterChange(filter)}>{{ all: "全部", errors: "有错误", warnings: "有警告", passed: "通过" }[filter]}</Button>)}</div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={props.onSelectAll}>{props.allVisibleSelected ? <CheckSquare className="mr-1 h-4 w-4" /> : <Square className="mr-1 h-4 w-4" />}全选</Button>{props.selectedCount > 0 && <Button variant="destructive" size="sm" onClick={props.onDeleteSelected}><Trash2 className="mr-1 h-4 w-4" />删除 ({props.selectedCount})</Button>}</div>
        </div>
        {props.searchQuery && <p className="mt-2 text-xs text-muted-foreground">找到 {props.filteredCount} 道匹配题目</p>}
      </CardContent></Card>
    </>
  )
}
