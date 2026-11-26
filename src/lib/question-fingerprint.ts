import { createHash } from "node:crypto"

export function questionFingerprint(question: { type: string; content: string; options?: string[] | string | null }): string {
  let options: unknown = question.options ?? []
  if (typeof options === "string") {
    try { options = JSON.parse(options) } catch { /* 旧库异常选项保留原文参与指纹，避免误合并。 */ }
  }
  const normalize = (value: string) => value.replace(/\r\n?/g, "\n").trim()
  const normalizedOptions = Array.isArray(options) ? options.map(option => typeof option === "string" ? normalize(option) : option) : options
  return "v2:" + createHash("sha256").update(JSON.stringify([
    question.type, normalize(question.content), normalizedOptions,
  ])).digest("hex")
}
