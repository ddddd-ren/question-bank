import { describe, expect, it } from "vitest"
import { parsePracticeDraft, recordAnswer, createAnswerRecord, PRACTICE_DRAFT_KEY } from "../practice-draft"
describe("练习草稿", () => {
  it("坏数据和重复题目不能恢复", () => {
    expect(parsePracticeDraft("not-json")).toBeNull()
    expect(parsePracticeDraft('{"questions":[]}')).toBeNull()
    expect(PRACTICE_DRAFT_KEY).toBe("question-bank:practice-draft:v1")
  })
  it("往返题目及重试保留同一份答案", () => {
    const first = { questionId: 1, questionContent: "题", userAnswer: "A", correctAnswer: "A", isCorrect: true, timeSpent: 2, saved: false }
    const records = recordAnswer([], first)
    expect(recordAnswer(records, { ...first, userAnswer: "B" })).toEqual(records)
    expect(recordAnswer(records, { ...first, saved: true }, true)).toEqual([{ ...first, saved: true }])
  })
  it("超过10000字拒绝提交，原草稿保持可编辑且不产生记录", () => {
    const question = { id: 1, type: "essay", content: "题", options: null, answer: "参考" }
    const draft = { version: 1, sessionId: "123e4567-e89b-42d3-a456-426614174000", context: "mode=normal", questions: [question], currentIndex: 0, records: [], inputs: { "1": "字".repeat(10001) }, showReview: false }
    expect(() => createAnswerRecord(question, draft.inputs["1"], 10)).toThrow()
    expect(draft.records).toEqual([])
    expect(parsePracticeDraft(JSON.stringify(draft))?.inputs["1"]).toHaveLength(10001)
  })
  it("长时间练习按两小时封顶，旧超长失败记录恢复为可编辑草稿", () => {
    const question = { id: 1, type: "essay", content: "题", options: null, answer: "参考" }
    expect(createAnswerRecord(question, "回答", 7201).timeSpent).toBe(7200)
    const record = { ...createAnswerRecord(question, "回答", 1), userAnswer: "字".repeat(10001) }
    const restored = parsePracticeDraft(JSON.stringify({ version: 1, sessionId: "123e4567-e89b-42d3-a456-426614174000", context: "mode=normal", questions: [question], currentIndex: 0, records: [record], inputs: {}, showReview: true }))
    expect(restored?.records).toEqual([])
    expect(restored?.inputs["1"]).toHaveLength(10001)
    expect(restored?.showReview).toBe(false)
    const assessed = { ...createAnswerRecord(question, "回答", 1), isCorrect: true, selfAssessment: true, saved: true }
    const gradedDraft = parsePracticeDraft(JSON.stringify({ ...restored, records: [assessed] }))
    expect(gradedDraft?.records[0]).toMatchObject({ isCorrect: true, selfAssessment: true, saved: true })
  })

})
