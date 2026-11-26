import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
const directory = mkdtempSync(path.join(tmpdir(), "ai-provider-test-"))
const original = process.env.DATABASE_PATH
let sqlite: typeof import("../../db")["sqliteDb"]
let providers: typeof import("../queries")
beforeAll(async () => {
  process.env.DATABASE_PATH = path.join(directory, "test.db"); vi.resetModules()
  sqlite = (await import("../../db")).sqliteDb
  providers = await import("../queries")
})
afterAll(() => {
  sqlite?.close(); rmSync(directory, { recursive: true, force: true })
  if (original === undefined) delete process.env.DATABASE_PATH
  else process.env.DATABASE_PATH = original
})
it("激活不存在的服务不清空原激活服务", () => {
  providers.initAiConfigTable()
  const original = sqlite.prepare("SELECT id FROM ai_config LIMIT 1").get() as { id: string }
  expect(providers.activateProvider(original.id)).toBe(true)
  expect(providers.activateProvider("missing-provider")).toBe(false)
  expect(sqlite.prepare("SELECT id FROM ai_config WHERE is_active=1").all()).toEqual([original])
})
