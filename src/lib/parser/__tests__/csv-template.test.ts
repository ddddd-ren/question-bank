import { expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { parseCsvQuestions } from "../csv-parser"
import { GET } from "@/app/api/templates/route"

vi.mock("@/lib/auth-route", () => ({ withSession: (handler: unknown) => handler }))

it("下载的 CSV 模板所有行都可解析，并保留答案、解析和标签列", async () => {
  const response = await GET(new NextRequest("http://localhost/api/templates?format=csv"))
  expect(response.status).toBe(200)
  const questions = parseCsvQuestions(await response.text())
  expect(questions.map(({ type, answer, explanation, tags }) => ({ type, answer, explanation, tags }))).toEqual([
    { type: "single", answer: "D", explanation: "Includes String Number Boolean", tags: ["JavaScript", "Basics"] },
    { type: "multiple", answer: "ABCD", explanation: "All can be used", tags: ["CSS", "Layout"] },
    { type: "truefalse", answer: "false", explanation: "JS is dynamically typed", tags: ["JavaScript", "Basics"] },
    { type: "fill", answer: "a", explanation: "Uses a tag", tags: ["HTML", "Basics"] },
    { type: "code", answer: "function unique(arr) { return [...new Set(arr)]; }", explanation: "Uses ES6 Set", tags: ["JavaScript", "Algorithm"] },
  ])
  expect(questions.slice(2).every(question => question.options === null)).toBe(true)
})
