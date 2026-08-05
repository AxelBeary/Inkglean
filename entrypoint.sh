#!/bin/sh
# 启动服务（initDatabase 已在 app.js 中自动执行，无需重复调用）
# v0.21: tsx 运行时（支持 .ts/.js 混存，零配置）
# 安全加固批 F6: cd 到 server 再 npx——npx 从 cwd 向上找 node_modules/.bin，
# 从 /app 起跑会找不到 /app/server/node_modules 的 tsx 而在线下载（无网络/慢环境卡启动）
cd /app/server
exec npx tsx src/index.js
