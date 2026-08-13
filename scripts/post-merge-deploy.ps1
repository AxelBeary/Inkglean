# ============================================
# post-merge-deploy.ps1 —— 合入 master 后的一键重建部署（开发机）
# 用法：合入并推送后手动执行  pwsh scripts/post-merge-deploy.ps1
#      紧急场景可加 -Force 绕过发布门禁（会记录 WARN）
#      未跑/未过 accept 时可加 -SkipAccept 跳过 accept 报告联动（会记录 WARN）
# 流程：门禁+accept 联动 → 备份+VERIFY → prev tag → 重建 → 等健康 → 迁移回读断言 → 冒烟清单
# 纪律：备份是强制前置；任一 FAIL 即停；回滚统一走 scripts/rollback.ps1
# ============================================
param(
  [switch]$Force,
  [switch]$SkipAccept
)
$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT
$LOG = Join-Path $ROOT 'data\backups\deploy.log'
$ALERT_DIR = Join-Path $ROOT 'data\backups'
New-Item -ItemType Directory -Force -Path (Split-Path $LOG -Parent) | Out-Null

function Log($msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Write-Host $line
  Add-Content -Path $LOG -Value $line -Encoding utf8
}

function Write-FailureAlert([string]$stage, [string]$detail) {
  try {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $file = Join-Path $ALERT_DIR "deploy-failed-$stamp.txt"
    $lines = @(
      "[$stamp] deploy FAILED at $stage"
      "stage: $stage"
      "detail: $detail"
      'next: see deploy.log tail; if the app is broken, run pwsh scripts/rollback.ps1'
    )
    Set-Content -Path $file -Value $lines -Encoding utf8
    Log "ALERT_FILE=$file"
  } catch {
    # 告警通道自身失败时只走控制台，避免再写日志失败触发 trap 重入
    Write-Host "WARN: 失败告警文件写入失败（$($_.Exception.Message)）"
  }
  # 只保留最近 10 份告警文件，防长期积累
  @(Get-ChildItem -Path $ALERT_DIR -Filter 'deploy-failed-*.txt' -File -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -Skip 10) | Remove-Item -Force -ErrorAction SilentlyContinue
}

function Stop-Fail([string]$msg) {
  Log $msg
  Write-FailureAlert 'deploy' $msg
  exit 1
}

trap {
  Write-FailureAlert 'unhandled' ($_.Exception.Message)
  exit 1
}

function Get-HttpCode([string]$url) {
  $code = curl.exe -k -s -o NUL -w '%{http_code}' --max-time 30 $url 2>$null
  return "$code"
}

function Add-Smoke([string]$name, [string]$status, [string]$detail) {
  $line = "[$status] $name —— $detail"
  Log $line
  if ($status -eq 'FAIL') { $script:smokeFail++ }
}

# deploy.log 轮转（5MB x 3，best-effort：轮转失败不阻塞部署）
try {
  & (Join-Path $ROOT 'scripts\rotate-log.ps1') -Path $LOG
} catch {
  Log "WARN: deploy.log 轮转失败（$($_.Exception.Message)），继续（日志仍可追加）"
}

Log '=== post-merge-deploy start ==='

# ─── STEP0 发布前置门禁：master + 工作区干净 + 记录 HEAD ───
$branchRaw = git branch --show-current 2>$null
$branch = if ($branchRaw) { ($branchRaw | Out-String).Trim() } else { '' }
$shaRaw = git rev-parse HEAD 2>$null
$sha = if ($shaRaw) { ($shaRaw | Out-String).Trim() } else { '' }
$dirty = @(git status --porcelain 2>$null)
$gateIssues = @()
if ($branch -ne 'master') { $gateIssues += "当前分支 '$branch' 不是 master（部署要求合入 master 后执行）" }
if ($dirty.Count -gt 0) { $gateIssues += "工作区有 $($dirty.Count) 处未提交改动（首条：$($dirty[0])）" }
if ($gateIssues.Count -gt 0) {
  if ($Force) {
    Log ("WARN: 发布门禁被 -Force 绕过：" + ($gateIssues -join '；'))
  } else {
    Log 'GATE FAIL:'
    foreach ($issue in $gateIssues) { Log "  - $issue" }
    Log '  处理：提交/切回 master 后重试；紧急场景可加 -Force（会记录 WARN）。'
    Write-FailureAlert 'STEP0 发布门禁' '发布门禁未过（见上方 GATE FAIL 明细）'
    exit 1
  }
}
Log "GATE OK: branch=$branch HEAD=$sha dirty=$($dirty.Count)"

