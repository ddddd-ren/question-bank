# 部署上线指南

本项目使用 Next.js + `better-sqlite3`。题库数据默认保存在 SQLite 文件中，线上部署必须挂载持久化目录。

## 推荐方案：Docker + VPS

1. 在服务器安装 Docker 和 Docker Compose。
2. 上传项目代码到服务器。
3. 在项目根目录准备环境变量，可按需设置：

```bash
LLM_API_KEY=你的模型服务密钥
DATABASE_PATH=/app/data/question-bank.db
```

4. 启动服务：

```bash
docker compose up -d --build
```

5. 访问：

```bash
http://服务器IP:3000
```

## 持久化数据

`docker-compose.yml` 已将本机 `./data` 挂载到容器 `/app/data`。重新构建镜像不会删除题库。

建议定期备份：

```bash
cp data/question-bank.db data/question-bank-$(date +%F).db
```

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
