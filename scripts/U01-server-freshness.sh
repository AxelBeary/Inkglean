#!/usr/bin/env bash
# ============================================================
# U01-server-freshness.sh ｜ 备份新鲜度看门狗 · 服务器侧读数器
# 单元号 C-T08-04 ｜ 批次 toolshop-2026-09-29 ｜ 交付给 artist-commission 项目组
#
# 干什么：在服务器（Linux 生产机）上把 data/backups 里的备份产物扫一遍，
#         用 JSON 打到 stdout。**只读**：不写文件、不删档、不起停容器、不联网、不 ssh。
#         和 server/scripts/patrol.sh 同口径（只认官方 ISO 命名、阈值默认 36h），
#         但额外把「有档 / 档名恢复端认不认」分开报——防 F-16 那种半静默假绿。
#
# 交负责人自己敲（本工具永不代替你连服务器）：
#   cd /opt/inkglean                                  # 换成实际项目目录
#   sh scripts/U01-server-freshness.sh > /tmp/U01-server-freshness.json
#   cat /tmp/U01-server-freshness.json                # 顺手看一眼，里面没有 IP/账号/密钥
# 然后把这页 JSON 拷回本机（U 盘、复制粘贴、任何方式都行），存成文件，
# 在本机用看门狗读它：
#   node U01-backup-freshness.mjs --server-json <本机存放路径>
#
# 用法: sh U01-server-freshness.sh [--dir <备份目录>] [--max-age-hours 36] [--quiet]
# 退出码: 0=新鲜  1=断档(超阈值/无档)  2=WARN(读数不足、命名不合规等判据不清)
# ============================================================
set -u

BK=""
MAX_H=36
QUIET=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) BK="${2:-}"; shift 2 ;;
    --max-age-hours) MAX_H="${2:-36}"; shift 2 ;;
    --quiet) QUIET=1; shift ;;
    -h|--help) echo "用法: sh U01-server-freshness.sh [--dir <备份目录>] [--max-age-hours 36] [--quiet]"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 3 ;;
  esac
done

# 定位仓库根（脚本放 <repo>/scripts/ 下时可自动定位）
if [ -z "$BK" ]; then
  SELF=$(cd "$(dirname "$0")" && pwd)
  ROOT=$(cd "$SELF/.." && pwd)
  BK="$ROOT/data/backups"
fi
NOW=$(date +%s)
COLLECTED=$(date '+%Y-%m-%dT%H:%M:%S%z')

jesc() { printf '%s' "$1" | tr -d '\r\n' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | cut -c1-200; }

# 官方 ISO 命名档（每日/每周/部署/uploads 通用）名内时间戳 → epoch（UTC）
epoch_iso() {
  _n=$1
  _ts=$(printf '%s' "$_n" | sed -n 's/.*\([0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]\)T\([0-9][0-9]\)-\([0-9][0-9]\)-\([0-9][0-9]\).*/\1 \2:\3:\4/p')
  [ -z "$_ts" ] && { echo ""; return; }
  date -u -d "$_ts" +%s 2>/dev/null || echo ""
}
# server-backup.sh 旧命名 bak-daily-YYYYMMDD-HHMMSS → epoch（服务器本地时区）
epoch_legacy() {
  _n=$1
  _ts=$(printf '%s' "$_n" | sed -n 's/.*bak-daily-\([0-9][0-9][0-9][0-9]\)\([0-9][0-9]\)\([0-9][0-9]\)-\([0-9][0-9]\)\([0-9][0-9]\)\([0-9][0-9]\).*/\1-\2-\3 \4:\5:\6/p')
  [ -z "$_ts" ] && { echo ""; return; }
  date -d "$_ts" +%s 2>/dev/null || echo ""
}
fsize() { ls -l -- "$1" 2>/dev/null | awk '{print $5}'; }

BEST_OFF_E=""; BEST_OFF_N=""; BEST_OFF_B=""
BEST_UP_E=""; BEST_UP_N=""; BEST_UP_B=""
BESTLEG_E=""; BESTLEG_N=""; BESTLEG_B=""
N_OFF=0; N_UP=0; N_LEG=0; N_WEEK=0; N_DEPLOY=0; N_OTHER=0; N_LOG=0
ALERTS=""
add_alert() { if [ -z "$ALERTS" ]; then ALERTS="$1"; else ALERTS="$ALERTS,$1"; fi; }