# ─── STEP0 接上：accept 报告联动（最近报告全绿 + ≤24h + HEAD 一致；-SkipAccept 可跳过） ───
$shortSha = if ($sha.Length -ge 7) { $sha.Substring(0, 7) } else { $sha }
if (-not $SkipAccept) {
  $acceptDir = Join-Path $ROOT 'workspace\temp'
  $acceptReports = @(Get-ChildItem -Path $acceptDir -Filter 'accept-master-*.md' -File -ErrorAction SilentlyContinue |
    Sort-Object Name)
  $latestAccept = if ($acceptReports.Count -gt 0) { $acceptReports[-1] } else { $null }
  $acceptReason = ''
  if (-not $latestAccept) {
    $acceptReason = 'workspace/temp 下没有 accept-master-*.md 验收报告'
  } elseif ($shortSha -eq '') {
    $acceptReason = '无法解析当前 HEAD 短 SHA，无法核对验收报告对应版本'
  } else {
    $reportText = Get-Content -Raw -Encoding utf8 -LiteralPath $latestAccept.FullName
    $staleH = [math]::Round(((Get-Date) - $latestAccept.LastWriteTime).TotalHours, 1)
    if (-not $reportText.Contains('**✅ 全绿**')) {
      $acceptReason = "最近报告 $($latestAccept.Name) 未全绿"
    } elseif (-not $reportText.Contains("# 验收报告 — master @ $shortSha")) {
      $acceptReason = "最近报告 $($latestAccept.Name) 对应 HEAD $shortSha 之外的提交"
    } elseif ($staleH -gt 24) {
      $acceptReason = "最近报告 $($latestAccept.Name) 已 $staleH 小时（>24h）"
    }
  }
  if ($acceptReason) {
    Stop-Fail "ACCEPT 前置失败：$acceptReason。处理：先运行 pwsh scripts/accept.ps1（需全绿且 HEAD 一致）；紧急场景加 -SkipAccept（会记录 WARN）。"
  } else {
    Log "ACCEPT OK: $($latestAccept.Name)（全绿，≤24h，HEAD=$shortSha）"
  }
}

# ─── STEP1 强制备份 + 备份产物 VERIFY（fail-fast） ───
Log 'STEP1 备份 DB + uploads + VERIFY ...'
& (Join-Path $ROOT 'daily-backup.bat')
if ($LASTEXITCODE -ne 0) {
  Stop-Fail 'ABORT: 备份失败或备份校验未过，不重建（详见 data/backups/daily-backup.log）'
}
# P0-1 双入口：daily-backup.bat 已校验，此处按施工图再显式校验一次（幂等）
$backup = Get-ChildItem -Path (Join-Path $ROOT 'data\backups') -Filter 'commission.db.bak-*' -File -ErrorAction SilentlyContinue |
  Sort-Object Name | Select-Object -Last 1
if (-not $backup) {
  Stop-Fail 'ABORT: 备份命令成功但未找到 commission.db.bak-* 产物'
}
$verifyOut = & node (Join-Path $ROOT 'scripts\verify-backup.mjs') $backup.FullName 2>&1
$verifyText = ($verifyOut | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $verifyText -notmatch 'VERIFY_OK') {
  Stop-Fail "ABORT: 备份校验未通过（$verifyText）"
}
Log "STEP1 OK: $($backup.Name) VERIFY_OK"

# ─── STEP2 打 prev tag（回滚用）→ 重建容器 ───
Log 'STEP2 打 prev tag + docker compose build ...'
$imageId = docker inspect --format '{{.Image}}' commission-web 2>$null
if ($LASTEXITCODE -eq 0 -and $imageId) {
  $prevTag = 'commission-web:prev-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
  docker tag ($imageId | Out-String).Trim() $prevTag
  if ($LASTEXITCODE -eq 0) {
    Log "PREV_TAG=$prevTag"
  } else {
    Log 'WARN: docker tag 失败，本轮无可用 prev tag（回滚需人工 tag，见 rollback.ps1 指引）'
  }
} else {
  Log 'WARN: 未找到运行中的 commission-web 容器，跳过 prev tag（首次部署场景）'
}
docker compose build web
if ($LASTEXITCODE -ne 0) {
  Stop-Fail "ABORT: 构建失败（旧容器若仍在运行则不受影响；上一版镜像 tag：$prevTag）。下一步：修复后重试，或回滚：pwsh scripts/rollback.ps1"
}
docker compose up -d
if ($LASTEXITCODE -ne 0) {
  Stop-Fail 'ABORT: 启动失败。下一步：docker compose logs --tail 200 web；或回滚：pwsh scripts/rollback.ps1'
}

# ─── STEP3 等健康（最多 90s） ───
Log 'STEP3 等待 healthy ...'
$ok = $false
for ($i = 0; $i -lt 18; $i++) {
  Start-Sleep 5
  $status = docker inspect --format '{{.State.Health.Status}}' commission-web 2>$null
  if ($status -eq 'healthy') { $ok = $true; break }
}
if (-not $ok) {
  Stop-Fail 'FAIL: 容器未 healthy。回滚指引：pwsh scripts/rollback.ps1（自动恢复上一版 DB + prev 镜像）'
}
Log 'STEP3 OK: commission-web healthy'

