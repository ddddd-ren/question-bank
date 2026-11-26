import { useEffect, useRef, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { showToast } from "@/components/toast"
import type { TextbookDetail, TextbookHeading } from "@/lib/textbooks/types"
import { getErrorMessage } from "@/lib/utils"
import { learnedLabel, positionUnit, selectClass } from "./reading"

export type OutlineEntry = TextbookHeading & { id?: string }
type Row = { key: string; id?: string; title: string; level: number; start: string }

interface Props {
  book: TextbookDetail
  onSave: (entries: OutlineEntry[]) => Promise<void>
  onReading: (saved?: boolean) => void
  onDraftChange: (dirty: boolean) => void
}

export function OutlineEditor({ book, onSave, onReading, onDraftChange }: Props) {
  const unit = positionUnit(book.format)
  const [rows, setRows] = useState<Row[]>(() => book.chapters.map(c => ({
    key: c.id, id: c.id, title: c.title, level: c.level, start: String(c.start),
  })))
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const nextRow = useRef(0)
  const original = new Map(book.chapters.map(chapter => [chapter.id, chapter]))
  const dirty = rows.length !== book.chapters.length || rows.some((row, i) => {
    const c = book.chapters[i]
    return row.id !== c.id || row.title !== c.title || row.level !== c.level || row.start !== String(c.start)
  })
  useEffect(() => { onDraftChange(dirty) }, [dirty, onDraftChange])

  function update(index: number, changes: Partial<Row>) {
    setRows(current => current.map((row, i) => i === index ? { ...row, ...changes } : row))
  }

  function insert(index: number) {
    const previous = rows[index - 1]
    const start = Math.min(previous ? Number(previous.start) + 1 : 1, Number(rows[index]?.start) || book.unitCount)
    const row = { key: `new-${nextRow.current++}`, title: "", level: previous?.level ?? 1, start: String(start) }
    setRows([...rows.slice(0, index), row, ...rows.slice(index)])
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    try {
      const chapters = rows.map(({ id, title, level, start }) => ({ id, title: title.trim(), level, start: Number(start) }))
      const invalid = chapters.findIndex((c, i) => !c.title || !Number.isInteger(c.start) || c.start < 1 || c.start > book.unitCount
        || (i > 0 && c.start < chapters[i - 1].start))
      if (invalid >= 0) throw new Error(`请检查第 ${invalid + 1} 项的名称和起始${unit}。起点须按原文顺序排列。`)
      setBusy(true)
      await onSave(chapters)
      showToast("教材目录已保存", "success")
      onReading(true)
    } catch (err) {
      setError(getErrorMessage(err, "保存目录失败"))
    } finally {
      setBusy(false)
    }
  }

  return <Card>
    <CardHeader>
      <CardTitle>校正目录</CardTitle>
      <p className="text-sm text-muted-foreground">按原文顺序设置名称、层级和起始{unit}。相邻同级项可以合并，保留上一项的名称和起点。</p>
    </CardHeader>
    <CardContent>
      <form onSubmit={save}>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <Button type="button" variant="outline" size="sm" disabled={rows.length >= 3000} onClick={() => insert(0)}>在开头添加章节</Button>
          <div className="max-h-[64vh] space-y-2 overflow-y-auto">
            {rows.map((row, i) => {
              const source = row.id ? original.get(row.id) : undefined
              const hasRecords = source && (source.linkedCount > 0 || source.learnedTo !== null)
              return <div key={row.key} className="space-y-2 rounded-lg border p-3">
                <div className="grid grid-cols-2 items-end gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_6rem_7rem]">
                  <label className="col-span-2 space-y-1 sm:col-span-1"><span>名称</span>
                    <Input value={row.title} required maxLength={200} onChange={e => update(i, { title: e.target.value })} />
                  </label>
                  <label className="grid gap-1">层级
                    <select className={selectClass} value={row.level} onChange={e => update(i, { level: Number(e.target.value) })}>
                      {[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={level}>{level} 级</option>)}
                    </select>
                  </label>
                  <label className="space-y-1"><span>起始{unit}</span>
                    <Input type="number" min={Number(rows[i - 1]?.start) || 1} max={book.unitCount} required step={1} value={row.start} onChange={e => update(i, { start: e.target.value })} />
                  </label>
                </div>
                {hasRecords && <p className="text-xs text-muted-foreground">{learnedLabel(source, unit)} · 已关联 {source.linkedCount} 题。请先处理现有记录，再移除此项或移动起点。</p>}
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant="ghost" disabled={rows.length >= 3000} onClick={() => insert(i + 1)}>在下方插入</Button>
                  {i > 0 && row.level === rows[i - 1].level && <Button type="button" size="sm" variant="outline" disabled={!!hasRecords}
                    onClick={() => setRows(rows.filter(r => r.key !== row.key))}>并入上一项</Button>}
                  <Button type="button" size="sm" variant="ghost" disabled={rows.length <= 1 || !!hasRecords}
                    onClick={() => setRows(rows.filter(r => r.key !== row.key))}>移除目录项</Button>
                </div>
              </div>
            })}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit">{busy ? "正在保存…" : "保存目录"}</Button>
            <Button type="button" variant="ghost" onClick={() => onReading()}>取消</Button>
          </div>
        </fieldset>
      </form>
    </CardContent>
  </Card>
}
