#!/usr/bin/env bash
# ============================================
# 拾绘 Inkglean · 服务器每日备份（Linux，配合 crontab 使用）
# 备份内容：数据库（VACUUM INTO 安全快照，留 7 份）+ uploads 目录（tar.gz，留 2 份）
# crontab 示例（每天 03:30）：
#   30 3 * * * /root/inkglean-git/scripts/server-backup.sh >> /root/inkglean-git/data/backups/cron.log 2>&1
# ============================================
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || { echo "无法定位项目根目录"; exit 1; }

TS=$(date +%Y%m%d-%H%M%S)
BK=data/backups
mkdir -p "$BK"

CID=$(docker compose ps -q web 2>/dev/null || true)
if [ -z "$CID" ] || ! docker inspect --format '{{.State.Running}}' "$CID" 2>/dev/null | grep -q true; then
  echo "[$TS] FAIL 容器未在运行，跳过本次备份"
  exit 1
fi

# 1) 数据库：VACUUM INTO 一致性快照（不停服安全；产物经 bind mount 落在宿主机 data/backups/）
if docker compose exec -T web node -e "require('better-sqlite3')('/app/data/commission.db').prepare('VACUUM INTO ?').run('/app/data/backups/commission.db.bak-daily-$TS')"; then
  echo "[$TS] OK DB 备份：commission.db.bak-daily-$TS"
else
  echo "[$TS] FAIL DB 备份失败"
  exit 1
fi
# 轮转：每日档留 7 份
ls -t "$BK"/commission.db.bak-daily-* 2>/dev/null | tail -n +8 | xargs -r rm -f

# 2) uploads 目录（留 2 份；失败不视为致命，DB 已保住）
if tar -czf "$BK/uploads-$TS.tar.gz" uploads 2>/dev/null; then
  echo "[$TS] OK uploads 备份：uploads-$TS.tar.gz"
  ls -t "$BK"/uploads-*.tar.gz 2>/dev/null | tail -n +3 | xargs -r rm -f
else
  echo "[$TS] WARN uploads 备份失败（DB 已保住，uploads 请人工查看）"
fi
