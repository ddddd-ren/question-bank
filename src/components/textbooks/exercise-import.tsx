"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { QuestionEditor } from "@/components/import/question-editor"
import type { EditableQuestion } from "@/lib/parser/question-templates"
import type { QuestionType } from "@/lib/types"
import { fetchJson } from "@/lib/utils"
import type { QuestionQuality } from "@/lib/parser/quality-checker"
import type { TextbookChapter, TextbookFormat } from "@/lib/textbooks/types"

interface Props {
  bookId: string; chapter: TextbookChapter; format: TextbookFormat; onImported: () => void | Promise<void>
  onDraftChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void
}
interface Draft { editable: EditableQuestion; quality: QuestionQuality }

async function send<T>(url: string, method: string, body: unknown): Promise<T> {
  return fetchJson<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
}

export function TextbookExerciseImport(props: Props) {
  return <Exercises key={`${props.bookId}/${props.chapter.id}/${props.chapter.start}/${props.chapter.end}`} {...props} />
}

function Exercises({ bookId, chapter, format, onImported, onDraftChange, onBusyChange }: Props) {
  const [from, setFrom] = useState(chapter.start)
  const [to, setTo] = useState(Math.min(chapter.end, chapter.start + 249))
  const [drafts, setDrafts] = useState<(Draft | null)[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [editors, setEditors] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const hasDraft = drafts.some(Boolean)
  useEffect(() => {
    onDraftChange?.(hasDraft)
    return () => onDraftChange?.(false)
  }, [hasDraft, onDraftChange])
  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])
  const unit = format === "pdf" ? "页" : "段"
  const selection = { bookId, chapterId: chapter.id, from, to }
  function clear() { setDrafts([]); setSelected([]); setMessage("") }
  const trackEditor = useCallback((index: number, open: boolean) => {
    setEditors(old => old.includes(index) === open ? old : open ? [...old, index] : old.filter(n => n !== index))
  }, [])
  async function review(index: number, question: EditableQuestion, targetType?: QuestionType) {
    setBusy(true)
    try {
      const value = await send<Draft>("/api/questions/preview", "PATCH", { index, question, targetType })
      setDrafts(old => old.map((d, n) => n === index ? value : d))
      return value.editable
    } catch (e) { setMessage(e instanceof Error ? e.message : "校验失败") }
    finally { setBusy(false) }
  }
  async function act(run: () => Promise<void>) {
    setBusy(true); setMessage("")
    try { await run() } catch (e) { setMessage(e instanceof Error ? e.message : "操作失败") } finally { setBusy(false) }
  }
  const visible = drafts.flatMap((draft, index) => draft ? [{ draft, index }] : [])
  return <details className="rounded-md border p-3"><summary className="cursor-pointer font-medium">导入本节习题</summary>
    <fieldset disabled={busy} className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2"><label>起始{unit}<Input type="number" min={chapter.start} max={chapter.end} value={from || ""} onChange={e => { clear(); setFrom(Number(e.target.value)) }} /></label>
        <label>结束{unit}<Input type="number" min={from} max={chapter.end} value={to || ""} onChange={e => { clear(); setTo(Number(e.target.value)) }} /></label></div>
      <Button type="button" variant="outline" disabled={from < chapter.start || to < from || to > chapter.end} onClick={() => void act(async () => {
        clear()
        const value = await send<{questions: Draft[]}>(`/api/textbooks/${bookId}/exercises`, "POST", selection)
        setDrafts(value.questions)
        setMessage(value.questions.length ? `识别到 ${value.questions.length} 道候选题，请核对后勾选。` : "这个范围没有识别到编号习题，可以调整页段。")
      })}>预览习题</Button>
      {visible.length > 0 && <>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visible.every(({ index }) => selected.includes(index))}
          onChange={e => setSelected(e.target.checked ? visible.map(row => row.index) : [])} />选择全部候选题</label>
        {visible.map(({ draft, index }) => <div key={index} className="space-y-1"><label className="flex items-center gap-2 text-sm"><input type="checkbox"
          aria-label={`选中习题 ${index + 1}`} checked={selected.includes(index)} onChange={e => setSelected(old => e.target.checked ? [...old, index] : old.filter(n => n !== index))} />
          第 {index + 1} 题{draft.editable.sourcePage && ` · 第 ${draft.editable.sourcePage} ${unit}`}</label>
          <QuestionEditor index={index} question={draft.editable} quality={draft.quality} onEditingChange={trackEditor} onRemove={() => {
            setDrafts(old => old.map((d, i) => i === index ? null : d)); setSelected(old => old.filter(n => n !== index))
          }} onSave={async (i, question) => !!(await review(i, question))} onApplyTemplate={(i, type, question) => review(i, question, type)} />
        </div>)}
        <p className="text-sm text-muted-foreground">所选习题将关联本节，默认学完整节可考。已入库的同题会复用。</p>
        {editors.length > 0 && <p className="text-sm">请先保存或取消正在编辑的习题。</p>}
        <Button type="button" disabled={!!editors.length || !selected.length || selected.some(i => drafts[i]?.quality.issueCount.error)} onClick={() => void act(async () => {
          const result = await send<{ imported: number; linked: number; archived: number }>("/api/questions/preview", "PUT", { textbook: selection,
            questions: visible.filter(row => selected.includes(row.index)).map(row => row.draft.editable) })
          clear()
          const done = `已关联 ${result.linked} 道题，其中新增 ${result.imported} 道。${result.archived ? `跳过已归档的 ${result.archived} 道。` : ""}`
          setMessage(done)
          try { await onImported() } catch { setMessage(done + "刷新教材可查看最新题数。") }
        })}>确认入库并关联 {selected.length} 题</Button>
      </>}
      {(busy || message) && <p role="status" className="text-sm">{busy ? "正在处理习题…" : message}</p>}
    </fieldset>
  </details>
}
