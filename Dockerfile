# ============================================
# 多阶段构建：减小最终镜像体积
# ============================================

# ─── Stage 1: 构建前端 ───
FROM node:22-slim AS frontend-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
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

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
