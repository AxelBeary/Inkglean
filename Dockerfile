# ============================================
# 多阶段构建：减小最终镜像体积
# ============================================

# ─── Stage 1: 构建前端 ───
FROM node:22-slim AS frontend-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
# v0.21: 前端 Sentry DSN（构建时注入，留空=禁用）
ARG VITE_SENTRY_DSN=
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build

# ─── Stage 2: 生产运行 ───
FROM node:22-slim
WORKDIR /app

# 后端依赖（仅 production）
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# CVE 修复：升级 npm 工具链（消除 tar/brace-expansion/picomatch/sigstore 已知漏洞）
RUN npm install -g npm@latest

# 后端源码
COPY server/ ./server/

# 前端构建产物
COPY --from=frontend-build /app/web/dist ./web/dist

# 启动脚本
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 安全加固批 F6: 非 root 运行——node:22-slim 默认 uid 0，若应用/依赖出现 RCE 即容器内 root。
# 数据卷（SQLite DB + 上传目录）显式 chown 给 node 用户，保证可写。
RUN mkdir -p /app/data /app/uploads && chown -R node:node /app/data /app/uploads

EXPOSE 3000
USER node
ENTRYPOINT ["/entrypoint.sh"]
