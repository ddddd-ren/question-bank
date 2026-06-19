import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const aiConfig = sqliteTable("ai_config", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  apiKey: text("api_key").notNull().default(""),
  model: text("model").notNull(),
  maxTokens: integer("max_tokens").notNull().default(2000),
  isActive: integer("is_active").notNull().default(0),
})

export interface AiProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  maxTokens: number
  isActive: boolean
}

export const DEFAULT_PROVIDERS: Omit<AiProvider, "apiKey">[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    maxTokens: 2000,
    isActive: true,
  },
  {
    id: "minimax",
    name: "MiniMax",
    baseUrl: "https://api.minimax.chat/v1",
    model: "MiniMax-Text-01",
    maxTokens: 2000,
    isActive: false,
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    maxTokens: 2000,
    isActive: false,
  },
  {
    id: "custom",
    name: "自定义",
    baseUrl: "",
    model: "",
    maxTokens: 2000,
    isActive: false,
  },
]
