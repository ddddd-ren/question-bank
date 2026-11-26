"use client"

import Link from "next/link"
import useSWR from "swr"
import type { Dispatch, SetStateAction } from "react"
import { fetcher } from "@/hooks/use-swr-fetcher"
import { Input } from "@/components/ui/input"
import type { PaperStudyScope } from "@/lib/paper/template"
import { studyModeNames, type StudyMode, type TextbookDetail, type TextbookPaperRequest, type TextbookSummary } from "@/lib/textbooks/types"

const select = "h-9 w-full rounded-md border bg-background px-2 text-sm"

export function TextbookScopePicker({ value, onChange, total }: {
  value?: TextbookPaperRequest; onChange: Dispatch<SetStateAction<TextbookPaperRequest | undefined>>; total: number
}) {
  const books = useSWR<{ books: TextbookSummary[] }>("/api/textbooks", fetcher)
  const detail = useSWR<{ book: TextbookDetail }>(value ? `/api/textbooks/${value.bookId}` : null, fetcher)
  const book = detail.data?.book, learned = book?.chapters.filter(c => c.learnedTo !== null) ?? []
  return <div className="space-y-2">
    <label className="block">按教材学习进度<select className={select} value={value?.bookId ?? ""} onChange={e =>
      onChange(e.target.value ? { bookId: e.target.value, mode: "cumulative" } : undefined)}>
      <option value="">不限教材</option>
      {value && !books.data?.books.some(b => b.id === value.bookId) && <option value={value.bookId}>{book?.title ?? "所选教材"}</option>}
      {books.data?.books.map(b => <option key={b.id} value={b.id}>{b.title}{b.edition && ` · ${b.edition}`}</option>)}
    </select></label>
    {(books.error || (value && detail.error)) && <p role="alert" className="text-sm">教材读取失败。<button type="button" className="underline" onClick={() => { void books.mutate(); void detail.mutate() }}>重新读取</button></p>}
    {books.data?.books.length === 0 && <Link className="text-sm underline" href="/textbooks">导入第一本教材</Link>}
    {value && <>
      <label className="block">出题范围<select className={select} value={value.mode} onChange={e => {
        const mode = e.target.value as StudyMode
        onChange({ bookId: value.bookId, mode, ...(mode === "mixed" && { newCount: Math.ceil(total / 2) }), ...(mode === "custom" && { chapterIds: [] }) })
      }}>{Object.entries(studyModeNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      {book && <p className="text-sm text-muted-foreground">已记录 {learned.length} 个章节的进度。 <Link href={`/textbooks/${book.id}?view=progress`} className="underline">查看教材进度</Link></p>}
      {value.mode === "custom" && <fieldset className="max-h-52 space-y-1 overflow-auto rounded border p-2"><legend className="px-1 text-sm">选择章节（含已学子节）</legend>
        {learned.map(c => <label key={c.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={value.chapterIds?.includes(c.id) ?? false}
          onChange={e => onChange(current => current && { ...current, chapterIds: e.target.checked ? [...(current.chapterIds ?? []), c.id] : current.chapterIds?.filter(id => id !== c.id) })} />
          <span>{c.title} · 学至第 {c.learnedTo} {book?.format === "pdf" ? "页" : "段"}</span></label>)}
      </fieldset>}
      {value.mode === "mixed" && <div className="space-y-1"><label className="block">新课题数<Input type="number" min={0} max={total} value={value.newCount ?? ""} onChange={e =>
        onChange({ ...value, newCount: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
        <p className="text-sm">全卷 {total} 题，旧课 {Math.max(0, total - (value.newCount ?? 0))} 题。</p></div>}
      {(value.mode === "recent" || value.mode === "mixed") && <p className="text-sm text-muted-foreground">新课取最近一次标记新增的页段。同时涉及新旧内容的题可在累计复习或自选章节中使用。</p>}
    </>}
  </div>
}

function visibleChapters(scope: PaperStudyScope) {
  const selected = new Set(scope.chapterIds)
  const visible: PaperStudyScope["chapters"] = []
  let selectedLevel = Infinity
  for (const c of scope.chapters) {
    if (c.level <= selectedLevel) selectedLevel = Infinity
    if (selectedLevel === Infinity && selected.has(c.id)) selectedLevel = c.level
    if (scope.mode === "custom" && selectedLevel === Infinity) continue
    if (c.learnedTo !== null && (scope.mode !== "recent" || c.recentFrom !== null)) visible.push(c)
  }
  return visible
}

export function SavedStudyScope({ scope, total }: { scope: PaperStudyScope; total: number }) {
  const unit = scope.format === "pdf" ? "页" : "段"
  const visible = visibleChapters(scope)
  const skipped = scope.chapters.filter(c => c.learnedTo === null)
  return <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer font-medium">出卷时的学习范围 · {scope.title}{scope.edition && ` · ${scope.edition}`} · {studyModeNames[scope.mode]}</summary>
    {scope.mode === "mixed" && <p className="mt-2">新课 {scope.newCount} 题，旧课 {total - (scope.newCount ?? 0)} 题</p>}
    <ul className="mt-2 space-y-1">{visible.map(c => <li key={c.id}>{c.title} · 第 {scope.mode === "recent" ? c.recentFrom : c.start}–{c.learnedTo} {unit}{c.learnedTo !== c.end && "（部分已学）"}{scope.mode === "mixed" && c.recentFrom !== null && ` · 本次新增第 ${c.recentFrom}–${c.learnedTo} ${unit}`}</li>)}</ul>
    {!!skipped.length && <details className="mt-2"><summary>出卷时未学或跳过的章节（{skipped.length}）</summary>
      <ul className="mt-1">{skipped.map(c => <li key={c.id}>{c.title}{c.skipped && " · 已跳过"}</li>)}</ul></details>}
  </details>
}
