#!/bin/sh
# 初始化数据库（如果不存在）
cd /app/server
node src/db/init.js

# 启动服务
exec node src/index.js
