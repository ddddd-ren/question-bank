import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import Database from "better-sqlite3"
import type { TemplateSection } from "../../paper/template"
import { backupDatabase } from "../backup.mjs"
import { questionFingerprint } from "../../question-fingerprint"

const directory = mkdtempSync(path.join(tmpdir(), "paper-template-test-"))
const source = path.join(directory, "source.db")
let sqlite: typeof import("../index").sqliteDb
let templates: typeof import("../paper-templates")
let papers: typeof import("../papers")
const section: TemplateSection = { title: "选择题", type: "single", slots: [{ number: "1", points: 2 }] }
const bytes = Buffer.from("原卷文件")

beforeAll(async () => {
  vi.stubEnv("DATABASE_PATH", source)
  vi.resetModules()
  sqlite = (await import("../index")).sqliteDb
  templates = await import("../paper-templates")
  papers = await import("../papers")
  sqlite.exec(`
    INSERT INTO subjects(id,name) VALUES(1,'学科一'),(2,'学科二');
    INSERT INTO knowledge_points(id,subject_id,name) VALUES(1,1,'知识点一'),(2,2,'知识点二');
    INSERT INTO questions(id,type,content,content_hash,subject_id,knowledge_point_id,difficulty,tags,archived_at) VALUES
      (1,'single','唯一标签','1',1,1,2,'["专项"]',NULL),
      (2,'single','普通','2',1,1,2,NULL,NULL),
      (3,'single','其他标签','3',1,1,2,'["专项扩展"]',NULL),
      (4,'single','其他学科','4',2,2,2,'["专项"]',NULL),
      (5,'single','已归档','5',1,1,2,'["专项"]','2020'),
      (6,'single','不同难度','6',1,1,1,'["专项"]',NULL),
      (7,'essay','主观题','7',1,1,2,NULL,NULL);
  `)
})

