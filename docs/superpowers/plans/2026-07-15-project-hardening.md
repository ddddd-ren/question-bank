# 题库项目安全与质量整改实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变题库核心功能的前提下，封闭未授权访问和滥用入口，消除密钥与运行数据泄露风险，并为 SQLite 批量查询改动建立可靠的回归测试。

**Architecture:** 使用 Next.js 16 的 `proxy.ts` 作为统一访问边界，通过环境变量配置的共享访问令牌和 HttpOnly Cookie 保护页面及 API；对高成本代码运行接口增加进程内限流。AI 配置接口只返回不可逆的密钥状态。数据库测试使用独立临时 SQLite 文件，避免读写正式题库。

**Tech Stack:** Next.js 16.2.6、React 19、TypeScript、Zod、better-sqlite3、Drizzle ORM、Vitest、Docker Compose。

---

## 文件结构

- Create: `src/lib/auth.ts`：令牌校验、Cookie 常量和安全比较。
- Create: `src/app/login/page.tsx`：最小登录界面。
- Create: `src/app/api/auth/login/route.ts`：设置 HttpOnly 会话 Cookie。
- Create: `src/app/api/auth/logout/route.ts`：清除会话 Cookie。
- Modify: `src/proxy.ts`：统一保护页面和 API，并放行登录与静态资源。
- Create: `src/lib/rate-limit.ts`：代码运行接口的轻量限流器。
- Modify: `src/app/api/code/run/route.ts`：接入限流、超时和响应体上限。
- Modify: `src/app/api/ai/config/route.ts`：停止返回密钥片段。
- Create: `src/lib/__tests__/auth.test.ts`：访问令牌测试。
- Create: `src/lib/__tests__/rate-limit.test.ts`：限流测试。
- Create: `src/lib/db/__tests__/queries.integration.test.ts`：SQLite 批量操作回归测试。
- Modify: `.gitignore`：明确忽略数据库、WAL 和服务日志。
- Modify: `docker-compose.yml`：默认仅绑定本机并注入访问令牌。
- Modify: `.dockerignore`：排除数据库、日志、覆盖率和开发缓存。
- Modify: `README.md`：补充真实安装、访问控制、备份和验证说明。

### Task 1: 建立统一访问令牌

**Files:**
- Create: `src/lib/auth.ts`
- Test: `src/lib/__tests__/auth.test.ts`

- [ ] **Step 1: 编写失败测试**

覆盖以下行为：未配置 `APP_ACCESS_TOKEN` 时只允许显式开发模式；正确令牌通过；错误令牌失败；不同长度令牌不会抛出异常。

```ts
import { afterEach, describe, expect, it } from "vitest"
import { isAccessTokenValid } from "../auth"

describe("isAccessTokenValid", () => {
  const original = process.env.APP_ACCESS_TOKEN

  afterEach(() => {
    process.env.APP_ACCESS_TOKEN = original
  })

  it("accepts the configured token", () => {
    process.env.APP_ACCESS_TOKEN = "test-secret"
    expect(isAccessTokenValid("test-secret")).toBe(true)
  })

  it("rejects missing, incorrect and different-length tokens", () => {
    process.env.APP_ACCESS_TOKEN = "test-secret"
    expect(isAccessTokenValid(undefined)).toBe(false)
    expect(isAccessTokenValid("wrong")).toBe(false)
    expect(isAccessTokenValid("test-secrex")).toBe(false)
  })
})
```

- [ ] **Step 2: 验证测试失败**

Run: `npx vitest run src/lib/__tests__/auth.test.ts`

Expected: FAIL，提示无法解析 `../auth`。

- [ ] **Step 3: 实现恒定时间令牌比较**

在 `src/lib/auth.ts` 中导出：

```ts
import { timingSafeEqual } from "node:crypto"

export const AUTH_COOKIE_NAME = "question_bank_session"

export function isAccessTokenValid(candidate: string | undefined): boolean {
  const expected = process.env.APP_ACCESS_TOKEN
  if (!expected || !candidate) return false

  const expectedBuffer = Buffer.from(expected)
  const candidateBuffer = Buffer.from(candidate)
  if (expectedBuffer.length !== candidateBuffer.length) return false
  return timingSafeEqual(expectedBuffer, candidateBuffer)
}
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run src/lib/__tests__/auth.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/auth.ts src/lib/__tests__/auth.test.ts
git commit -m "feat: add shared access token validation"
```

### Task 2: 增加登录、退出和代理保护

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Modify: `src/proxy.ts`

- [ ] **Step 1: 阅读项目内 Next.js 16 文档**

在写代码前搜索并阅读 `node_modules/next/dist/docs/` 中关于 Proxy、cookies、Route Handler 和重定向的文档，确认当前版本 API，不沿用旧版 middleware 约定。

Run: `rg -n "proxy|cookies|Route Handler" node_modules/next/dist/docs`

Expected: 找到 Next.js 16 对应文档并记录弃用提示。

- [ ] **Step 2: 编写登录接口**

`POST /api/auth/login` 接收 `{ token: string }`，通过 `isAccessTokenValid` 后设置 `HttpOnly`、`SameSite=Strict`、生产环境 `Secure` 的 Cookie；失败统一返回 401，不回显令牌。

