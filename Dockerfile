FROM node:22-slim

WORKDIR /app

# 安装后端依赖（better-sqlite3 在 Debian/glibc 上有预编译二进制，无需编译工具）
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# 安装前端依赖并构建
COPY web/package.json web/package-lock.json* ./web/
RUN cd web && npm install
COPY web/ ./web/
RUN cd web && npm run build

# 复制后端源码
COPY server/ ./server/

# 复制启动脚本
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
