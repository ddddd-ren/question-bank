import { describe, expect, it } from "vitest"
import { createPaginatedKey } from "../query-key"

describe("createPaginatedKey", () => {
  it("按稳定顺序生成分页查询键", () => {
    expect(createPaginatedKey("/api/favorites", {
      page: 2,
      pageSize: 20,
      type: "all",
      search: "  网络  ",
    })).toBe("/api/favorites?page=2&pageSize=20&search=%E7%BD%91%E7%BB%9C")
  })

  it("忽略空搜索和全部题型", () => {
    expect(createPaginatedKey("/api/mistakes", {
      page: 1,
      pageSize: 20,
      type: "all",
      search: " ",
    })).toBe("/api/mistakes?page=1&pageSize=20")
  })
})
