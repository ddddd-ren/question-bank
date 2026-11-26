import { randomUUID } from "node:crypto"
import { inArray } from "drizzle-orm"
import { ApiError } from "../api-error"
import { questionFingerprint } from "../question-fingerprint"
import type { PaperStudyScope, SavedTemplate, StudyBalance, TemplateFilters, TemplateSection, TemplateShortage } from "../paper/template"
import type { TextbookPaperRequest } from "../textbooks/types"
import { allocateStudyQuotas, type PaperCandidate, type QuotaPool } from "../paper/study-allocation"
import { freezeStudyScope, studyCandidates } from "./textbook-paper-scope"
import { db, sqliteDb } from "./index"
import { getPaper, savePaper } from "./papers"
import { questions } from "./schema"
import { serializeQuestion } from "./serialize"

export function listPaperTemplates() {
  return sqliteDb.prepare("SELECT id,name FROM paper_templates ORDER BY rowid DESC").all() as Pick<SavedTemplate, "id" | "name">[]
}

export function getPaperTemplate(id: string): SavedTemplate {
  const row = sqliteDb.prepare("SELECT id,name,sections FROM paper_templates WHERE id=?").get(id) as { id: string; name: string; sections: string } | undefined
  if (!row) throw new ApiError(404, "试卷模板不存在")
  return { ...row, sections: JSON.parse(row.sections) }
}

export function getTemplateFile(id: string): Buffer {
  const file = sqliteDb.prepare("SELECT file FROM paper_templates WHERE id=?").pluck().get(id) as Buffer | undefined
  if (!file) throw new ApiError(404, "试卷模板不存在")
  return file
}

export function storePaperTemplate(name: string, sections: TemplateSection[], bytes: Buffer): SavedTemplate {
  const id = randomUUID()
  sqliteDb.prepare("INSERT INTO paper_templates(id,name,sections,file) VALUES(?,?,?,?)").run(id, name, JSON.stringify(sections), bytes)
  return { id, name, sections }
}

const genericTypeTags = new Set(["单选题", "多选题", "判断题", "填空题", "计算题", "简答题", "论述题", "编程题"])

function candidates(section: TemplateSection, type: TemplateSection["type"], filters: TemplateFilters, limit: number, includeIds?: number[], excludeIds?: number[]) {
  if (includeIds?.length === 0) return []
  const conditions = ["archived_at IS NULL", "type=?"]
  const parameters: (string | number)[] = [type]
  for (const [column, value] of [
    ["subject_id", filters.subjectId], ["knowledge_point_id", filters.knowledgePointId], ["difficulty", filters.difficulty],
    ["knowledge_point_id", section.knowledgePointId], ["difficulty", section.difficulty],
  ] as const) {
    if (value !== undefined) {
      conditions.push(`${column}=?`)
      parameters.push(value)
    }
  }
  if (section.tag && !genericTypeTags.has(section.tag)) {
    conditions.push("EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(tags) THEN tags ELSE '[]' END) WHERE typeof(key)='integer' AND type='text' AND value=?)")
    parameters.push(section.tag)
  }
  if (includeIds) {
    conditions.push("id IN (SELECT value FROM json_each(?))")
    parameters.push(JSON.stringify(includeIds))
  }
  if (excludeIds?.length) {
    conditions.push("id NOT IN (SELECT value FROM json_each(?))")
    parameters.push(JSON.stringify(excludeIds))
  }
  // 全卷只需 limit 道题；任一规则保留这么多不同候选即可保证原有可行匹配。
  return sqliteDb.prepare(`
    SELECT min(id) AS id, coalesce(nullif(fingerprint,''), question_fingerprint(type,content,options)) AS identity
    FROM questions WHERE ${conditions.join(" AND ")}
    GROUP BY identity ORDER BY random() LIMIT ?
  `).all(...parameters, limit) as PaperCandidate[]
}

