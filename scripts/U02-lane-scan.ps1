# U02-lane-scan.ps1 | C-T07-09 并行车道现场清理 · 只读扫描器
# 默认只报不改：不带 -Apply 时，本脚本对被扫目录只读，不删、不移、不建、不改。
# 用法（一条命令）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File U02-lane-scan.ps1
# 写回（默认关闭，须三个条件同时满足才动）：
#   -Apply -Ids A4,C2 -Confirm RECYCLE-U02   删除一律走回收站，脚本内不含 rm/del/Remove-Item
# 退出码：0=只读扫描完成（不论发现多少候选） 2=前置条件失败 4=-Apply 有失败项 6=-Apply 护栏未通过（未碰任何文件）
[CmdletBinding()]
param(
    [string]$Root = 'D:\Hermes Agent CN Desktop\workspace\artist-commission',
    [string]$TempDir = '',
    [int]$InFlightMinutes = 30,
    [int]$QuietDays = 3,
    [switch]$Apply,
    [string[]]$Ids = @(),
    [string]$Confirm = '',
    [string]$ReportFile = ''
)

$ErrorActionPreference = 'Stop'
# R2 起：判据一律来自 U02-verdict.ps1（唯一事实源）。本文件只取数与排版，不得再自己写一条 if 判据。
. (Join-Path $PSScriptRoot 'U02-verdict.ps1')
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$script:Buf = New-Object System.Collections.Generic.List[string]
function Say([string]$t) { $script:Buf.Add($t); Write-Host $t }
function InvGit([string]$repo, [string[]]$ga) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $out = & git -C $repo @ga 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    [pscustomobject]@{ Text = $out; Code = $code }
}
function UtcToLocal([double]$epoch) { [DateTimeOffset]::FromUnixTimeSeconds([int]$epoch).LocalDateTime }
function NewestFile([string]$path, [int]$depth) {
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    $items = Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue
    if ($depth -ge 0) { $items = Get-ChildItem -LiteralPath $path -Recurse -Force -File -Depth $depth -ErrorAction SilentlyContinue }
    $n = $items | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($n) { return $n.LastWriteTime } else { return (Get-Item -LiteralPath $path).LastWriteTime }
}
function CountFiles([string]$path) {
    $f = @(Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue)
    $kb = [math]::Round((($f | Measure-Object -Property Length -Sum).Sum / 1KB), 1)
    [pscustomobject]@{ N = $f.Count; KB = $kb }
}

$now = Get-Date
$runAt = $now.ToString('yyyy-MM-dd HH:mm:ss')
$flight = @{}   # id -> pscustomobject，供 -Apply 解析
Say 'U02 · 并行车道现场清理（C-T07-09）· 只读扫描'
Say ("根目录  ：{0}" -f $Root)
if (-not $TempDir) { $TempDir = Join-Path $Root 'AGENTS\temp' }
Say ("temp 口 ：{0}" -f $TempDir)
Say ("扫描时间：$runAt")
Say ("模式    ：{0}" -f $(if ($Apply) { '写回模式 -Apply（回收站口径）' } else { '只报不改（默认）' }))
Say ("在飞护栏：最后活动 < {0} 分钟一律判 WARN-ACTIVE，不得回收；temp 按 {1} 天静默期分级" -f $InFlightMinutes, $QuietDays)
Say ('-' * 78)

