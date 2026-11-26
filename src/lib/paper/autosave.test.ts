import { expect, it, vi } from "vitest"
import { createPaperAutosave, PaperSaveConflict } from "./autosave"

const initial = { answers: { "3": "旧答案" }, marked: [3], submittedAt: null }

it("重试原始改动后继续保存新题，不发送未编辑题目的旧快照", async () => {
  const send = vi.fn().mockRejectedValueOnce(new Error("断网")).mockResolvedValue(initial)
  const queue = createPaperAutosave(initial, send)
  const first = queue.save({ edit: { questionId: 1, answer: { from: "", to: "A" }, marked: true } })
  await expect(first.promise).rejects.toThrow("断网")
  const second = queue.save({ edit: { questionId: 2, answer: { from: "", to: "B" } } })
  await second.promise
  const original = { edits: [{ questionId: 1, answer: { from: "", to: "A" }, marked: true }] }
  expect(send.mock.calls[0][0]).toMatchObject(original)
  expect(send.mock.calls[1][0]).toMatchObject(original)
  expect(send.mock.calls[2][0]).toMatchObject({ edits: [{ questionId: 2, answer: { from: "", to: "B" } }] })
  expect(first.isLatest()).toBe(false)
  expect(second.isLatest()).toBe(true)
})

it("请求在途期间合并同题连续输入，并在交卷请求中发送未保存变化", async () => {
  let finish: (value: typeof initial) => void = () => {}
  const inFlight = new Promise<typeof initial>(resolve => { finish = resolve })
  const send = vi.fn().mockReturnValueOnce(inFlight).mockResolvedValue(initial)
  const queue = createPaperAutosave(initial, send)
  const old = queue.save({ edit: { questionId: 1, marked: true } })
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
  queue.save({ edit: { questionId: 3, answer: { from: "旧答案", to: "新" } } })
  queue.save({ edit: { questionId: 3, answer: { from: "新", to: "新答案" } } })
  const latest = queue.save({ submit: true })
  finish(initial)
  await queue.flush()
  expect(old.isLatest()).toBe(false)
  expect(latest.isLatest()).toBe(true)
  expect(send.mock.calls.slice(1).flatMap(([request]) => request.edits)).toEqual([
    { questionId: 3, answer: { from: "旧答案", to: "新答案" } },
  ])
  expect(send.mock.lastCall?.[0]).toMatchObject({ submit: true })
})

it.each(["local", "saved"] as const)("按选择处理冲突 %s，并补存其他题目", async resolve => {
  const conflict = new PaperSaveConflict(3, "其他页面答案")
  const send = vi.fn()
    .mockRejectedValueOnce(conflict)
    .mockResolvedValue({ ...initial, answers: { 3: resolve === "local" ? "最新本页答案" : conflict.savedAnswer, 4: "另一道题" } })
  const queue = createPaperAutosave(initial, send)
  await expect(queue.save({
    edit: { questionId: 3, answer: { from: "旧答案", to: "本页答案" } },
  }).promise).rejects.toBe(conflict)
  queue.save({ edit: { questionId: 3, answer: { from: "本页答案", to: "最新本页答案" } } })
  const other = queue.save({ edit: { questionId: 4, answer: { from: "", to: "另一道题" } } })
  await expect(other.promise).rejects.toBe(conflict)
  expect(queue.draft().answers[3]).toBe("最新本页答案")
  await queue.save({ resolve }).promise
  expect(send.mock.calls.slice(1).flatMap(([request]) => request.edits)).toEqual([
    ...(resolve === "local" ? [{ questionId: 3, answer: { from: conflict.savedAnswer, to: "最新本页答案" } }] : []),
    { questionId: 4, answer: { from: "", to: "另一道题" } },
  ])
  expect(queue.draft().answers).toEqual({ 3: resolve === "local" ? "最新本页答案" : conflict.savedAnswer, 4: "另一道题" })
  expect(queue.hasPending()).toBe(false)
})
