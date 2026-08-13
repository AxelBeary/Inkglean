# ============================================
# rollback.ps1 —— 发布失败回滚（P0-4，2026-08-13）
#
# 配合 post-merge-deploy.ps1 的 prev tag + 每日备份使用：
#   ① 解析上一版镜像 tag（deploy.log 的 PREV_TAG=，或现存 commission-web:prev-*）
#   ② 停 web → 用 restore-db.ts 恢复上一版 DB（自带 integrity+FK 校验与失败回滚）
#   ③ docker tag 切回 prev → force-recreate 重建 web 容器
#   ④ 健康检查 + 登录页冒烟
#   ⑤ 全程写 data/backups/rollback.log，摘要写 deploy.log
#
# 用法：
#   pwsh scripts/rollback.ps1
#   pwsh scripts/rollback.ps1 -PrevTag commission-web:prev-20260813-103000 -BackupFile C:\...\commission.db.bak-2026-...
#
# 依赖：宿主 node（>=22.6，推荐 >=23.6 可直接跑 restore-db.ts；本机实测 node 24 可用）
#       以及 server/ 依赖（better-sqlite3）。失败路径均给出下一步指引。
# ============================================
param(
  [string]$PrevTag,
  [string]$BackupFile
)
$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT
$LOG = Join-Path $ROOT 'data\backups\deploy.log'
$RBLOG = Join-Path $ROOT 'data\backups\rollback.log'
New-Item -ItemType Directory -Force -Path (Split-Path $LOG -Parent) | Out-Null

function Log($msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Write-Host $line
  Add-Content -Path $LOG -Value $line -Encoding utf8
}

function LogR($msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Write-Host $line
  Add-Content -Path $RBLOG -Value $line -Encoding utf8
}

LogR '=== rollback start ==='

# ─── ① 解析上一版镜像 tag ───
if (-not $PrevTag) {
  $lines = @(Get-Content -Path $LOG -Encoding utf8 -ErrorAction SilentlyContinue)
  $prevLine = $lines | Where-Object { $_ -match 'PREV_TAG=(commission-web:prev-[\w.-]+)' } | Select-Object -Last 1
  if ($prevLine) {
    $PrevTag = [regex]::Match($prevLine, 'PREV_TAG=(commission-web:prev-[\w.-]+)').Groups[1].Value
  }
}
if (-not $PrevTag) {
  # 兜底：取现存最新 prev tag（时间戳 yyyyMMdd-HHmmss 字典序=时间序）
  $existing = @(docker images --format '{{.Repository}}:{{.Tag}}' 2>$null | Where-Object { $_ -match '^commission-web:prev-' })
  if ($existing.Count -gt 0) {
    $PrevTag = $existing | Sort-Object | Select-Object -Last 1
  }
}
if (-not $PrevTag) {
  LogR 'FAIL: 未找到上一版镜像 tag。'
  LogR '  下一步：确认 deploy.log 里有 PREV_TAG= 记录；或人工执行：'
  LogR '    docker tag <上一版镜像ID> commission-web:prev-<时间戳>'
  LogR '    pwsh scripts/rollback.ps1 -PrevTag commission-web:prev-<时间戳>'
  exit 1
}
LogR "STEP1 上一版镜像: $PrevTag"
docker image inspect $PrevTag *> $null
if ($LASTEXITCODE -ne 0) {
  LogR "FAIL: 镜像 $PrevTag 不存在。"
  LogR '  下一步：从 docker images 中挑上一版镜像并 docker tag 到该名字后重试（见 deploy.log 的 PREV_TAG）。'
  exit 1
}

# ─── ② 定位上一版 DB 备份（与 restore-db.ts 的 pickLatestBackup 同规则：文件名序取最新） ───
$backup = $null
if ($BackupFile) {
  $backup = Get-Item -Path $BackupFile -ErrorAction SilentlyContinue
  if (-not $backup) { LogR "FAIL: 指定的备份文件不存在: $BackupFile"; exit 1 }
} else {
  $backup = Get-ChildItem -Path (Join-Path $ROOT 'data\backups') -Filter 'commission.db.bak-*' -File -ErrorAction SilentlyContinue |
    Sort-Object Name | Select-Object -Last 1
}
if (-not $backup) {
  LogR 'FAIL: data/backups 下没有 commission.db.bak-* 备份。'
  LogR '  下一步：先执行  daily-backup.bat  （或 pwsh scripts/post-merge-deploy.ps1 的备份步骤），再重试本脚本。'
  exit 1
}
LogR "STEP2 使用备份: $($backup.FullName)"

