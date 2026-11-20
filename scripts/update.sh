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
# 属主必须是容器运行用户（uid 1000）：root 建的目录容器内 node 用户写不进（每日备份会遭 SQLITE_CANTOPEN）
chown 1000:1000 data/backups 2>/dev/null || true
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
# 先 fetch 再快进合并：fetch 失败只可能是连不上远端，合并失败则只可能是本地改动挡住或历史分叉
FETCH_OUT=$(git fetch origin --prune 2>&1)
if [ $? -ne 0 ]; then
  echo "$FETCH_OUT" | sed 's/^/     /'
  fail "连不上远端仓库（网络 / 代理 / 凭据问题，与本地改动无关）；修好后重跑本脚本即可"
fi

# 远端是否改写过历史：fetch 当场报了 forced update，或上一次记录的 origin/master 已不是新历史的祖先
# （后一条是为「上次 pull 已经把 forced update 拉下来、这次 fetch 无事可报」的情况兜底）
REMOTE_OLD=$(git rev-parse -q --verify 'origin/master@{1}' 2>/dev/null || true)
REWRITTEN=no
if echo "$FETCH_OUT" | grep -qF '(forced update)'; then REWRITTEN=yes; fi
if [ "$REWRITTEN" = no ] && [ -n "$REMOTE_OLD" ] && [ "$REMOTE_OLD" != "$(git rev-parse origin/master)" ]; then
  if ! git merge-base --is-ancestor "$REMOTE_OLD" origin/master 2>/dev/null; then REWRITTEN=yes; fi
fi

if git merge-base --is-ancestor HEAD origin/master 2>/dev/null; then
  if ! MERGE_OUT=$(git merge --ff-only origin/master 2>&1); then
    echo "$MERGE_OUT" | sed 's/^/     /'
    case "$MERGE_OUT" in
      *"would be overwritten"*|*"commit your changes or stash"*)
        fail "本地未提交改动挡住了本次更新：先 git stash（或 git diff > ~/inkglean-local.patch）再重跑" ;;
      *)
        fail "快进合并失败；本机未做改动，请把上面的输出贴给维护者" ;;
    esac
  fi
else
  LOCAL_ONLY=$(git rev-list --count origin/master..HEAD 2>/dev/null || echo "?")
  REMOTE_ONLY=$(git rev-list --count HEAD..origin/master 2>/dev/null || echo "?")
  BASE=$(git merge-base HEAD origin/master 2>/dev/null || true)
  BTS=$(date +%Y%m%d-%H%M%S)
  echo ""
  echo "  ⚠ 本地与远端 master 已分叉，无法快进：本地独有 $LOCAL_ONLY 个提交，远端独有 $REMOTE_ONLY 个提交"
  if [ -n "$BASE" ]; then echo "    分叉点：$(git log --oneline -1 "$BASE")"; fi
  DIRTY=$(git status --porcelain --untracked-files=no)
  if [ -n "$DIRTY" ]; then
    echo "$DIRTY" | sed 's/^/     /'
    echo "    ⚠ 上面是未提交改动，git reset --hard 会丢掉它们：先 git stash 或 git diff > ~/inkglean-local.patch"
  fi
  echo ""
  if [ "$REWRITTEN" = yes ]; then
    echo "  ⚠ 判断：远端 master 的历史被改写过（force-push / rebase / filter-repo 一类）。"
    echo "    这不是服务器网络问题，也不是你在服务器上改出来的，是上游重写了提交历史。"
    echo ""
    echo "  本机只是部署、没有自己的提交时，按这三条对齐后重跑："
    echo ""
    echo "      cd $(pwd)"
    echo "      git branch \"backup/pre-rewrite-$BTS\"   # 旧历史先留个指针，提交不会丢"
    echo "      git reset --hard origin/master           # 对齐到远端新历史"
    echo "      bash scripts/update.sh                   # 重跑（会重新备份数据库、重建容器）"
    echo ""
    echo "  拿不准本地有没有自己的提交，先看：git log --oneline origin/master..HEAD | head -20"
    echo "    · 全是上游作者的旧提交 → 直接按上面三条走"
    echo "    · 混有运维/你改的提交 → 对齐后 git cherry-pick <提交号> 搬回来，再重跑"
  else
    echo "  ⚠ 判断：本地有远端没有的提交（多半是在服务器上直接改过代码），或远端分支被重置过。"
    echo ""
    echo "      cd $(pwd)"
    echo "      git log --oneline origin/master..HEAD    # 先看这些提交是什么"
    echo "      git branch \"backup/pre-rewrite-$BTS\"   # 保底"
    echo "      git reset --hard origin/master           # 对齐（提交都还在备份分支里）"
    echo "      git cherry-pick <要保留的提交号>          # 需要保留的再搬回来"
    echo "      bash scripts/update.sh"
  fi
  echo ""
  echo "  随时可回滚：git reset --hard backup/pre-rewrite-$BTS"
  fail "已停止：代码未改动、容器未重建、数据库未动"
fi
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

# ── 6) 体检：健康接口 + 迁移版本（容器内探测优先：默认 compose 不映射 3000 端口，宿主机 curl 会假警报） ──
HEALTH=$(docker compose exec -T web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(console.log).catch(()=>{})" 2>/dev/null || true)
[ -z "$HEALTH" ] && HEALTH=$(curl -s --max-time 10 http://localhost:3000/api/health 2>/dev/null || true)
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
