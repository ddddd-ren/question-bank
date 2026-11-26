import { beforeEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ random: vi.fn(), byIds: vi.fn(), save: vi.fn(), get: vi.fn(), docx: vi.fn() }))
vi.mock("@/lib/auth-route", () => ({ withSession: (handler: unknown) => handler }))
vi.mock("@/lib/db/queries", () => ({ getRandomQuestions: mocks.random, getQuestionsByIds: mocks.byIds }))
vi.mock("@/lib/db/papers", () => ({ savePaper: mocks.save, getPaper: mocks.get, listPapers: vi.fn(), listAttempts: vi.fn(() => []) }))
vi.mock("@/lib/paper/docx", () => ({ createPaperDocx: mocks.docx }))
vi.mock("@/lib/db/paper-templates", () => ({}))
import { POST, GET } from "@/app/api/papers/route"
beforeEach(() => vi.clearAllMocks())
it("随机缺题明确拒绝，不保存残缺试卷", async () => {
  mocks.random.mockResolvedValue([])
  const result = await POST(new NextRequest("http://localhost/api/papers", { method: "POST", body: JSON.stringify({ mode: "random", rules: [{ type: "single", count: 3 }], difficulty: 4 }) }))
  expect(result.status).toBe(400)
  expect((await result.json()).error).toContain("仅有 0 题")
  expect(mocks.save).not.toHaveBeenCalled()
  expect(mocks.random).toHaveBeenCalledWith(expect.objectContaining({ difficulty: 4 }))
})
it("手动题目已删除或归档时拒绝静默丢题", async () => {
  mocks.byIds.mockResolvedValue([])
  const result = await POST(new NextRequest("http://localhost/api/papers", { method: "POST", body: JSON.stringify({ mode: "manual", questionIds: [10] }) }))
  expect(result.status).toBe(400)
  expect(mocks.save).not.toHaveBeenCalled()
})
it("导出只使用服务器快照，不再随机抽题", async () => {
  const question = { id: 1, type: "single", content: "冻结题干", answer: "A" }
  mocks.get.mockReturnValue({ id: "saved", title: "冻结试卷", questions: [question] })
  mocks.docx.mockResolvedValue(Buffer.from("docx"))
  const result = await GET(new NextRequest("http://localhost/api/papers?id=saved&format=docx&includeAnswers=true"))
  expect(result.status).toBe(200)
  expect(mocks.docx).toHaveBeenCalledWith("冻结试卷", [{ type: "single", questions: [question] }], true)
  expect(mocks.random).not.toHaveBeenCalled()
})
