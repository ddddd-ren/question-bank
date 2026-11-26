import { FileJson, FileSpreadsheet, FileText, FileType, FileUp, Loader2, Upload } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SUPPORTED_FILE_HINT } from "@/hooks/use-import-workflow"

interface ImportToolbarProps {
  file: File | null
  parsing: boolean
  dragActive: boolean
  error: string | null
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onDrag: (event: React.DragEvent) => void
  onDrop: (event: React.DragEvent) => void
  onParse: () => void
  onDownloadTemplate: (format: "json" | "csv") => void
}

function FileIcon({ file }: { file: File | null }) {
  if (!file) return <Upload className="h-8 w-8 text-primary" />
  const extension = file.name.split(".").pop()?.toLowerCase()
  if (extension === "json") return <FileJson className="h-8 w-8 text-green-500" />
  if (extension === "csv") return <FileSpreadsheet className="h-8 w-8 text-blue-500" />
  if (extension === "pdf") return <FileType className="h-8 w-8 text-red-500" />
  if (extension === "ppt" || extension === "pptx" || extension === "pptm") {
    return <FileText className="h-8 w-8 text-orange-500" />
  }
  return <FileText className="h-8 w-8 text-primary" />
}

const formatHints = [
  ["Word 格式", "章节标题与题号", "A. B. C. D. 选项", "答案可用红色标记"],
  ["PPT 格式", "支持 ppt/pptx/pptm", "按幻灯片顺序读取", "使用标准题号与选项"],
  ["PDF 格式", "支持文本型 PDF", "自动过滤页眉页码", "扫描件需先 OCR"],
  ["JSON 格式", "支持所有题型", "可包含标签和解析", "推荐大批量导入"],
  ["CSV 格式", "可使用 Excel 编辑", "选项和标签用 | 分隔", "适合简单批量导入"],
]

export function ImportToolbar(props: ImportToolbarProps) {
  return (
    <Card className="animate-slide-up">
      <CardHeader><CardTitle className="flex items-center gap-2"><FileUp className="h-5 w-5 text-primary" />选择文件</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-6 rounded-lg border bg-muted/50 p-4">
          <p className="mb-3 text-sm font-medium">下载导入模板</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => props.onDownloadTemplate("json")}><FileJson className="mr-2 h-4 w-4" />JSON 模板</Button>
            <Button variant="outline" size="sm" onClick={() => props.onDownloadTemplate("csv")}><FileSpreadsheet className="mr-2 h-4 w-4" />CSV 模板</Button>
          </div>
        </div>
        <div
          className={cn("cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors", props.dragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-muted/30")}
          onDragEnter={props.onDrag} onDragOver={props.onDrag} onDragLeave={props.onDrag} onDrop={props.onDrop}
        >
          <label className="cursor-pointer">
            <input type="file" accept=".docx,.pdf,.ppt,.pptx,.pptm,.json,.csv" onChange={props.onFileChange} className="hidden" />
            <div className="flex flex-col items-center gap-4">
              <div className={props.file ? "" : "flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10"}><FileIcon file={props.file} /></div>
              {props.file ? (
                <div><p className="text-lg font-medium">{props.file.name}</p><p className="text-sm text-muted-foreground">{(props.file.size / 1024).toFixed(1)} KB</p></div>
              ) : (
                <div><p className="text-lg font-medium">{props.dragActive ? "松开即可上传文件" : "点击选择或拖拽文件"}</p><p className="text-sm text-muted-foreground">支持 {SUPPORTED_FILE_HINT} 格式</p></div>
              )}
              {props.file && <p className="text-sm text-primary">点击或拖拽更换文件</p>}
            </div>
          </label>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {formatHints.map(([title, ...items]) => (
            <div key={title} className="rounded-lg border bg-muted/40 p-4"><h4 className="mb-2 font-medium">{title}</h4><ul className="space-y-1 text-xs text-muted-foreground">{items.map((item) => <li key={item}>{item}</li>)}</ul></div>
          ))}
        </div>
        {props.file && <div className="mt-6 flex justify-center"><Button onClick={props.onParse} disabled={props.parsing} size="lg">{props.parsing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{props.parsing ? "解析中..." : "开始解析"}</Button></div>}
        {props.error && <div className="mt-4 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{props.error}</div>}
      </CardContent>
    </Card>
  )
}
