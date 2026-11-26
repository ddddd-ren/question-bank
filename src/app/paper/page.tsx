"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { SavedStudyScope } from "@/components/paper/textbook-scope"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { TemplateBuilder, scoreText } from "@/components/paper/template-builder"
import { Fragment } from "react"
import { RichContent } from "@/components/rich-content"
import { showToast } from "@/components/toast"
import { formatTemplateHeading } from "@/lib/paper/template-docx-heading"
import { typeLabels } from "@/lib/constants"
import { getOptionLetter, parseOptionText } from "@/lib/utils"
import { createPaperAutosave, PaperSaveConflict, type PaperSaveAction } from "@/lib/paper/autosave"
import { toggleChoiceSelection } from "@/lib/answer-grading"
import type { SerializedQuestion } from "@/lib/db/serialize"
import type { PaperAttempt, SavedPaper } from "@/lib/db/papers"
import type { QuestionType } from "@/lib/types"

interface PaperSummary { id: string; title: string; total: number; createdAt: number }
interface AttemptSummary { id: string; mode: string; startedAt: number; submittedAt: number | null }
interface NamedItem { id: number; name: string; subjectId?: number }
const types = Object.entries(typeLabels) as [QuestionType, string][]
async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  const data = await response.json()
  if (!response.ok) {
    if (response.status === 409 && typeof data.conflict?.questionId === "number" && typeof data.conflict.savedAnswer === "string") {
      throw new PaperSaveConflict(data.conflict.questionId, data.conflict.savedAnswer)
    }
    throw new Error(data.error || "请求失败")
  }
  return data
}
function body(method: string, value: unknown) { return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) } }
function errorToast(error: unknown) { showToast(error instanceof Error ? error.message : "操作失败", "error") }
const selectClass = "h-9 rounded-md border bg-background px-2 text-sm"

export default function PaperPage() {
  return <Suspense fallback={<p>正在打开组卷页…</p>}><PaperEntry /></Suspense>
}

function PaperEntry() {
  const book = useSearchParams().get("textbook") ?? ""
  return <PaperContent key={book} initialBook={book} />
}

