import { parse } from "csv-parse/sync"
import { parseJsonQuestions } from "./json-parser"

type CsvRecord = Record<string, string>

function findValue(record: CsvRecord, keyword: string): string | undefined {
  const entry = Object.entries(record).find(([key]) => key.includes(keyword))
  return entry?.[1]?.trim() || undefined
}

export function parseCsvQuestions(csvContent: string) {
  let records: CsvRecord[]
  try {
    records = parse(csvContent, {
      bom: true,
      columns: (headers: string[]) => headers.map((header) => header.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
    }) as CsvRecord[]
  } catch {
    throw new Error("CSV 格式错误")
  }

  if (records.length === 0) {
    throw new Error("CSV 文件为空")
  }

  const questions = records.map((record) => {
    const content = findValue(record, "content") || findValue(record, "题干")
    if (!content) throw new Error("CSV 文件缺少题干")

    const optionsValue = findValue(record, "options") || findValue(record, "选项")
    return {
      type: findValue(record, "type") || findValue(record, "题型") || "essay",
      content,
      options: optionsValue ? optionsValue.split("|").map((option) => option.trim()).filter(Boolean) : undefined,
      answer: findValue(record, "answer") || findValue(record, "答案"),
      explanation: findValue(record, "explanation") || findValue(record, "解析"),
      tags: (findValue(record, "tags") || findValue(record, "标签"))?.split("|").map((tag) => tag.trim()).filter(Boolean),
    }
  })

  return parseJsonQuestions(JSON.stringify({ questions }))
}
