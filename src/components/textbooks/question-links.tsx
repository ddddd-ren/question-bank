import { useEffect, useState, type FormEvent } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { PaginatedResponse } from "@/hooks/use-swr-fetcher"
import { typeLabels } from "@/lib/constants"
import { createPaginatedKey } from "@/lib/query-key"
import type { TextbookDetail, TextbookQuestionLink } from "@/lib/textbooks/types"
import { fetchJson, getErrorMessage } from "@/lib/utils"
import { chapterRange, positionUnit, selectClass } from "./reading"

type Question = { id: number; type: string; content: string }
type LinkTarget = Pick<TextbookQuestionLink, "chapterId" | "through">
type TargetDraft = Record<string, string>

interface Props {
  book: TextbookDetail
  chapterId?: string
  onRefresh: () => Promise<void>
  onBusyChange: (value: boolean) => void
  onDraftChange: (dirty: boolean) => void
}

export function QuestionLinks({ book, chapterId, onRefresh, onBusyChange, onDraftChange }: Props) {
  const unit = positionUnit(book.format)
  const url = `/api/textbooks/${book.id}/links`
  const [input, setInput] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Question[]>([])
  const [inspectId, setInspectId] = useState<number | null>(null)
  const [targets, setTargets] = useState<TargetDraft>(() => chapterId ? { [chapterId]: "full" } : {})
  const [mode, setMode] = useState<"add" | "replace">("add")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const questions = useSWR(createPaginatedKey("/api/questions", { page, pageSize: 10, search: query }), fetchJson<PaginatedResponse<Question>>)
  const existing = useSWR(inspectId === null ? null : `${url}?questionId=${inspectId}`, fetchJson<{ links: LinkTarget[] }>)
  const chosen = new Set(selected.map(q => q.id))
  const allOnPage = !!questions.data?.data.length && questions.data.data.every(q => chosen.has(q.id))
  const chapterMap = new Map(book.chapters.map(c => [c.id, c]))
  const targetIds = Object.keys(targets)
  const dirty = selected.length > 0
  useEffect(() => { onDraftChange(dirty) }, [dirty, onDraftChange])

  function toggle(question: Question) {
    setSelected(current => current.some(q => q.id === question.id)
      ? current.filter(q => q.id !== question.id) : [...current, question])
  }

  function togglePage() {
    const visible = questions.data?.data ?? []
    const ids = new Set(visible.map(q => q.id))
    setSelected(current => allOnPage ? current.filter(q => !ids.has(q.id)) : [...current, ...visible.filter(q => !chosen.has(q.id))])
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setNotice("")
    if (!selected.length || (!targetIds.length && mode === "add")) return
    if (!targetIds.length && !window.confirm(`解除选中的 ${selected.length} 道题在《${book.title}》中的全部章节关联？`)) return
    try {
      const links = targetIds.map(id => {
        const chapter = chapterMap.get(id)
        if (!chapter) throw new Error("目录已更新，请重新选择必要章节")
        const through = targets[id] === "full" ? null : Number(targets[id])
        if (through !== null && (!Number.isInteger(through) || through < chapter.start || through > chapter.end)) {
          throw new Error(`「${chapter.title}」的位置须在第 ${chapter.start} 至 ${chapter.end} ${unit}之间`)
        }
        return { chapterId: id, through }
      })
      setBusy(true)
      onBusyChange(true)
      await fetchJson(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIds: selected.map(q => q.id), links, mode }),
      })
      setNotice(`已保存 ${selected.length} 道题在本书中的关联。`)
      setSelected([])
      setMode("add")
      await Promise.allSettled([onRefresh(), existing.mutate()])
    } catch (err) {
      setError(getErrorMessage(err, "保存章节关联失败"))
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }

  return <div className="grid items-start gap-4 lg:grid-cols-2">
    <Card className="min-w-0">
      <CardHeader><CardTitle>选择题库中的题目</CardTitle></CardHeader>
      <CardContent>
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setPage(1); setQuery(input.trim()) }}>
            <Input aria-label="搜索题干" placeholder="搜索题干" maxLength={200} type="search" value={input} onChange={e => setInput(e.target.value)} />
            <Button variant="outline" type="submit">搜索</Button>
          </form>
          {questions.error ? <p role="alert" className="text-sm text-destructive">{getErrorMessage(questions.error, "读取题库失败")}
            <Button size="sm" variant="ghost" onClick={() => void questions.mutate()}>重试</Button></p>
            : !questions.data ? <p role="status" className="text-sm text-muted-foreground">正在读取题目…</p>
              : <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{query && `“${query}” · `}共 {questions.data.total} 道题</span>
                  {questions.data.data.length > 0 && <button type="button" className="text-primary" onClick={togglePage}>{allOnPage ? "取消本页全选" : "全选本页"}</button>}
                </div>
                {questions.data.data.length === 0 ? <p className="text-sm text-muted-foreground">{query ? "没有找到匹配的题目。" : "题库中还没有题目。"}</p> :
                  <ul className="divide-y">
                    {questions.data.data.map(q => <li key={q.id} className="flex items-start gap-2 py-2">
                      <label className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={chosen.has(q.id)} onChange={() => toggle(q)} />
                        <span className="min-w-0">
                          <span className="block text-xs text-muted-foreground">#{q.id} · {typeLabels[q.type] || q.type}</span>
                          <span className="line-clamp-3 break-words">{q.content}</span>
                        </span>
                      </label>
                      <Button size="sm" variant="ghost" aria-label={`查看第 ${q.id} 题的关联`} onClick={() => setInspectId(q.id)}>查看关联</Button>
                    </li>)}
                  </ul>}
                {questions.data.totalPages > 1 && <div className="flex items-center justify-between gap-2 text-sm">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
                  <span>{page} / {questions.data.totalPages}</span>
                  <Button size="sm" variant="outline" disabled={page >= questions.data.totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
                </div>}
              </>}
          {inspectId !== null && <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium">第 {inspectId} 题在本书中的关联</p>
            {existing.error ? <p role="alert">{getErrorMessage(existing.error, "读取关联失败")}<Button size="sm" variant="ghost" onClick={() => void existing.mutate()}>重试</Button></p>
              : !existing.data ? <p role="status">正在读取…</p>
                : !existing.data.links.length ? <p>尚未关联本书章节。</p>
                  : <>
                    <ul className="list-disc space-y-1 pl-5">
                      {existing.data.links.map(link => <li key={link.chapterId}>{chapterMap.get(link.chapterId)?.title ?? "目录已更新"} · {link.through === null ? "整节" : `至第 ${link.through} ${unit}`}</li>)}
                    </ul>
                    <Button size="sm" variant="outline" onClick={() => setTargets(Object.fromEntries(existing.data!.links.map(link => [link.chapterId, link.through === null ? "full" : String(link.through)])))}>
                      用这组关联填入必要章节
                    </Button>
                  </>}
          </div>}
        </fieldset>
      </CardContent>
    </Card>
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>必要章节</CardTitle>
        <p className="text-sm text-muted-foreground">每道题都需学到下列全部位置，才会进入本书的组卷范围。</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={save}><fieldset disabled={busy} className="min-w-0 space-y-4 text-sm">
          <div>
            <p className="font-medium">已选 {selected.length} 道题</p>
            {selected.length > 0 && <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
              {selected.map(q => <li key={q.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">#{q.id} · {q.content}</span>
                <button className="shrink-0 text-primary" type="button" aria-label={`移除第 ${q.id} 题`} onClick={() => toggle(q)}>移除</button>
              </li>)}
            </ul>}
          </div>
          <label className="grid gap-1.5">添加必要章节
            <select className={selectClass} value="" onChange={e => setTargets({ ...targets, [e.target.value]: "full" })}>
              <option value="" disabled>选择章节…</option>
              {book.chapters.map(c => <option key={c.id} value={c.id} disabled={targets[c.id] !== undefined}>{"　".repeat(Math.max(0, c.level - 1))}{c.title} · {chapterRange(c, unit)}</option>)}
            </select>
          </label>
          <ul className="space-y-2">
            {targetIds.map(id => {
              const c = chapterMap.get(id)
              if (!c) return null
              const mark = targets[id]
              return <li key={id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words font-medium">{c.title} <span className="font-normal text-muted-foreground">· {chapterRange(c, unit)}</span></span>
                  <button type="button" className="shrink-0 text-primary" aria-label={`移除必要章节${c.title}`} onClick={() => {
                    const next = { ...targets }; delete next[id]; setTargets(next)
                  }}>移除</button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select className={selectClass} aria-label={`${c.title}的必要学习范围`} value={mark === "full" ? "full" : "through"}
                    onChange={e => setTargets({ ...targets, [id]: e.target.value === "full" ? "full" : String(c.start) })}>
                    <option value="full">学完整节</option><option value="through">学至指定{unit}</option>
                  </select>
                  {mark !== "full" && <label className="inline-flex items-center gap-1.5">第
                    <Input className="w-20" aria-label={`${c.title}的必要学习位置`} type="number" min={c.start} max={c.end} step={1} required value={mark}
                      onChange={e => setTargets({ ...targets, [id]: e.target.value })} />{unit}</label>}
                </div>
              </li>
            })}
          </ul>
          <label className="grid gap-1.5">本书中已有的关联
            <select className={selectClass} value={mode} onChange={e => setMode(e.target.value as "add" | "replace")}>
              <option value="add">保留并追加（同节取更远位置）</option>
              <option value="replace">替换所选题目在本书中的全部关联</option>
            </select>
          </label>
          {error && <p role="alert" className="text-destructive">{error}</p>}
          {notice && <p role="status" className="text-muted-foreground">{notice}</p>}
          <Button type="submit" disabled={!selected.length || (mode === "add" && !targetIds.length)}>{
            busy ? "正在保存…" : mode === "add" ? "追加关联" : targetIds.length ? "替换关联" : "解除所选题目的全部关联"
          }</Button>
        </fieldset></form>
      </CardContent>
    </Card>
  </div>
}
