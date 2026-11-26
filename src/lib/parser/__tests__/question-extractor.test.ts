import { describe, expect, it } from "vitest"
import { extractQuestionsFromHtml, parsePdfTextToQuestions, recognizeParagraphs } from "../question-extractor"

it("跨页题目保留起始页码并继续读取后页选项", () => {
  const questions = recognizeParagraphs(["一、单选题", "1. 测试题目？", "A. 甲", "B. 乙", "答案：A", "2. 第二题？", "A. 丙", "B. 丁", "答案：B"], "pdf-line", [1, 1, 1, 2, 2, 2, 2, 2, 2])
  expect(questions).toHaveLength(2)
  expect(questions[0]).toMatchObject({ sourcePage: 1, answer: "A" })
  expect(questions[1]).toMatchObject({ sourcePage: 2, answer: "B" })
})

it("仅从明确的大题标题继承细分标签，进入普通论述题后清除", async () => {
  const lines = ["一、名词解释题（每题 2 分）", "1. 请解释什么是操作系统。", "参考答案：系统软件。",
    "二、简答题", "2. 说明调度器的作用。", "参考答案：调度任务。",
    "三、案例分析", "3. 请讨论名词解释与简答题的不同用途。", "参考答案：用于不同考核目标。"]
  const html = lines.map((text, i) => i % 3 ? `<p>${text}</p>` : `<h2>${text}</h2>`).join("")
  for (const questions of [await extractQuestionsFromHtml(html), recognizeParagraphs(lines, "pdf-line")]) {
    expect(questions.map(q => q.tags)).toEqual([["名词解释"], ["简答题"], undefined])
  }
})

describe("extractQuestionsFromHtml", () => {
  it("recognizes generic choice sections and split inline options", async () => {
    const questions = await extractQuestionsFromHtml([
      "<p>一、选择题</p>",
      "<p>1. HTML 中用于创建超链接的标签是？ A. &amp;lt;a&amp;gt; B. &amp;lt;div&amp;gt; C. &amp;lt;p&amp;gt; D. &amp;lt;span&amp;gt;</p>",
      "<p>正确答案：A</p>",
    ].join(""))

    expect(questions).toHaveLength(1)
    expect(questions[0]).toMatchObject({
      type: "single",
      content: "HTML 中用于创建超链接的标签是？",
      options: ["A. <a>", "B. <div>", "C. <p>", "D. <span>"],
      answer: "A",
    })
  })

  it("normalizes multiple choice answers from compact answer text", async () => {
    const questions = await extractQuestionsFromHtml([
      "<p>一、多选题</p>",
      "<p>1. 以下属于前端基础技术的是？</p>",
      "<p>A、HTML B、CSS C、SQL D、JavaScript</p>",
      "<p>参考答案: DA</p>",
    ].join(""))

    expect(questions).toHaveLength(1)
    expect(questions[0]).toMatchObject({
      type: "multiple",
      answer: "AD",
    })
    expect(questions[0].options).toEqual(["A. HTML", "B. CSS", "C. SQL", "D. JavaScript"])
  })

  it("extracts PDF-style text with page artifacts, standalone numbers, and full-width options", async () => {
    const questions = await parsePdfTextToQuestions([
      "第 1 页",
      "一、单项选择题（每题 2 分）",
      "1.",
      "下列属于前端框架的是？",
      "A) React",
      "Ｂ．MySQL",
      "C、Linux",
      "D. Redis",
      "参考答案：A",
      "解析：React 是前端 UI 框架。",
    ].join("\n"))

    expect(questions).toHaveLength(1)
    expect(questions[0]).toMatchObject({
      type: "single",
      content: "下列属于前端框架的是？",
      options: ["A. React", "B. MySQL", "C. Linux", "D. Redis"],
      answer: "A",
      explanation: "React 是前端 UI 框架。",
    })
  })

  it("keeps inline explanations out of choice answers", async () => {
    const questions = await extractQuestionsFromHtml([
      "<p>一、单选题</p>",
      "<p>1. 下列属于前端框架的是？ A. Vue B. MySQL C. Redis D. Linux 答案：A 解析：Vue 是前端框架。</p>",
    ].join(""))

    expect(questions).toHaveLength(1)
    expect(questions[0]).toMatchObject({
      type: "single",
      answer: "A",
      explanation: "Vue 是前端框架。",
    })
  })

  it("无章节和答案时保守处理选择外观题", () => {
    const questions = recognizeParagraphs([
      "1. 下列技术中请选择正确项",
      "A. HTML",
      "B. CSS",
      "C. Java",
    ], "paragraph")

    expect(questions[0].type).toBe("essay")
    expect(questions[0].diagnostic?.warnings.some((warning) => warning.code === "uncertain_type")).toBe(true)
    expect(questions[0].options).toHaveLength(3)
  })

  it("不把普通题干末尾字母识别为答案", () => {
    const questions = recognizeParagraphs(["1. 变量名称可以字母 A 结尾"], "paragraph")
    expect(questions[0].answer).toBeNull()
    expect(questions[0].content).toContain("字母 A")
  })

  it("PDF 名词解释按顶层题号拆分并保留术语定义", async () => {
    const questions = await parsePdfTextToQuestions([
      "复习资料题",
      "一、名词解释",
      "1. 数据库管理系统：介于用户和操作系统之间的软件。",
      "2. 候选码：能够唯一标识关系表中每一行的最小属性组合。",
    ].join("\n"))

    expect(questions).toHaveLength(2)
    expect(questions.map((question) => question.content)).toEqual([
      "数据库管理系统:介于用户和操作系统之间的软件。",
      "候选码:能够唯一标识关系表中每一行的最小属性组合。",
    ])
  })
})
