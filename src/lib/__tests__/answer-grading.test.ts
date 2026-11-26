import { describe, expect, it } from "vitest"
import { gradePracticeAnswer, toggleChoiceSelection } from "../answer-grading"
import { normalizeChoiceAnswer } from "../parser/choice-answer"
import { classifyQuestion } from "../parser/type-classifier"

it("支持题目接口允许的二十个选项，选择与判分使用相同范围", () => {
  for (const letter of "ABCDEFGHIJKLMNOPQRST") {
    expect(toggleChoiceSelection("single", null, letter)).toBe(letter)
    expect(gradePracticeAnswer("single", letter, letter.toLowerCase())).toBe(true)
  }
  expect(normalizeChoiceAnswer("ｔ、Ｊ，ｉ、Ｊ")).toBe("IJT")
  expect(gradePracticeAnswer("multiple", "IJT", "Ｔ、Ｊ、Ｉ")).toBe(true)
  expect(toggleChoiceSelection("multiple", "IJ", "T")).toBe("IJT")
  expect(toggleChoiceSelection("multiple", "IJT", "J")).toBe("IT")
})

it("不接受超出二十个选项的字母或夹杂非答案文本", () => {
  for (const answer of ["U", "Z", "AU", "答案 I", "I1", "I.T"]) {
    expect(normalizeChoiceAnswer(answer)).toBeNull()
    expect(gradePracticeAnswer("single", "I", answer)).toBe(false)
  }
})

it("扩展选项范围后仍保留英文判断答案", () => {
  for (const answer of ["true", "false", "FALSE"]) {
    expect(normalizeChoiceAnswer(answer)).toBeNull()
    expect(classifyQuestion({ stem: "判断这个说法是否正确", options: [], answer }).type).toBe("truefalse")
  }
  expect(gradePracticeAnswer("truefalse", "false", "错误")).toBe(true)
})

describe("gradePracticeAnswer", () => {
  it("单选题要求答案完全一致", () => {
    expect(gradePracticeAnswer("single", "A", "A")).toBe(true)
    expect(gradePracticeAnswer("single", "A", "AB")).toBe(false)
    expect(gradePracticeAnswer("single", "A", "B")).toBe(false)
  })

  it("多选题忽略顺序但不接受部分答案", () => {
    expect(gradePracticeAnswer("multiple", "AC", "C、A")).toBe(true)
    expect(gradePracticeAnswer("multiple", "AC", "A")).toBe(false)
    expect(gradePracticeAnswer("multiple", "AC", "ABC")).toBe(false)
  })

  it("判断题统一常见答案写法", () => {
    expect(gradePracticeAnswer("truefalse", "√", "对")).toBe(true)
    expect(gradePracticeAnswer("truefalse", "×", "false")).toBe(true)
    expect(gradePracticeAnswer("truefalse", "√", "错")).toBe(false)
  })

  it("填空题忽略首尾空白、连续空格和英文大小写", () => {
    expect(gradePracticeAnswer("fill", "Transmission Control Protocol", " transmission   control protocol ")).toBe(true)
    expect(gradePracticeAnswer("fill", "TCP", "UDP")).toBe(false)
  })

  it("主观题和缺少参考答案的题目不自动判分", () => {
    expect(gradePracticeAnswer("essay", "参考内容", "用户回答")).toBeNull()
    expect(gradePracticeAnswer("calculation", "42", "42")).toBeNull()
    expect(gradePracticeAnswer("code", "return 1", "return 1")).toBeNull()
    expect(gradePracticeAnswer("single", null, "A")).toBeNull()
  })
})

describe("toggleChoiceSelection", () => {
  it("单选题始终只保留当前选项", () => {
    expect(toggleChoiceSelection("single", "A", "B")).toBe("B")
  })

  it("多选题可以增删选项并保持稳定顺序", () => {
    expect(toggleChoiceSelection("multiple", null, "C")).toBe("C")
    expect(toggleChoiceSelection("multiple", "C", "A")).toBe("AC")
    expect(toggleChoiceSelection("multiple", "AC", "A")).toBe("C")
    expect(toggleChoiceSelection("multiple", "C", "C")).toBeNull()
  })
})