function match(template: SavedTemplate, filters: TemplateFilters, request?: TextbookPaperRequest) {
  const total = template.sections.reduce((n, s) => n + s.slots.length, 0)
  const study = request && freezeStudyScope(request, total)
  const eligible = study && studyCandidates(study)
  const slots = template.sections.flatMap((section, sectionIndex) => {
    return section.slots.map(slot => ({ sectionIndex, section, type: slot.type ?? section.type }))
  })
  let assigned: Map<number, number>
  let balance: StudyBalance | undefined
  if (study?.mode === "mixed" && eligible) {
    const pools = new Map<string, QuotaPool>()
    const choices = slots.map(({ section, type }) => {
      const key = JSON.stringify([type, section.tag, section.knowledgePointId, section.difficulty])
      if (!pools.has(key)) pools.set(key, {
        recent: candidates(section, type, filters, total, eligible.recent),
        review: candidates(section, type, filters, total, eligible.review),
      })
      return pools.get(key)!
    })
    const result = allocateStudyQuotas(choices, study.newCount!)
    assigned = result.assigned
    study.newSlots = result.newSlots
    balance = result.balance
  } else {
    const pools = new Map<string, PaperCandidate[]>()
    const choices = slots.map(({ section, type }) => {
      const key = JSON.stringify([type, section.tag, section.knowledgePointId, section.difficulty])
      if (!pools.has(key)) pools.set(key, candidates(section, type, filters, total, eligible?.all))
      return pools.get(key)!
    })
    assigned = allocateQuestions(choices)
  }
  const counts = template.sections.map(() => 0)
  for (const index of assigned.keys()) counts[slots[index].sectionIndex]++
  const shortages: TemplateShortage[] = []
  template.sections.forEach((section, sectionIndex) => {
    const required = section.slots.length, available = counts[sectionIndex]
    if (available < required) shortages.push({ sectionIndex, required, available })
  })
  return { total, shortages, assigned, study, balance }
}

function allocateQuestions(pools: PaperCandidate[][]) {
  const owner = new Map<string, number>()
  const assigned = new Map<number, number>()
  // 允许已选题让位给别的槽位，避免重叠规则把可生成的试卷误报为缺题。
  function place(index: number, visited: Set<string>): boolean {
    const pool = pools[index]
    const free = pool.find(candidate => !owner.has(candidate.identity))
    if (free !== undefined) {
      owner.set(free.identity, index)
      assigned.set(index, free.id)
      return true
    }
    for (const { id, identity } of pool) {
      if (visited.has(identity)) continue
      visited.add(identity)
      if (place(owner.get(identity)!, visited)) {
        owner.set(identity, index)
        assigned.set(index, id)
        return true
      }
    }
    return false
  }
  const exhausted = new Set<PaperCandidate[]>()
  for (const [index, pool] of pools.entries()) {
    if (!exhausted.has(pool) && !place(index, new Set())) exhausted.add(pool)
  }
  return assigned
}

export function checkTemplate(templateId: string, filters: TemplateFilters, study?: TextbookPaperRequest) {
  return sqliteDb.transaction(() => {
    const { total, shortages, balance } = match(getPaperTemplate(templateId), filters, study)
    return { total, shortages, ...(balance && { balance }) }
  })()
}

function loadQuestions(ids: number[]) {
  const found = db.select().from(questions).where(inArray(questions.id, ids)).all()
  const byId = new Map(found.map(q => [q.id, serializeQuestion(q)]))
  return ids.map(id => byId.get(id)!)
}

export function generateTemplatePaper(templateId: string, filters: TemplateFilters, title?: string, request?: TextbookPaperRequest) {
  return sqliteDb.transaction(() => {
    const template = getPaperTemplate(templateId)
    const { total, shortages, assigned, study, balance } = match(template, filters, request)
    if (shortages.length) {
      const details = shortages.map(s => `${template.sections[s.sectionIndex].title}缺 ${s.required - s.available} 题`).join("，")
      const allocation = balance ? `（新课 ${balance.newAssigned}/${balance.newRequired}，旧课 ${balance.oldAssigned}/${balance.oldRequired}）` : ""
      throw new ApiError(409, details + allocation)
    }
    const ids = Array.from({ length: total }, (_, i) => assigned.get(i)!)
    return savePaper(title || template.name, loadQuestions(ids), { ...template, filters, ...(study && { study }) })
  }).immediate()
}

export function replaceTemplateQuestion(paperId: string, index: number) {
  return sqliteDb.transaction(() => {
    const paper = getPaper(paperId)
    if (!paper.template) throw new ApiError(400, "请选择模板试卷")
    const slots = paper.template.sections.flatMap(section => section.slots.map(slot => ({ section, type: slot.type ?? section.type })))
    if (!Number.isInteger(index) || !slots[index] || !paper.questions[index]) throw new ApiError(400, "题目序号超出试卷范围")
    const { section, type } = slots[index]
    const used = new Set(paper.questions.map(q => q.fingerprint || questionFingerprint(q)))
    const scope = paper.template.study
    const allowed = scope && replacementIds(scope, index)
    const pool = candidates(section, type, paper.template.filters, used.size + 1, allowed, paper.questions.map(q => q.id))
    const replacement = pool.find(candidate => !used.has(candidate.identity))
    if (!replacement) throw new ApiError(409, "没有符合条件的其他题目可替换")
    const updated = [...paper.questions]
    updated[index] = loadQuestions([replacement.id])[0]
    return savePaper(paper.title, updated, paper.template)
  }).immediate()
}

function replacementIds(scope: PaperStudyScope, index: number) {
  const candidates = studyCandidates(scope)
  if (scope.mode !== "mixed") return candidates.all
  return scope.newSlots?.includes(index) ? candidates.recent : candidates.review
}