# ─── ③ 停 web，避免恢复期间业务进程写库 ───
$webRunning = docker inspect commission-web *> $null
if ($LASTEXITCODE -eq 0) {
  LogR 'STEP3 停止 web 容器 ...'
  docker compose stop web
  if ($LASTEXITCODE -ne 0) { LogR 'WARN: docker compose stop web 非零，继续（容器可能已停止）' }
} else {
  LogR 'STEP3 无运行中的 commission-web 容器，跳过 stop'
}

# ─── ④ 恢复上一版 DB（restore-db.ts 自带完整性校验；失败会回滚原库并退出 1） ───
LogR 'STEP4 恢复 DB（restore-db.ts）...'
$oldDbPath = $env:DB_PATH
$oldBackupDir = $env:BACKUP_DIR
try {
  $env:DB_PATH = Join-Path $ROOT 'data\commission.db'
  $env:BACKUP_DIR = Join-Path $ROOT 'data\backups'
  $restoreOut = & node (Join-Path $ROOT 'server\scripts\restore-db.ts') $backup.FullName 2>&1
  $restoreCode = $LASTEXITCODE
} finally {
  $env:DB_PATH = $oldDbPath
  $env:BACKUP_DIR = $oldBackupDir
}
$restoreText = ($restoreOut | Out-String).Trim()
if ($restoreCode -ne 0 -or $restoreText -notmatch 'RESTORE_OK') {
  LogR "FAIL: DB 恢复失败（exit=$restoreCode）：$restoreText"
  LogR '  下一步：'
  LogR '    1. 先验证备份完好： node scripts/verify-backup.mjs <备份文件>'
  LogR '    2. restore-db.ts 已把原库留为 data/commission.db.bak-pre-restore-*，可人工复核'
  LogR '    3. 确认备份损坏时不要切镜像，先补做可用备份；若宿主 node 版本过旧，可升级到 >=23.6 后重试'
  exit 1
}
LogR "STEP4 OK: RESTORE_OK $($backup.FullName)"

# ─── ⑤ 切回 prev tag 并重建容器 ───
LogR "STEP5 切换镜像 tag: $PrevTag -> commission-web:latest"
docker tag $PrevTag 'commission-web:latest'
if ($LASTEXITCODE -ne 0) {
  LogR "FAIL: docker tag 失败（$PrevTag -> latest）。下一步：确认镜像可访问后人工重试该命令。"
  exit 1
}
LogR 'STEP5 重建 web 容器（--no-build --force-recreate）...'
docker compose up -d --no-build --force-recreate web
if ($LASTEXITCODE -ne 0) {
  LogR 'FAIL: 容器重建失败。下一步：docker compose logs --tail 200 web 排查后重试；数据未动，可放心重跑本脚本。'
  exit 1
}

# ─── ⑥ 健康检查（最长 90s） ───
LogR 'STEP6 等待 healthy ...'
$ok = $false
for ($i = 0; $i -lt 18; $i++) {
  Start-Sleep 5
  $status = docker inspect --format '{{.State.Health.Status}}' commission-web 2>$null
  if ($status -eq 'healthy') { $ok = $true; break }
}
if (-not $ok) {
  LogR 'FAIL: 回滚后容器仍未 healthy。下一步：docker compose logs --tail 200 web；'
  LogR '  若 DB 与镜像均已确认，可重跑 pwsh scripts/rollback.ps1（幂等）。'
  exit 1
}
LogR 'STEP6 OK: commission-web healthy'

# ─── ⑦ 登录页冒烟 ───
$code = curl.exe -k -s -o NUL -w '%{http_code}' --max-time 30 'https://localhost/login'
if ($code -eq '200') {
  LogR "STEP7 OK: 登录页冒烟 HTTP $code"
} else {
  LogR "FAIL: 登录页冒烟 HTTP $code。下一步：docker compose ps 确认 caddy/web 状态；重跑本脚本可幂等重试。"
  exit 1
}

LogR "ROLLBACK_DONE tag=$PrevTag backup=$($backup.Name)"
Log "ROLLBACK_DONE tag=$PrevTag backup=$($backup.Name)"
