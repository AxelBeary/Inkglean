#!/bin/sh
# 启动服务（initDatabase 已在 app.js 中自动执行，无需重复调用）
exec node /app/server/src/index.js
