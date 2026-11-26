# 部署上线指南

本项目使用 Next.js + `better-sqlite3`。题库数据默认保存在 SQLite 文件中，线上部署必须挂载持久化目录。

## 推荐方案：Docker + VPS

1. 在服务器安装 Docker 和 Docker Compose。
2. 上传项目代码到服务器。
3. 在项目根目录准备环境变量，可按需设置：

```bash
APP_ACCESS_TOKEN=长度足够且不可预测的随机令牌
LLM_API_KEY=你的模型服务密钥
DATABASE_PATH=/app/data/question-bank.db
```

4. 启动服务：

```bash
docker compose up -d --build
```

5. 本机访问：

```bash
http://127.0.0.1:3000
```

Compose 默认只绑定本机。如果需要其他设备访问，应通过同机 HTTPS 反向代理转发，不要直接把 3000 端口暴露到公网。容器健康检查访问公开的 `/api/health`，不会绕过业务接口的登录保护。

代码运行默认为关闭。自建 Piston 时，将 `PISTON_EXECUTE_URL` 设为题库容器可访问的完整执行接口。同一 Docker 网络内可使用服务名，例如 `http://piston:2000/api/v2/execute`。使用要求 Bearer 认证的接口时，再设置 `PISTON_API_TOKEN`。

## 持久化数据

`docker-compose.yml` 已将本机 `./data` 挂载到容器 `/app/data`。重新构建镜像不会删除题库。

在设置页下载完整备份，或在安装了项目依赖的环境执行一致性备份；不要在运行中直接复制 WAL 模式的数据库主文件：

```bash
node scripts/database-backup.mjs backup /backups/question-bank.db
node scripts/database-backup.mjs verify /backups/question-bank.db
```

恢复前停止所有题库进程，然后执行 `node scripts/database-backup.mjs restore /backups/question-bank.db --stopped`。工具在替换前校验数据库，并保留恢复前原库。发现 WAL/SHM/日志文件时会拒绝恢复，应先确认服务已正常关闭，不要删除活跃日志。备份可能含 AI Key，不应提交到 Git 或公开分享。容器中如未包含脚本，可在宿主机的项目目录使用同一数据库路径操作。

## Nginx 反向代理示例

```nginx
server {
  server_name your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

配置 HTTPS 可使用 Certbot：

```bash
certbot --nginx -d your-domain.com
```

## 不推荐直接部署到 Vercel

当前版本依赖本地 SQLite 文件和原生模块 `better-sqlite3`。Vercel Serverless 环境没有适合长期保存 SQLite 文件的持久磁盘，除非先迁移到外部数据库。
