import { resizeTemplateSection } from "./resize-template-section"
import { TextbookScopePicker } from "./textbook-scope"
import Link from "next/link"
import type { TextbookPaperRequest } from "@/lib/textbooks/types"
import type { StudyBalance } from "@/lib/paper/template"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatTemplateHeading } from "@/lib/paper/template-docx-heading"
import { typeLabels } from "@/lib/constants"
import type { SavedPaper } from "@/lib/db/papers"
import { MAX_TEMPLATE_SLOTS, type SavedTemplate, type TemplateSection, type TemplateSlot, type TemplateShortage } from "@/lib/paper/template"
import type { QuestionType } from "@/lib/types"

type Summary = Pick<SavedTemplate, "id" | "name">
const select = "h-9 w-full rounded-md border bg-background px-2 text-sm"
const typeOptions = Object.entries(typeLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)
export function scoreText(slots: TemplateSlot[]) {
  const unknown = slots.filter(slot => slot.points === null).length
  const sum = Number(slots.reduce((n, slot) => n + (slot.points ?? 0), 0).toFixed(6))
  return unknown ? `已标分值 ${sum} 分，${unknown} 题未标分` : `${sum} 分`
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || "请求失败")
  return value
}
function message(error: unknown) { return error instanceof Error ? error.message : "操作失败" }
function post(value: unknown) {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }
}
export function TemplateBuilder({ title, subject, knowledge, difficulty, points, onGenerated, busy, setBusy, initialBook }: {
  initialBook?: string
  title: string; subject: string; knowledge: string; difficulty: string
  points: {id: number; name: string; subjectId?: number}[]
  onGenerated: (paper: SavedPaper) => Promise<void>; busy: boolean; setBusy: (busy: boolean) => void
}) {
  const [list, setList] = useState<Summary[]>([])
  const [saved, setSaved] = useState<SavedTemplate | null>(null)
  const [revisionSource, setRevisionSource] = useState<SavedTemplate | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sections, setSections] = useState<TemplateSection[]>([])
  const [name, setName] = useState("")
  const [warnings, setWarnings] = useState<string[]>([])
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [study, setStudy] = useState<TextbookPaperRequest | undefined>(initialBook ? { bookId: initialBook, mode: "cumulative" } : undefined)
  const [check, setCheck] = useState<{key: string; shortages: TemplateShortage[]; balance?: StudyBalance; error?: string} | null>(null)
  const payload = JSON.stringify({ mode: "template", templateId: saved?.id, subjectId: Number(subject) || undefined,
    knowledgePointId: Number(knowledge) || undefined, difficulty: Number(difficulty) || undefined, study })
  const key = payload + "|" + revision
  const locked = busy || working
  useEffect(() => {
    const controller = new AbortController()
    void request<Summary[]>("/api/paper-templates", { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setList(value)
    }).catch(e => {
      if (!controller.signal.aborted) setError(message(e))
    })
    return () => controller.abort()
  }, [revision])
  useEffect(() => {
    if (!saved) return
    const controller = new AbortController()
    void request<{shortages: TemplateShortage[]; balance?: StudyBalance}>("/api/papers", { ...post({ ...JSON.parse(payload), preflight: true }), signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setCheck({ key, shortages: value.shortages, balance: value.balance }) })
      .catch(e => { if (!controller.signal.aborted) setCheck({ key, shortages: [], error: message(e) }) })
    return () => controller.abort()
  }, [saved, key, payload])
  async function run(action: () => Promise<void>) {
    setWorking(true); setError("")
    try { await action() } catch (e) { setError(message(e)) } finally { setWorking(false) }
  }
  async function analyze(source: File) {
    setSaved(null); setRevisionSource(null); setSections([]); setWarnings([]); setFile(source)
    const form = new FormData()
    form.set("action", "analyze"); form.set("file", source)
    const value = await request<{sections: TemplateSection[]; warnings: string[]}>("/api/paper-templates", { method: "POST", body: form })
    setName(source.name.replace(/\.docx$/i, "")); setSections(value.sections); setWarnings(value.warnings)
  }
  async function save() {
    const form = new FormData()
    if (revisionSource) {
      form.set("action", "revise"); form.set("templateId", revisionSource.id)
    } else if (file) {
      form.set("action", "save"); form.set("file", file)
    } else return
    form.set("name", name.trim()); form.set("sections", JSON.stringify(sections))
    const value = await request<SavedTemplate>("/api/paper-templates", { method: "POST", body: form })
    setSaved(value); setRevisionSource(null); setRevision(r => r + 1); setList(old => [...old.filter(item => item.id !== value.id), value]); setFile(null); setWarnings([])
  }
  function edit(index: number, change: Partial<TemplateSection>) {
    setSections(old => old.map((section, i) => i === index ? { ...section, ...change } : section))
  }
  const shown = saved?.sections ?? sections
  const slots = shown.flatMap(s => s.slots)
  const editing = !!file || !!revisionSource
  const invalid = editing && (slots.length > MAX_TEMPLATE_SLOTS ? `全卷最多支持 ${MAX_TEMPLATE_SLOTS} 题` : shown.flatMap((section, i) => {
    if (!section.title.trim()) return [`请填写第 ${i + 1} 大题的标题`]
    const numbers = section.slots.map(slot => slot.number.trim())
    if (numbers.some(number => !number)) return [`${section.title} 有空白题号`]
    if (new Set(numbers).size !== numbers.length) return [`${section.title} 有重复题号`]
    if (section.slots.some(slot => slot.points !== null && (slot.points < 0 || slot.points > 10000))) return [`${section.title} 的分值须在 0 至 10000 之间`]
    return []
  })[0])
  const current = check?.key === key ? check : null
  return <fieldset disabled={locked} className="min-w-0 space-y-3">
    <TextbookScopePicker value={study} onChange={setStudy} total={slots.length} />
    <label className="block">已保存模板<select className={select} value={saved?.id ?? revisionSource?.id ?? ""} onChange={e => {
      const id = e.target.value
      setSaved(null); setRevisionSource(null); setSections([]); setFile(null); setWarnings([])
      if (id) void run(async () => setSaved(await request<SavedTemplate>(`/api/paper-templates?id=${encodeURIComponent(id)}`)))
    }}><option value="">选择模板</option>{list.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="block">上传 Word 样卷<Input type="file" accept=".docx" onChange={e => {
      const source = e.target.files?.[0]; e.target.value = ""
      if (source) void run(() => analyze(source))
    }} /></label>
    {saved && <Button variant="outline" onClick={() => {
      setRevisionSource(saved); setSections(saved.sections); setName(saved.name.slice(0, 195) + "（修订）")
      setSaved(null); setError("")
    }}>调整模板</Button>}
    {warnings.length > 0 && <div role="status" className="rounded border p-2"><strong>识别提醒</strong><ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
    {editing && shown.length > 0 && <label className="block">模板名称<Input value={name} maxLength={200} onChange={e => setName(e.target.value)} /></label>}
    {shown.map((section, i) => {
      const updateSlot = (j: number, change: Partial<TemplateSlot>) => edit(i, { slots: section.slots.map((s,k) => k === j ? { ...s, ...change } : s) })
      return <details key={i} className="rounded-md border p-3" open={saved ? undefined : true}><summary className="cursor-pointer font-medium">{formatTemplateHeading(section) || `大题 ${i + 1}`} · {section.slots.length} 题 · {scoreText(section.slots)}</summary>
        {saved ? <div className="mt-2 space-y-1 text-sm"><p>{typeLabels[section.type]}{section.tag && ` · 标签：${section.tag}`}{section.knowledgePointId && ` · 知识点：${points.find(p => p.id === section.knowledgePointId)?.name ?? section.knowledgePointId}`}{section.difficulty && ` · 难度 ${section.difficulty}`}</p><ul>{section.slots.map((s,j) => <li key={j}>{s.number} · {typeLabels[s.type ?? section.type]} · {s.points === null ? "未标分" : `${s.points} 分`}</li>)}</ul></div> :
        <div className="mt-3 grid gap-2 text-sm"><label>大题标题<Input maxLength={500} value={section.title} onChange={e => edit(i,{title:e.target.value})} /></label>
          <label>默认题型<select className={select} value={section.type} onChange={e => edit(i,{type:e.target.value as QuestionType})}>{typeOptions}</select></label>
          <label>细分标签<Input maxLength={50} placeholder="如：名词解释" value={section.tag ?? ""} onChange={e => edit(i,{tag:e.target.value || undefined})} /></label>
          <label>知识点<select className={select} value={section.knowledgePointId ?? ""} onChange={e => edit(i,{knowledgePointId:Number(e.target.value) || undefined})}><option value="">沿用全卷条件</option>{points.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>难度<select className={select} value={section.difficulty ?? ""} onChange={e => edit(i,{difficulty:Number(e.target.value) || undefined})}><option value="">沿用全卷条件</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>题量<Input type="number" min={1} max={MAX_TEMPLATE_SLOTS} defaultValue={section.slots.length} key={section.slots.length} onBlur={e => {
            const n = Number(e.target.value)
            if (!Number.isInteger(n) || n < 1 || n > MAX_TEMPLATE_SLOTS) { e.target.value = String(section.slots.length); return }
            setSections(old => resizeTemplateSection(old, i, n))
          }} /></label>
          {section.slots.map((s,j) => <div key={j} className="grid grid-cols-2 gap-2 border-t pt-2"><label>题号<Input maxLength={32} value={s.number} onChange={e => updateSlot(j,{number:e.target.value})} /></label>
            <label>分值<Input type="number" step="any" min={0} placeholder="未标分" value={s.points ?? ""} onChange={e => updateSlot(j,{points:e.target.value === "" ? null : Number(e.target.value)})} /></label>
            <label className="col-span-2">该题题型<select className={select} value={s.type ?? ""} onChange={e => updateSlot(j,{type:e.target.value as QuestionType || undefined})}><option value="">沿用大题题型</option>{typeOptions}</select></label></div>)}</div>}
      </details>
    })}
    {shown.length > 0 && <p>全卷 {slots.length} 题 · {scoreText(slots)}</p>}
    {invalid && <p role="alert">{invalid}</p>}
    {editing && shown.length > 0 && <Button disabled={!name.trim() || slots.length < 1 || !!invalid} onClick={() => void run(save)}>{revisionSource ? "另存为新模板" : "确认并保存模板"}</Button>}
    {revisionSource && <Button variant="outline" onClick={() => {
      setSaved(revisionSource); setRevisionSource(null); setSections([]); setError("")
    }}>取消调整</Button>}
    {saved && <><div role="status" className="space-y-1 text-sm">{!current ? "正在检查题库…" : current.error ?? (current.shortages.length ? current.shortages.map(s => <p key={s.sectionIndex}>{saved.sections[s.sectionIndex]?.title}：需要 {s.required} 题，可用 {s.available} 题，缺 {s.required - s.available} 题</p>) : "题库数量充足，可以生成。")}</div>
      {current?.balance && <p className="text-sm">可分配新课 {current.balance.newAssigned}/{current.balance.newRequired} 题，旧课 {current.balance.oldAssigned}/{current.balance.oldRequired} 题。</p>}
      {study && !!current?.shortages.length && <Link className="inline-block text-sm underline" href={`/textbooks/${study.bookId}?view=links`}>去关联本书题目</Link>}
      <Button className="w-full" disabled={!current || !!current.error || current.shortages.length > 0} onClick={() => void run(async () => {
        setBusy(true)
        try { await onGenerated(await request<SavedPaper>("/api/papers", post({ ...JSON.parse(payload), title }))) }
        finally { setRevision(r => r + 1); setBusy(false) }
      })}>生成并保存试卷</Button></>}
    {working && <p role="status">正在处理…</p>}
    {(error || current?.error || !!current?.shortages.length) && <div>{error && <p role="alert">{error}</p>}<Button variant="outline" onClick={() => { setError(""); setRevision(r => r + 1); if (file && !sections.length) void run(() => analyze(file)) }}>重新检查</Button></div>}
  </fieldset>
}
