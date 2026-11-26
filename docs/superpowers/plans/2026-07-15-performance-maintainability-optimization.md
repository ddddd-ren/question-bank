# 题库性能与可维护性优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变题库功能和数据格式的前提下，降低大题库搜索与随机抽题耗时，减少前端重复请求，并把超大导入模块拆成可测试、可维护的边界。

**Architecture:** 先建立可重复的 API 延迟基线，再使用 SQLite FTS5 trigram 索引替代长关键词 `%LIKE%` 扫描，并使用随机 ID 游标替代全表 `ORDER BY RANDOM()`。前端统一使用 SWR 和防抖后的查询键；导入流程按“状态 hook、展示组件、服务端解析器加载”分层。

**Tech Stack:** Next.js 16.2.10、React 19、TypeScript、better-sqlite3、Drizzle ORM、SQLite FTS5、SWR、Vitest。

---

## 文件结构

- Create: `scripts/benchmark-api.mjs`：登录后执行 API 预热并输出 p50、p95、最大耗时。
- Modify: `package.json`：增加 `benchmark:api` 命令。
- Modify: `src/lib/db/index.ts`：创建 FTS5 表、同步触发器和首次重建逻辑。
- Create: `src/lib/db/search.ts`：构造安全 FTS 查询并决定 FTS/LIKE 路径。
- Create: `src/lib/db/__tests__/search.integration.test.ts`：验证中文、英文、特殊字符和索引同步。
- Modify: `src/lib/db/queries.ts`：接入 FTS 搜索和随机游标抽题。
- Create: `src/lib/random.ts`：可注入随机源的整数与洗牌函数。
- Create: `src/lib/__tests__/random.test.ts`：随机边界和洗牌测试。
- Modify: `src/hooks/use-swr-fetcher.ts`：导出统一 fetcher、分页响应类型和收藏/错题 hooks。
- Create: `src/hooks/use-paginated-filter.ts`：管理页码、题型与防抖搜索条件。
- Create: `src/hooks/__tests__/query-key.test.ts`：验证稳定查询键。
- Modify: `src/app/favorites/page.tsx`：改用统一 SWR 数据流和局部 mutate。
- Modify: `src/app/mistakes/page.tsx`：改用统一 SWR 数据流。
- Create: `src/hooks/use-import-workflow.ts`：承载导入页面状态与命令。
- Create: `src/components/import/import-toolbar.tsx`：文件、筛选、批量操作工具栏。
- Create: `src/components/import/import-summary.tsx`：类型统计和质量摘要。
- Modify: `src/app/import/page.tsx`：只负责页面布局和组件编排。
- Modify: `src/app/api/questions/preview/route.ts`：按文件类型动态加载解析器。
- Modify: `README.md`：记录基准命令和优化后的搜索行为。

### Task 1: 建立可重复的 API 性能基线

**Files:**
- Create: `scripts/benchmark-api.mjs`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: 编写基准脚本**

脚本必须读取 `BENCHMARK_BASE_URL` 和 `APP_ACCESS_TOKEN`，先登录并保存响应 Cookie，然后对以下请求各预热 3 次、采样 30 次：

```js
const targets = [
  ["dashboard", "/api/dashboard"],
  ["questions", "/api/questions?page=1&pageSize=20"],
  ["search", "/api/questions/search?q=计算机&page=1&pageSize=20"],
  ["practice", "/api/practice?count=20&mode=normal"],
]
```

使用 `performance.now()` 记录耗时，排序后输出：

```js
function percentile(values, ratio) {
  const index = Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)
  return values[index]
}

console.table(results.map(({ name, durations }) => ({
  name,
  p50: percentile(durations, 0.5).toFixed(1),
  p95: percentile(durations, 0.95).toFixed(1),
  max: durations.at(-1).toFixed(1),
})))
```

登录响应通过 `response.headers.getSetCookie()` 或兼容回退读取 Cookie；任何非 2xx 响应立即退出并显示接口名称。

- [ ] **Step 2: 增加 npm 命令**

```json
{
  "scripts": {
    "benchmark:api": "node scripts/benchmark-api.mjs"
  }
}
```

- [ ] **Step 3: 记录优化前基线**

PowerShell：

```powershell
$env:BENCHMARK_BASE_URL = "http://localhost:3000"
$env:APP_ACCESS_TOKEN = "本地访问令牌"
npm run benchmark:api
```

Expected: 四个接口均输出 p50、p95、max；将结果粘贴到计划执行记录或提交说明中，不提交访问令牌。

