"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR, { useSWRConfig } from "swr"
import { ChevronLeft, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TextbookDetail, TextbookSummary } from "@/lib/textbooks/types"
import { fetchJson, getErrorMessage } from "@/lib/utils"
import { TextbookReader } from "./reader"
import { ProgressEditor } from "./progress-editor"
import { OutlineEditor, type OutlineEntry } from "./outline-editor"
import { QuestionLinks } from "./question-links"
import { chapterAt, positionUnit, selectClass } from "./reading"

const views = { read: "阅读教材", progress: "学习进度", outline: "校正目录", links: "关联题目" }
type View = keyof typeof views
type Location = { position: number; chapterId?: string }
type BookUpdate =
  | { action: "outline"; chapters: OutlineEntry[] }
  | { action: "progress"; changes: { chapterId: string; learnedTo: number | null; skipped?: boolean }[]; advanceOnly?: boolean }

function ReadingWorkspace({ book, initialView, save, refresh }: {
  book: TextbookDetail
  initialView: View
  save: (update: BookUpdate) => Promise<void>
  refresh: () => Promise<void>
}) {
  const router = useRouter()
  const { data } = useSWR("/api/textbooks", fetchJson<{ books: TextbookSummary[] }>)
  const storageKey = `textbook-reading:${book.id}`
  const [location, setLocation] = useState<Location>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null")
      if (saved && Number.isInteger(saved.position) && saved.position >= 1 && saved.position <= book.unitCount) {
        return { position: saved.position, chapterId: saved.chapterId }
      }
    } catch { /* 浏览器禁止本地存储时仍可阅读。 */ }
    return { position: 1 }
  })
  const [view, setView] = useState<View>(initialView)
  const [through, setThrough] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [dirty, setDirty] = useState(false)
  const selected = chapterAt(book.chapters, location.position, location.chapterId)

  useEffect(() => {
    if (!dirty && !pending) return
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty, pending])

  function canLeave() {
    return !pending && (!dirty || window.confirm("当前修改尚未保存，确定放弃并离开？"))
  }

  function guardLink(event: { preventDefault: () => void }) {
    if (!canLeave()) event.preventDefault()
  }

  function openView(next: View, position: number | null = null, saved = false) {
    if (view === next && through === position) return
    if (!saved && !canLeave()) return
    setDirty(false)
    setThrough(position)
    setView(next)
  }

  function jump(position: number, chapterId?: string) {
    if (chapterAt(book.chapters, position, chapterId)?.id !== selected?.id) {
      if (!canLeave()) return
      setDirty(false)
    }
    const next = { position, chapterId }
    setLocation(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* 此时只保留本次阅读位置。 */ }
  }

  async function update(payload: BookUpdate) {
    setPending(true)
    try { await save(payload) } finally { setPending(false) }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link href="/textbooks" onNavigate={guardLink} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" />教材书架</Link>
      {data && data.books.length > 1 && <label className="flex max-w-full items-center gap-2 text-sm"><span className="shrink-0">切换教材</span>
        <select className={`${selectClass} min-w-0 flex-1`} value={book.id} disabled={pending} onChange={e => {
          if (canLeave()) router.push(`/textbooks/${encodeURIComponent(e.target.value)}`)
        }}>
          {data.books.map(b => <option key={b.id} value={b.id}>{b.title} · {b.edition || b.format.toUpperCase()}</option>)}
        </select></label>}
    </div>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="break-words text-3xl font-bold">{book.title}</h1>
        <p className="mt-1 break-words text-sm text-muted-foreground">{[book.edition, book.format.toUpperCase(), `${book.unitCount} ${positionUnit(book.format)}`, `${book.chapterCount} 个章节`].filter(Boolean).join(" · ")}</p>
      </div>
      <Button asChild variant="outline"><Link href={`/paper?textbook=${book.id}`} onNavigate={guardLink}><FileText className="mr-1.5 h-4 w-4" />按模板组卷</Link></Button>
    </div>
    <div className="flex flex-wrap gap-1.5" aria-label="教材功能" role="group">
      {Object.entries(views).map(([name, label]) => <Button key={name} size="sm" disabled={pending} variant={view === name ? "default" : "outline"} aria-pressed={view === name}
        onClick={() => openView(name as View)}>{label}</Button>)}
    </div>
    {view === "read" && <TextbookReader book={book} chapter={selected} position={location.position} onJump={jump} onRefresh={refresh}
      onMark={() => openView("progress", location.position)} onDraftChange={setDirty} onBusyChange={setPending} />}
    {view === "progress" && <ProgressEditor key={through ?? "manual"} book={book} through={through} onReading={saved => openView("read", null, saved)} onDraftChange={setDirty}
      onSave={changes => update({ action: "progress", changes, advanceOnly: through !== null })} />}
    {view === "outline" && <OutlineEditor book={book} onReading={saved => openView("read", null, saved)} onDraftChange={setDirty} onSave={chapters => update({ action: "outline", chapters })} />}
    {view === "links" && <QuestionLinks book={book} chapterId={selected?.id} onRefresh={refresh} onBusyChange={setPending} onDraftChange={setDirty} />}
  </div>
}

export function TextbookWorkspace({ id, initialView }: { id: string; initialView: View }) {
  const url = `/api/textbooks/${encodeURIComponent(id)}`
  const { data, error, mutate } = useSWR(url, fetchJson<{ book: TextbookDetail }>, { revalidateOnFocus: false })
  const { mutate: mutateCache } = useSWRConfig()

  async function save(update: BookUpdate) {
    const result = await fetchJson<{ book: TextbookDetail }>(url, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update),
    })
    await mutate(result, { revalidate: false })
    if (update.action === "outline") void mutateCache("/api/textbooks")
  }

  if (!data) return <div className="space-y-3">
    <Link href="/textbooks" className="text-sm text-primary">返回教材书架</Link>
    {error ? <div role="alert" className="flex items-center gap-3 text-sm">{getErrorMessage(error, "读取教材失败")}
      <Button size="sm" variant="outline" onClick={() => void mutate()}>重试</Button></div> :
      <p role="status" className="text-sm text-muted-foreground">正在读取教材…</p>}
  </div>
  return <ReadingWorkspace key={id} book={data.book} initialView={initialView} save={save} refresh={async () => { await mutate() }} />
}
