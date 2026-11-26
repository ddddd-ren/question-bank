import { describe, expect, it } from "vitest"
import { splitDuplicateQuestions } from "../import-dedupe"

describe("导入题目去重", () => {
  it("同时去掉数据库已有和当前请求内重复的哈希", () => {
    const result = splitDuplicateQuestions([
      { contentHash: "existing", content: "已存在" },
      { contentHash: "new", content: "新题" },
      { contentHash: "new", content: "同批重复" },
    ], new Set(["existing"]))

    expect(result.unique).toEqual([{ contentHash: "new", content: "新题" }])
    expect(result.duplicateCount).toBe(2)
  })
})