function PaperContent({ initialBook }: { initialBook: string }) {
  const [title, setTitle] = useState("题库试卷")
  const [mode, setMode] = useState(initialBook ? "template" : "random")
  const [rules, setRules] = useState<Record<string, number>>({ single: 5 })
  const [subject, setSubject] = useState("")
  const [knowledge, setKnowledge] = useState("")
  const [difficulty, setDifficulty] = useState("")
  const [subjects, setSubjects] = useState<NamedItem[]>([])
  const [points, setPoints] = useState<NamedItem[]>([])
  const [papers, setPapers] = useState<PaperSummary[]>([])
  const [paper, setPaper] = useState<SavedPaper | null>(null)
  const [history, setHistory] = useState<AttemptSummary[]>([])
  const [attempt, setAttempt] = useState<PaperAttempt | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [marked, setMarked] = useState<number[]>([])
  const [index, setIndex] = useState(0)
  const [minutes, setMinutes] = useState(60)
  const [examMode, setExamMode] = useState<"practice" | "exam">("exam")
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed" | PaperSaveConflict>("idle")
  const [clock, setClock] = useState(0)
  const offset = useRef(0)
  const saveQueue = useRef<ReturnType<typeof createPaperAutosave<PaperAttempt>> | null>(null)
  const latestAttempt = useRef<string | null>(null)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [page, setPage] = useState(1)
  const [bank, setBank] = useState<{ data: SerializedQuestion[]; totalPages: number }>({ data: [], totalPages: 0 })
  const [loadingBank, setLoadingBank] = useState(false)
  const [bankError, setBankError] = useState("")
  const [selected, setSelected] = useState<Record<number, string>>({})

  const acceptAttempt = useCallback((value: PaperAttempt) => {
    saveQueue.current = createPaperAutosave(value, change => jsonRequest("/api/papers/attempts", body("PATCH", { id: value.id, ...change })))
    latestAttempt.current = value.id
    offset.current = value.serverNow - Date.now()
    setAttempt(value); setPaper(value.paper); setAnswers(value.answers); setMarked(value.marked)
    setClock(value.serverNow)
    setSaveState("idle")
    try { localStorage.setItem("paper-attempt", value.id) } catch { /* 当前页仍可继续作答。 */ }
  }, [])
  const refreshPapers = useCallback(async () => setPapers(await jsonRequest("/api/papers")), [])
  useEffect(() => {
    void jsonRequest("/api/papers").then(setPapers).catch(errorToast)
    void jsonRequest("/api/subjects").then(setSubjects).catch(errorToast)
    void jsonRequest("/api/knowledge-points").then(setPoints).catch(errorToast)
    const id = localStorage.getItem("paper-attempt")
    if (id && !initialBook) void jsonRequest(`/api/papers/attempts?id=${encodeURIComponent(id)}`).then(acceptAttempt).catch(errorToast)
  }, [acceptAttempt, refreshPapers, initialBook])

  useEffect(() => {
    if (mode !== "manual") return
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(page), pageSize: "30" })
    for (const [key, value] of Object.entries({ search, type: typeFilter, subjectId: subject, knowledgePointId: knowledge, difficulty })) if (value) params.set(key, value)
    const timer = setTimeout(() => {
      setLoadingBank(true); setBankError("")
      void jsonRequest(`/api/questions?${params}`, { signal: controller.signal }).then(setBank).catch(error => {
        if (!controller.signal.aborted) setBankError(error.message)
      }).finally(() => { if (!controller.signal.aborted) setLoadingBank(false) })
    }, 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [mode, page, search, typeFilter, subject, knowledge, difficulty])

  const persist = useCallback(async (id: string, changes?: PaperSaveAction) => {
    const queue = saveQueue.current
    if (!queue || latestAttempt.current !== id) return
    setSaveState("saving")
    const pending = queue.save(changes)
    const input = queue.draft()
    setAnswers(input.answers); setMarked(input.marked)
    return pending.promise.then(value => {
      if (saveQueue.current !== queue) return
      if (value.submittedAt !== null) {
        acceptAttempt(value)
      } else if (pending.isLatest()) {
        const draft = queue.draft()
        setAnswers(draft.answers); setMarked(draft.marked)
        setSaveState("saved")
      }
    }).catch(error => {
      if (saveQueue.current === queue && pending.isLatest()) {
        setSaveState(error instanceof PaperSaveConflict ? error : "failed")
      }
    })
  }, [acceptAttempt])

  const checkDeadline = useCallback(async (id: string) => {
    const queue = saveQueue.current
    setSaveState("saving")
    try {
      const value: PaperAttempt = await jsonRequest(`/api/papers/attempts?id=${encodeURIComponent(id)}`)
      if (saveQueue.current !== queue) return
      if (value.submittedAt === null) {
        setClock(value.serverNow)
        offset.current = value.serverNow - Date.now()
        return false
      }
      acceptAttempt(value)
      if (queue?.hasPending()) showToast("考试已结束，结果按服务器已保存的答案结算", "info")
      return true
    } catch {
      if (saveQueue.current === queue) setSaveState("failed")
    }
  }, [acceptAttempt])

  useEffect(() => {
    if (!attempt || attempt.submittedAt) return
    let checking = false
    const timer = setInterval(() => {
      const now = Date.now() + offset.current
      setClock(now)
      if (!checking && attempt.expiresAt && now >= attempt.expiresAt) {
        checking = true
        void checkDeadline(attempt.id).then(done => {
          if (done === false) checking = false
          else clearInterval(timer)
        })
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [attempt, checkDeadline])

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!saveQueue.current?.hasPending()) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [])

  const saveAnswer = (value: string) => {
    if (!attempt) return
    const id = attempt.paper.questions[index].id
    void persist(attempt.id, { edit: { questionId: id, answer: { from: answers[id] ?? "", to: value } } })
  }
  const loadPaper = async (id: string) => {
    setBusy(true)
    try {
      await saveQueue.current?.flush()
      const value = await jsonRequest(`/api/papers?id=${id}`)
      latestAttempt.current = null; localStorage.removeItem("paper-attempt")
      setPaper(value); setHistory(value.attempts); setAttempt(null)
    } catch (error) { errorToast(error) } finally { setBusy(false) }
  }
  const acceptPaper = async (value: SavedPaper, message = "试卷已生成并保存") => {
    setPaper(value); setHistory([]); setAttempt(null); latestAttempt.current = null; localStorage.removeItem("paper-attempt")
    await refreshPapers(); showToast(message, "success")
  }
  const replaceQuestion = async (index: number) => {
    if (!paper) return
    setBusy(true)
    try { await acceptPaper(await jsonRequest("/api/papers", body("POST", { mode: "replace", paperId: paper.id, index })), "已换题并另存为新试卷，当前显示副本") }
    catch (error) { errorToast(error) } finally { setBusy(false) }
  }
  const generate = async () => {
    setBusy(true)
    try {
      const value = await jsonRequest("/api/papers", body("POST", { title, mode, rules: types.map(([type]) => ({ type, count: rules[type] || 0 })), questionIds: Object.keys(selected).map(Number), subjectId: subject ? Number(subject) : undefined, knowledgePointId: knowledge ? Number(knowledge) : undefined, difficulty: difficulty ? Number(difficulty) : undefined }))
      await acceptPaper(value)
    } catch (error) { errorToast(error) } finally { setBusy(false) }
  }
  const start = async () => {
    if (!paper) return
    setBusy(true)
    try { acceptAttempt(await jsonRequest("/api/papers/attempts", body("POST", { paperId: paper.id, mode: examMode, minutes }))); setIndex(0) }
    catch (error) { errorToast(error) } finally { setBusy(false) }
  }
  const submit = async () => {
    if (!attempt) return
    setBusy(true)
    try { await persist(attempt.id, { submit: true }) }
    finally { setBusy(false) }
  }
  const selfAssess = async (questionId: number, isCorrect: boolean) => {
    if (!attempt) return
    setBusy(true)
    try { acceptAttempt(await jsonRequest("/api/papers/attempts", body("PATCH", { id: attempt.id, selfAssessment: { questionId, isCorrect } }))) }
    catch (error) { errorToast(error) } finally { setBusy(false) }
  }
  const resume = async (id: string) => {
    setBusy(true)
    try { acceptAttempt(await jsonRequest(`/api/papers/attempts?id=${id}`)); setIndex(0) }
    catch (error) { errorToast(error) } finally { setBusy(false) }
  }

  const template = (attempt?.paper ?? paper)?.template
  const layout = template?.sections.flatMap(section => section.slots.map((slot, i) => ({ section, slot, first: i === 0 })))
  const questionLabel = (i: number, includeSection = false) => {
    const position = layout?.[i]
    if (!position) return `第 ${i + 1} 题`
    const label = `第 ${position.slot.number} 题 · ${position.slot.points === null ? "未标分" : position.slot.points + " 分"}`
    return includeSection ? `${position.section.title} · ${label}` : label
  }
  if (attempt) {
    const question = attempt.paper.questions[index]
    const done = attempt.submittedAt !== null
    const expired = attempt.expiresAt !== null && clock >= attempt.expiresAt
    const locked = done || busy || expired
    const remaining = Math.max(0, Math.ceil(((attempt.expiresAt || clock) - clock) / 1000))
    const results = Object.values(attempt.results || {})
    const conflict = saveState instanceof PaperSaveConflict ? saveState : null
    return <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{attempt.paper.title}</h1><p className="text-sm text-muted-foreground">{done ? "交卷结果" : attempt.mode === "exam" ? `模拟考试 · 剩余 ${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒` : "不限时练习 · 统一交卷后查看结果"}</p></div><Button variant="outline" disabled={busy} onClick={() => void loadPaper(attempt.paperId)}>返回试卷</Button></div>
      {done ? <p>答对 {results.filter(r => r.isCorrect === true).length} 题 · 答错 {results.filter(r => r.isCorrect === false).length} 题 · 待评 {results.filter(r => r.isCorrect === null).length} 题。主观题请对照参考答案自评，待评不计入正确率。</p> : (
        <div className="space-y-3">
          {conflict && !expired && (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p role="alert">{questionLabel(attempt.paper.questions.findIndex(q => q.id === conflict.questionId), true)}的答案有冲突。</p>
              <p className="max-h-32 overflow-auto whitespace-pre-wrap break-words">已保存的答案：{conflict.savedAnswer || "未作答"}</p>
              <p className="max-h-32 overflow-auto whitespace-pre-wrap break-words">本页的答案：{answers[conflict.questionId] || "未作答"}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void persist(attempt.id, { resolve: "saved" })}>使用已保存答案</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void persist(attempt.id, { resolve: "local" })}>保存本页答案</Button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <span role="status">{expired
              ? (saveState === "failed" ? "获取交卷结果失败" : "作答时间已到")
              : ({ idle: "作答会自动保存", saving: "保存中…", saved: "已保存", failed: "保存失败，当前输入仍保留" }[typeof saveState === "string" ? saveState : "idle"])}</span>
            {expired ? <Button variant="outline" disabled={saveState === "saving"} onClick={() => void checkDeadline(attempt.id)}>查看交卷结果</Button> : <>
              {saveState === "failed" && <Button variant="outline" disabled={busy} onClick={() => void persist(attempt.id)}>重试保存</Button>}
              <Button disabled={busy || !!conflict} onClick={() => void submit()}>交卷（未答 {attempt.paper.questions.filter(q => !answers[q.id]?.trim()).length} 题）</Button>
            </>}
          </div>
        </div>
      )}
      {layout && done && <p>已确认得分 {Number(layout.reduce((sum, item, i) => sum + (attempt.results?.[attempt.paper.questions[i].id]?.isCorrect ? item.slot.points ?? 0 : 0), 0).toFixed(6))} 分 · {scoreText(layout.map(item => item.slot))}</p>}
      <div aria-label="答题卡" className="flex flex-wrap gap-2">{attempt.paper.questions.map((q, i) => <Fragment key={q.id}>{layout?.[i]?.first && <h2 className="w-full font-medium">{formatTemplateHeading(layout[i].section)}</h2>}<Button variant={index === i ? "default" : "outline"} onClick={() => setIndex(i)} aria-label={`${questionLabel(i, true)}${answers[q.id] ? "已答" : "未答"}${marked.includes(q.id) ? "待检查" : ""}`}>{layout?.[i]?.slot.number ?? i + 1}{answers[q.id] ? " ✓" : ""}{marked.includes(q.id) ? " ★" : ""}</Button></Fragment>)}</div>
      {question && <Card><CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base"><span>{questionLabel(index, true)} · {typeLabels[question.type]}</span>{!done && <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={locked} checked={marked.includes(question.id)} onChange={event => void persist(attempt.id, { edit: { questionId: question.id, marked: event.target.checked } })} />待检查</label>}</CardTitle></CardHeader><CardContent className="space-y-4">
        <RichContent content={question.content} />
        {question.options?.length ? <div className="space-y-2">{question.options.map((option, i) => { const letter = getOptionLetter(option); return <div key={i} className={`flex items-start gap-3 rounded-md border p-3 ${(answers[question.id] || "").includes(letter) ? "border-primary bg-primary/10" : ""}`}><input aria-label={`选项 ${letter}`} type={question.type === "multiple" ? "checkbox" : "radio"} name={`question-${question.id}`} disabled={locked} checked={(answers[question.id] || "").includes(letter)} onChange={() => saveAnswer(toggleChoiceSelection(question.type, answers[question.id], letter) || "")} className="mt-1" /><span>{letter}.</span><RichContent content={parseOptionText(option)} /></div> })}</div> : question.type === "truefalse" ? <div className="flex gap-2">{["正确", "错误"].map(value => <Button key={value} disabled={locked} variant={answers[question.id] === value ? "default" : "outline"} onClick={() => saveAnswer(value)}>{value}</Button>)}</div> : <Textarea aria-label="你的答案" disabled={locked} maxLength={20000} value={answers[question.id] || ""} onChange={event => saveAnswer(event.target.value)} className="min-h-40" />}
        {done && <div className="space-y-2 rounded-md bg-muted p-4"><p>你的答案：{answers[question.id] || "未作答"}</p><p>{attempt.results?.[question.id].isCorrect === null ? "待评" : attempt.results?.[question.id].isCorrect ? "正确" : "错误"}</p><div>参考答案：<RichContent content={question.answer || "无"} /></div><RichContent content={question.explanation || ""} />{attempt.results?.[question.id].isCorrect === null && ["calculation", "essay", "code"].includes(question.type) && <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void selfAssess(question.id, true)}>自评：掌握了</Button><Button variant="outline" disabled={busy} onClick={() => void selfAssess(question.id, false)}>自评：需要复习</Button></div>}</div>}
        <div className="flex justify-between"><Button variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>上一题</Button><Button variant="outline" disabled={index === attempt.paper.questions.length - 1} onClick={() => setIndex(index + 1)}>下一题</Button></div>
      </CardContent></Card>}
    </div>
  }

  return <div className="space-y-6"><div><h1 className="text-3xl font-bold">组卷与模拟考试</h1><p className="mt-2 text-muted-foreground">生成即保存固定试卷，预览、导出和作答使用同一份题目。</p></div>
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]"><div className="space-y-4"><Card><CardHeader><CardTitle>组卷设置</CardTitle></CardHeader><CardContent className="space-y-4">
      <label className="block space-y-1"><span>试卷名称</span><Input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} /></label>
      <label className="block space-y-1"><span>组卷方式</span><select className={`${selectClass} w-full`} value={mode} disabled={busy} onChange={e => setMode(e.target.value)}><option value="random">随机抽题</option><option value="manual">手动选题</option><option value="template">按模板组卷</option></select></label>
      <div className="grid gap-2"><select aria-label="学科" className={selectClass} value={subject} onChange={e => { setSubject(e.target.value); setKnowledge(""); setPage(1) }}><option value="">全部学科</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select aria-label="知识点" className={selectClass} value={knowledge} onChange={e => { setKnowledge(e.target.value); setPage(1) }}><option value="">全部知识点</option>{points.filter(p => !subject || p.subjectId === Number(subject)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select aria-label="难度" className={selectClass} value={difficulty} onChange={e => { setDifficulty(e.target.value); setPage(1) }}><option value="">全部难度</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>难度 {n}</option>)}</select></div>
      {mode === "template" ? <TemplateBuilder initialBook={initialBook} title={title} subject={subject} knowledge={knowledge} difficulty={difficulty} points={points} onGenerated={acceptPaper} busy={busy} setBusy={setBusy} /> : mode === "random" ? <div className="space-y-2">{types.map(([type,label]) => <label key={type} className="flex items-center justify-between gap-3"><span>{label}</span><Input className="w-24" type="number" min={0} max={100} value={rules[type] || 0} onChange={e => setRules({ ...rules, [type]: Number(e.target.value) })} /></label>)}</div> : <div className="space-y-3"><Input aria-label="搜索题目" placeholder="搜索题目" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} /><select aria-label="题型" className={selectClass} value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}><option value="">全部题型</option>{types.map(([type,label]) => <option key={type} value={type}>{label}</option>)}</select><p className="text-sm">已选 {Object.keys(selected).length} 题（含其他分页和筛选）</p>{Object.entries(selected).length > 0 && <details><summary>查看与移除已选题目</summary>{Object.entries(selected).map(([id,content]) => <button key={id} className="block w-full truncate text-left text-sm" onClick={() => setSelected(previous => { const next = { ...previous }; delete next[Number(id)]; return next })}>移除 #{id} · {content}</button>)}</details>}{bankError && <p role="alert">{bankError}</p>}{loadingBank ? <p>正在加载题目…</p> : <div className="max-h-80 overflow-auto">{bank.data.map(q => <label key={q.id} className="flex gap-2 border-b py-3"><input type="checkbox" checked={q.id in selected} onChange={e => setSelected(previous => { const next = { ...previous }; if (e.target.checked) next[q.id] = q.content; else delete next[q.id]; return next })} /><span className="line-clamp-2 text-sm">#{q.id} · {q.content}</span></label>)}{!bank.data.length && !bankError && <p>没有匹配题目</p>}</div>}<div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={loadingBank || page <= 1} onClick={() => setPage(page - 1)}>上一页</Button><span>{page} / {Math.max(1,bank.totalPages)}</span><Button variant="outline" disabled={loadingBank || page >= bank.totalPages} onClick={() => setPage(page + 1)}>下一页</Button></div></div>}
      {mode !== "template" && <Button className="w-full" disabled={busy} onClick={() => void generate()}>生成并保存试卷</Button>}
    </CardContent></Card><Card><CardHeader><CardTitle>已保存试卷</CardTitle></CardHeader><CardContent className="space-y-2">{papers.length ? papers.map(item => <Button key={item.id} variant={paper?.id === item.id ? "secondary" : "outline"} aria-current={paper?.id === item.id ? "true" : undefined} className="h-auto w-full justify-between gap-2 py-2" disabled={busy} onClick={() => void loadPaper(item.id)}><span className="min-w-0 text-left"><span className="block truncate">{item.title}</span><time className="block text-xs text-muted-foreground" dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}</time></span><span className="shrink-0">{paper?.id === item.id && "当前 · "}{item.total} 题</span></Button>) : <p className="text-muted-foreground">暂无试卷</p>}</CardContent></Card></div>
    <Card><CardHeader><CardTitle>{paper ? `${paper.title} · ${paper.questions.length} 题` : "试卷预览"}</CardTitle></CardHeader><CardContent className="space-y-5">{paper ? <><div className="flex flex-wrap items-center gap-3"><Button variant="outline" asChild><a href={`/api/papers?id=${paper.id}&format=docx&includeAnswers=false`}>导出学生卷</a></Button><Button variant="outline" asChild><a href={`/api/papers?id=${paper.id}&format=docx&includeAnswers=true`}>导出答案卷</a></Button></div><div className="flex flex-wrap items-center gap-2"><select aria-label="作答模式" className={selectClass} value={examMode} onChange={e => setExamMode(e.target.value as "practice" | "exam")}><option value="exam">限时模拟考试</option><option value="practice">不限时练习</option></select>{examMode === "exam" && <label className="flex items-center gap-2"><Input aria-label="考试时长" className="w-24" type="number" min={1} max={480} value={minutes} onChange={e => setMinutes(Number(e.target.value))} />分钟</label>}<Button disabled={busy} onClick={() => void start()}>开始作答</Button></div>{history.length > 0 && <div className="space-y-2"><h2 className="font-medium">历史作答</h2>{history.map(item => <Button variant="outline" key={item.id} disabled={busy} onClick={() => void resume(item.id)}>{new Date(item.startedAt).toLocaleString("zh-CN")} · {item.submittedAt ? "查看结果" : "继续作答"}</Button>)}</div>}{template?.study && <SavedStudyScope scope={template.study} total={paper.questions.length} />}{template && layout && <p>{template.name} · 全卷 {scoreText(layout.map(item => item.slot))}</p>}{paper.questions.map((q,i) => <Fragment key={q.id}>{layout?.[i]?.first && <h2 className="font-semibold">{formatTemplateHeading(layout[i].section)} · {scoreText(layout[i].section.slots)}</h2>}<div className="space-y-2 rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{questionLabel(i)} · {typeLabels[q.type]}</p>{template && <Button size="sm" variant="outline" disabled={busy} onClick={() => void replaceQuestion(i)}>同条件换题并另存</Button>}</div><RichContent content={q.content} />{q.options?.map((option,j) => <RichContent key={j} content={option} className="text-sm" />)}</div></Fragment>)}</> : <p className="py-16 text-center text-muted-foreground">设置组卷条件，或打开已保存试卷。</p>}</CardContent></Card></div>
  </div>
}
