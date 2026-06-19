import { describe, expect, it } from "vitest"
import { extractQuestionsFromHtml, parsePdfTextToQuestions } from "../question-extractor"

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
})
