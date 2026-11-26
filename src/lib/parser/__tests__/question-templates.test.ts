import { describe, expect, it } from "vitest"
import { applyTemplate, fromEditable, toEditable, type EditableQuestion } from "../question-templates"

describe("question templates", () => {
  it("套用模板和来回转换保留来源页码", () => {
    const editable = toEditable({ type: "essay", content: "来源测试题干", options: null, answer: "答案", explanation: null, contentHash: "", sourcePage: 7 })
    expect(fromEditable(applyTemplate(editable, "single")).sourcePage).toBe(7)
    expect(applyTemplate(applyTemplate(editable, "single"), "essay").sourcePage).toBe(7)
  })

  it("normalizes single choice answers", () => {
    const editable = toEditable({
      type: "single",
      content: "Which option is correct?",
      options: ["A. One", "B. Two"],
      answer: " b ",
      explanation: null,
      contentHash: "",
    })

    expect(editable.answer).toBe("B")
    expect(editable.options).toEqual(["A. One", "B. Two", "C. ", "D. "])
    expect(fromEditable(editable).answer).toBe("B")
    expect(fromEditable(editable).options).toEqual(["A. One", "B. Two"])
  })

  it("deduplicates and sorts choice answers with Chinese separators", () => {
    const editable = toEditable({
      type: "multiple",
      content: "Which options are correct?",
      options: ["A. One", "B. Two", "C. Three"],
      answer: " c、a、a ",
      explanation: null,
      contentHash: "",
    })

    expect(editable.answer).toBe("AC")
    expect(fromEditable(editable).answer).toBe("AC")
  })

  it("preserves blank answers when applying another template", () => {
    const fillQuestion: EditableQuestion = {
      type: "fill",
      stem: "HTML uses ____{1} for links.",
      blanks: [{ id: 1, placeholder: "____", answer: "a" }],
      explanation: "Anchor tag",
    }

    const applied = applyTemplate(fillQuestion, "essay")

    expect(applied.type).toBe("essay")
    expect(applied.stem).toBe(fillQuestion.stem)
    expect(applied.answer).toBe("a")
    expect(applied.explanation).toBe("Anchor tag")
  })

  it("drops choice options when applying a non-choice template", () => {
    const choiceQuestion: EditableQuestion = {
      type: "single",
      stem: "Which option is correct?",
      options: ["A. One", "B. Two"],
      answer: "A",
    }

    const applied = applyTemplate(choiceQuestion, "truefalse")

    expect(applied.type).toBe("truefalse")
    expect(applied.options).toBeUndefined()
    expect(applied.answer).toBeUndefined()
    expect(applied.preserved).toMatchObject({
      sourceType: "single",
      options: ["A. One", "B. Two"],
      answer: "A",
    })
  })

  it("detects common fill blank markers without duplicating numbered blanks", () => {
    const editable = toEditable({
      type: "fill",
      content: "HTML uses ____{1} for links, CSS uses （） for styles, and JS uses 【】 for behavior.",
      options: null,
      answer: "a; style; script",
      explanation: null,
      contentHash: "",
    })

    expect(editable.stem).toBe("HTML uses ____{1} for links, CSS uses ____{2} for styles, and JS uses ____{3} for behavior.")
    expect(editable.blanks).toEqual([
      { id: 1, placeholder: "____", answer: "a" },
      { id: 2, placeholder: "____", answer: "style" },
      { id: 3, placeholder: "____", answer: "script" },
    ])
  })

  it("restores single choice data after a round trip through essay", () => {
    const original: EditableQuestion = {
      type: "single",
      stem: "Which option is correct?",
      options: ["A. One", "B. Two"],
      answer: "B",
    }

    const essay = applyTemplate(original, "essay")
    const restored = applyTemplate(essay, "single")

    expect(restored.options).toEqual(["A. One", "B. Two", "C. ", "D. "])
    expect(restored.answer).toBe("B")
  })

  it("does not put a multiple choice answer into a true-false answer", () => {
    const converted = applyTemplate({
      type: "multiple",
      stem: "Choose all correct options.",
      options: ["A. One", "B. Two", "C. Three"],
      answer: "AC",
    }, "truefalse")

    expect(converted.answer).toBeUndefined()
    expect(converted.preserved?.answer).toBe("AC")
  })

  it("restores a true-false answer after switching to multiple choice", () => {
    const multiple = applyTemplate({ type: "truefalse", stem: "The statement is correct.", answer: "√" }, "multiple")
    const restored = applyTemplate(multiple, "truefalse")

    expect(restored.answer).toBe("√")
  })

  it("restores fill blanks after a round trip through essay", () => {
    const original: EditableQuestion = {
      type: "fill",
      stem: "HTML uses ____{1} and CSS uses ____{2}.",
      blanks: [
        { id: 1, placeholder: "____", answer: "a" },
        { id: 2, placeholder: "____", answer: "style" },
      ],
    }

    const restored = applyTemplate(applyTemplate(original, "essay"), "fill")

    expect(restored.stem).toBe(original.stem)
    expect(restored.blanks).toEqual(original.blanks)
  })

  it("assigns unnumbered blanks after the largest existing id", () => {
    const editable = toEditable({
      type: "fill",
      content: "First ____{3}, then ____, finally （）.",
      options: null,
      answer: "one; two; three",
      explanation: null,
      contentHash: "",
    })

    expect(editable.stem).toBe("First ____{3}, then ____{4}, finally ____{5}.")
    expect(editable.blanks?.map((blank) => blank.id)).toEqual([3, 4, 5])
  })

  it("keeps all blank slots when there are fewer answers", () => {
    const editable = toEditable({
      type: "fill",
      content: "____ and ____ and ____.",
      options: null,
      answer: "one; two",
      explanation: null,
      contentHash: "",
    })

    expect(editable.blanks).toHaveLength(3)
    expect(editable.blanks?.[2].answer).toBeUndefined()
  })

  it("preserves surplus fill answers and records a warning", () => {
    const editable = toEditable({
      type: "fill",
      content: "Only ____.",
      options: null,
      answer: "one; two",
      explanation: null,
      contentHash: "",
    })

    expect(editable.preserved?.answer).toBe("two")
    expect(editable.preserved?.warnings).toContain("答案数量多于填空位，额外答案已保留")
  })

  it("restores fill slots when surplus answers were already preserved", () => {
    const fill = toEditable({
      type: "fill",
      content: "Only ____.",
      options: null,
      answer: "one; two",
      explanation: null,
      contentHash: "",
    })

    const restored = applyTemplate(applyTemplate(fill, "essay"), "fill")

    expect(restored.blanks).toEqual([{ id: 1, placeholder: "____", answer: "one" }])
    expect(restored.preserved?.answer).toBe("two")
  })

  it("does not overwrite an answer edited in the target template", () => {
    const essay = applyTemplate({
      type: "single",
      stem: "Which option is correct?",
      options: ["A. One", "B. Two"],
      answer: "A",
    }, "essay")

    const restored = applyTemplate({ ...essay, answer: "B" }, "single")

    expect(restored.answer).toBe("B")
  })

  it("does not serialize preserved data", () => {
    const standard = fromEditable({
      type: "essay",
      stem: "Explain it.",
      answer: "Current answer",
      preserved: {
        sourceType: "single",
        options: ["A. Hidden", "B. Hidden"],
        answer: "A",
      },
    })

    expect(standard.options).toBeNull()
    expect(standard).not.toHaveProperty("preserved")
  })
})
