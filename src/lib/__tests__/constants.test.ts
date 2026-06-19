import { describe, it, expect } from "vitest"
import { typeLabels, typeColors, typeIcons } from "../constants"

describe("constants", () => {
  it("should have labels for all question types", () => {
    const types = ["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]
    types.forEach(type => {
      expect(typeLabels[type]).toBeDefined()
      expect(typeof typeLabels[type]).toBe("string")
    })
  })

  it("should have colors for all question types", () => {
    const types = ["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]
    types.forEach(type => {
      expect(typeColors[type]).toBeDefined()
      expect(typeColors[type]).toMatch(/^bg-/)
    })
  })

  it("should have icons for all question types", () => {
    const types = ["single", "multiple", "truefalse", "fill", "calculation", "essay", "code"]
    types.forEach(type => {
      expect(typeIcons[type]).toBeDefined()
    })
  })
})
