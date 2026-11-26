import { useState, type FormEvent } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { TextbookChapter, TextbookDetail } from "@/lib/textbooks/types"
import { cn, fetchJson, getErrorMessage } from "@/lib/utils"
import { TextbookExerciseImport } from "./exercise-import"
import { chapterRange, learnedLabel, positionUnit, selectClass } from "./reading"

interface Props {
  book: TextbookDetail
  position: number
  chapter?: TextbookChapter
  onJump: (position: number, chapterId?: string) => void
  onMark: () => void
  onRefresh: () => Promise<void>
  onDraftChange: (dirty: boolean) => void
  onBusyChange: (busy: boolean) => void
}

function PositionInput({ position, max, unit, jump }: { position: number; max: number; unit: string; jump: (n: number) => void }) {
  const [input, setInput] = useState(String(position))
  function submit(event: FormEvent) {
    event.preventDefault()
    const target = Number(input)
    if (Number.isInteger(target) && target >= 1 && target <= max) jump(target)
  }
  return <form className="flex items-center gap-1.5 text-sm" onSubmit={submit}>
    <label className="inline-flex items-center gap-1.5">第<Input aria-label={`阅读位置（${unit}）`} className="w-20" type="number" min={1} max={max} step={1} required value={input}
      onChange={e => setInput(e.target.value)} />{unit}</label>
    <Button type="submit" size="sm" variant="outline">跳转</Button>
  </form>
}

export function TextbookReader({ book, position, chapter, onJump, onMark, onRefresh, onDraftChange, onBusyChange }: Props) {
  const unit = positionUnit(book.format)
  const [showPdf, setShowPdf] = useState(false)
  const contentUrl = `/api/textbooks/${book.id}/content`
  const pdfUrl = `${contentUrl}?original=1&inline=1#page=${position}`
  const { data, error, mutate } = useSWR(`${contentUrl}?position=${position}`, fetchJson<{ position: number; text: string }>)
  const text = data?.position === position ? data.text : undefined

  return <div className="grid items-start gap-4 lg:grid-cols-[minmax(15rem,0.9fr)_minmax(0,2.1fr)]">
    <Card className="min-w-0">
      <CardHeader><CardTitle>章节目录</CardTitle></CardHeader>
      <CardContent>
        <select className={cn(selectClass, "w-full lg:hidden")} aria-label="跳转到章节" value={chapter?.id ?? ""} onChange={e => {
          const target = book.chapters.find(c => c.id === e.target.value)
          if (target) onJump(target.start, target.id)
        }}>
          <option value="" disabled>选择章节</option>
          {book.chapters.map(c => <option key={c.id} value={c.id}>{"　".repeat(Math.max(0, c.level - 1))}{c.title} · 第 {c.start} {unit}</option>)}
        </select>
        <nav aria-label="教材章节" className="hidden max-h-[64vh] overflow-y-auto lg:grid lg:gap-1">
          {book.chapters.map(c => <button type="button" key={c.id} aria-current={c.id === chapter?.id ? "location" : undefined}
            className={cn("rounded-md px-2 py-2 text-left text-sm hover:bg-muted", c.id === chapter?.id && "bg-accent text-accent-foreground")}
            style={{ paddingInlineStart: 8 + (c.level - 1) * 10 }} onClick={() => onJump(c.start, c.id)}>
            <span className="block break-words font-medium">{c.title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{chapterRange(c, unit)} · {learnedLabel(c, unit)}</span>
          </button>)}
        </nav>
      </CardContent>
    </Card>
    <div className="min-w-0 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="break-words leading-snug">{chapter?.title ?? "教材正文"}</CardTitle>
          <p className="text-sm text-muted-foreground">正在阅读第 {position} {unit}，全书共 {book.unitCount} {unit}
            {chapter && ` · ${learnedLabel(chapter, unit)}`}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={position <= 1} onClick={() => onJump(position - 1)}>上一{unit}</Button>
            <Button size="sm" variant="outline" disabled={position >= book.unitCount} onClick={() => onJump(position + 1)}>下一{unit}</Button>
            <PositionInput key={position} position={position} max={book.unitCount} unit={unit} jump={onJump} />
          </div>
          {book.format === "pdf" && <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button size="sm" variant="outline" onClick={() => setShowPdf(!showPdf)}>{showPdf ? "显示页内文字" : "显示 PDF 原页"}</Button>
            <a className="text-primary underline-offset-4 hover:underline" href={pdfUrl} target="_blank" rel="noopener noreferrer">在新窗口打开第 {position} 页</a>
          </div>}
          {showPdf ? <iframe key={position} title={`${book.title} PDF 原件，第 ${position} 页`} src={pdfUrl} className="h-[62vh] w-full rounded-md border" /> :
            <div className="min-h-28 border-y py-5">
              {error ? <p role="alert" className="text-sm text-destructive">{getErrorMessage(error, "读取原文失败")}
                <Button size="sm" variant="ghost" onClick={() => void mutate()}>重试</Button></p>
                : text === undefined ? <p role="status" className="text-sm text-muted-foreground">正在读取原文…</p>
                  : text.trim() ? <p className="whitespace-pre-wrap break-words leading-8">{text}</p>
                    : <p className="text-sm text-muted-foreground">{book.format === "pdf" ? "本页没有可提取的文字，可查看 PDF 原页。" : "此段没有可显示的文字。"}</p>}
            </div>}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onMark}>学到这里（第 {position} {unit}）</Button>
            <a className="text-sm text-primary underline-offset-4 hover:underline" href={`${contentUrl}?original=1`}>下载原件</a>
          </div>
        </CardContent>
      </Card>
      {chapter && <TextbookExerciseImport key={chapter.id} bookId={book.id} chapter={chapter} format={book.format} onImported={onRefresh}
        onDraftChange={onDraftChange} onBusyChange={onBusyChange} />}
    </div>
  </div>
}
