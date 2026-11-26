const baseUrl = (process.env.BENCHMARK_BASE_URL || "http://localhost:3000").replace(/\/$/, "")
const accessToken = process.env.APP_ACCESS_TOKEN

if (!accessToken) {
  console.error("缺少 APP_ACCESS_TOKEN，无法执行认证基准")
  process.exit(1)
}

const targets = [
  ["dashboard", "/api/dashboard"],
  ["questions", "/api/questions?page=1&pageSize=20"],
  ["search", "/api/questions/search?q=计算机&page=1&pageSize=20"],
  ["practice", "/api/practice?count=20&mode=normal"],
]

function percentile(values, ratio) {
  const index = Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)
  return values[index]
}

function readCookies(headers) {
  const setCookies = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie")].filter(Boolean)
  return setCookies.map((value) => value.split(";", 1)[0]).join("; ")
}

async function request(path, cookie) {
  const startedAt = performance.now()
  const response = await fetch(`${baseUrl}${path}`, {
    headers: cookie ? { Cookie: cookie } : undefined,
  })
  const duration = performance.now() - startedAt

  if (!response.ok) {
    throw new Error(`${path} 返回 HTTP ${response.status}`)
  }
  await response.arrayBuffer()
  return duration
}

async function main() {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: accessToken }),
  })

  if (!loginResponse.ok) {
    throw new Error(`登录失败，HTTP ${loginResponse.status}`)
  }

  const cookie = readCookies(loginResponse.headers)
  if (!cookie) throw new Error("登录响应未返回会话 Cookie")

  const results = []
  for (const [name, path] of targets) {
    for (let index = 0; index < 3; index += 1) await request(path, cookie)

    const durations = []
    for (let index = 0; index < 30; index += 1) {
      durations.push(await request(path, cookie))
    }
    durations.sort((left, right) => left - right)
    results.push({ name, durations })
  }

  console.table(results.map(({ name, durations }) => ({
    name,
    p50: percentile(durations, 0.5).toFixed(1),
    p95: percentile(durations, 0.95).toFixed(1),
    max: durations.at(-1).toFixed(1),
  })))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "基准执行失败")
  process.exit(1)
})
