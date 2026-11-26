import { beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = state.cursor++
    if (!(index in state.values)) state.values[index] = initial
    return [state.values[index], (next: unknown) => {
      state.values[index] = typeof next === "function" ? next(state.values[index]) : next
    }]
  },
  useCallback: (callback: unknown) => callback,
  useMemo: (callback: () => unknown) => callback(),
  useEffect: () => {},
}))
vi.mock("@/components/toast", () => ({ showToast: vi.fn() }))
import { useImportWorkflow as runWorkflow } from "../use-import-workflow"

function renderWorkflow() {
  state.cursor = 0
  return runWorkflow()
}

beforeEach(() => {
  state.values = []
  vi.restoreAllMocks()
})

it("手动保存刷新质量及预览，失败返回false让编辑器保留草稿", async () => {
  const draft = { type: "single" as const, stem: "测试题目内容" }
  const original = { index: 0, editable: draft, preview: "旧预览", quality: { issueCount: { error: 1, warning: 0 }, question: {} } }
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ total: 1, questions: [original] }))
  renderWorkflow().handleFileChange({ target: { files: [new File(["{}"], "test.json")], value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>)
  await renderWorkflow().handleParse()
  expect(renderWorkflow().importBlockedByErrors).toBe(true)
  const edited = { ...draft, options: ["A. 一", "B. 二"] }
  fetchMock.mockResolvedValueOnce(Response.json({ editable: edited, preview: "新预览", quality: { issueCount: { error: 0, warning: 0 }, question: {} } }))
  expect(await renderWorkflow().handleSaveQuestion(0, edited)).toBe(true)
  expect(renderWorkflow().parsedQuestions[0].preview).toBe("新预览")
  expect(renderWorkflow().importBlockedByErrors).toBe(false)
  fetchMock.mockRejectedValueOnce(new Error("网络失败"))
  expect(await renderWorkflow().handleSaveQuestion(0, { ...edited, stem: "待重试草稿" })).toBe(false)
  expect(renderWorkflow().parsedQuestions[0].editable).toEqual(edited)
})
