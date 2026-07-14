import { createHash } from "node:crypto"

const TRUNCATED_SUFFIX = "\n...[输出已截断]"

export function truncateText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return ""
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}${TRUNCATED_SUFFIX}`
}

export function createCodeRunClientKey(sessionToken: string | undefined): string {
  if (!sessionToken) return "anonymous"
  return createHash("sha256").update(sessionToken).digest("hex")
}
