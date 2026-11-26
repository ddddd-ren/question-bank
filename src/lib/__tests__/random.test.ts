import { describe, expect, it } from "vitest"
import { shuffle } from "../random"

describe("random utilities", () => {
  it("返回新的洗牌数组且不修改输入", () => {
    const input = [1, 2, 3]
    expect(shuffle(input, () => 0)).toEqual([2, 3, 1])
    expect(input).toEqual([1, 2, 3])
  })

})
