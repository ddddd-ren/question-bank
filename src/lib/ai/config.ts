// Barrel file — re-exports from split modules for backward compatibility
export { aiConfig, DEFAULT_PROVIDERS } from "./schema"
export type { AiProvider } from "./schema"
export { initAiConfigTable, getActiveProvider, getAllProviders, updateProvider, activateProvider } from "./queries"
export { testApiConnection } from "./test"
