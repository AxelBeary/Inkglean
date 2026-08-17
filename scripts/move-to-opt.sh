#!/usr/bin/env bash
# ============================================
# 拾绘 Inkglean · 搬家脚本：把项目目录挪到 /opt/inkglean（Linux 服务器用）
# 用法：在项目目录里运行  bash scripts/move-to-opt.sh [目标目录]
#       默认目标 /opt/inkglean。加 --yes 跳过确认。
# 流程：搬家前备份 → 停容器 → 整目录搬走 → 改 crontab 路径 → 重启 → 等健康 → 体检
# 纪律：目标已存在即停（绝不覆盖）；任一步失败即停并说明现状
# ============================================
set -uo pipefail

# ── 关键：本脚本要搬的正是自己所在的目录。bash 是边读边执行，
#    先把整个脚本复制到 /tmp 再从副本运行，搬到一半才不会断。 ──
SELF_REAL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
SOURCE_DIR="$(cd "$(dirname "$SELF_REAL")/.." && pwd)"   # 脚本在 scripts/ 下，上一级=项目根
if [ "${MOVE_TO_OPT_REEXEC:-}" != "1" ]; then
  COPY="/tmp/move-to-opt.$$.sh"
  cp "$SELF_REAL" "$COPY"
  # 导出副本路径：重执行后 $$ 会变，结尾清理靠它才能删对文件
  export MOVE_TO_OPT_REEXEC=1 MOVE_SRC="$SOURCE_DIR" MOVE_COPY="$COPY"
  exec bash "$COPY" "$@"
fi

ok()   { echo "  ✓ $1"; }
warn() { echo "  ⚠ $1"; }
fail() { echo "  ✗ $1"; exit 1; }

SOURCE_DIR="${MOVE_SRC:-$SOURCE_DIR}"
TARGET_DIR="${1:-/opt/inkglean}"
AUTO_YES=0
for a in "$@"; do [ "$a" = "--yes" ] && AUTO_YES=1; done
# 若第一个参数是 --yes，目标取默认
[ "${1:-}" = "--yes" ] && TARGET_DIR=/opt/inkglean

echo "══ 拾绘 Inkglean · 搬家到 $TARGET_DIR ══"
echo "  来源：$SOURCE_DIR"
echo "  目标：$TARGET_DIR"

# ── 0) 前置检查 ──
[ "$(id -u)" = "0" ] || fail "请用 root 运行（需要写 /opt 和改 crontab）"
[ -d "$SOURCE_DIR" ] || fail "来源目录不存在：$SOURCE_DIR"
git -C "$SOURCE_DIR" rev-parse --git-dir >/dev/null 2>&1 || warn "来源不是 git 仓库（仍可搬，但之后无法一键更新）"
[ -e "$TARGET_DIR" ] && fail "目标已存在：$TARGET_DIR（为安全绝不覆盖，请先确认或换目标）"
command -v docker >/dev/null 2>&1 || fail "找不到 docker 命令"

if [ "$AUTO_YES" != "1" ]; then
  echo ""
  echo "  搬家会有约 1 分钟停机（停容器→搬→起）。数据会先备份。"
  read -r -p "  确认搬家？输入 yes 继续：" ans
  [ "$ans" = "yes" ] || { echo "  已取消。"; exit 0; }
fi

cd "$SOURCE_DIR" || fail "进不了来源目录"

# ── 1) 搬家前备份（容器在跑才做；VACUUM INTO 不停服安全） ──
mkdir -p data/backups
chown 1000:1000 data/backups 2>/dev/null || true
CID=$(docker compose ps -q web 2>/dev/null || true)
if [ -n "$CID" ] && docker inspect --format '{{.State.Running}}' "$CID" 2>/dev/null | grep -q true; then
  TS=$(date +%Y%m%d-%H%M%S)
  if docker compose exec -T -w /app/server web node -e "require('better-sqlite3')('/app/data/commission.db').prepare('VACUUM INTO ?').run('/app/data/commission.db.bak-pre-move-$TS')" >/dev/null 2>&1; then
    ok "搬家前备份完成（commission.db.bak-pre-move-$TS）"
  else
    warn "搬家前备份失败（不阻断；5 秒内 Ctrl+C 可取消）"
    sleep 5
  fi
fi

# ── 2) 停容器 ──
docker compose down || fail "停容器失败"
ok "容器已停止"

# ── 3) 搬目录 ──
mkdir -p "$(dirname "$TARGET_DIR")"
mv "$SOURCE_DIR" "$TARGET_DIR" || fail "搬目录失败（源/目标可能跨文件系统，请看报错）"
ok "目录已搬到 $TARGET_DIR"
cd "$TARGET_DIR" || fail "搬完进不了新目录"

# ── 4) 改 crontab 里的旧路径 ──
if crontab -l >/dev/null 2>&1; then
  crontab -l | sed "s#$SOURCE_DIR#$TARGET_DIR#g" | crontab - && ok "crontab 路径已更新" || warn "crontab 更新失败，请手动改"
else
  warn "当前无 crontab，跳过"
fi

# ── 5) 新位置重启 ──
docker compose up -d || fail "新位置启动失败"

# ── 6) 等 healthy（最多 150 秒） ──
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
  fail "容器未恢复健康（当前：$STATUS）。数据已备份在 $TARGET_DIR/data/，别慌，把上方日志发给我"
fi
ok "容器已健康"

# ── 7) 体检（容器内探测优先：默认 compose 不映射 3000 端口，宿主机 curl 会假警报） ──
HEALTH=$(docker compose exec -T web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(console.log).catch(()=>{})" 2>/dev/null || true)
[ -z "$HEALTH" ] && HEALTH=$(curl -s --max-time 10 http://localhost:3000/api/health 2>/dev/null || true)
echo "$HEALTH" | grep -q '"status":"ok"' && ok "健康检查通过" || warn "健康检查响应异常：$HEALTH（容器状态以上方 healthy 为准）"
DBVER=$(docker compose exec -T -w /app/server web node -e "console.log(require('better-sqlite3')('/app/data/commission.db').prepare('SELECT MAX(version) v FROM schema_migrations').get().v)" 2>/dev/null || echo "?")

echo ""
echo "══ 搬家完成 ══"
echo "  新家：$TARGET_DIR ｜ 数据库迁移：v$DBVER"
echo "  以后更新：cd $TARGET_DIR && bash scripts/update.sh"
echo "  旧位置 $SOURCE_DIR 已整个搬走，无残留。"
# 清理 /tmp 副本（用导出的路径，$$ 重执行后已变）
[ -n "${MOVE_COPY:-}" ] && rm -f "$MOVE_COPY" 2>/dev/null || true