```ts
const LoginSchema = z.object({ token: z.string().min(1).max(200) })

response.cookies.set(AUTH_COOKIE_NAME, token, {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
})
```

- [ ] **Step 3: 编写退出接口和登录页面**

退出接口将同名 Cookie 的 `maxAge` 设置为 0。登录页面只包含密码输入框、提交按钮和通用错误提示，不把令牌写入 localStorage 或 URL。

- [ ] **Step 4: 修改 Proxy**

放行 `/login`、`/api/auth/login`、`/_next/*`、图标和静态文件；其他请求必须携带有效 Cookie。页面请求失败时重定向 `/login`，API 请求失败时返回 JSON 401。保留现有安全响应头和 API 禁止缓存头。

- [ ] **Step 5: 手工验证访问矩阵**

Run: `npm run dev`

Expected:

| 场景 | 结果 |
|---|---|
| 未登录访问 `/` | 307/303 到 `/login` |
| 未登录访问 `/api/dashboard` | 401 JSON |
| 错误令牌登录 | 401 |
| 正确令牌登录 | 设置 HttpOnly Cookie 并进入首页 |
| 退出后访问首页 | 再次跳转登录页 |

- [ ] **Step 6: 提交**

```bash
git add src/proxy.ts src/app/login/page.tsx src/app/api/auth/login/route.ts src/app/api/auth/logout/route.ts
git commit -m "feat: protect application with shared login"
```

### Task 3: 限制代码运行接口滥用

**Files:**
- Create: `src/lib/rate-limit.ts`
- Create: `src/lib/__tests__/rate-limit.test.ts`
- Modify: `src/app/api/code/run/route.ts`

- [ ] **Step 1: 编写限流失败测试**

验证同一键在 60 秒内最多 10 次，第 11 次拒绝，窗口过期后恢复，并返回 `retryAfterSeconds`。

- [ ] **Step 2: 实现固定窗口限流器**

实现 `consumeRateLimit(key, { limit, windowMs }, now = Date.now())`，返回 `{ allowed, remaining, retryAfterSeconds }`。Map 条目在窗口过期时删除，避免无限增长。

- [ ] **Step 3: 验证单元测试通过**

Run: `npx vitest run src/lib/__tests__/rate-limit.test.ts`

Expected: PASS。

- [ ] **Step 4: 接入代码运行接口**

从可信代理头或 `request.ip` 的当前版本替代 API 中取得客户端键；无法取得时使用会话 Cookie 的哈希。超限返回 429 和 `Retry-After`。对 Piston 请求使用 `AbortSignal.timeout(12_000)`，并将上游错误正文截断到 2 KB，标准输出/错误输出各截断到 100 KB。

- [ ] **Step 5: 验证接口**

连续发起 11 次请求，前 10 次进入上游调用，第 11 次返回 429；等待窗口后恢复。确认超时返回 504/502，响应中不包含无限长度上游正文。

- [ ] **Step 6: 提交**

```bash
git add src/lib/rate-limit.ts src/lib/__tests__/rate-limit.test.ts src/app/api/code/run/route.ts
git commit -m "feat: rate limit code execution"
```

### Task 4: 消除 AI 密钥回显

**Files:**
- Modify: `src/app/api/ai/config/route.ts`
- Test: `src/lib/ai/__tests__/config-response.test.ts`

- [ ] **Step 1: 抽取安全响应映射并编写失败测试**

安全对象必须完全删除 `apiKey`，只保留 `hasApiKey`。测试短密钥、长密钥和空密钥，序列化结果中均不得包含原始密钥片段。

```ts
expect(JSON.stringify(toSafeProvider(provider))).not.toContain(provider.apiKey)
expect(toSafeProvider(provider)).not.toHaveProperty("apiKey")
```

- [ ] **Step 2: 实现安全映射**

将 GET 映射改为显式字段白名单，不使用 `{ ...p }`，防止数据库将来新增敏感字段时被自动暴露。

- [ ] **Step 3: 运行测试和接口检查**

Run: `npx vitest run src/lib/ai/__tests__/config-response.test.ts`

Expected: PASS；`GET /api/ai/config` 响应中不存在 `apiKey` 字段。

- [ ] **Step 4: 提交**

```bash
git add src/app/api/ai/config/route.ts src/lib/ai/__tests__/config-response.test.ts
git commit -m "fix: stop exposing api key fragments"
```

### Task 5: 将运行数据退出版本控制

**Files:**
- Modify: `.gitignore`
- Modify: `.dockerignore`
- Modify: `docker-compose.yml`

- [ ] **Step 1: 备份正式数据库**

先停止写入数据库的开发服务器，再使用 SQLite 在线备份命令或复制已关闭的数据库文件到仓库外。不得直接删除唯一数据副本。

- [ ] **Step 2: 完善忽略规则**

加入：

```gitignore
/data/*.db
/data/*.db-shm
/data/*.db-wal
/server.log
/server.err.log
```

`.dockerignore` 同时排除 `.git`、`.next`、`node_modules`、`coverage`、`data/*.db*` 和 `server*.log`。