- [ ] **Step 4: 验证脚本错误路径**

使用错误令牌执行一次。

Expected: 登录阶段非零退出，不继续发送采样请求，输出中不回显令牌。

- [ ] **Step 5: 提交**

```bash
git add scripts/benchmark-api.mjs package.json README.md
git commit -m "perf: add authenticated api benchmark"
```

### Task 2: 使用 FTS5 优化题库搜索

**Files:**
- Modify: `src/lib/db/index.ts`
- Create: `src/lib/db/search.ts`
- Create: `src/lib/db/__tests__/search.integration.test.ts`
- Modify: `src/lib/db/queries.ts`

- [ ] **Step 1: 编写 FTS 查询构造失败测试**

`src/lib/db/search.ts` 提供以下接口：

```ts
export function shouldUseFullTextSearch(search: string): boolean
export function toFtsPhrase(search: string): string
```

测试要求：去除首尾空格；长度少于 3 的关键词走 LIKE；3 个及以上字符走 FTS；双引号被转义并整体包装为短语。

```ts
expect(shouldUseFullTextSearch("计算机")).toBe(true)
expect(shouldUseFullTextSearch("计算")).toBe(false)
expect(toFtsPhrase('操作"系统')).toBe('"操作""系统"')
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/db/__tests__/search.integration.test.ts`

Expected: FAIL，提示 `search.ts` 不存在。

- [ ] **Step 3: 创建 FTS5 表与触发器**

在 `src/lib/db/index.ts` 的表初始化后执行：

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS questions_fts USING fts5(
  content,
  answer,
  tags,
  content='questions',
  content_rowid='id',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS questions_fts_insert AFTER INSERT ON questions BEGIN
  INSERT INTO questions_fts(rowid, content, answer, tags)
  VALUES (new.id, new.content, coalesce(new.answer, ''), coalesce(new.tags, ''));
END;

CREATE TRIGGER IF NOT EXISTS questions_fts_delete AFTER DELETE ON questions BEGIN
  INSERT INTO questions_fts(questions_fts, rowid, content, answer, tags)
  VALUES ('delete', old.id, old.content, coalesce(old.answer, ''), coalesce(old.tags, ''));
END;

CREATE TRIGGER IF NOT EXISTS questions_fts_update AFTER UPDATE ON questions BEGIN
  INSERT INTO questions_fts(questions_fts, rowid, content, answer, tags)
  VALUES ('delete', old.id, old.content, coalesce(old.answer, ''), coalesce(old.tags, ''));
  INSERT INTO questions_fts(rowid, content, answer, tags)
  VALUES (new.id, new.content, coalesce(new.answer, ''), coalesce(new.tags, ''));
END;
```

初始化时比较 `questions` 与 `questions_fts` 数量；数量不一致才执行：

```sql
INSERT INTO questions_fts(questions_fts) VALUES ('rebuild');
```

- [ ] **Step 4: 编写索引同步集成测试**

使用临时数据库验证：插入后可搜索；更新题干后旧词消失、新词出现；删除后结果消失；双引号和标点不会造成 SQL 错误；两字符关键词仍通过 LIKE 返回结果。

- [ ] **Step 5: 修改 `getQuestions`**

当 `shouldUseFullTextSearch(search)` 为真时，使用参数绑定的子查询：

```ts
whereConditions.push(sql`${questions.id} IN (
  SELECT rowid FROM questions_fts WHERE questions_fts MATCH ${toFtsPhrase(search)}
)`)
```

短关键词保留现有 `LIKE`。总数查询和分页查询必须使用同一 `whereClause`，确保页数一致。

- [ ] **Step 6: 运行测试**

```bash
npx vitest run src/lib/db/__tests__/search.integration.test.ts
npx vitest run src/lib/db/__tests__/queries.integration.test.ts
npm test
```

Expected: 全部 PASS；正式数据库只在应用首次启动时补建索引，不修改题目内容。

- [ ] **Step 7: 提交**

```bash
git add src/lib/db/index.ts src/lib/db/search.ts src/lib/db/queries.ts src/lib/db/__tests__/search.integration.test.ts
git commit -m "perf(db): add full text question search"
```

### Task 3: 移除随机抽题的全表随机排序

**Files:**
- Create: `src/lib/random.ts`
- Create: `src/lib/__tests__/random.test.ts`
- Modify: `src/lib/db/queries.ts`
- Modify: `src/lib/db/__tests__/queries.integration.test.ts`

- [ ] **Step 1: 编写随机工具失败测试**

```ts
expect(randomInteger(10, 20, () => 0)).toBe(10)
expect(randomInteger(10, 20, () => 0.999999)).toBe(20)
expect(shuffle([1, 2, 3], () => 0)).toEqual([2, 3, 1])
```

`randomInteger` 必须包含上下界；`shuffle` 返回新数组，不修改输入。

- [ ] **Step 2: 实现随机工具并验证测试通过**

```ts
export function randomInteger(min: number, max: number, random = Math.random) {
  return Math.floor(random() * (max - min + 1)) + min
}

export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}
```

- [ ] **Step 3: 编写随机查询回归测试**

测试数据库插入至少 300 条题目并制造 ID 空洞；连续抽取 20 次，每次要求：数量正确、无重复、过滤条件正确、不同调用至少出现两个不同 ID 集合。

- [ ] **Step 4: 实现随机游标查询**

先使用相同过滤条件查询 `min(id)`、`max(id)` 和 `count(*)`。结果数不超过请求数时直接按 ID 返回全部；否则生成 `[minId, maxId]` 中的随机 pivot，执行两次有界查询：

```sql
SELECT ... FROM questions
WHERE <filters> AND id >= ?
ORDER BY id
LIMIT ?;

