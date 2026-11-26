import { describe, expect, it } from "vitest"
import { classifyQuestion } from "../type-classifier"

describe("classifyQuestion", () => {
  it("优先保留明确章节题型", () => {
    expect(classifyQuestion({ stem: "选择", options: ["A. 一", "B. 二"], answer: null, sectionType: "single" }).type).toBe("single")
  })

  it("无章节和答案时不根据选项武断判单选", () => {
    const result = classifyQuestion({ stem: "请选择", options: ["A. 一", "B. 二", "C. 三", "D. 四"], answer: null })
    expect(result.type).toBe("essay")
    expect(result.warnings.some((warning) => warning.code === "uncertain_type")).toBe(true)
  })

  it("根据多个有效答案判断多选", () => {
    expect(classifyQuestion({ stem: "请选择", options: ["A. 一", "B. 二", "C. 三"], answer: "AC" }).type).toBe("multiple")
  })

  it.each(["对", "错", "√", "×"])("根据判断答案 %s 识别判断题", (answer) => {
    expect(classifyQuestion({ stem: "该说法正确吗", options: [], answer }).type).toBe("truefalse")
  })

  it("识别填空和编程强证据", () => {
    expect(classifyQuestion({ stem: "HTML 使用 ____，CSS 使用 ____", options: [], answer: null }).type).toBe("fill")
    expect(classifyQuestion({ stem: "请编写程序完成以下代码 function main() {}", options: [], answer: null }).type).toBe("code")
  })

  it("弱计算关键词不能覆盖章节题型", () => {
    expect(classifyQuestion({ stem: "计算下列选项中正确的是", options: ["A. 1", "B. 2"], answer: "A", sectionType: "single" }).type).toBe("single")
  })

  it("选择题章节中无选项的括号答案按填空题处理", () => {
    expect(classifyQuestion({ stem: "候选码是（ ）", options: [], answer: "CE", sectionType: "single" }).type).toBe("fill")
  })

  it("分数接近时报告冲突", () => {
    const result = classifyQuestion({ stem: "计算并分析程序结果", options: [], answer: null })
    expect(result.warnings.some((warning) => warning.code === "conflicting_signals")).toBe(true)
  })
})
