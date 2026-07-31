#!/bin/sh
# 启动服务（initDatabase 已在 app.js 中自动执行，无需重复调用）
# v0.21: tsx 运行时（支持 .ts/.js 混存，零配置）
exec npx tsx /app/server/src/index.js
