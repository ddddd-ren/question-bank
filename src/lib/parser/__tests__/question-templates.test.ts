import { describe, expect, it } from "vitest"
import { applyTemplate, fromEditable, toEditable, type EditableQuestion } from "../question-templates"

describe("question templates", () => {
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
    expect(applied.answer).toBe("A")
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
})
