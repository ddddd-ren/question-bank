import { describe, it, expect } from "vitest"
import {
  PracticeSubmitSchema,
  QuestionQuerySchema,
  requireBody,
  parseBoundedInteger,
  parsePagination,
  parseOptionalNumber,
  parseOptionalString,
  validateQuery,
} from "../api-validate"

describe("PracticeSubmitSchema", () => {
  it("接受客户端答题契约并丢弃伪造的判分结果", () => {
    expect(PracticeSubmitSchema.parse({
      questionId: 7,
      userAnswer: "AC",
      isCorrect: true,
      timeSpent: 12,
    })).toEqual({
      questionId: 7,
      userAnswer: "AC",
      timeSpent: 12,
    })
  })

  it("拒绝空答案", () => {
    expect(() => PracticeSubmitSchema.parse({ questionId: 7, userAnswer: "" })).toThrow()
  })
})

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

  it("should use defaults for non-finite pagination params", () => {
    const params = new URLSearchParams({ page: "abc", pageSize: "Infinity" })
    expect(parsePagination(params)).toEqual({ page: 1, pageSize: 20, offset: 0 })
  })

  it("should floor decimal pagination params", () => {
    const params = new URLSearchParams({ page: "2.9", pageSize: "10.8" })
    expect(parsePagination(params)).toEqual({ page: 2, pageSize: 10, offset: 10 })
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

  it("should return undefined for non-finite numbers", () => {
    expect(parseOptionalNumber("Infinity")).toBeUndefined()
  })
})

describe("parseBoundedInteger", () => {
  const options = { defaultValue: 10, min: 1, max: 100 }

  it("should parse and clamp integer values", () => {
    expect(parseBoundedInteger("25", options)).toBe(25)
    expect(parseBoundedInteger("0", options)).toBe(1)
    expect(parseBoundedInteger("999", options)).toBe(100)
  })

  it("should floor decimals and use defaults for invalid values", () => {
    expect(parseBoundedInteger("12.8", options)).toBe(12)
    expect(parseBoundedInteger("abc", options)).toBe(10)
    expect(parseBoundedInteger(null, options)).toBe(10)
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

describe("validateQuery", () => {
  it("should parse query booleans explicitly", () => {
    const enabled = validateQuery(QuestionQuerySchema, new URLSearchParams({
      hasAnswer: "true",
      stats: "1",
    }))
    expect(enabled.hasAnswer).toBe(true)
    expect(enabled.stats).toBe(true)

    const disabled = validateQuery(QuestionQuerySchema, new URLSearchParams({
      hasAnswer: "false",
      stats: "0",
    }))
    expect(disabled.hasAnswer).toBe(false)
    expect(disabled.stats).toBe(false)
  })

  it("should reject invalid query boolean values", () => {
    const params = new URLSearchParams({ stats: "no" })
    expect(() => validateQuery(QuestionQuerySchema, params)).toThrow("参数错误: stats")
  })
})
