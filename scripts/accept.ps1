#!/usr/bin/env pwsh
# accept.ps1 — 一号独立验收流水线（v2，2026-08-19：新增 test-tamper 测试同改标红闸门）
#
# 目的：把「合入前复跑全门禁」固化为零遗漏的机械流程，产出结构化验收报告。
# 纪律出处：STATUS v82 教训（合入门禁漏跑致结构污染流入 master）；
#          「self-report 不可信」——报告里的数字全部是本脚本实测，不引用任何自报。
#
# 用法：
#   pwsh scripts/accept.ps1                        # 验收当前仓库（master 自检）
#   pwsh scripts/accept.ps1 -Worktree <worktree路径>   # 验收某个 worktree
#   pwsh scripts/accept.ps1 -SkipE2E               # 跳过 E2E（不推荐，仅排障用）
#
# 产出：workspace/temp/accept-<分支>-<时间戳>.md（门禁报告）
#       workspace/temp/accept-logs/<时间戳>/<门禁>.log（每道门禁完整输出）
# 退出码：0 = 全绿；1 = 任一门禁失败；2 = 环境/前置检查失败
#
# 注意：本脚本不 merge、不合入——merge master 与合入决定永远由一号人工执行。
#       脚本只报告 worktree 落后 master 的提交数作为提醒。

param(
  [string]$Worktree = '',
  [switch]$SkipE2E,
  # test-tamper 闸门裁决理由：业务代码与测试同改时必须显式给出，否则该道门禁失败
  [string]$TestTamperAck = ''
)

$ErrorActionPreference = 'Stop'

# ---------- 定位仓库 ----------
$repo = if ($Worktree) {
  (Resolve-Path $Worktree).Path
} else {
  (git rev-parse --show-toplevel).Trim()
}
if (-not (Test-Path (Join-Path $repo 'server')) -or -not (Test-Path (Join-Path $repo 'web'))) {
  Write-Error "验收目标缺少 server/ 或 web/ 目录：$repo"
  exit 2
}

$branch = (git -C $repo rev-parse --abbrev-ref HEAD).Trim()
$head = (git -C $repo rev-parse --short HEAD).Trim()
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logDir = Join-Path $repo "workspace/temp/accept-logs/$stamp"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$reportPath = Join-Path $repo "workspace/temp/accept-$branch-$stamp.md"

Write-Host "=== 验收流水线 ===" -ForegroundColor Cyan
Write-Host "目标：$repo （分支 $branch @ $head）"
Write-Host "报告：$reportPath`n"

# ---------- 前置检查 ----------
$preCheckNotes = @()
$dirty = git -C $repo status --porcelain
$trackedDirty = $dirty | Where-Object { $_ -notmatch '^\?\?' }
$untracked = $dirty | Where-Object { $_ -match '^\?\?' }
if ($trackedDirty) {
  Write-Error ("前置检查失败：存在未提交的已跟踪改动（038 事故防再发）：`n" + ($trackedDirty -join "`n"))
  exit 2
}
if ($untracked) {
  $preCheckNotes += "⚠️ 有 $($untracked.Count) 个未跟踪文件（不阻塞，合入时注意勿误提交）"
}

$behind = (git -C $repo rev-list --count HEAD..master 2>$null)
if ($behind -and [int]$behind -gt 0) {
  $preCheckNotes += "⚠️ 当前分支落后 master $behind 个提交——合入前由一号手工 merge master 并复跑"
}

$portBusy = Get-NetTCPConnection -LocalPort 3999 -State Listen -ErrorAction SilentlyContinue
if ($portBusy -and -not $SkipE2E) {
  $preCheckNotes += "⚠️ 端口 3999 被占用（E2E 专用端口）——v85 教训：E2E 失败先查端口占用再疑代码"
}

# ---------- 门禁清单（唯一事实源，新增门禁项在此追加） ----------
$gates = @(
  @{ id = 'server-typecheck'; label = 'server typecheck（双 tsconfig）'; dir = 'server'; npmArgs = @('run', 'typecheck') },
  @{ id = 'server-lint';      label = 'server lint（eslint+oxlint）';   dir = 'server'; npmArgs = @('run', 'lint') },
  @{ id = 'server-test';      label = 'server vitest';                  dir = 'server'; npmArgs = @('test'); countKey = 'server' },
  @{ id = 'web-lint';         label = 'web lint（vue-tsc+eslint）';     dir = 'web';    npmArgs = @('run', 'lint') },
  @{ id = 'web-test';         label = 'web vitest';                     dir = 'web';    npmArgs = @('run', 'test:web'); countKey = 'web' },
  @{ id = 'web-i18n';         label = 'web check-i18n';                 dir = 'web';    npmArgs = @('run', 'check:i18n') },
  @{ id = 'web-build';        label = 'web build';                      dir = 'web';    npmArgs = @('run', 'build') }
)
if (-not $SkipE2E) {
  $gates += @{ id = 'e2e'; label = 'Playwright E2E'; dir = ''; npmArgs = @('run', 'test:e2e'); countKey = 'e2e' }
  $gates += @{ id = 'e2e-locators'; label = 'E2E check-locators'; dir = ''; npmArgs = @('run', 'check:e2e') }
}

# test-tamper 闸门：业务+测试同改须带裁决理由（防改测试凑绿；用例数基线防的是删测试，此处防改软断言）
$tamperArgs = @('scripts/check-test-tamper.mjs', '--base', 'master')
if ($TestTamperAck) { $tamperArgs += @('--ack-reason', $TestTamperAck) }
$gates += @{ id = 'test-tamper'; label = '测试同改标红（check-test-tamper）'; dir = ''; npmArgs = @('exec', '--no', '--', 'node') + $tamperArgs }

