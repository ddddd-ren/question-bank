import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { showToast } from "@/components/toast"
import type { TextbookDetail } from "@/lib/textbooks/types"
import { getErrorMessage } from "@/lib/utils"
import { advanceThrough, changeChapterMark, chapterRange, learnedLabel, positionUnit, progressChanges, selectClass, type ProgressDraft } from "./reading"

interface Props {
  book: TextbookDetail
  through: number | null
  onSave: (changes: ReturnType<typeof progressChanges>) => Promise<void>
  onReading: (saved?: boolean) => void
  onDraftChange: (dirty: boolean) => void
}

export function ProgressEditor({ book, through, onSave, onReading, onDraftChange }: Props) {
  const unit = positionUnit(book.format)
  const [proposed] = useState(() => through === null ? {} : advanceThrough(book.chapters, through))
  const [draft, setDraft] = useState<ProgressDraft>(proposed)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  let dirty: boolean
  try {
    dirty = through === null ? progressChanges(book.chapters, draft).length > 0
      : Object.keys(draft).length !== Object.keys(proposed).length
  } catch { dirty = true }
  useEffect(() => { onDraftChange(dirty) }, [dirty, onDraftChange])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    try {
      const changes = progressChanges(book.chapters, draft)
      if (!changes.length) {
        setError("选中的章、节与原进度相同")
        return
      }
      setBusy(true)
      await onSave(changes)
      setDraft({})
      showToast(`已保存 ${changes.length} 个章节的学习进度`, "success")
      if (through !== null) onReading(true)
    } catch (err) {
      setError(getErrorMessage(err, "保存学习进度失败"))
    } finally {
      setBusy(false)
    }
  }

  const visible = through === null ? book.chapters : book.chapters.filter(c => proposed[c.id] !== undefined)
  return <Card>
    <CardHeader>
      <CardTitle>{through === null ? "学习进度" : `学到第 ${through} ${unit}`}</CardTitle>
      <p className="text-sm text-muted-foreground">{through === null
        ? "设置父章会同步调整下属各节，之后仍可逐节修改。部分已学时会保留子节已有的更远进度。"
        : "勾选本次已学的章、节。取消勾选可保留原进度，已学得更远的章节会自动保留。"}</p>
    </CardHeader>
    <CardContent>
      <form onSubmit={save}>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          {visible.length === 0 && <p className="py-4 text-sm text-muted-foreground">这个位置前没有需要推进的章节。</p>}
          <div className="max-h-[60vh] divide-y overflow-y-auto">
            {visible.map((chapter, index) => {
              const mark = draft[chapter.id]
              const choice = mark === undefined ? "keep" : mark === "skip" || mark === "full" ? mark : "part"
              const title = <span className="min-w-0 flex-1" style={{ paddingInlineStart: (chapter.level - 1) * 7 }}>
                <span className="block break-words font-medium">{chapter.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{chapterRange(chapter, unit)} · {learnedLabel(chapter, unit)}</span>
                {chapter.recentFrom !== null && chapter.learnedTo !== null && <span className="mt-1 block text-xs text-muted-foreground">
                  本次新学 · 第 {chapter.recentFrom === chapter.learnedTo ? chapter.recentFrom : `${chapter.recentFrom}–${chapter.learnedTo}`} {unit}
                </span>}
              </span>
              if (through !== null) return <label key={chapter.id} className="flex items-center gap-3 py-3 text-sm">
                <input type="checkbox" className="h-4 w-4 shrink-0" checked={mark !== undefined} onChange={e => {
                  const next = { ...draft }
                  if (e.target.checked) next[chapter.id] = proposed[chapter.id]
                  else delete next[chapter.id]
                  setDraft(next)
                }} />
                {title}
                <span className="text-xs text-muted-foreground">{proposed[chapter.id] === "full" ? "学至节末" : `学至第 ${proposed[chapter.id]} ${unit}`}</span>
              </label>
              return <div key={chapter.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:gap-4">
                {title}
                <div className="flex flex-wrap items-center gap-2">
                  <select className={selectClass} aria-label={`${chapter.title}的学习状态`} value={choice} onChange={e => {
                    const value = e.target.value === "part" ? String(Math.min(chapter.learnedTo ?? chapter.start, chapter.end - 1)) : e.target.value
                    setDraft(current => changeChapterMark(book.chapters, index, value, current))
                  }}>
                    <option value="keep">保留原进度</option>
                    <option value="full">{book.chapters[index + 1]?.level > chapter.level ? "整章已学" : "整节已学"}</option>
                    {chapter.end > chapter.start && <option value="part">部分已学</option>}
                    <option value="skip">标记为跳过</option>
                    <option value="clear">清除进度并标为未学</option>
                  </select>
                  {choice === "part" && <label className="flex items-center gap-1.5 text-xs">学至
                    <Input aria-label={`${chapter.title}已学到第几${unit}`} className="w-20" type="number" min={chapter.start} max={chapter.end} step={1} required value={mark}
                      onChange={e => {
                        const value = e.target.value
                        setDraft(current => changeChapterMark(book.chapters, index, value, current))
                      }} />{unit}
                  </label>}
                </div>
              </div>
            })}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={Object.keys(draft).length === 0}>{busy ? "正在保存…" : "确认学习进度"}</Button>
            <Button type="button" variant="ghost" onClick={() => onReading()}>返回阅读</Button>
          </div>
        </fieldset>
      </form>
    </CardContent>
  </Card>
}
