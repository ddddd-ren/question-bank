# 题库系统

本项目是一个面向个人学习的本地题库管理工具，支持题目导入、分类与学科管理、随机练习、错题与收藏、组卷导出、AI 解析以及远程沙箱代码运行。

## 环境要求

- Node.js 20.9 或更高版本
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

备份前先停止开发或生产服务器。Windows PowerShell 示例：

```powershell
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item -LiteralPath "data/question-bank.db" -Destination "D:/backups/question-bank-$timestamp.db"
```

恢复时同样需要先停止服务器，再用备份文件替换 `question-bank.db`。如果目录中存在旧的 `question-bank.db-wal` 或 `question-bank.db-shm`，确认没有 SQLite 进程占用后再清理这些临时文件。

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
- 代码运行请求发送到 Piston 公共服务，接口设置了请求频率、上游超时和输出长度限制。
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

测试包含参数校验、题目解析、访问令牌、限流、AI 配置脱敏，以及隔离临时数据库中的 SQLite 批量查询回归测试。

## 生产部署检查清单

- 使用足够长、不可预测的 `APP_ACCESS_TOKEN`。
- 确认 `.env.local`、数据库、WAL 和日志不在 Git 中。
- 确认数据库目录具有持久化存储和定期备份。
- 非本机访问必须配置 HTTPS 和防火墙或反向代理访问控制。
- 运行完整质量检查并检查 `npm audit --omit=dev`。
- 验证未登录页面跳转到 `/login`，未登录 API 返回 401。
- 验证 AI 配置响应中不存在 `apiKey` 字段。
- 根据实际使用量评估 Piston 公共服务的可用性和数据合规要求。
