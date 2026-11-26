import { createHash } from "node:crypto"

export interface AiCacheKeyInput {
  providerBaseUrl?: string
  promptVersion?: string
  model: string
  question: string
  options?: string[] | null
  answer?: string | null
  type?: string
  mode?: string
  userAnswer?: string
  hintLevel?: number
}

export function createAiCacheKey(input: AiCacheKeyInput): string {
  const stableInput = {
    providerBaseUrl: input.providerBaseUrl || "",
    promptVersion: input.promptVersion || "v2",
    model: input.model,
    question: input.question,
    options: input.options || [],
    answer: input.answer || "",
    type: input.type || "",
    mode: input.mode || "",
    userAnswer: input.userAnswer || "",
    hintLevel: input.mode === "hint" ? input.hintLevel || 1 : null,
  }

  return createHash("sha256").update(JSON.stringify(stableInput)).digest("hex")
}
