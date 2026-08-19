#!/bin/sh
# 启动服务（initDatabase 已在 app.js 中自动执行，无需重复调用）
# v0.21: tsx 运行时（支持 .ts/.js 混存，零配置）
# 安全加固批 F6: cd 到 server 再 npx——npx 从 cwd 向上找 node_modules/.bin，
# 从 /app 起跑会找不到 /app/server/node_modules 的 tsx 而在线下载（无网络/慢环境卡启动）
cd /app/server
# R-6（审计批E）：DB 损坏自愈——起服前探测可打开性 + integrity_check。
# 背景：initDatabase 抛错 → 进程退出 → restart: unless-stopped 崩溃循环，Caddy 的
# depends_on service_healthy 永远等不到健康实例，全站宕机。探测失败 → 用 restore-db.ts
# 自动恢复最近备份；恢复失败才退出（宁可退出告警，也不带坏库继续跑）。
# 仅当 DB 文件存在时探测：全新部署无文件 = 首启建库（initDatabase 负责），
# 避免无备份可恢复时误退出。check-db.ts 抽为独立脚本以便单测（替代内联 node -e）。
if [ -n "$DB_PATH" ] && [ -f "$DB_PATH" ]; then
  if ! npx tsx scripts/check-db.ts; then
    echo "SELF-HEAL: 数据库损坏或不可打开（$DB_PATH），尝试从最近备份恢复..." >&2
    if ! npx tsx scripts/restore-db.ts; then
      echo "SELF-HEAL: 备份恢复失败，启动中止（避免 DB 损坏下崩溃循环）" >&2
      exit 1
    fi
    echo "SELF-HEAL: 已从备份恢复，继续启动"
  fi
fi
# TS 迁移后入口已改名 index.ts（tsx 支持 .ts 直跑；显式写扩展名避免依赖隐式解析）
exec npx tsx src/index.ts