# ---------- 前置：根与 git 可用性 ----------
if (-not (Test-Path -LiteralPath (Join-Path $Root '.git'))) {
    Say "前置失败：$Root 下没有 .git —— 判据无法成立，本次不出清单。"
    if ($ReportFile) { Set-Content -LiteralPath $ReportFile -Value ($script:Buf -join "`r`n") -Encoding UTF8 }
    exit 2
}
$wtRaw = InvGit $Root @('worktree', 'list')
if ($wtRaw.Code -ne 0) { Say "前置失败：git worktree list 报错：$($wtRaw.Text -join ' / ')" ; exit 2 }
$wtLines = @($wtRaw.Text | Where-Object { $_ -match '^/' -or $_ -match '^[A-Za-z]:' })
$reg = @{}
foreach ($l in $wtLines) {
    $p = ($l -split '\s{2,}')[0].Trim().Replace('\', '/').TrimEnd('/')
    $br = ''
    if ($l -match '\[([^\]]+)\]\s*$') { $br = $Matches[1] }
    $reg[$p] = $br
}
$mainPath = ($wtLines[0] -split '\s{2,}')[0].Trim().Replace('\', '/').TrimEnd('/')
$wtDir = Join-Path $Root 'worktrees'
$diskDirs = @()
if (Test-Path -LiteralPath $wtDir) {
    $diskDirs = @(Get-ChildItem -LiteralPath $wtDir -Directory -Force -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object { $_.FullName })
}
# R2：分支清单先取一遍 —— A 段要用"同名分支有没有进主干"这条旁证，B 段复用同一份（上一版 A 段拿不到这条旁证）
$bRaw = InvGit $Root @('branch', '--format=%(refname:short)|%(HEAD)')
$branches = @($bRaw.Text | Where-Object { $_ -match '\|' } | ForEach-Object {
    $pa = $_ -split '\|'
    [pscustomobject]@{ Name = $pa[0].Trim(); Head = ($pa[1].Trim() -eq '*') }
})
$brNames = @($branches | ForEach-Object { $_.Name })
$brInMain = @{}
foreach ($b0 in $branches) {
    if ($b0.Name -eq 'master') { $brInMain[$b0.Name] = $true; continue }
    $a0 = InvGit $Root @('merge-base', '--is-ancestor', $b0.Name, 'master')
    $brInMain[$b0.Name] = ($a0.Code -eq 0)
}
Say ''
Say ('[A] 挂着的工作副本 · 磁盘 worktrees/ {0} 个目录 vs git worktree list 登记 {1} 条（含主仓）' -f $diskDirs.Count, $reg.Count)
$aidx = 0
$ridx = 0
foreach ($d in $diskDirs) {
    $aidx++
    $id = "A{0}" -f $aidx
    $dn = Split-Path $d -Leaf
    $dNorm = $d.Replace('\', '/')
    $isMain = ($dNorm -eq $mainPath)
    $hasDotGit = Test-Path -LiteralPath (Join-Path $d '.git')
    $regBr = $reg[$dNorm]
    $newest = NewestFile $d 2
    $inFlight = ($newest -and (($now - $newest).TotalMinutes -lt $InFlightMinutes))
    $dirty = -1
    if ($hasDotGit) { $dirty = @(InvGit $d @('status', '--porcelain')).Text.Count }
    $cf = CountFiles $d
    $mb = Get-U02MatchedBranch -DirName $dn -BranchNames $brNames
    $vv = Get-U02WorktreeVerdict -IsMainRoot $isMain -Registered ([bool]$regBr) -HasGit $hasDotGit `
        -FileCount $cf.N -DirtyLines $dirty -InFlight $inFlight `
        -HasMatchedBranch ([bool]$mb) -BranchInMain $(if ($mb) { [bool]$brInMain[$mb] } else { $false })
    $verdict = $vv.Code
    $note = $vv.Why
    Say ("  {0} {1}" -f $id, $dn)
    Say ("      登记分支={0}  .git={1}  脏行数={2}  文件={3}个/{4}KB  最近活动={5}" -f `
        $(if ($regBr) { $regBr } else { '（无）' }), $(if ($hasDotGit) { 'yes' } else { 'no' }), `
        $(if ($dirty -ge 0) { $dirty } else { 'n/a(无.git,不跑git)' }), $cf.N, $cf.KB, `
        $(if ($newest) { $newest.ToString('yyyy-MM-dd HH:mm') } else { '（空目录）' }))
    Say ("      判定：{0} —— {1}" -f $verdict, $note)
    if ($isMain) { Say '      （主仓路径本身，永不在回收范围）' }
    $flight[$id] = [pscustomobject]@{ Kind = 'dir'; Path = $d; Verdict = $verdict; Class = $vv.Class; Br = '' }
}
$regOnly = @($reg.Keys | Where-Object { -not ($diskDirs | ForEach-Object { $_.Replace('\', '/') }) -contains $_ })
if ($regOnly.Count -gt 0) {
    Say ("  WARN：git 登记了但磁盘 worktrees/ 找不到的路径 {0} 个 —— 需 git worktree prune 前先人工核对" -f $regOnly.Count)
    foreach ($r in $regOnly) {
        Say "      $r"
        $ridx++; $flight["R$ridx"] = [pscustomobject]@{ Kind = 'dir'; Path = $r; Verdict = 'WARN-STALE-REG'; Class = 'warn'; Br = '' }
    }
}

Say ''
Say '[B] 本地分支 · 是否已进 master'
Say ("  git branch 共 {0} 条（含 master）" -f $branches.Count)
$mergedCnt = 0; $noMergeCnt = 0; $bidx = 0
foreach ($b in $branches) {
    $bidx++
    $id = "B{0}" -f $bidx
    if ($b.Name -eq 'master' -or $b.Head) {
        $vm = Get-U02BranchVerdict -IsMainline $true
        Say ("  {0} {1}  判定：{2}（{3}）" -f $id, $b.Name, $vm.Code, $vm.Why)
        $flight[$id] = [pscustomobject]@{ Kind = 'branch'; Path = ''; Verdict = $vm.Code; Class = $vm.Class; Br = $b.Name }
        continue
    }
    $isAnc = [bool]$brInMain[$b.Name]
    $range = "master...{0}" -f $b.Name
    $ab = InvGit $Root @('rev-list', '--left-right', '--count', $range)
    $abT = ($ab.Text -join '').Trim()
    $checked = ''
    foreach ($k in $reg.Keys) { if ($reg[$k] -eq $b.Name) { $checked = $k } }
    $vv2 = Get-U02BranchVerdict -IsMainline $false -InMain $isAnc -OccupiedBy $checked
    $verdict = $vv2.Code; $note = $vv2.Why
    if ($isAnc) { $mergedCnt++ } else { $noMergeCnt++ }
    Say ("  {0} {1}" -f $id, $b.Name)
    Say ("      ahead/behind vs master（左=master独有 右=分支独有）：{0}   进master：{1}" -f $abT, $(if ($isAnc) { 'yes' } else { 'no' }))
    Say ("      判定：{0} —— {1}" -f $verdict, $note)
    $flight[$id] = [pscustomobject]@{ Kind = 'branch'; Path = ''; Verdict = $verdict; Class = $vv2.Class; Br = $b.Name }
}
Say ("  小计：已进 master {0} 条 / 未进 master {1} 条" -f $mergedCnt, $noMergeCnt)

Say ''
Say '[C] temp 里的一次性脚本'
if (-not (Test-Path -LiteralPath $TempDir)) {
    Say ("  WARN：temp 目录不存在（{0}）—— C 段无清单；口径见 README" -f $TempDir)
    $tempExists = $false
} else {
    $tempExists = $true
    $allT = @(Get-ChildItem -LiteralPath $TempDir -Force -ErrorAction SilentlyContinue)
    $filesT = @($allT | Where-Object { -not $_.PSIsContainer })
    $dirsT = @($allT | Where-Object { $_.PSIsContainer })
    $ps1 = @($filesT | Where-Object { $_.Extension -eq '.ps1' })
    $newestT = NewestFile $TempDir 0
    Say ("  条目 {0}（文件 {1} + 子目录 {2}）；*.ps1 {3} 个；最近活动 {4}" -f `
        $allT.Count, $filesT.Count, $dirsT.Count, $ps1.Count, `
        $(if ($newestT) { $newestT.ToString('yyyy-MM-dd HH:mm') } else { '（空）' }))
    if ($newestT -and (($now - $newestT).TotalMinutes -lt $InFlightMinutes)) {
        Say ("  WARN-ACTIVE：temp {0} 分钟内还有写入，整段本轮不得回收" -f $InFlightMinutes)
    }
    $ig = InvGit $Root @('check-ignore', '-v', '--', $TempDir)
    if ($ig.Code -eq 0) { Say ("  未入库核对：{0}" -f ($ig.Text -join ' ')) }
    else { Say '  WARN：check-ignore 未确认 temp 被忽略 —— 「未入库」这条判据本轮不成立' }

    # R2：C 段的"扫哪些文件 + 怎么判"整体搬到 U02-verdict.ps1 的 Select-U02TempItems（唯一事实源）
    $ts = Select-U02TempItems -TempDir $TempDir -Now $now -InFlightMinutes $InFlightMinutes -QuietDays $QuietDays
    $c1idx = 0; $cidx = 0
    if ($ts.Named -eq 0) {
        Say '  [口径 C-1] 报告点名的 815b3-launch-*.ps1：本目录 0 命中（详见 差异.md —— 路径与命名都已换代）'
    }
    foreach ($it in $ts.Items) {
        if ($it.Source -eq 'C-1') { $c1idx++; $i = "C1{0}" -f $c1idx } else { $cidx++; $i = "C{0}" -f $cidx }
        Say ("  {0} {1}  改于 {2}（{3} 天前，{4}B）  判定：{5} —— {6}" -f $i, $it.Name, $it.Mtime.ToString('yyyy-MM-dd HH:mm'), $it.AgeDays, $it.Bytes, $it.Code, $it.Why)
        $flight[$i] = [pscustomobject]@{ Kind = 'file'; Path = $it.Path; Verdict = $it.Code; Class = $it.Class; Br = '' }
    }
    Say ("  [口径 C-2] 命中一次性口径的 .ps1：{0} 个；未命中的 .ps1 {1} 个本轮不列（命名不像一次性件，交人自行判断）" -f ($ts.Hit + $ts.Named), $ts.Missed)
    if ($ts.Truncated) { Say '  WARN：命中条数超过本段上限 30，后面的是截断的，不是没有' }
}

Say ''
Say '[D] 总判（看这一段就够，不用读代码）'
$cand = @($flight.Values | Where-Object { $_.Class -eq 'candidate' })
$warn = @($flight.Values | Where-Object { $_.Class -eq 'warn' })
$blocked = @($flight.Values | Where-Object { $_.Class -eq 'blocked' })
Say ('  ' + (Get-U02VerdictLine -Items @($flight.Values | ForEach-Object { @{ Kind = $_.Kind; Class = $_.Class; Code = $_.Verdict } })))
Say ("  A 挂起工作副本：磁盘 {0} / 登记 {1} / 候选 {2} 个（{3}）" -f $diskDirs.Count, $reg.Count, `
    @($cand | Where-Object { $_.Kind -eq 'dir' }).Count, ((@($cand | Where-Object { $_.Kind -eq 'dir' } | ForEach-Object { $_.Path.Replace('\', '/') })) -join ', '))
Say ("  B 已合入分支：{0} 条已进 master，其中 {1} 条被工作副本挡住，候选 {2} 条" -f $mergedCnt, $blocked.Count, @($cand | Where-Object { $_.Kind -eq 'branch' }).Count)
Say ("  C temp 一次性脚本候选：{0} 个" -f @($cand | Where-Object { $_.Kind -eq 'file' }).Count)
Say ("  WARN 类（判据不清，不判死）：{0} 项" -f $warn.Count)
if ($cand.Count -gt 0) {
    $idList = @()
    foreach ($kv in ($flight.GetEnumerator() | Sort-Object { $_.Name.Substring(0, 1) }, { [int]($_.Name -replace '\D', '') })) {
        if ($kv.Value.Verdict -eq 'CANDIDATE-CONFIRM' -and $kv.Value.Kind -ne 'branch') { $idList += $kv.Name }
    }
    Say '  要不要动手：需要 —— 但须你逐号确认后本工具才收；不替你拍板删不删。'
    Say ("   确认后的回收命令（默认关闭；只送回收站，不碰分支）：powershell -NoProfile -ExecutionPolicy Bypass -File ""{0}"" -Apply -Ids {1} -Confirm RECYCLE-U02" -f $PSCommandPath, ($idList -join ','))
}
else { Say '  要不要动手：暂不需要 —— 无可确认候选。' }
if (@($cand | Where-Object { $_.Kind -eq 'branch' }).Count -gt 0) {
    Say '  分支剪除本工具不代做（不越界拍板），由负责人自己敲：'
    foreach ($c in @($cand | Where-Object { $_.Kind -eq 'branch' })) {
        Say ("    git -C ""{0}"" branch -d {1}" -f $Root, $c.Br)
    }
    Say '  （只用 -d 不用 -D：-d 遇到未合入会被 git 自己拦下）'
}
Say ('-' * 78)
Say ("扫描完成：{0}  只读模式判定：本次未对被扫目录做任何写入。" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))

# ---------- 写回段（默认关闭）----------
if ($Apply) {
    Say ''
    Say '[E] 写回执行'
    if ($Confirm -ne 'RECYCLE-U02') {
        Say '护栏未通过：-Apply 必须同时给 -Confirm RECYCLE-U02。未碰任何文件。'
        if ($ReportFile) { Set-Content -LiteralPath $ReportFile -Value ($script:Buf -join "`r`n") -Encoding UTF8 }
        exit 6
    }
    if ($Ids.Count -eq 0) {
        Say '护栏未通过：-Apply 必须显式给 -Ids（编号逗号分隔）。未碰任何文件。'
        if ($ReportFile) { Set-Content -LiteralPath $ReportFile -Value ($script:Buf -join "`r`n") -Encoding UTF8 }
        exit 6
    }
    $fail = 0
    $shell = New-Object -ComObject Shell.Application
    $bin = $shell.NameSpace(10)
    foreach ($id in $Ids) {
        $it = $flight[$id]
        if (-not $it) { Say ("  {0} 编号不存在 —— 跳过" -f $id); $fail++; continue }
        if ($it.Verdict -ne 'CANDIDATE-CONFIRM') { Say ("  {0} 判定 {1} 非候选 —— 拒收，不动" -f $id, $it.Verdict); $fail++; continue }
        if ($it.Kind -eq 'branch') { Say ("  {0} 是分支 —— 本工具不代剪，请自己敲 git branch -d {1}" -f $id, $it.Br); continue }
        if (-not (Test-Path -LiteralPath $it.Path)) { Say ("  {0} 路径已不存在 —— 跳过" -f $id); continue }
        $bin.MoveHere($it.Path)
        Start-Sleep -Milliseconds 800
        if (Test-Path -LiteralPath $it.Path) { Say ("  {0} 回收站投递后路径仍在，需人工复查：{1}" -f $id, $it.Path); $fail++ }
        else { Say ("  {0} 已送回收站（可还原）：{1}" -f $id, $it.Path) }
    }
    if ($fail -gt 0) { Say ("写回完成，{0} 项未成功" -f $fail); $code = 4 } else { Say '写回完成'; $code = 0 }
}
else { $code = 0 }

if ($ReportFile) {
    $dir = Split-Path -Parent $ReportFile
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Set-Content -LiteralPath $ReportFile -Value ($script:Buf -join "`r`n") -Encoding UTF8
}
exit $code