- [ ] **Step 3: 仅从 Git 索引移除运行数据**

Run:

```bash
git rm --cached data/question-bank.db data/question-bank.db-shm data/question-bank.db-wal server.log server.err.log
```

Expected: 文件仍保留在本地磁盘，`git status` 显示索引删除和忽略规则修改。

- [ ] **Step 4: 默认仅本机暴露 Docker 端口**

将映射改为 `127.0.0.1:3000:3000`，并要求通过 `.env` 注入 `APP_ACCESS_TOKEN`：

```yaml
ports:
  - "127.0.0.1:3000:3000"
environment:
  APP_ACCESS_TOKEN: ${APP_ACCESS_TOKEN:?APP_ACCESS_TOKEN is required}
```

- [ ] **Step 5: 验证 Docker 配置**

Run: `docker compose config`

Expected: 配置解析成功；未设置令牌时明确失败；设置后端口只绑定 127.0.0.1。

- [ ] **Step 6: 提交**

```bash
git add .gitignore .dockerignore docker-compose.yml
git commit -m "chore: remove runtime data from version control"
```

### Task 6: 为 SQLite 批量查询增加集成测试

**Files:**
- Create: `src/lib/db/__tests__/queries.integration.test.ts`
- Modify: `src/lib/db/index.ts`（仅在需要支持测试数据库注入时修改）

- [ ] **Step 1: 建立隔离测试数据库**

每个测试使用临时目录中的 SQLite 文件，并在导入查询模块前设置 `DATABASE_PATH`。测试结束后关闭连接并删除临时目录，禁止读取 `data/question-bank.db`。

- [ ] **Step 2: 编写失败测试**

覆盖：空数组批量创建返回空数组；一次创建 401 条题目成功；使用 501 个 ID/hash 查询不触发 SQLite 参数上限；重复 ID/hash 不导致重复结果；随机题数量被上层限制；错题类型过滤的参数顺序正确。

- [ ] **Step 3: 运行集成测试**

Run: `npx vitest run src/lib/db/__tests__/queries.integration.test.ts`

Expected: 当前缺失测试注入能力或边界行为时 FAIL。

- [ ] **Step 4: 做最小实现调整**

只修改测试暴露出的真实问题；保持 `SQLITE_IN_CHUNK_SIZE = 500` 和 `SQLITE_INSERT_CHUNK_SIZE = 400`，不重构无关查询。

- [ ] **Step 5: 运行数据库测试和完整测试**

Run:

```bash
npx vitest run src/lib/db/__tests__/queries.integration.test.ts
npm test
```

Expected: 集成测试与全部测试 PASS，正式数据库文件时间戳不变化。

- [ ] **Step 6: 提交**

```bash
git add src/lib/db/index.ts src/lib/db/__tests__/queries.integration.test.ts
git commit -m "test: cover sqlite batch query limits"
```

### Task 7: 依赖升级与项目文档收尾

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

- [ ] **Step 1: 查询 Next.js 16 修复版本**

先阅读 `node_modules/next/dist/docs/` 的升级说明，再使用 `npm view next versions --json` 和安全公告确认包含 PostCSS 修复且兼容当前代码的稳定版本。禁止执行 `npm audit fix --force`，因为当前建议会错误降级到 Next 9。

- [ ] **Step 2: 在独立提交中升级依赖**

仅升级 Next.js、匹配的 `eslint-config-next` 及锁文件；除非兼容性要求，不顺带升级其他依赖。

- [ ] **Step 3: 完整验证**

Run:

```bash
npm ci
npm run lint
npx tsc --noEmit --pretty false
npm test
npm run build
npm audit --omit=dev
```

Expected: lint、类型、测试、构建全部通过；生产依赖不再报告该 PostCSS 公告，或 README 中明确记录尚无可用修复版本和缓解措施。

- [ ] **Step 4: 重写 README**

README 必须包含：项目功能、Node 版本、安装与启动、`APP_ACCESS_TOKEN`、Docker 启动、本地端口绑定、数据库备份/恢复、测试命令、AI Key 不回显说明，以及生产部署前检查清单。

- [ ] **Step 5: 最终检查**

Run:

```bash
git diff --check
git status --short
```

Expected: 无空白错误；运行数据库、WAL、日志、`.env`、`.next` 和覆盖率文件不再出现在未跟踪列表。

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json README.md
git commit -m "docs: document secure deployment workflow"
```

## 最终验收标准

- 未登录用户不能访问页面、读写 API、AI 配置或代码运行接口。
- Cookie 为 HttpOnly、SameSite=Strict，生产环境启用 Secure。
- AI 配置响应不包含 `apiKey` 字段或任何密钥片段。
- 代码运行接口具有限流、上游超时和响应长度限制。
- Docker 默认只监听本机，启动时强制要求访问令牌。
- 数据库、WAL、日志和环境变量不再进入 Git 或 Docker 构建上下文。
- 401/429、安全映射和 SQLite 大批量行为都有自动化测试。
- ESLint、TypeScript、全部 Vitest、生产构建和依赖审计达到约定结果。
