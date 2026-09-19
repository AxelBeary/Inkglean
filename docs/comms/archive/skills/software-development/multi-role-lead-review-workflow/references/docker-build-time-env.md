# Docker 构建时环境变量注入（Vite VITE_* / 前端密钥）

## 问题

Vite 把 `import.meta.env.VITE_*` 变量在 **`npm run build` 时焊死进 JS bundle**，不是运行时读取。
Docker 多阶段构建里，前端 build 阶段（`frontend-build`）看不到宿主机的 `.env`，`docker-compose.yml` 的
`env_file` 只作用于**运行时容器**，对 build 阶段无效。

所以：后端密钥（运行时读 `process.env.X`）填 `.env` 即可；**前端密钥必须经 `ARG` 在构建时传入**。

典型触发：前端 Sentry DSN（`VITE_SENTRY_DSN`）、前端 API base、任何 `VITE_*` 配置。

## 修法（三处联动）

**1. Dockerfile — build 阶段加 ARG + ENV（必须在 `RUN npm run build` 之前）**

```dockerfile
FROM node:22-slim AS frontend-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
# 构建时注入，留空=禁用（前端代码应判空跳过）
ARG VITE_SENTRY_DSN=
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build
```

`ARG` 单独不够——Vite 读的是进程环境变量，必须 `ENV` 把 ARG 值转成环境变量再 build。

**2. docker-compose.yml — build.args 从宿主 .env 插值**

```yaml
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        VITE_SENTRY_DSN: ${VITE_SENTRY_DSN:-}   # :- 留空兜底，未设不报错
```

**3. `.env` — 用户填值（不入版本库）**

```
VITE_SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/zzz
```

## 验证

```powershell
# 语法检查
cmd.exe /c "docker compose config --quiet"; echo "EXIT: $LASTEXITCODE"   # 0=通过
# 重建（build 阶段会重新跑，注入新 ARG）
cmd.exe /c "docker compose up -d --build 2>&1" | Select-Object -Last 5   # 看到 Healthy
# 健康检查
cmd.exe /c "docker exec commission-web node -e ""fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(d=>console.log(d.status))"""
```

## 陷阱

- **改了 ARG 值必须 `--build` 重建**，`docker compose restart` 不会重跑 build 阶段，旧 bundle 残留。
- **Docker 层缓存**：若 `COPY web/ ./` 之前的层没变，`RUN npm run build` 可能命中缓存不重跑。
  改 ARG 会破坏该层缓存（ARG 值变了），通常会自动重建；若怀疑残留，`docker compose build --no-cache`。
- **前端代码必须判空**：`if (import.meta.env.VITE_SENTRY_DSN) { init(...) }`，留空时完全不初始化、零网络请求。
- **密钥别贴聊天**：用户给 DSN 时让 ta 直接填 `.env`，不复制到对话（留痕）。一号只加占位行，不碰值。
- 这是「开关式设计」的部署侧体现：DSN 空=功能完全禁用，符合用户「不侵入、可一键关」的底线。