if [ ! -d "$BK" ]; then
  echo "{\"collector\":\"U01-server-freshness.sh\",\"version\":1,\"collected_at\":\"$(jesc "$COLLECTED")\",\"epoch_now\":$NOW,\"dir\":\"$(jesc "$BK")\",\"error\":\"dir_missing\",\"counts\":{},\"alerts\":[\"备份目录不存在: $(jesc "$BK")\"]}"
  exit 1
fi

for f in "$BK"/*; do
  [ -f "$f" ] || continue
  n=$(basename "$f")
  case "$n" in
    commission.db.bak-weekly-????-??-??T??-??-??-???Z) N_WEEK=$((N_WEEK+1)); continue ;;
    commission.db.bak-deploy-????-??-??T??-??-??-???Z) N_DEPLOY=$((N_DEPLOY+1)); continue ;;
    commission.db.bak-daily-*)
      e=$(epoch_legacy "$n")
      N_LEG=$((N_LEG+1))
      if [ -n "$e" ] && { [ -z "$BESTLEG_E" ] || [ "$e" -gt "$BESTLEG_E" ]; }; then BESTLEG_E=$e; BESTLEG_N=$n; BESTLEG_B=$(fsize "$f"); fi
      continue ;;
    commission.db.bak-????-??-??T??-??-??-???Z)
      e=$(epoch_iso "$n")
      N_OFF=$((N_OFF+1))
      if [ -n "$e" ] && { [ -z "$BEST_OFF_E" ] || [ "$e" -gt "$BEST_OFF_E" ]; }; then BEST_OFF_E=$e; BEST_OFF_N=$n; BEST_OFF_B=$(fsize "$f"); fi
      continue ;;
    uploads-????-??-??T??-??-??-???Z.tar.gz)
      e=$(epoch_iso "$n")
      N_UP=$((N_UP+1))
      if [ -n "$e" ] && { [ -z "$BEST_UP_E" ] || [ "$e" -gt "$BEST_UP_E" ]; }; then BEST_UP_E=$e; BEST_UP_N=$n; BEST_UP_B=$(fsize "$f"); fi
      continue ;;
    *.log|*.txt) N_LOG=$((N_LOG+1)); continue ;;
    *) N_OTHER=$((N_OTHER+1)); continue ;;
  esac
done

# cron.log / patrol.log 尾部标记（有就报，没有就算了，不猜）
CRON_PATH="$BK/cron.log"; CRON_LINES=0; CRON_LAST_FAIL=""
if [ -f "$CRON_PATH" ]; then
  CRON_LINES=$(wc -l < "$CRON_PATH" | tr -d ' ')
  CRON_LAST_FAIL=$(grep -E 'FAIL|错误|No such|refused' "$CRON_PATH" 2>/dev/null | tail -n 1)
fi
PATROL_PATH="$BK/patrol.log"; PATROL_LAST=""
if [ -f "$PATROL_PATH" ]; then
  PATROL_LAST=$(grep -E 'PATROL_(ALL_OK|_ALERT)' "$PATROL_PATH" 2>/dev/null | tail -n 1)
fi

# 容器状态（best-effort，只取 running 布尔，不取任何地址/端口/账号）
CID=$(docker inspect --format '{{.State.Running}}' commission-web 2>/dev/null)
[ -z "${CID:-}" ] && CID="unknown"
UPDIR=no; [ -d "$(cd "$BK/.." && pwd)/uploads" ] && UPDIR=yes

# 判读
VERDICT=0
note_off=""
if [ -z "$BEST_OFF_E" ]; then
  VERDICT=1; add_alert '"服务器没有任何官方 ISO 命名的每日档（恢复端只认这个名）"'
  note_off="none"
else
  AGE_H=$(( (NOW - BEST_OFF_E) / 3600 ))
  note_off="${AGE_H}h"
  if [ "$AGE_H" -gt "$MAX_H" ]; then VERDICT=1; add_alert "\"服务器最新合规每日档已 ${AGE_H}h 未更新（阈值 ${MAX_H}h）\""; fi
fi
if [ -n "$BESTLEG_E" ]; then
  LEG_AGE_H=$(( (NOW - BESTLEG_E) / 3600 ))
  if [ "$VERDICT" -eq 0 ]; then VERDICT=2; fi
  add_alert "\"服务器有 ${N_LEG} 份 server-backup.sh 旧命名档（bak-daily-*），restore-db.ts / verify-backup.mjs / patrol.sh 都不认，最新一份 ${LEG_AGE_H}h 前——有档不等于能恢复（F-16）\""
fi
if [ -z "$BEST_UP_E" ]; then
  if [ "$VERDICT" -lt 1 ]; then VERDICT=1; fi
  add_alert '"服务器没有 uploads 归档，出事只能恢复数据库"'
fi
if [ "$CID" = "unknown" ]; then
  if [ "$VERDICT" -eq 0 ]; then VERDICT=2; fi
  add_alert '"docker 查询不可用（未装或当前用户无权限），容器是否在跑无法判定——patrol.sh 第 1 项同款坑：cron 用户没进 docker 组会假红"'
fi
if [ "$UPDIR" = "no" ]; then
  if [ "$VERDICT" -eq 0 ]; then VERDICT=2; fi
  add_alert '"uploads 目录不存在（patrol.sh 第 5 项口径）"'
fi

json_of() { # $1=name $2=epoch $3=bytes —— 空名则输出 null
  if [ -z "$1" ]; then echo "null"; else
    printf '{"name":"%s","epoch":%s,"bytes":%s,"age_hours":%s}' "$(jesc "$1")" "${2:-0}" "${3:-0}" "$(( (NOW-${2:-$NOW})/3600 ))"
  fi
}
OFF_JSON=$(json_of "$BEST_OFF_N" "$BEST_OFF_E" "$BEST_OFF_B")
UP_JSON=$(json_of "$BEST_UP_N" "$BEST_UP_E" "$BEST_UP_B")
LEG_JSON=$(json_of "$BESTLEG_N" "$BESTLEG_E" "$BESTLEG_B")

ALERT_BODY="$ALERTS"

printf '{"collector":"U01-server-freshness.sh","version":1,"collected_at":"%s","collected_at_epoch":%s,"epoch_now":%s,"dir":"%s",' "$COLLECTED" "$(date -d "$COLLECTED" +%s 2>/dev/null || echo $NOW)" "$NOW" "$(jesc "$BK")"
printf '"threshold_hours":%s,"container":{"running":"%s"},"uploads_dir_exists":"%s",' "$MAX_H" "$CID" "$UPDIR"
printf '"counts":{"official":%s,"nonconform":%s,"uploads":%s,"weekly":%s,"deploy":%s,"log_or_txt":%s,"other":%s},' "$N_OFF" "$N_LEG" "$N_UP" "$N_WEEK" "$N_DEPLOY" "$N_LOG" "$N_OTHER"
printf '"official_newest":%s,"nonconform_newest":%s,"uploads_newest":%s,' "$OFF_JSON" "$LEG_JSON" "$UP_JSON"
printf '"cron_log":{"path":"%s","lines":%s,"last_fail_line":"%s"},' "$(jesc "$CRON_PATH")" "$CRON_LINES" "$(jesc "$CRON_LAST_FAIL")"
printf '"patrol_last_line":"%s",' "$(jesc "$PATROL_LAST")"
printf '"verdict_code":%s,"alerts":[%s]}\n' "$VERDICT" "$ALERT_BODY"

if [ "$QUIET" -eq 0 ]; then
  {
    echo "--- 人话一行 ---"
    echo "最新合规每日档: ${BEST_OFF_N:-（无）}  年龄: ${note_off}"
    echo "旧命名档（恢复端不认）: ${N_LEG} 份${BESTLEG_N:+  最新 $BESTLEG_N}"
    echo "uploads 档: ${BEST_UP_N:-（无）}"
    echo "告警: ${ALERTS:-无}"
    echo "退出码: $VERDICT (0=新鲜 1=断档 2=WARN)"
  } >&2
fi
exit "$VERDICT"