# ---------- 基线（用例数只增不减；增长后同步更新本文件） ----------
$baselinePath = Join-Path $repo 'scripts/accept-baseline.json'
$baseline = if (Test-Path $baselinePath) { Get-Content $baselinePath -Raw | ConvertFrom-Json } else { $null }

$results = [System.Collections.Generic.List[object]]::new()
$totalSw = [System.Diagnostics.Stopwatch]::StartNew()

foreach ($gate in $gates) {
  $workDir = if ($gate.dir) { Join-Path $repo $gate.dir } else { $repo }
  $logFile = Join-Path $logDir "$($gate.id).log"
  Write-Host "▶ $($gate.label) ..." -NoNewline
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  Push-Location $workDir
  try {
    $npmArgs = $gate.npmArgs
    $output = & npm @npmArgs 2>&1 | Out-String
    $code = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  $sw.Stop()
  Set-Content -Path $logFile -Value $output -Encoding utf8
  $ok = ($code -eq 0)

  $detail = ''
  # 实测数字提取：先去 ANSI 转义码（npm/vitest 彩色输出会干扰正则）
  $plain = $output -replace "`e\[[0-9;]*m", ''
  if ($gate.countKey -and $plain -match 'Tests\s+(\d+)\s+passed') { $detail = "$($Matches[1]) passed" }
  elseif ($gate.countKey -eq 'e2e' -and $plain -match '(\d+)\s+passed\s*\(') { $detail = "$($Matches[1]) passed" }

  # 基线对比：用例数少于基线 = 红色告警（防删测试凑绿）
  if ($gate.countKey -and $baseline) {
    $base = $baseline.($gate.countKey)
    if ($detail -match '^(\d+)') {
      $actual = [int]$Matches[1]
      if ($base -and $actual -lt [int]$base) {
        $detail += "  🔴 低于基线 $base"
        $ok = $false  # 用例数倒退视同门禁失败，须一号裁决
      } elseif ($base -and $actual -gt [int]$base) {
        $detail += "  （基线 $base，增长待更新 accept-baseline.json）"
      }
    }
  }

  $mark = if ($ok) { '✅' } else { '❌' }
  Write-Host " $mark $([math]::Round($sw.Elapsed.TotalSeconds))s $detail"
  $results.Add([pscustomobject]@{
      id = $gate.id; label = $gate.label; ok = $ok
      seconds = [math]::Round($sw.Elapsed.TotalSeconds)
      detail = $detail; log = $logFile; output = $output
    })
}
$totalSw.Stop()

# ---------- 报告 ----------
$failed = $results | Where-Object { -not $_.ok }
$verdict = if ($failed.Count -eq 0) { '✅ 全绿' } else { "🔴 $($failed.Count) 道失败" }

$report = [System.Text.StringBuilder]::new()
[void]$report.AppendLine("# 验收报告 — $branch @ $head")
[void]$report.AppendLine('')
[void]$report.AppendLine("- 时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
[void]$report.AppendLine("- 目标：``$repo``")
[void]$report.AppendLine("- 总耗时：$([math]::Round($totalSw.Elapsed.TotalSeconds)) 秒")
[void]$report.AppendLine("- 结论：**$verdict**")
[void]$report.AppendLine('')
if ($preCheckNotes) {
  [void]$report.AppendLine('## 前置检查')
  foreach ($n in $preCheckNotes) { [void]$report.AppendLine("- $n") }
  [void]$report.AppendLine('')
}
if ($TestTamperAck) {
  [void]$report.AppendLine('## 测试同改裁决（test-tamper）')
  [void]$report.AppendLine('')
  [void]$report.AppendLine("业务代码与测试同改，一号已裁决理由：$TestTamperAck")
  [void]$report.AppendLine('')
}
[void]$report.AppendLine('## 门禁明细')
[void]$report.AppendLine('')
[void]$report.AppendLine('| 门禁 | 结果 | 耗时(s) | 实测 | 日志 |')
[void]$report.AppendLine('|---|---|---|---|---|')
foreach ($r in $results) {
  $mark = if ($r.ok) { '✅' } else { '❌' }
  $logRel = $r.log.Replace($repo, '').TrimStart('/\')
  [void]$report.AppendLine("| $($r.label) | $mark | $($r.seconds) | $($r.detail) | ``$logRel`` |")
}
[void]$report.AppendLine('')
if ($failed.Count -gt 0) {
  [void]$report.AppendLine('## 失败项输出尾部（各 40 行）')
  [void]$report.AppendLine('')
  foreach ($f in $failed) {
    [void]$report.AppendLine("### ❌ $($f.label)")
    [void]$report.AppendLine('')
    [void]$report.AppendLine('```')
    $tail = ($f.output -split "`n") | Select-Object -Last 40
    [void]$report.AppendLine(($tail -join "`n"))
    [void]$report.AppendLine('```')
    [void]$report.AppendLine('')
  }
}
[void]$report.AppendLine('---')
[void]$report.AppendLine('> 本报告由 scripts/accept.ps1 自动生成，数字均为实测。')
[void]$report.AppendLine('> **报告全绿 ≠ 可以合入**：一号仍须 diff 抽查（scope creep / 语义等价）后人工决定合入。')
Set-Content -Path $reportPath -Value $report.ToString() -Encoding utf8

Write-Host "`n=== 结论：$verdict（总耗时 $([math]::Round($totalSw.Elapsed.TotalSeconds))s）===" -ForegroundColor $(if ($failed.Count -eq 0) { 'Green' } else { 'Red' })
Write-Host "报告：$reportPath"
exit $(if ($failed.Count -eq 0) { 0 } else { 1 })
