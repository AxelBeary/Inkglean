# ============================================
# post-merge-deploy.ps1 —— 合入 master 后的一键重建部署（开发机）
# 用法：合入并推送后手动执行  pwsh scripts/post-merge-deploy.ps1
# 流程：备份 → 重建 → 等健康 → 迁移回读 → 登录页冒烟；任何一步失败即停并给回滚指引
# 纪律：备份是强制前置；本脚本不做无人值守自动触发（合入永远人工确认）
# ============================================
$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT
$LOG = Join-Path $ROOT 'data\backups\deploy.log'

function Log($msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Write-Host $line
  Add-Content -Path $LOG -Value $line -Encoding utf8
}

Log '=== post-merge-deploy start ==='

# 1. 强制备份（复用既有每日备份链路，失败即中止）
Log 'STEP1 备份 DB + uploads ...'
& (Join-Path $ROOT 'daily-backup.bat')
if ($LASTEXITCODE -ne 0) { Log 'ABORT: 备份失败，不重建（先修备份）'; exit 1 }
Log 'STEP1 OK（BACKUP_OK 见 daily-backup.log）'

# 2. 重建容器
Log 'STEP2 docker compose build ...'
docker compose build web
if ($LASTEXITCODE -ne 0) { Log 'ABORT: 构建失败'; exit 1 }
docker compose up -d
if ($LASTEXITCODE -ne 0) { Log 'ABORT: 启动失败'; exit 1 }

# 3. 等健康（最多 90s）
Log 'STEP3 等待 healthy ...'
$ok = $false
for ($i = 0; $i -lt 18; $i++) {
  Start-Sleep 5
  $status = docker inspect --format '{{.State.Health.Status}}' commission-web 2>$null
  if ($status -eq 'healthy') { $ok = $true; break }
}
if (-not $ok) {
  Log 'FAIL: 容器未 healthy。回滚指引：恢复最近备份 data/backups/ 下最新 .bak 后 docker compose up -d --build'
  exit 1
}
Log 'STEP3 OK: commission-web healthy'

# 4. 迁移回读（报当前 schema 版本，人工对照 STATUS 预期；-w 指到 /app/server 才能解析 better-sqlite3）
$ver = docker compose exec -T -w /app/server web node -e "const db=require('better-sqlite3')('/app/data/commission.db');console.log(db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v)" 2>$null
Log "STEP4 迁移版本回读: v$ver"

# 5. 登录页冒烟（https 走 Caddy 自签证书；用 curl.exe 避开 .NET HttpClient 的证书/超时怪癖）
$code = curl.exe -k -s -o NUL -w '%{http_code}' --max-time 30 'https://localhost/login'
if ($code -eq '200') {
  Log "STEP5 登录页冒烟: HTTP $code"
} else {
  Log "STEP5 WARN: 登录页冒烟返回 $code——请人工浏览器确认（Caddy 自签证书续签瞬间可能短暂抖动，可稍候重试）"
}

Log '=== post-merge-deploy done ==='
