#!/bin/sh
# ============================================
# patrol.sh —— 服务器每日巡检（纯脚本，零 AI，供 cron 调用）
# 部署到海外服务器后：crontab 加一行
#   30 3 * * * /opt/inkglean/server/scripts/patrol.sh >> /opt/inkglean/data/backups/patrol.log 2>&1
# 检查六件事：容器健康 / 备份新鲜度 / 磁盘余量 / 登录页可达 / uploads 目录存在性 / 迁移自动备份计数
# 任何一项异常写 PATROL_ALERT 行（将来接通知渠道时 grep 这一行即可）
# ============================================
cd "$(dirname "$0")/../.." || exit 1
STAMP=$(date '+%F %T')
ALERT=0

# 1. 容器健康
STATUS=$(docker inspect --format '{{.State.Health.Status}}' commission-web 2>/dev/null)
if [ "$STATUS" != "healthy" ]; then
  echo "$STAMP PATROL_ALERT container: commission-web=$STATUS"
  ALERT=1
else
  echo "$STAMP OK container: healthy"
fi

# 2. 备份新鲜度：最新 DB 备份必须是 36 小时内
NEWEST=$(ls -t data/backups/commission.db.bak-* 2>/dev/null | head -n 1)
if [ -z "$NEWEST" ]; then
  echo "$STAMP PATROL_ALERT backup: 没有任何 DB 备份"
  ALERT=1
else
  AGE_H=$(( ($(date +%s) - $(date -r "$NEWEST" +%s)) / 3600 ))
  if [ "$AGE_H" -gt 36 ]; then
    echo "$STAMP PATROL_ALERT backup: 最新备份已 ${AGE_H}h 未更新 ($NEWEST)"
    ALERT=1
  else
    echo "$STAMP OK backup: ${NEWEST} (${AGE_H}h)"
  fi
fi

# 3. 磁盘余量：<15% 告警
USE=$(df -P . | awk 'NR==2 {gsub("%","",$5); print $5}')
if [ "$USE" -gt 85 ]; then
  echo "$STAMP PATROL_ALERT disk: 使用率 ${USE}%"
  ALERT=1
else
  echo "$STAMP OK disk: ${USE}%"
fi

# 4. 登录页可达（容器内环回，不依赖证书/域名）
if docker compose exec -T web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
  echo "$STAMP OK health: /api/health 200"
else
  echo "$STAMP PATROL_ALERT health: /api/health 不可达"
  ALERT=1
fi

# 5. uploads 目录存在性（uploads 与 DB 同为完整备份的必要一半，目录缺失即告警）
if [ ! -d "uploads" ]; then
  echo "$STAMP PATROL_ALERT uploads: uploads 目录不存在"
  ALERT=1
else
  echo "$STAMP OK uploads: 目录存在"
fi

# 6. 迁移自动备份计数（data/commission.db.bak.vN 无清理机制，随迁移数增长；当前约 16 份）
VBAK_COUNT=$(find data -maxdepth 1 -name 'commission.db.bak.v*' 2>/dev/null | wc -l)
if [ "$VBAK_COUNT" -gt 24 ]; then
  echo "$STAMP PATROL_ALERT bakv: 迁移自动备份已积压 ${VBAK_COUNT} 份（>24），建议人工归档/清理"
  ALERT=1
else
  echo "$STAMP OK bakv: ${VBAK_COUNT} 份迁移自动备份"
fi

[ "$ALERT" -eq 0 ] && echo "$STAMP PATROL_ALL_OK"
exit $ALERT
