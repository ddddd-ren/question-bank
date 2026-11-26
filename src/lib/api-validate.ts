import { z } from "zod"
import { ApiError } from "./api-error"

function parseFiniteNumber(value: string | null, fallback: number): number {
  if (!value) return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function requireBody(body: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      throw new ApiError(400, `缺少必填字段: ${field}`)
    }
  }
}

export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, Math.floor(parseFiniteNumber(searchParams.get("page"), 1)))
  const pageSize = Math.min(100, Math.max(1, Math.floor(parseFiniteNumber(searchParams.get("pageSize"), 20))))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export function parseOptionalNumber(value: string | null): number | undefined {
  if (!value) return undefined
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

export function parseBoundedInteger(value: string | null, options: {
  defaultValue: number
  min: number
  max: number
}): number {
  const parsed = Math.floor(parseFiniteNumber(value, options.defaultValue))
  return Math.min(options.max, Math.max(options.min, parsed))
}

export function parseOptionalString(value: string | null): string | undefined {
  return value || undefined
}

const QueryBooleanSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value
  if (value === "true" || value === "1") return true
  if (value === "false" || value === "0") return false
  return value
}, z.boolean())

export const QuestionTypeSchema = z.enum([
  "single", "multiple", "truefalse", "fill", "calculation", "essay", "code"
])

export const QuestionQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: QuestionTypeSchema.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  knowledgePointId: z.coerce.number().int().positive().optional(),
  difficulty: z.coerce.number().int().min(1).max(5).optional(),
  search: z.string().max(200).optional(),
  hasAnswer: QueryBooleanSchema.default(false),
  recentDays: z.coerce.number().int().positive().max(365).optional(),
  stats: QueryBooleanSchema.default(false),
})

export { PracticeSubmitSchema } from "./practice-input"

export const FavoriteToggleSchema = z.object({
  questionId: z.number().int().positive(),
})

export function validateQuery<T>(schema: z.ZodSchema<T>, searchParams: URLSearchParams): T {
  const raw = Object.fromEntries(searchParams.entries())
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
    const firstIssue = issues[0]
    const path = firstIssue?.path?.join('.') || 'unknown'
    throw new ApiError(400, `参数错误: ${path} - ${firstIssue?.message || '验证失败'}`)
  }
  return result.data
}

export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    const issues = result.error.issues
    const firstIssue = issues[0]
    const path = firstIssue?.path?.join('.') || 'unknown'
    throw new ApiError(400, `请求体错误: ${path} - ${firstIssue?.message || '验证失败'}`)
  }
  return result.data
}
