import { describe, it, expect } from "vitest"
import { ApiError } from "../api-error"

describe("ApiError", () => {
  it("should create an error with status code and message", () => {
    const error = new ApiError(404, "Not Found")
    expect(error.statusCode).toBe(404)
    expect(error.message).toBe("Not Found")
    expect(error.name).toBe("ApiError")
  })

  it("should include details when provided", () => {
    const error = new ApiError(400, "Bad Request", "Missing field")
    expect(error.details).toBe("Missing field")
  })

  it("should be an instance of Error", () => {
    const error = new ApiError(500, "Server Error")
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ApiError)
  })
})