# ─── STEP4 迁移回读断言：期望版本 vs 容器内实际版本 ───
Log 'STEP4 迁移回读断言 ...'
$migrationFile = Join-Path $ROOT 'server\src\db\migrations\index.ts'
$migrationText = Get-Content -Raw -Encoding utf8 $migrationFile
$versions = [regex]::Matches($migrationText, "from '\./v(\d+)-") | ForEach-Object { [int]$_.Groups[1].Value }
$expectedVersion = if ($versions.Count -gt 0) { ($versions | Measure-Object -Maximum).Maximum } else { 0 }
if ($expectedVersion -lt 1) {
  Stop-Fail 'STEP4 FAIL: 迁移回读失败——无法从 server/src/db/migrations/index.ts 解析期望版本（无 from ./vNN- 命中）'
}
$dbVer = (docker compose exec -T -w /app/server web node -e "const db=require('better-sqlite3')('/app/data/commission.db');console.log(db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v)" 2>$null | Out-String).Trim()
$dbVerInt = 0
if ($dbVer -match '^\d+$') { $dbVerInt = [int]$dbVer }
if ($dbVerInt -ne $expectedVersion) {
  Log "STEP4 FAIL: 迁移回读失败——期望 v$expectedVersion，容器内 schema_migrations 实际 v$dbVerInt（原始输出：$dbVer）"
  Log '  下一步：docker compose logs --tail 200 web 看迁移错误；或回滚：pwsh scripts/rollback.ps1'
  Write-FailureAlert 'STEP4 迁移回读' "期望 v$expectedVersion，实际 v$dbVerInt"
  exit 1
}
Log "STEP4 OK: 迁移回读 v$expectedVersion = 期望版本"

# ─── STEP5 冒烟清单（PASS/WARN/FAIL 表；任一 FAIL 即中止） ───
$script:smokeFail = 0
Log 'STEP5 冒烟清单（PASS/WARN/FAIL）...'

$code = Get-HttpCode 'https://localhost/api/health'
Add-Smoke '/api/health' $(if ($code -eq '200') { 'PASS' } else { 'FAIL' }) "HTTP $code（必过）"

Add-Smoke 'schema 版本 = 预期' $(if ($dbVerInt -eq $expectedVersion) { 'PASS' } else { 'FAIL' }) "v$dbVerInt / v$expectedVersion"

$code = Get-HttpCode 'https://localhost/login'
Add-Smoke '登录页 /login' $(if ($code -eq '200') { 'PASS' } else { 'FAIL' }) "HTTP $code（必过）"

# 公开画师主页：口径=公开目录取首个画师 subdomain → 探测其公开 API；目录为空/不可解析则 WARN（口径不可用，不阻断）
# V1 首实战抓修③（2026-08-14）：curl 输出经管道会被控制台码页（GBK）解码坏 UTF-8 中文致 JSON 解析失败——
# 改落盘临时文件后按 UTF-8 读回
$dirTmp = Join-Path $env:TEMP "commission-artists-$PID.json"
curl.exe -k -s --max-time 30 -o $dirTmp 'https://localhost/api/artists' 2>$null
$dirBody = if (Test-Path $dirTmp) { (Get-Content -Raw -Encoding utf8 $dirTmp).Trim() } else { '' }
Remove-Item $dirTmp -ErrorAction SilentlyContinue
try {
  $artists = @($dirBody | ConvertFrom-Json)
  if ($artists.Count -gt 0) {
    $sub = $artists[0].subdomain
    $code = Get-HttpCode "https://localhost/api/artists/$sub"
    if ($code -eq '200') {
      Add-Smoke '公开画师主页' 'PASS' "HTTP $code（/api/artists/$sub）"
    } else {
      Add-Smoke '公开画师主页' 'FAIL' "HTTP $code（/api/artists/$sub）"
    }
  } else {
    Add-Smoke '公开画师主页' 'WARN' '公开画师目录为空，无可探测对象（口径不可用，不阻断）'
  }
} catch {
  $snippet = if ($dirBody.Length -gt 60) { $dirBody.Substring(0, 60) } else { $dirBody }
  Add-Smoke '公开画师主页' 'WARN' "公开目录接口不可解析（$snippet），口径不可用，不阻断"
}

$code = Get-HttpCode 'https://localhost/api/artists'
Add-Smoke '只读 API /api/artists' $(if ($code -eq '200') { 'PASS' } else { 'FAIL' }) "HTTP $code（必过）"

if ($script:smokeFail -gt 0) {
  Stop-Fail "FAIL: 冒烟未过（$script:smokeFail 项 FAIL），考虑回滚：pwsh scripts/rollback.ps1"
}
Log 'STEP5 OK: 冒烟清单全过（可含 WARN）'
Log '=== post-merge-deploy done ==='