afterAll(() => {
  sqlite?.close()
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

it("重叠规则保留稀缺题、槽位能覆盖题型，生成全卷无重复", () => {
  const template = templates.storePaperTemplate("模板", [
    { ...section, slots: [section.slots[0], { number: "2", points: 2 }, { number: "3", points: 4, type: "essay" }] },
    { ...section, tag: "专项", knowledgePointId: 1 },
  ], bytes)
  const filters = { subjectId: 1, difficulty: 2 }
  expect(templates.checkTemplate(template.id, filters)).toEqual({ total: 4, shortages: [] })
  const paper = templates.generateTemplatePaper(template.id, filters)
  expect(paper.questions.map(q => q.id).sort()).toEqual([1, 2, 3, 7])
  expect(paper.questions.slice(2).map(q => q.id)).toEqual([7, 1])
  expect(paper.template).toEqual({ ...template, filters })
  expect(papers.listPapers()).toContainEqual(expect.objectContaining({ id: paper.id, total: 4 }))
  expect(templates.listPaperTemplates()).toContainEqual({ id: template.id, name: template.name })
})

it("通用大题标题不要求题目额外带同名标签，细分标题仍按标签筛选", () => {
  const generic = templates.storePaperTemplate("通用简答", [{ title: "二、简答题", type: "essay", tag: "简答题", slots: [{ number: "1", points: 5 }] }], bytes)
  expect(templates.checkTemplate(generic.id, {}).shortages).toEqual([])
  const specific = templates.storePaperTemplate("名词解释", [{ title: "二、名词解释", type: "essay", tag: "名词解释", slots: [{ number: "1", points: 5 }] }], bytes)
  expect(templates.checkTemplate(specific.id, {}).shortages).toEqual([{ sectionIndex: 0, required: 1, available: 0 }])
})

it("预检按可同时分配的数量报缺；矛盾的知识点与难度不能覆盖，不保存半卷", () => {
  const rule = { ...section, difficulty: 2, tag: "专项", knowledgePointId: 1 }
  const template = templates.storePaperTemplate("缺题", [rule, rule], bytes)
  expect(templates.checkTemplate(template.id, { subjectId: 1 })).toEqual({
    total: 2, shortages: [{ sectionIndex: 1, required: 1, available: 0 }],
  })
  for (const filters of [{ difficulty: 1 }, { knowledgePointId: 2 }, { subjectId: 2 }]) {
    expect(templates.checkTemplate(template.id, filters).shortages.map(s => s.available)).toEqual([0, 0])
  }
  const before = papers.listPapers().length
  expect(() => templates.generateTemplatePaper(template.id, {})).toThrow("缺 1 题")
  expect(papers.listPapers()).toHaveLength(before)
})

it("指定槽位换题另存，旧卷、其余题与作答快照保留；无备选时拒绝", () => {
  const template = templates.storePaperTemplate("换题", [section, { ...section, tag: "专项" }], bytes)
  const paper = templates.generateTemplatePaper(template.id, { subjectId: 1, difficulty: 2 })
  const attempt = papers.startAttempt(paper.id, "practice")
  const changed = templates.replaceTemplateQuestion(paper.id, 0)
  expect(changed.id).not.toBe(paper.id)
  expect(changed.questions[0].id).not.toBe(paper.questions[0].id)
  expect(changed.questions[1]).toEqual(paper.questions[1])
  expect(papers.getPaper(paper.id)).toEqual(paper)
  expect(papers.getAttempt(attempt.id).paper.questions.map(q => q.id)).toEqual(paper.questions.map(q => q.id))
  expect(() => templates.replaceTemplateQuestion(paper.id, 1)).toThrow("没有符合条件")
  expect(() => templates.replaceTemplateQuestion(paper.id, -1)).toThrow("序号")
})

it("同名模板另存独立版本；整库备份包含原文件且旧试卷仍可读取", async () => {
  const original = templates.storePaperTemplate("同名", [section], bytes)
  const newer = templates.storePaperTemplate("同名", [section], Buffer.from("新文件"))
  expect(original.id).not.toBe(newer.id)
  expect(templates.getTemplateFile(original.id)).toEqual(bytes)
  sqlite.prepare("INSERT INTO papers(id,title,snapshot,created_at) VALUES('legacy','旧试卷','[]',0)").run()
  expect(papers.getPaper("legacy")).toEqual({ id: "legacy", title: "旧试卷", questions: [], createdAt: 0 })
  const destination = path.join(directory, "backup.db")
  await backupDatabase(source, destination)
  const copy = new Database(destination, { readonly: true })
  try {
    expect(copy.prepare("SELECT file FROM paper_templates WHERE id=?").pluck().get(original.id)).toEqual(bytes)
  } finally { copy.close() }
})

it("同内容的不同记录只占一题，分配和换题使用满足本槽规则的实际记录", () => {
  const insert = sqlite.prepare("INSERT INTO questions(id,type,content,content_hash,tags,fingerprint) VALUES(?,'fill',?,?,?,?)")
  const fingerprint = questionFingerprint({ type: "fill", content: "相同" })
  insert.run(21, "相同", "21", '["甲"]', fingerprint)
  insert.run(22, "相同", "22", '["乙"]', null)
  const rules: TemplateSection[] = ["甲", "乙"].map(tag => ({ ...section, type: "fill", tag }))
  const template = templates.storePaperTemplate("内容去重", rules, bytes)
  expect(templates.checkTemplate(template.id, {}).shortages).toEqual([{ sectionIndex: 1, required: 1, available: 0 }])
  expect(() => templates.generateTemplatePaper(template.id, {})).toThrow("缺 1 题")
  insert.run(23, "独有", "23", '["甲"]', null)
  const paper = templates.generateTemplatePaper(template.id, {})
  expect(paper.questions.map(q => q.id)).toEqual([23, 22])
  insert.run(24, "相同", "24", '["乙"]', fingerprint)
  expect(() => templates.replaceTemplateQuestion(paper.id, 1)).toThrow("没有符合条件")
  insert.run(25, "备选", "25", '["乙"]', null)
  expect(templates.replaceTemplateQuestion(paper.id, 1).questions.map(q => q.id)).toEqual([23, 25])
})
