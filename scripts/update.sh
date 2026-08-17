#!/usr/bin/env bash
# ============================================
# 拾绘 Inkglean · 一键更新脚本（Linux 服务器用）
# 用法：在项目目录里运行  bash scripts/update.sh
# 流程：更新前备份 → 拉代码 → 写版本标记 → 重建容器 → 等健康 → 体检 → 汇报
# 纪律：备份失败给警告并留 5 秒取消窗口；任何一步失败即停并给回滚命令
# ============================================
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || { echo "✗ 无法定位项目根目录"; exit 1; }

ok()   { echo "  ✓ $1"; }
warn() { echo "  ⚠ $1"; }
fail() { echo "  ✗ $1"; exit 1; }

echo "══ 拾绘 Inkglean · 一键更新 ══"

# ── 0) 前置检查：git 仓库 + docker 可用 ──
git rev-parse --git-dir >/dev/null 2>&1 || fail "当前目录不是 git 仓库，无法用本脚本更新"
command -v docker >/dev/null 2>&1 || fail "找不到 docker 命令"
OLD_FULL=$(git rev-parse HEAD)
OLD_HEAD=$(git rev-parse --short HEAD)

CID=$(docker compose ps -q web 2>/dev/null || true)

# ── 1) 更新前备份（容器在跑才做；VACUUM INTO 不停服也安全） ──
# 注：-w /app/server 必须带——better-sqlite3 装在 /app/server/node_modules，默认工作目录 /app 找不到模块
mkdir -p data/backups
if [ -n "$CID" ] && docker inspect --format '{{.State.Running}}' "$CID" 2>/dev/null | grep -q true; then
  TS=$(date +%Y%m%d-%H%M%S)
  BACKUP_OUT=$(docker compose exec -T -w /app/server web node -e "require('better-sqlite3')('/app/data/commission.db').prepare('VACUUM INTO ?').run('/app/data/commission.db.bak-pre-update-$TS')" 2>&1)
  if [ $? -eq 0 ]; then
    ok "更新前备份完成（commission.db.bak-pre-update-$TS）"
    # 轮转：更新前备份只留最近 2 份
    docker compose exec -T web sh -c "ls -t /app/data/commission.db.bak-pre-update-* 2>/dev/null | tail -n +3 | xargs -r rm -f" >/dev/null 2>&1 || true
  else
    warn "备份失败：$(echo "$BACKUP_OUT" | head -1)（不阻断更新；如不放心，5 秒内 Ctrl+C 取消）"
    sleep 5
  fi
else
  warn "容器未在运行，跳过更新前备份"
fi

# ── 2) 拉取最新代码 ──
git pull --ff-only origin master || fail "拉取代码失败（检查服务器网络；如有本地改动请先处理）"
NEW_FULL=$(git rev-parse HEAD)
NEW_HEAD=$(git rev-parse --short HEAD)
if [ "$OLD_FULL" = "$NEW_FULL" ]; then
  echo "  已是最新（$NEW_HEAD）。5 秒后仍会重建容器（Ctrl+C 可取消）…"
  sleep 5
else
  ok "代码已更新：$OLD_HEAD → $NEW_HEAD"
fi

# ── 3) 写版本标记（管理后台「系统更新」面板据此显示当前版本） ──
mkdir -p data
printf '{"commit":"%s","deployedAt":"%s"}' "$NEW_FULL" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > data/version.json

# ── 4) 重建容器 ──
echo "  重建容器中（视网速约 1~3 分钟）…"
docker compose up -d --build || fail "容器重建失败，请查看上方报错"

# ── 5) 等待 healthy（最多 150 秒） ──
STATUS="missing"
for _ in $(seq 1 30); do
  CID=$(docker compose ps -q web 2>/dev/null || true)
  if [ -n "$CID" ]; then
    STATUS=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}nohealth{{end}}' "$CID" 2>/dev/null || echo "missing")
  fi
  [ "$STATUS" = "healthy" ] && break
  sleep 5
done
if [ "$STATUS" != "healthy" ]; then
  docker compose logs --tail 30 web
  fail "容器未恢复健康（当前：$STATUS）。上方为最近日志；回滚命令：git reset --hard $OLD_FULL && docker compose up -d --build"
fi
ok "容器已健康"

# ── 6) 体检：健康接口 + 迁移版本 ──
HEALTH=$(curl -s --max-time 10 http://localhost:3000/api/health 2>/dev/null || true)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  ok "健康检查通过"
else
  warn "健康检查响应异常：$HEALTH"
fi
DBVER=$(docker compose exec -T -w /app/server web node -e "console.log(require('better-sqlite3')('/app/data/commission.db').prepare('SELECT MAX(version) v FROM schema_migrations').get().v)" 2>/dev/null || echo "?")

echo ""
echo "══ 更新完成 ══"
echo "  版本：$OLD_HEAD → $NEW_HEAD ｜ 数据库迁移：v$DBVER"
echo "  请打开网站确认一切正常。"
echo "  如需回滚：git reset --hard $OLD_FULL && docker compose up -d --build"
