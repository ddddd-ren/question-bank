# 题库系统

本项目是一个面向个人学习的本地题库管理工具，支持题目导入、分类与学科管理、随机练习、错题与收藏、组卷导出、AI 解析以及远程沙箱代码运行。

- 学科、知识点、难度与题数专项练习；保存草稿、刷新续答、主观题自评。
- 今日到期复习与错题掌握状态，保留完整答题历史。
- 固定题目快照的试卷、Word 导出与限时模拟考试，自动保存、答题卡、统一交卷。
- 在「组卷 → 按模板组卷」上传 `.docx` 样卷，确认各大题的题号、题型、分值与筛选条件后即可复用。页面会列出缺题数量，生成后可同条件换题另存，或导出沿用样卷排版的学生卷和答案卷。
- 在「教材」导入 PDF、EPUB 或 DOCX（每册最多 64 MiB），核对目录。PDF 按页标记，EPUB 和 Word 按段标记。扫描 PDF 可对照原件手工划分章节。书签和已学进度分别保存。
- 在教材详情中给题库题目批量关联一个或多个必需章节，也可选中原文页段，预览课后习题再入库。选择「按教材进度组卷」后沿用 Word 模板，可考最近一次新增的内容、累计已学范围、自选章节，或指定新课与旧课各出几题。涉及多个章节的题需全部落在可考范围内。原卷和换题均使用出卷时的学习范围。
- 模板支持正文题位、同一表格单元格内的题目和一级十进制自动编号。表格行数需在 Word 中调整。题区含图片或复杂多级编号时，页面会提示整理模板。题库详情页可补充学科、知识点、难度及“简答题”“名词解释”等标签。
- 题干与解析支持 Markdown、图片链接和 `$...$` / `$$...$$` 数学公式；PDF / PPT 保留可识别的题目起始页。
- AI 分层提示与错因复盘，支持取消；题目归档保留历史记录。

## 环境要求

- Node.js 24 LTS
- npm 10 或兼容版本
- Windows、Linux 或 macOS
- Docker 部署为可选项

## 本地启动

安装依赖：

```bash
npm ci
```

在 `.env.local` 中至少配置访问令牌：

```dotenv
APP_ACCESS_TOKEN=请替换为足够长的随机字符串
```

可选 AI 环境变量：

```dotenv
LLM_BASE_URL=https://api.example.com/v1
LLM_API_KEY=your-api-key
LLM_MODEL=your-model
```

编程题默认停用代码运行。自建 Piston 后，在服务端设置 `PISTON_EXECUTE_URL` 为完整执行接口地址，例如 `http://127.0.0.1:2000/api/v2/execute`。接口需要 Bearer 认证时，可另设 `PISTON_API_TOKEN`。

启动开发服务器：

```bash
npm run dev
```

浏览器访问 [http://localhost:3000](http://localhost:3000)，输入 `APP_ACCESS_TOKEN` 完成登录。登录态保存在 HttpOnly Cookie 中，浏览器不会保存原始访问令牌。

## 数据库

默认数据库路径为 `data/question-bank.db`，也可以通过环境变量覆盖：

```dotenv
DATABASE_PATH=D:/data/question-bank.db
```

数据库、WAL 文件和服务日志属于运行数据，不应提交到 Git。

题库搜索对 3 个及以上字符使用 SQLite FTS5 trigram 索引，1-2 个字符保留 `LIKE` 兼容路径。应用首次启动会构建全文索引，之后由数据库触发器自动同步题目的新增、修改和删除。

随机练习在筛选后的候选题中随机抽取，启用「未答优先」时先从未答题中抽取。批量导入限制单文件 20 MiB，并在单个 SQLite 事务中提交，失败时不会留下半批数据。

设置页可直接下载完整 SQLite 快照。命令行工具支持在线一致性备份与结构校验，自动读取 `.env.local` 中的数据库路径：

```powershell
node scripts/database-backup.mjs backup D:/backups/question-bank.db
node scripts/database-backup.mjs verify D:/backups/question-bank.db
```

恢复前先正常停止所有开发或生产服务器，再执行：

```powershell
node scripts/database-backup.mjs restore D:/backups/question-bank.db --stopped
```

恢复工具保留原数据库，拒绝损坏、缺少必要结构的备份和仍带有 WAL/SHM/日志的目标。备份包括题目、练习、收藏、复习与试卷数据，也可能包含 AI Key，应妥善保管。题目 JSON / CSV 导出用于交换题目，不能代替整库备份。

模拟考试到期后在页面计时请求或下一次服务端访问时结算；是否接收答案以服务器截止时间为准。浏览器草稿仅保存在当前设备，退出登录会清理。扫描图片 PDF 仍需先进行 OCR。

## Docker 部署

Docker Compose 默认只监听本机 `127.0.0.1:3000`，并强制要求访问令牌：

```bash
APP_ACCESS_TOKEN=请替换为随机字符串 docker compose up -d --build
```

PowerShell 示例：

```powershell
$env:APP_ACCESS_TOKEN = "请替换为随机字符串"
docker compose up -d --build
```

题库数据库通过 `./data:/app/data` 持久化。需要允许其他设备访问时，应先配置 HTTPS、可信反向代理和网络访问控制，再显式修改端口绑定，不建议直接暴露到公网。

## 安全边界

- 页面和 API 默认都需要共享访问令牌登录。
- AI 配置查询只返回 `hasApiKey`，不会返回 API Key 或密钥片段。
- 配置 Piston 后，代码运行请求只发送到指定沙箱，接口设置了请求频率、上游超时和输出长度限制。
- 共享令牌适合个人或可信小范围环境，不等同于多用户账号和权限系统。
- 修改 `APP_ACCESS_TOKEN` 会使已有登录 Cookie 自动失效。

## 质量检查

```bash
npm run lint
npx tsc --noEmit --pretty false
npm test
npm run build
npm audit --omit=dev
```

API 性能基准需要先启动服务，并提供与服务一致的访问令牌：

```powershell
$env:BENCHMARK_BASE_URL = "http://localhost:3000"
$env:APP_ACCESS_TOKEN = "本地访问令牌"
npm run benchmark:api
```

基准会预热并采样仪表盘、题库分页、搜索和随机练习接口，输出 p50、p95 与最大响应耗时。

测试包含参数校验、题目解析、访问令牌、限流、AI 配置脱敏，以及隔离临时数据库中的 SQLite 批量查询回归测试。

## 生产部署检查清单

- 使用足够长、不可预测的 `APP_ACCESS_TOKEN`。
- 确认 `.env.local`、数据库、WAL 和日志不在 Git 中。
- 确认数据库目录具有持久化存储和定期备份。
- 非本机访问必须配置 HTTPS 和防火墙或反向代理访问控制。
- 运行完整质量检查并检查 `npm audit --omit=dev`。
- 验证未登录页面跳转到 `/login`，未登录 API 返回 401。
- 验证 AI 配置响应中不存在 `apiKey` 字段。
- 启用了代码运行时，验证应用可以访问所配置的 Piston 服务。
- 确认 `/api/health` 返回 200；该端点只检查服务和 SQLite，不返回题库数据。
- 确认 `.next/standalone` 中不存在数据库、WAL、日志或环境文件。
