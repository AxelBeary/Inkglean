#!/bin/sh
# 初始化数据库（如果不存在）
node /app/server/src/db/init.js

# 启动服务
exec node /app/server/src/index.js
