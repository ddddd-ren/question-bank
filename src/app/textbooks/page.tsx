"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import useSWR from "swr"
import { BookMarked, ChevronRight, FileUp, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { positionUnit } from "@/components/textbooks/reading"
import type { TextbookSummary } from "@/lib/textbooks/types"
import { fetchJson, getErrorMessage } from "@/lib/utils"

type ImportResult = { id: string; reused: boolean; warnings: string[] }

export default function TextbooksPage() {
  const { data, error, mutate } = useSWR("/api/textbooks", fetchJson<{ books: TextbookSummary[] }>)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [imported, setImported] = useState<ImportResult | null>(null)

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const body = new FormData(form)
    const file = body.get("file")
    if (!(file instanceof File) || !file.size || file.size > 64 * 1024 * 1024) {
      setUploadError("请选择非空且不超过 64 MiB 的教材文件")
      return
    }
    setBusy(true)
    setUploadError("")
    try {
      const result = await fetchJson<ImportResult>("/api/textbooks/import", { method: "POST", body })
      setImported(result)
      setUploadOpen(false)
      void mutate()
    } catch (err) {
      setUploadError(getErrorMessage(err, "导入教材失败"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">教材书架</h1>
        {!uploadOpen && <Button onClick={() => { setUploadError(""); setImported(null); setUploadOpen(true) }}>
          <Plus className="mr-1.5 h-4 w-4" />导入教材
        </Button>}
      </div>
      {uploadOpen && <Card>
        <CardHeader><CardTitle>导入教材</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={upload}>
            <fieldset disabled={busy} className="grid gap-4 text-sm sm:grid-cols-2">
              <label className="space-y-1.5 sm:col-span-2"><span>教材文件（PDF、EPUB、DOCX，最大 64 MiB）</span>
                <Input name="file" type="file" required accept=".pdf,.epub,.docx" />
              </label>
              <label className="space-y-1.5"><span>书名（选填）</span><Input name="title" maxLength={200} placeholder="默认使用文件名" /></label>
              <label className="space-y-1.5"><span>版次（选填）</span><Input name="edition" maxLength={100} placeholder="例如：第 3 版" /></label>
              {uploadError && <p role="alert" className="text-destructive sm:col-span-2">{uploadError}</p>}
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit"><FileUp className="mr-1.5 h-4 w-4" />{busy ? "正在解析教材…" : "开始导入"}</Button>
                <Button type="button" variant="ghost" onClick={() => setUploadOpen(false)}>取消</Button>
              </div>
            </fieldset>
          </form>
        </CardContent>
      </Card>}
      {imported && <Card>
        <CardContent className="space-y-3 p-4 text-sm" role="status">
          <p className="font-medium">{imported.reused ? "书架中已有这本教材，已保留原有学习记录。" : "教材已加入书架。"}</p>
          {imported.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {imported.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>}
          <Button asChild size="sm"><Link href={`/textbooks/${imported.id}`}>打开教材<ChevronRight className="ml-1 h-4 w-4" /></Link></Button>
        </CardContent>
      </Card>}
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
        {getErrorMessage(error, "读取书架失败")}<Button variant="outline" size="sm" onClick={() => void mutate()}>重新加载</Button>
      </div>}
      {!data && !error && <p role="status" className="text-sm text-muted-foreground">正在读取书架…</p>}
      {data?.books.length === 0 && <Card><CardContent className="space-y-2 p-8 text-center">
        <BookMarked className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
        <h2 className="font-semibold">书架中还没有教材</h2>
        <p className="text-sm text-muted-foreground">导入第一本教材后，就可以按章节记录进度并组卷。</p>
      </CardContent></Card>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data?.books.map(book => <Link key={book.id} href={`/textbooks/${book.id}`} className="group min-w-0 rounded-lg focus-visible:outline-ring">
          <Card className="h-full transition-colors group-hover:border-primary/50"><CardContent className="flex h-full items-center gap-4 p-5">
            <BookMarked aria-hidden className="h-6 w-6 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <h2 className="break-words font-semibold">{book.title}</h2>
              <p className="mt-1 break-words text-sm text-muted-foreground">{[book.edition, book.format.toUpperCase(), `${book.unitCount} ${positionUnit(book.format)}`, `${book.chapterCount} 个章节`].filter(Boolean).join(" · ")}</p>
            </div>
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          </CardContent></Card>
        </Link>)}
      </div>
    </div>
  )
}
