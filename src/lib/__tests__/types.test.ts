import { describe, it, expect } from "vitest"
import { QUESTION_TYPES, isQuestionType, assertQuestionType } from "../types"

describe("types", () => {
  it("QUESTION_TYPES contains all 7 types", () => {
    expect(QUESTION_TYPES).toHaveLength(7)
    expect(QUESTION_TYPES).toContain("single")
    expect(QUESTION_TYPES).toContain("multiple")
    expect(QUESTION_TYPES).toContain("truefalse")
    expect(QUESTION_TYPES).toContain("fill")
    expect(QUESTION_TYPES).toContain("calculation")
    expect(QUESTION_TYPES).toContain("essay")
    expect(QUESTION_TYPES).toContain("code")
  })

  it("isQuestionType returns true for valid types", () => {
    for (const t of QUESTION_TYPES) {
      expect(isQuestionType(t)).toBe(true)
    }
  })

  it("isQuestionType returns false for invalid types", () => {
    expect(isQuestionType("unknown")).toBe(false)
    expect(isQuestionType("")).toBe(false)
    expect(isQuestionType("Single")).toBe(false)
  })

  it("assertQuestionType returns the type for valid types", () => {
    expect(assertQuestionType("single")).toBe("single")
    expect(assertQuestionType("code")).toBe("code")
  })

  it("assertQuestionType throws for invalid types", () => {
    expect(() => assertQuestionType("unknown")).toThrow("Invalid question type")
  })
})
