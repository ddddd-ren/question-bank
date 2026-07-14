import type { AiProvider } from "./schema"

export interface SafeAiProvider {
  id: string
  name: string
  baseUrl: string
  model: string
  maxTokens: number
  isActive: boolean
  hasApiKey: boolean
}

export function toSafeProvider(provider: AiProvider): SafeAiProvider {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    model: provider.model,
    maxTokens: provider.maxTokens,
    isActive: provider.isActive,
    hasApiKey: provider.apiKey.length > 0,
  }
}
