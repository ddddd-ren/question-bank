import { describe, it, expect } from "vitest"
import { requireBody, parsePagination, parseOptionalNumber, parseOptionalString } from "../api-validate"

describe("requireBody", () => {
  it("should pass when all required fields are present", () => {
    expect(() => requireBody({ name: "test", age: 25 }, ["name", "age"])).not.toThrow()
  })

  it("should throw ApiError when field is missing", () => {
    expect(() => requireBody({ name: "test" }, ["name", "age"])).toThrow("缺少必填字段: age")
  })

  it("should throw when field is empty string", () => {
    expect(() => requireBody({ name: "" }, ["name"])).toThrow("缺少必填字段: name")
  })

  it("should throw when field is null", () => {
    expect(() => requireBody({ name: null }, ["name"])).toThrow("缺少必填字段: name")
  })
})

describe("parsePagination", () => {
  it("should parse valid pagination params", () => {
    const params = new URLSearchParams({ page: "2", pageSize: "10" })
    expect(parsePagination(params)).toEqual({ page: 2, pageSize: 10, offset: 10 })
  })

  it("should use defaults for missing params", () => {
    const params = new URLSearchParams()
    expect(parsePagination(params)).toEqual({ page: 1, pageSize: 20, offset: 0 })
  })

  it("should clamp page to minimum 1", () => {
    const params = new URLSearchParams({ page: "-1" })
    expect(parsePagination(params).page).toBe(1)
  })

  it("should clamp pageSize to maximum 100", () => {
    const params = new URLSearchParams({ pageSize: "200" })
    expect(parsePagination(params).pageSize).toBe(100)
  })

  it("should clamp pageSize to minimum 1", () => {
    const params = new URLSearchParams({ pageSize: "0" })
    expect(parsePagination(params).pageSize).toBe(1)
  })
})

describe("parseOptionalNumber", () => {
  it("should return undefined for null", () => {
    expect(parseOptionalNumber(null)).toBeUndefined()
  })

  it("should parse valid number", () => {
    expect(parseOptionalNumber("42")).toBe(42)
  })

  it("should return undefined for NaN", () => {
    expect(parseOptionalNumber("abc")).toBeUndefined()
  })
})

describe("parseOptionalString", () => {
  it("should return undefined for null", () => {
    expect(parseOptionalString(null)).toBeUndefined()
  })

  it("should return undefined for empty string", () => {
    expect(parseOptionalString("")).toBeUndefined()
  })

  it("should return the string value", () => {
    expect(parseOptionalString("hello")).toBe("hello")
  })
})
