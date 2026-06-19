import { describe, it, expect } from "vitest"
import { parseJsonArray, stringifyJsonArray } from "../db/serialize"

describe("serialize", () => {
  it("parseJsonArray returns null for null input", () => {
    expect(parseJsonArray(null)).toBeNull()
  })

  it("parseJsonArray parses valid JSON array", () => {
    expect(parseJsonArray('["a","b","c"]')).toEqual(["a", "b", "c"])
  })

  it("parseJsonArray returns null for invalid JSON", () => {
    expect(parseJsonArray("not json")).toBeNull()
  })

  it("parseJsonArray returns null for non-array JSON", () => {
    expect(parseJsonArray('"string"')).toBeNull()
  })

  it("stringifyJsonArray returns null for null/undefined/empty", () => {
    expect(stringifyJsonArray(null)).toBeNull()
    expect(stringifyJsonArray(undefined)).toBeNull()
    expect(stringifyJsonArray([])).toBeNull()
  })

  it("stringifyJsonArray serializes arrays", () => {
    expect(stringifyJsonArray(["a", "b"])).toBe('["a","b"]')
  })
})
