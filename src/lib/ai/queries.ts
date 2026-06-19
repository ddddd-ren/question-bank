import { db } from "@/lib/db"
import { eq } from "drizzle-orm"
import { aiConfig, DEFAULT_PROVIDERS, type AiProvider } from "./schema"

let initialized = false

export function initAiConfigTable() {
  if (initialized) return

  const sqlite = db.$client
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ai_config (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL,
      max_tokens INTEGER NOT NULL DEFAULT 2000,
      is_active INTEGER NOT NULL DEFAULT 0
    );
  `)

  const stmt = sqlite.prepare(`
    INSERT OR IGNORE INTO ai_config (id, name, base_url, api_key, model, max_tokens, is_active)
    VALUES (?, ?, ?, '', ?, ?, ?)
  `)

  for (const provider of DEFAULT_PROVIDERS) {
    stmt.run(
      provider.id,
      provider.name,
      provider.baseUrl,
      provider.model,
      provider.maxTokens,
      provider.isActive ? 1 : 0
    )
  }

  initialized = true
}

export function getActiveProvider(): AiProvider | null {
  initAiConfigTable()

  const result = db.select().from(aiConfig).where(eq(aiConfig.isActive, 1)).limit(1).all()
  const row = result[0]

  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey || process.env.LLM_API_KEY || "",
    model: row.model,
    maxTokens: row.maxTokens,
    isActive: row.isActive === 1,
  }
}

export function getAllProviders(): AiProvider[] {
  initAiConfigTable()

  const results = db.select().from(aiConfig).all()

  return results.map(row => ({
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    model: row.model,
    maxTokens: row.maxTokens,
    isActive: row.isActive === 1,
  }))
}

export function updateProvider(id: string, data: Partial<Omit<AiProvider, "id">>): boolean {
  initAiConfigTable()

  const updateData: Partial<Omit<AiProvider, "id" | "isActive">> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.baseUrl !== undefined) updateData.baseUrl = data.baseUrl
  if (data.apiKey !== undefined) updateData.apiKey = data.apiKey
  if (data.model !== undefined) updateData.model = data.model
  if (data.maxTokens !== undefined) updateData.maxTokens = data.maxTokens

  if (Object.keys(updateData).length === 0) return false

  const result = db.update(aiConfig).set(updateData).where(eq(aiConfig.id, id)).run()
  return result.changes > 0
}

export function activateProvider(id: string): boolean {
  initAiConfigTable()

  db.update(aiConfig).set({ isActive: 0 }).run()
  const result = db.update(aiConfig).set({ isActive: 1 }).where(eq(aiConfig.id, id)).run()
  return result.changes > 0
}
