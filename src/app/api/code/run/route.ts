import { NextRequest, NextResponse } from "next/server"
import { handleApiError } from "@/lib/api-error"
import { z } from "zod"

const PISTON_API = "https://emkc.org/api/v2/piston/execute"

const CodeRunSchema = z.object({
  code: z.string().min(1).max(50000),
  language: z.string().max(50).optional().default("auto"),
  stdin: z.string().max(10000).optional(),
})

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
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({
        error: "Piston API请求失败",
        details: errorText
      }, { status: 502 })
    }

    const result = await response.json()

    const output = {
      success: !result.run.stderr,
      stdout: result.run.stdout || "",
      stderr: result.run.stderr || "",
      output: result.run.output || "",
      language: result.language,
      version: result.version,
      compile: result.compile ? {
        stdout: result.compile.stdout || "",
        stderr: result.compile.stderr || "",
        output: result.compile.output || "",
      } : null,
    }

    return NextResponse.json(output)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function GET() {
  return NextResponse.json({
    languages: Object.keys(LANGUAGE_MAP),
    autoDetect: true,
  })
}
