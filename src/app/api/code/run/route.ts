import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-error"
import { AUTH_COOKIE_NAME } from "@/lib/auth"
import { createCodeRunClientKey, truncateText } from "@/lib/code-run"
import { consumeRateLimit } from "@/lib/rate-limit"
import { z } from "zod"

const PISTON_API = "https://emkc.org/api/v2/piston/execute"

const CodeRunSchema = z.object({
  code: z.string().min(1).max(50000),
  language: z.string().max(50).optional().default("auto"),
  stdin: z.string().max(10000).optional(),
})

const PistonStageSchema = z.object({
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  output: z.string().optional(),
})

const PistonResultSchema = z.object({
  language: z.string(),
  version: z.string(),
  run: PistonStageSchema,
  compile: PistonStageSchema.optional(),
})

const CODE_RUN_RATE_LIMIT = { limit: 10, windowMs: 60_000 }

const LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  "c": { language: "c", version: "10.2.0" },
  "cpp": { language: "cpp", version: "10.2.0" },
  "c++": { language: "cpp", version: "10.2.0" },
  "java": { language: "java", version: "15.0.2" },
  "python": { language: "python", version: "3.10.0" },
  "python3": { language: "python", version: "3.10.0" },
  "javascript": { language: "javascript", version: "18.15.0" },
  "js": { language: "javascript", version: "18.15.0" },
  "typescript": { language: "typescript", version: "5.0.3" },
  "ts": { language: "typescript", version: "5.0.3" },
  "go": { language: "go", version: "1.16.2" },
  "rust": { language: "rust", version: "1.68.2" },
  "ruby": { language: "ruby", version: "3.0.1" },
  "php": { language: "php", version: "8.2.3" },
  "swift": { language: "swift", version: "5.3.3" },
  "kotlin": { language: "kotlin", version: "1.8.20" },
  "r": { language: "r", version: "4.1.1" },
  "lua": { language: "lua", version: "5.4.4" },
  "perl": { language: "perl", version: "5.36.0" },
  "shell": { language: "bash", version: "5.2.0" },
  "bash": { language: "bash", version: "5.2.0" },
  "sql": { language: "sqlite3", version: "3.39.4" },
  "csharp": { language: "csharp", version: "6.12.0" },
  "c#": { language: "csharp", version: "6.12.0" },
}

function detectLanguage(code: string): string {
  const patterns: [RegExp, string][] = [
    [/^#include\s+[<"]/m, "c"],
    [/int\s+main\s*\(/m, "c"],
    [/^#include\s+.*iostream/m, "cpp"],
    [/using\s+namespace\s+std/m, "cpp"],
    [/cout\s*<</m, "cpp"],
    [/^public\s+class\s+/m, "java"],
    [/System\.out\./m, "java"],
    [/^def\s+\w+\s*\(/m, "python"],
    [/^import\s+\w+/m, "python"],
    [/print\s*\(/m, "python"],
    [/^function\s+\w+\s*\(/m, "javascript"],
    [/console\.log\s*\(/m, "javascript"],
    [/^const\s+.*=\s*require\s*\(/m, "javascript"],
    [/^func\s+\w+\s*\(/m, "go"],
    [/fmt\.Print/m, "go"],
    [/^fn\s+\w+\s*\(/m, "rust"],
    [/println!\s*\(/m, "rust"],
    [/^SELECT\s+/im, "sql"],
    [/^INSERT\s+INTO\s+/im, "sql"],
    [/^CREATE\s+TABLE\s+/im, "sql"],
    [/^def\s+/m, "python"],
    [/^class\s+\w+.*:/m, "python"],
  ]

  for (const [pattern, lang] of patterns) {
    if (pattern.test(code)) return lang
  }

  return "python"
}

export async function POST(request: NextRequest) {
  try {
    const clientKey = createCodeRunClientKey(request.cookies.get(AUTH_COOKIE_NAME)?.value)
    const rateLimit = consumeRateLimit(clientKey, CODE_RUN_RATE_LIMIT)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "代码运行请求过于频繁，请稍后再试" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      )
    }

    const body = await request.json()
    const validated = CodeRunSchema.parse(body)
    const { code, stdin } = validated
    let language = validated.language

    if (!language || language === "auto") {
      language = detectLanguage(code)
    }

    const langConfig = LANGUAGE_MAP[language.toLowerCase()]
    if (!langConfig) {
      return NextResponse.json({
        error: `不支持的语言: ${language}`,
        supported: Object.keys(LANGUAGE_MAP)
      }, { status: 400 })
    }

    const response = await fetch(PISTON_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: langConfig.language,
        version: langConfig.version,
        files: [{ content: code }],
        stdin: stdin || "",
        args: [],
        compile_timeout: 10000,
        run_timeout: 5000,
      }),
      signal: AbortSignal.timeout(12_000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({
        error: "Piston API请求失败",
        details: truncateText(errorText, 2_000),
      }, { status: 502 })
    }

    const result = PistonResultSchema.parse(await response.json())

    const output = {
      success: !result.run.stderr,
      stdout: truncateText(result.run.stdout, 100_000),
      stderr: truncateText(result.run.stderr, 100_000),
      output: truncateText(result.run.output, 100_000),
      language: result.language,
      version: result.version,
      compile: result.compile ? {
        stdout: truncateText(result.compile.stdout, 100_000),
        stderr: truncateText(result.compile.stderr, 100_000),
        output: truncateText(result.compile.output, 100_000),
      } : null,
    }

    return NextResponse.json(output)
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json({ error: "代码运行服务响应超时" }, { status: 504 })
    }
    return handleApiError(error)
  }
}

export async function GET() {
  return NextResponse.json({
    languages: Object.keys(LANGUAGE_MAP),
    autoDetect: true,
  })
}