SELECT ... FROM questions
WHERE <filters> AND id < ?
ORDER BY id
LIMIT ?;
```

第二次只补足第一次数量不足的部分，合并后使用 `shuffle` 打乱最多 100 条结果。所有筛选值继续使用参数绑定，禁止字符串插值。

- [ ] **Step 5: 验证不再使用全表随机排序**

Run: `rg -n "ORDER BY RANDOM" src/lib/db/queries.ts`

Expected: 无匹配。

- [ ] **Step 6: 运行测试与基准**

```bash
npx vitest run src/lib/__tests__/random.test.ts
npx vitest run src/lib/db/__tests__/queries.integration.test.ts
npm run benchmark:api
```

Expected: 测试 PASS；`practice` p95 不高于 Task 1 基线，并在大题库副本上明显下降。

- [ ] **Step 7: 提交**

```bash
git add src/lib/random.ts src/lib/__tests__/random.test.ts src/lib/db/queries.ts src/lib/db/__tests__/queries.integration.test.ts
git commit -m "perf(db): avoid full table random sorting"
```

### Task 4: 收敛收藏与错题页面数据流

**Files:**
- Create: `src/lib/query-key.ts`
- Create: `src/lib/__tests__/query-key.test.ts`
- Create: `src/hooks/use-paginated-filter.ts`
- Modify: `src/hooks/use-swr-fetcher.ts`
- Modify: `src/app/favorites/page.tsx`
- Modify: `src/app/mistakes/page.tsx`

- [ ] **Step 1: 编写稳定查询键失败测试**

```ts
expect(createPaginatedKey("/api/favorites", {
  page: 2,
  pageSize: 20,
  type: "all",
  search: "  网络  ",
})).toBe("/api/favorites?page=2&pageSize=20&search=%E7%BD%91%E7%BB%9C")
```

空搜索和 `type=all` 不进入 URL；参数顺序固定为 page、pageSize、type、search。

- [ ] **Step 2: 实现查询键与分页响应类型**

```ts
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
```

在 `use-swr-fetcher.ts` 中导出 `fetcher`，并增加 `useFavorites(filters)`、`useMistakes(filters)`，配置 `keepPreviousData: true`、`revalidateOnFocus: false`、`dedupingInterval: 2000`。

- [ ] **Step 3: 创建防抖筛选 hook**

`usePaginatedFilter` 返回：

```ts
{
  page,
  setPage,
  typeFilter,
  setTypeFilter,
  searchInput,
  setSearchInput,
  committedSearch,
  clearFilters,
}
```

使用现有 `useDebounce(searchInput, 300)` 生成 `committedSearch`；题型或搜索条件变化时将页码重置为 1。

- [ ] **Step 4: 重构收藏页面**

移除手写 `fetchFavorites`、`useEffect` 和 loading state。取消收藏成功后使用 SWR `mutate` 乐观删除当前项并调整 total；请求失败时回滚并显示 toast。

- [ ] **Step 5: 重构错题页面**

移除手写 `fetchMistakes` 和 `useEffect`，使用相同分页筛选 hook。加载时保留上一页数据，仅在首次无数据时显示骨架屏。

- [ ] **Step 6: 验证请求行为**

在浏览器输入 5 个连续字符。

Expected: 300ms 内不发请求，停止输入后只发一个请求；翻页时旧列表保持到新数据返回；取消收藏不再触发额外的整页 GET 后闪烁。

- [ ] **Step 7: 运行检查并提交**

```bash
npx vitest run src/lib/__tests__/query-key.test.ts
npm run lint
npx tsc --noEmit --pretty false
npm test
git add src/lib/query-key.ts src/lib/__tests__/query-key.test.ts src/hooks/use-paginated-filter.ts src/hooks/use-swr-fetcher.ts src/app/favorites/page.tsx src/app/mistakes/page.tsx
git commit -m "perf(ui): deduplicate paginated data fetching"
```

### Task 5: 拆分导入页面并按文件类型加载解析器

**Files:**
- Create: `src/hooks/use-import-workflow.ts`
- Create: `src/components/import/import-toolbar.tsx`
- Create: `src/components/import/import-summary.tsx`
- Modify: `src/app/import/page.tsx`
- Modify: `src/app/api/questions/preview/route.ts`
- Create: `src/lib/parser/__tests__/loader.test.ts`
- Create: `src/lib/parser/loader.ts`

- [ ] **Step 1: 编写解析器选择失败测试**

`loader.ts` 导出 `getParserKind(fileName)`，返回 `json | csv | word | pdf | powerpoint`，不支持格式抛出 `ApiError(400)`。

```ts
expect(getParserKind("questions.PDF")).toBe("pdf")
expect(getParserKind("slides.pptm")).toBe("powerpoint")
expect(() => getParserKind("notes.txt")).toThrow("不支持的文件格式")
```

- [ ] **Step 2: 动态加载重解析器**

Route Handler 不再从 `@/lib/parser` 顶层静态导入全部解析器。根据 kind 执行：

```ts
if (kind === "word") {
  const { parseWordBuffer } = await import("@/lib/parser/question-extractor")
  questions = await parseWordBuffer(buffer)
}
```

PDF 和 PowerPoint 使用各自动态导入；JSON/CSV 路径不得加载 `mammoth`、`unpdf` 或 PowerPoint 解析依赖。

- [ ] **Step 3: 抽取导入工作流 hook**

把文件选择、解析、编辑、批量选择、筛选、删除和导入请求移动到 `use-import-workflow.ts`。hook 只返回状态和命令，不返回 JSX；所有回调维持现有参数类型和 toast 文案。

- [ ] **Step 4: 抽取工具栏和摘要组件**

`ImportToolbar` 负责文件区、题型筛选和批量操作；`ImportSummary` 接收已经计算好的 `typeCounts` 与 `qualitySummary`。组件 props 使用显式接口，禁止传入整个 workflow 对象。

- [ ] **Step 5: 精简页面入口**

`src/app/import/page.tsx` 只保留 hook 调用、页面区块和 `QuestionEditor` 列表。目标行数少于 300；不得改变现有导入、模板下载、全选和质量筛选行为。

- [ ] **Step 6: 运行解析器与完整检查**

```bash
npx vitest run src/lib/parser/__tests__/loader.test.ts
npx vitest run src/lib/parser/__tests__
npm run lint
npx tsc --noEmit --pretty false
npm test
npm run build
```

Expected: 全部 PASS；构建输出包含 `/import` 和 `/api/questions/preview`；JSON 文件导入不触发 PDF/Word 解析器初始化错误。

- [ ] **Step 7: 提交**

```bash
git add src/hooks/use-import-workflow.ts src/components/import/import-toolbar.tsx src/components/import/import-summary.tsx src/app/import/page.tsx src/app/api/questions/preview/route.ts src/lib/parser/loader.ts src/lib/parser/__tests__/loader.test.ts
git commit -m "refactor(import): split workflow and lazy load parsers"
```

## 最终验收

- `npm run lint`、TypeScript、全部 Vitest、生产构建和 `npm audit --omit=dev` 全部通过。
- 搜索 3 个及以上字符时使用 FTS5，短关键词保持兼容；增删改题目后索引自动同步。
- `src/lib/db/queries.ts` 不再出现 `ORDER BY RANDOM()`。
- 收藏和错题搜索停止输入后只发一个请求，翻页不清空旧列表。
- `src/app/import/page.tsx` 少于 300 行，JSON/CSV 路径按需加载，不静态引入所有文档解析器。
- 优化后的 search 与 practice p95 不高于基线；若数据量不足以体现差异，使用备份副本扩充到至少 10,000 条后重复基准，禁止污染正式数据库。
- README 记录基准运行方法、FTS 索引行为和数据库备份要求。
