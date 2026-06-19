import { describe, it, expect } from "vitest"
import { parseOptionText, getOptionLetter, getErrorMessage } from "../utils"

describe("parseOptionText", () => {
  it("should parse option with dot separator", () => {
    expect(parseOptionText("A. Hello")).toBe("Hello")
    expect(parseOptionText("B. World")).toBe("World")
  })

  it("should parse option with Chinese dot separator", () => {
    expect(parseOptionText("A、Hello")).toBe("Hello")
  })

  it("should handle short options", () => {
    expect(parseOptionText("A")).toBe("A")
    expect(parseOptionText("AB")).toBe("AB")
  })

  it("should trim whitespace", () => {
    expect(parseOptionText("A.  Hello  ")).toBe("Hello")
  })
})

describe("getOptionLetter", () => {
  it("should return the first character", () => {
    expect(getOptionLetter("A. Hello")).toBe("A")
    expect(getOptionLetter("B. World")).toBe("B")
    expect(getOptionLetter("C")).toBe("C")
  })
})

describe("getErrorMessage", () => {
  it("should return error message for Error instances", () => {
    expect(getErrorMessage(new Error("test error"))).toBe("test error")
  })

  it("should return fallback for non-Error values", () => {
    expect(getErrorMessage("string error")).toBe("Unknown error")
    expect(getErrorMessage(null)).toBe("Unknown error")
    expect(getErrorMessage(undefined)).toBe("Unknown error")
  })

  it("should use custom fallback", () => {
    expect(getErrorMessage(null, "Custom fallback")).toBe("Custom fallback")
  })
})
