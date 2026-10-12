<#
.SYNOPSIS
    U02 并行车道现场清理 —— 现场清单器（只报不删）

.DESCRIPTION
    一条命令产出三张清单，交人确认后自行回收：
      清单1  还挂着的工作副本：git 登记 vs worktrees/ 磁盘目录 vs .git/worktrees 管理区，三方对差
      清单2  本地分支：是否已进 master、超前多少、是否被某个副本占用
      清单3  temp 里的一次性启动脚本：命名启发 + 是否被入库文件引用
    另附两节线索：temp 基数复点（钉口径）、僵死进程线索（简报 L123）。

    安全边界（不可让步）：
      - 只读 git 与文件系统。绝不删除、绝不覆盖、绝不 prune、绝不 branch -D、绝不杀进程、绝不注册计划任务。
      - 判据一律 WARN / BLOCK / KEEP / INFO，不输出 FAIL。
      - 在飞护栏：GuardMinutes（默认 30）内有过写入的条目一律标 BLOCK，不给回收建议。
      - 报告只写 -OutDir（默认脚本自身目录下的 reports），文件名带时间戳，不覆盖任何既有文件。
      - 未确认 .git 存在的目录里绝不跑 git 命令：否则向上命中主仓，把主仓的脏状态算到孤儿头上。

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\U02-lane-audit.ps1
    换项目根、放宽在飞窗口：
    .\U02-lane-audit.ps1 -RepoRoot 'D:\path\to\other\repo' -GuardMinutes 120

.NOTES
    工单 orders/U02-并行车道现场清理.md ｜ 单元 C-T07-09（同病灶并项 C-T06-4）
    绘约（artist-commission）记忆库不得导入或重建（用户 2026-09-04 已清档）；本件只引用磁盘与 git 事实。
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = 'D:\Hermes Agent CN Desktop\workspace\artist-commission',
    [string[]]$TempPath = @(),
    [int]$GuardMinutes = 30,
    [string]$OutDir = '',
    [int[]]$WatchPids = @(44404, 36322),
    [switch]$NoRefScan,
    [switch]$NoHtml
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$RunAt = Get-Date
$Now = $RunAt
$script:Log = New-Object System.Collections.ArrayList

function Say([string]$s) {
    [void]$script:Log.Add($s)
    Write-Output $s
}

# ---- 只读 git 包装：native 命令的 stderr 不当异常处理 ---------------------
function U02Git([string]$repo, [string[]]$a) {
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $o = & git -C $repo @a 2>&1
    $c = $LASTEXITCODE
    $ErrorActionPreference = $eap
    $lines = @()
    if ($null -ne $o) { $lines = @($o | ForEach-Object { "$_" }) }
    return [pscustomobject]@{ Code = $c; Lines = $lines }
}

function AgeDays($t) {
    if ($null -eq $t) { return $null }
    return [math]::Round(($Now - $t).TotalDays, 1)
}
function AgeText($t) {
    if ($null -eq $t) { return '时间不可读' }
    $d = AgeDays $t
    if ($d -lt 0) { return "$($t.ToString('yyyy-MM-dd HH:mm'))（未来时间）" }
    return "$($t.ToString('yyyy-MM-dd HH:mm'))（$d 天前）"
}
function FmtTime($t) {
    if ($null -eq $t) { return '' }
    return $t.ToString('yyyy-MM-dd HH:mm')
}
function IsInFlight($t) {
    if ($null -eq $t) { return $true }        # 读不到时间一律按在飞处理，宁保守
    return (($Now - $t).TotalMinutes -lt $GuardMinutes)
}
function ToRel([string]$abs) {
    if ($abs -like "$RepoRootTrim*") { return $abs.Substring($RepoRootTrim.Length).TrimStart('\', '/') }
    return $abs
}
function Esc([string]$s) {
    if ($null -eq $s) { return '' }
    return ($s -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;')
}
function WriteUtf8([string]$path, [string]$text, [bool]$bom) {
    $enc = New-Object System.Text.UTF8Encoding($bom)
    [System.IO.File]::WriteAllText($path, $text, $enc)
}
function ParseDate([string]$s) {
    $parsed = [DateTime]::MinValue
    if ([DateTime]::TryParse($s, [ref]$parsed)) { return $parsed }
    return $null
}

# ============================================================================
# 0. 前置体检
# ============================================================================
$gitVer = (& git --version 2>&1 | Select-Object -First 1)
Say "U02-lane-audit ｜ 并行车道现场清理（只报不删） ｜ 跑于 $($Now.ToString('yyyy-MM-dd HH:mm:ss'))"
Say ("环境：PS {0} ｜ {1}" -f $PSVersionTable.PSVersion.ToString(), $gitVer)
Say ("项目根 -RepoRoot = $RepoRoot")
Say ("在飞护栏 -GuardMinutes = $GuardMinutes ｜ 引用扫描 -NoRefScan = $([bool]$NoRefScan)")

$RepoRootTrim = $RepoRoot.TrimEnd('\', '/')
if (-not (Test-Path -LiteralPath (Join-Path $RepoRootTrim '.git'))) {
    Say "BLOCK-前置不成立：$RepoRootTrim 下没有 .git，本工具不判定、不动作。请用 -RepoRoot 指到真正的项目根。"
    Say '退出码 2 = 跑不起来（不等于"现场有垃圾"）。'
    exit 2
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Say 'BLOCK-前置不成立：本机 PATH 里没有 git，三张清单都出不了。'
    exit 2
}
if ([string]::IsNullOrWhiteSpace($OutDir)) { $OutDir = Join-Path $PSScriptRoot 'reports' }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

# 项目根自身的工作区脏状态：孤儿目录判据的对照物，必须先拿到
$rootStatus = U02Git $RepoRootTrim @('status', '--porcelain')
$rootDirty = @($rootStatus.Lines | Where-Object { $_ -match '\S' })
Say ("项目根 git status --porcelain = {0} 行（这些脏文件留在原地，本工具不碰，也不得算到任何副本头上）" -f $rootDirty.Count)

# ============================================================================
# 1. 清单1：还挂着的工作副本（三方对差）
# ============================================================================
Say ''
Say '=== 清单1 ｜ 工作副本：git 登记 vs worktrees/ 目录 vs .git/worktrees 管理区 ==='

$adminDir = Join-Path $RepoRootTrim '.git\worktrees'
$wtRoot = Join-Path $RepoRootTrim 'worktrees'

$regPairs = @{}
$regPaths = @{}
$pw = U02Git $RepoRootTrim @('worktree', 'list', '--porcelain')
$curPath = ''
foreach ($ln in $pw.Lines) {
    if ($ln -like 'worktree *') { $curPath = $ln.Substring(9).Replace('/', '\') }
    elseif ($ln -like 'branch refs/heads/*' -and $curPath -ne '') { $regPairs[$curPath] = $ln.Substring(18) }
}
foreach ($k in @($regPairs.Keys)) { $regPaths[$k.ToLower()] = $true }
Say ("口径 A：git worktree list --porcelain 登记条目 = {0}（含主仓；平表格式会多一行表头，别按行数误判）" -f $regPairs.Count)

$adminNames = @()
if (Test-Path -LiteralPath $adminDir) {
    $adminNames = @(Get-ChildItem -LiteralPath $adminDir -Directory | ForEach-Object { $_.Name })
}
Say ("口径 B：.git\worktrees 管理区 = {0} 个：{1}" -f $adminNames.Count, ($adminNames -join ', '))

$diskDirs = @()
if (Test-Path -LiteralPath $wtRoot) { $diskDirs = @(Get-ChildItem -LiteralPath $wtRoot -Directory) }
Say ("口径 C：磁盘 {0} = {1} 个目录：{2}" -f (ToRel $wtRoot), $diskDirs.Count, (($diskDirs | ForEach-Object { $_.Name }) -join ', '))
$missReg = @($regPairs.Keys | Where-Object { $_ -ne $RepoRootTrim.Replace('/', '\') -and -not (Test-Path -LiteralPath $_) })
Say ("口径 D：登记了但目录已不在 = {0} 个{1}" -f $missReg.Count, $(if ($missReg.Count) { '：' + (($missReg | ForEach-Object { ToRel $_ }) -join ', ') } else { '' }))
Say ''

$wtList = @()
$regSeen = @{}
foreach ($d in $diskDirs) {
    $abs = $d.FullName.Replace('/', '\')
    $regName = $null
    if ($regPaths.ContainsKey($abs.ToLower())) { $regName = $regPairs[$abs]; $regSeen[$abs] = $true }
    $hasGit = (Test-Path -LiteralPath (Join-Path $abs '.git'))
    $item = [ordered]@{
        Name            = $d.Name
        PathRel         = ToRel $abs
        PathAbs         = $abs
        Registered      = ($null -ne $regName)
        AdminRegistered = ($adminNames -contains $d.Name)
        HasDotGit       = $hasGit
        Branch          = ''
        Dirty           = $null
        Ahead           = $null
        MergedToMaster  = ''
        NewestWrite     = $d.LastWriteTime
        LastWrite       = $d.LastWriteTime
        InFlight        = $false
        Verdict         = ''
        Note            = ''
    }
    if (-not $hasGit) {
        # 没有 .git 的目录不是工作副本。在这里跑 git 会向上命中主仓，把主仓那
        # 若干脏行算到它头上（实测：项目根 status = $($rootDirty.Count) 行会被复读出来）。
        # 所以这一支只读文件系统，一条 git 命令都不发。
        $inner = @(Get-ChildItem -LiteralPath $abs -Force -ErrorAction SilentlyContinue)
        $files = @(Get-ChildItem -LiteralPath $abs -Recurse -File -Force -ErrorAction SilentlyContinue)
        $bytes = 0L
        $newest = $d.LastWriteTime
        foreach ($f in $files) { $bytes += $f.Length; if ($f.LastWriteTime -gt $newest) { $newest = $f.LastWriteTime } }
        $item.NewestWrite = $newest
        $item.InFlight = IsInFlight $newest
        $item.Note = ('git 未登记、无 .git，不是工作副本 ｜ 顶层 {0} 项、递归 {1} 个文件、{2:N0} 字节' -f $inner.Count, $files.Count, $bytes)
        if ($item.InFlight) { $item.Verdict = 'BLOCK-孤儿目录但在飞' } else { $item.Verdict = 'WARN-孤儿目录' }
    }
    else {
        $st = U02Git $abs @('status', '--porcelain')
        $dirtyLines = @($st.Lines | Where-Object { $_ -match '\S' })
        $item.Dirty = $dirtyLines.Count
        $item.Branch = $regName
        $newest = $d.LastWriteTime
        foreach ($dl in $dirtyLines) {
            $rel = ($dl -replace '^\s*[A-Za-z?]+\s+', '').Trim('"')
            if ($rel -match '->') { $rel = ($rel -split '->')[-1].Trim().Trim('"') }
            $fp = Join-Path $abs $rel
            if (Test-Path -LiteralPath $fp) {
                $ft = (Get-Item -LiteralPath $fp).LastWriteTime
                if ($ft -gt $newest) { $newest = $ft }
            }
        }
        $item.NewestWrite = $newest
        if ($regName) {
            $anc = U02Git $RepoRootTrim @('merge-base', '--is-ancestor', $regName, 'master')
            if ($anc.Code -eq 0) { $item.MergedToMaster = 'yes' } else { $item.MergedToMaster = 'no' }
            $ah = U02Git $RepoRootTrim @('rev-list', '--count', "master..$regName")
            $item.Ahead = [int](($ah.Lines | Where-Object { $_ -match '^\d+$' } | Select-Object -First 1))
            $cd = U02Git $RepoRootTrim @('log', '-1', '--format=%cI', $regName)
            $t = ParseDate ($cd.Lines | Select-Object -First 1)
            if ($null -ne $t -and $t -gt $item.NewestWrite) { $item.NewestWrite = $t }
        }
        $item.InFlight = IsInFlight $item.NewestWrite
        if ($null -eq $regName) {
            $item.Verdict = 'WARN-有 .git 但 git 未登记'
        }
        elseif ($item.InFlight) { $item.Verdict = 'BLOCK-在飞' }
        elseif ($item.Dirty -gt 0) { $item.Verdict = 'KEEP-有未提交改动' }
        elseif ($item.MergedToMaster -eq 'no' -and $item.Ahead -gt 0) { $item.Verdict = 'KEEP-分支未进 master' }
        else { $item.Verdict = 'WARN-登记副本无残留施工' }
        $item.Note = ('分支 {0} ｜ 未提交 {1} 行 ｜ 相对 master 超前 {2} ｜ 已进 master={3}' -f `
                $(if ($item.Branch) { $item.Branch } else { '（未登记，不发 git）' }), $item.Dirty, $item.Ahead, $item.MergedToMaster)
    }
    $wtList += [pscustomobject]$item
}

foreach ($kv in @($regPairs.GetEnumerator())) {
    if (-not $regSeen.ContainsKey($kv.Key) -and $kv.Key -ne $RepoRootTrim.Replace('/', '\')) {
        $wtList += [pscustomobject]([ordered]@{
                Name = (Split-Path $kv.Key -Leaf); PathRel = ToRel $kv.Key; PathAbs = $kv.Key
                Registered = $true; AdminRegistered = ($adminNames -contains (Split-Path $kv.Key -Leaf))
                HasDotGit = $false; Branch = $kv.Value; Dirty = $null; Ahead = $null; MergedToMaster = ''
                NewestWrite = $null; LastWrite = $null; InFlight = $false
                Verdict = 'WARN-登记在但目录不在'
                Note = 'git 仍登记，磁盘已无此目录；需人工确认后自行 git worktree prune（本工具不 prune）'
            })
    }
}

$wWarn = @($wtList | Where-Object { $_.Verdict -like 'WARN*' })
$wBlock = @($wtList | Where-Object { $_.Verdict -like 'BLOCK*' })
$wKeep = @($wtList | Where-Object { $_.Verdict -like 'KEEP*' })
Say ("小计：条目 {0} ｜ WARN {1} ｜ BLOCK(在飞) {2} ｜ KEEP {3}" -f $wtList.Count, $wWarn.Count, $wBlock.Count, $wKeep.Count)
foreach ($w in ($wtList | Sort-Object Verdict, Name)) {
    Say ('  [{0}] {1}' -f $w.Verdict, $w.PathRel)
    if ($w.Note) { Say ('        {0}' -f $w.Note) }
    Say ('        目录最后写入 {0} ｜ 在飞护栏内 = {1}' -f (AgeText $w.LastWrite), $(if ($w.InFlight) { '是（禁止动）' } else { '否' }))
}

# ============================================================================
# 2. 清单2：本地分支（"仅保留 master"这条此刻是否仍违例）
# ============================================================================
Say ''
Say '=== 清单2 ｜ 本地分支：是否已进 master、超前多少、被谁占用 ==='
$fmt = '%(refname:short)|%(objectname:short)|%(committerdate:iso-strict)|%(upstream:short)|%(HEAD)'
$brs = U02Git $RepoRootTrim @('for-each-ref', 'refs/heads', "--format=$fmt")
$wtByBranch = @{}
foreach ($w in $wtList) { if ($w.Branch) { $wtByBranch[$w.Branch.ToLower()] = $w.PathRel } }

$brList = @()
foreach ($ln in ($brs.Lines | Where-Object { $_ -match '\S' })) {
    $p = $ln.Split('|')
    $name = $p[0]; $sha = $p[1]
    $t = ParseDate $p[2]
    $up = $p[3]
    $merged = ''; $ahead = 0
    if ($name -ne 'master') {
        $anc = U02Git $RepoRootTrim @('merge-base', '--is-ancestor', $name, 'master')
        if ($anc.Code -eq 0) { $merged = 'yes' } else { $merged = 'no' }
        $ah = U02Git $RepoRootTrim @('rev-list', '--count', "master..$name")
        $ahead = [int](($ah.Lines | Where-Object { $_ -match '^\d+$' } | Select-Object -First 1))
    }
    $occ = ''
    if ($wtByBranch.ContainsKey($name.ToLower())) { $occ = $wtByBranch[$name.ToLower()] }
    $inf = IsInFlight $t
    if ($name -eq 'master') { $verdict = 'INFO-主干，保留' }
    elseif ($inf) { $verdict = 'BLOCK-在飞' }
    elseif ($merged -eq 'no' -and $ahead -gt 0) { $verdict = 'KEEP-未进 master，删＝丢施工' }
    elseif ($merged -eq 'yes' -and $occ) { $verdict = 'WARN-已进 master 但被副本占用' }
    elseif ($merged -eq 'yes') { $verdict = 'WARN-已进 master 且无占用' }
    else { $verdict = 'WARN-判据不全' }
    $brList += [pscustomobject]([ordered]@{
            Name = $name; Sha = $sha; HeadDate = $t; Upstream = $up
            MergedToMaster = $merged; AheadOfMaster = $ahead; CheckedOutIn = $occ
            InFlight = $inf; Verdict = $verdict
            Note = ('超前 {0} ｜ 上游 {1} ｜ 占用副本 {2} ｜ sha {3}' -f $ahead, $(if ($up) { $up } else { '无' }), $(if ($occ) { $occ } else { '无' }), $sha)
        })
}
$nonMaster = @($brList | Where-Object { $_.Name -ne 'master' })
$inMaster = @($nonMaster | Where-Object { $_.MergedToMaster -eq 'yes' })
Say ("小计：本地分支 {0} 条（master + 其他 {1}）｜ 已进 master {2} 条 ｜ 未进 master {3} 条" -f $brList.Count, $nonMaster.Count, $inMaster.Count, ($nonMaster.Count - $inMaster.Count))
Say ("用户成文要求「仅保留 master」：当前多挂 {0} 条 → 该要求此刻{1}" -f $nonMaster.Count, $(if ($nonMaster.Count -gt 0) { '仍违例' } else { '已达标' }))
foreach ($b in ($brList | Sort-Object Verdict, Name)) {
    Say ('  [{0}] {1,-34} {2}' -f $b.Verdict, $b.Name, $b.Note)
    Say ('        末次提交 {0}' -f (AgeText $b.HeadDate))
}

# ============================================================================
# 3. 清单3：temp 里的一次性启动脚本
# ============================================================================
Say ''
Say '=== 清单3 ｜ temp 一次性脚本候选（命名启发 + 是否被入库文件引用） ==='

if ($TempPath.Count -eq 0) {
    $TempPath = @((Join-Path $RepoRootTrim 'AGENTS\temp'), (Join-Path $RepoRootTrim 'temp'), (Join-Path $RepoRootTrim 'tmp'))
}
$scriptExt = @('.ps1', '.bat', '.cmd', '.mjs', '.cjs', '.js', '.py', '.sh')
$oneShotRegex = '(?i)(launch|(^|[^a-z])tmp|once|backup|scan|export|dump|guard|probe|e2e|final|check|wf[-_]?block|step\d|run[-_])'
$tracked = @(U02Git $RepoRootTrim @('ls-files') | Select-Object -ExpandProperty Lines | Where-Object { $_ -match '\S' })
Say ("引用扫描口径：只查已入库文件（git ls-files = {0} 个跟踪文件），未入库文档/脚本里的引用看不见 → 这是本清单的假绿风险" -f $tracked.Count)

$tempList = @()
$recheck = @()
foreach ($tp in $TempPath) {
    $tpTrim = $tp.TrimEnd('\', '/')
    if (-not (Test-Path -LiteralPath $tpTrim)) {
        Say ("  跳过不存在的 temp 根：{0}" -f $tpTrim)
        $recheck += [pscustomobject]@{ Root = $tpTrim; Exists = $false; Top = 0; Files = 0; Dirs = 0; Scripts = 0 }
        continue
    }
    $topFiles = @(Get-ChildItem -LiteralPath $tpTrim -File -Force -ErrorAction SilentlyContinue)
    $topDirs = @(Get-ChildItem -LiteralPath $tpTrim -Directory -Force -ErrorAction SilentlyContinue)
    $allFiles = @(Get-ChildItem -LiteralPath $tpTrim -Recurse -File -Force -ErrorAction SilentlyContinue)
    $allDirs = @(Get-ChildItem -LiteralPath $tpTrim -Recurse -Directory -Force -ErrorAction SilentlyContinue)
    $nScript = @($allFiles | Where-Object { $scriptExt -contains $_.Extension.ToLower() }).Count
    $recheck += [pscustomobject]@{
        Root = $tpTrim; Exists = $true; Top = ($topFiles.Count + $topDirs.Count)
        Files = $allFiles.Count; Dirs = $allDirs.Count; Scripts = $nScript
    }
    Say ('temp 根 {0} ｜ 顶层条目 {1}（文件 {2} + 子目录 {3}）｜ 递归文件 {4} ｜ 递归子目录 {5} ｜ 递归脚本 {6}' -f `
            (ToRel $tpTrim), ($topFiles.Count + $topDirs.Count), $topFiles.Count, $topDirs.Count, $allFiles.Count, $allDirs.Count, $nScript)

    # 外部报告点名的 815b3-launch-`$name.ps1：三口径复点，防止"在错目录 find 出 0 就判死"
    $hitStrict = @($topFiles | Where-Object { $_.Name -like '815b3-launch-*.ps1' })
    $hitLoose = @($allFiles | Where-Object { $_.Name -match '(?i)815b3' })
    $hitTracked = @($tracked | Where-Object { $_ -match '(?i)815b3' })
    $osHit = @()
    if ($env:TEMP -and (Test-Path -LiteralPath $env:TEMP)) {
        $osHit = @(Get-ChildItem -LiteralPath $env:TEMP -File -Force -Filter '*815b3*' -ErrorAction SilentlyContinue)
    }
    $topDirWith815 = @($topDirs | Where-Object { $_.Name -match '(?i)815b3' })
    Say ('  出处复点 815b3 ｜ 严格（本根顶层 815b3-launch-*.ps1）= {0} ｜ 宽松（本根递归 *815b3* 文件）= {1} ｜ 本根顶层同名子目录 = {2} ｜ 入库文件路径含 815b3 = {3} ｜ 系统 %TEMP% 顶层 = {4}（{5}）' -f `
            $hitStrict.Count, $hitLoose.Count, $topDirWith815.Count, $hitTracked.Count, $osHit.Count, $(if ($env:TEMP) { ToRel $env:TEMP.TrimEnd('\') } else { '无 %TEMP%' }))

    foreach ($f in ($topFiles | Where-Object { $scriptExt -contains $_.Extension.ToLower() })) {
        $stem = [IO.Path]::GetFileNameWithoutExtension($f.Name)
        $refCount = 0; $ref = ''
        if (-not $NoRefScan) {
            $g = U02Git $RepoRootTrim @('grep', '-F', '-l', '--', $stem)
            $refLines = @($g.Lines | Where-Object { $_ -match '\S' -and $_ -notmatch '^(fatal|error):' })
            $refCount = $refLines.Count
            $ref = ($refLines | Select-Object -First 2) -join '; '
        }
        $looks = ($f.Name -match $oneShotRegex)
        if ($NoRefScan) { $verdict = $(if ($looks) { 'WARN-一次性候选(未做引用扫描)' } else { 'INFO-未分类(未做引用扫描)' }) }
        elseif ($refCount -gt 0) { $verdict = 'KEEP-被入库文件引用' }
        elseif ($looks) { $verdict = 'WARN-一次性候选' }
        else { $verdict = 'INFO-未分类' }
        $note = '名字不像一次性，入库也零引用 —— 交人眼看'
        if ($refCount -gt 0) { $note = "引用见：$ref" }
        elseif ($looks) { $note = '名字像一次性（launch/probe/check/final/backup/…），且入库文件零引用' }
        $tempList += [pscustomobject]([ordered]@{
                Name = $f.Name; RelPath = (ToRel $f.FullName); Size = $f.Length
                Ext = $f.Extension.ToLower(); LastWrite = $f.LastWriteTime
                AgeDays = (AgeDays $f.LastWriteTime); InFlight = (IsInFlight $f.LastWriteTime)
                RefHits = $refCount; RefSample = $ref; NameHeuristic = $(if ($looks) { '命中' } else { '未命中' })
                Verdict = $verdict; Note = $note
            })
    }
}
$tWarn = @($tempList | Where-Object { $_.Verdict -like 'WARN*' })
$tKeep = @($tempList | Where-Object { $_.Verdict -like 'KEEP*' })
$tBlock = @($tempList | Where-Object { $_.InFlight })
Say ("小计：顶层脚本 {0} ｜ WARN 一次性候选 {1} ｜ KEEP 被引用 {2} ｜ {3} 分钟内有写入 {4}" -f $tempList.Count, $tWarn.Count, $tKeep.Count, $GuardMinutes, $tBlock.Count)
foreach ($t in ($tempList | Sort-Object Verdict, Name)) {
    Say ('  [{0}] {1,-40} {2,9} 字节 ｜ {3} ｜ 入库引用 {4} ｜ 名字启发 {5}' -f $t.Verdict, $t.Name, ('{0:N0}' -f $t.Size), (AgeText $t.LastWrite), $t.RefHits, $t.NameHeuristic)
    if ($t.Note) { Say ('        {0}' -f $t.Note) }
}

# ============================================================================
# 4. 附加线索：僵死进程（简报 L123 点名的两个 codex pid）
# ============================================================================
Say ''
Say '=== 附加线索 ｜ 简报 L123 点名的 pid 现在还在不在（只查不杀） ==='
$procList = @()
foreach ($onePid in $WatchPids) {
    $pp = Get-Process -Id $onePid -ErrorAction SilentlyContinue
    if ($pp) {
        $procList += [pscustomobject]@{ Pid = $onePid; Alive = $true; Name = $pp.ProcessName; Note = '仍在运行；本工具不杀进程，CPU/IO 是否停滞请负责人自己看任务管理器' }
        Say ('  [INFO-进程仍在] pid {0} = {1}，启动于 {2}' -f $onePid, $pp.ProcessName, $pp.StartTime.ToString('yyyy-MM-dd HH:mm'))
    }
    else {
        $procList += [pscustomobject]@{ Pid = $onePid; Alive = $false; Name = ''; Note = '已不存在，无需处理' }
        Say ('  [INFO-进程已消失] pid {0}' -f $onePid)
    }
}

# ============================================================================
# 5. 汇总 + 落盘（MD / JSON / HTML；带时间戳，绝不覆盖既有文件）
# ============================================================================
Say ''
Say '=== 汇总 ==='
Say ('三张清单 WARN：工作副本 {0} ｜ 分支 {1} ｜ temp 脚本 {2}' -f `
        $wWarn.Count, (@($brList | Where-Object { $_.Verdict -like 'WARN*' }).Count), $tWarn.Count)
$inflightTotal = @($wtList | Where-Object { $_.InFlight }).Count + @($brList | Where-Object { $_.InFlight }).Count + $tBlock.Count
Say ('在飞（{0} 分钟内）条目合计：{1} —— 这些一律不许动' -f $GuardMinutes, $inflightTotal)
Say '本工具未删除、未覆盖、未修改任何被检查的文件；未跑 prune，未跑 branch -D，未杀进程，未注册计划任务。'
Say '下一步由负责人拍板：逐条确认 WARN 后再自行回收；删除一律走回收站。'

$wtFlat = @()
foreach ($w in $wtList) {
    $wtFlat += [ordered]@{
        pathRel = $w.PathRel; hasDotGit = $w.HasDotGit; registered = $w.Registered
        adminRegistered = $w.AdminRegistered; branch = $w.Branch; dirty = $w.Dirty
        ahead = $w.Ahead; mergedToMaster = $w.MergedToMaster; newestWrite = (FmtTime $w.NewestWrite)
        dirLastWrite = (FmtTime $w.LastWrite); inFlight = $w.InFlight; verdict = $w.Verdict; note = $w.Note
    }
}
$payload = [ordered]@{
    unit         = 'C-T07-09'
    tool         = 'U02-lane-audit.ps1'
    runAt        = $Now.ToString('yyyy-MM-dd HH:mm:ss')
    repoRoot     = $RepoRootTrim
    guardMinutes = $GuardMinutes
    mode         = '只报不删'
    counts       = [ordered]@{
        worktreeRegisterLines  = $regPairs.Count
        worktreesDiskDirs      = $diskDirs.Count
        adminRegistered        = $adminNames.Count
        registeredButMissing   = $missReg.Count
        branchesTotal          = $brList.Count
        branchesNotMaster      = $nonMaster.Count
        branchesMergedToMaster = $inMaster.Count
        tempScriptCandidates   = $tempList.Count
        tempWarn               = $tWarn.Count
        wtWarn                 = $wWarn.Count
        wtBlock                = $wBlock.Count
        wtKeep                 = $wKeep.Count
        inFlightTotal          = $inflightTotal
        deleted                = 0
    }
    worktrees    = $wtFlat
    branches     = @($brList | ForEach-Object { [ordered]@{ name = $_.Name; sha = $_.Sha; mergedToMaster = $_.MergedToMaster; aheadOfMaster = $_.AheadOfMaster; checkedOutIn = $_.CheckedOutIn; headDate = (FmtTime $_.HeadDate); inFlight = $_.InFlight; verdict = $_.Verdict; note = $_.Note } })
    tempScripts  = @($tempList | ForEach-Object { [ordered]@{ file = $_.RelPath; size = $_.Size; lastWrite = (FmtTime $_.LastWrite); ageDays = $_.AgeDays; refHits = $_.RefHits; nameHeuristic = $_.NameHeuristic; inFlight = $_.InFlight; verdict = $_.Verdict; note = $_.Note } })
    tempBase     = @($recheck | ForEach-Object { [ordered]@{ root = $_.Root; exists = $_.Exists; topEntries = $_.Top; files = $_.Files; dirs = $_.Dirs; scripts = $_.Scripts } })
    pids         = @($procList | ForEach-Object { [ordered]@{ pid = $_.Pid; alive = $_.Alive; name = $_.Name; note = $_.Note } })
    rootDirty    = @($rootDirty)
}

$stamp = $Now.ToString('yyyyMMdd-HHmmss')
$mdPath = Join-Path $OutDir "U02-lane-report-$stamp.md"
$jsonPath = Join-Path $OutDir "U02-lane-report-$stamp.json"
$htmlPath = Join-Path $OutDir "U02-lane-report-$stamp.html"

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('# U02 并行车道现场清单（只报不删）')
[void]$sb.AppendLine('')
[void]$sb.AppendLine("- 跑的时间：$($Now.ToString('yyyy-MM-dd HH:mm:ss')) ｜ 在飞护栏：$GuardMinutes 分钟 ｜ 项目根：$RepoRootTrim")
[void]$sb.AppendLine('- 本清单不删除任何东西。WARN = 建议交人确认；BLOCK = 在飞护栏内，绝对不许动；KEEP = 动了会丢东西；INFO = 只是状态。')
[void]$sb.AppendLine('- 绘约项目的记忆库不得导入或重建（用户 2026-09-04 已清档）；本件只引用磁盘与 git 事实。')
[void]$sb.AppendLine("- 确切命令：$PSCommandPath $(if ($NoRefScan) { '-NoRefScan' } else { '' })")
[void]$sb.AppendLine('')
[void]$sb.AppendLine("## 清单1 ｜ 工作副本（git 登记 $($regPairs.Count) 行 / worktrees 目录 $($diskDirs.Count) 个 / 管理区 $($adminNames.Count) 个 / 登记但目录不在 $($missReg.Count) 个）")
[void]$sb.AppendLine('')
[void]$sb.AppendLine('| 判定 | 路径（相对项目根） | 有 .git | git 登记 | 分支 | 未提交行 | 超前 master | 已进 master | 最近写入 | 说明 |')
[void]$sb.AppendLine('|---|---|---|---|---|---|---|---|---|---|')
foreach ($w in ($wtList | Sort-Object Verdict, PathRel)) {
    if ($env:U02_DEBUG) {
        Say ('DEBUG row: verdict=[{0}] pathrel=[{1}] dotgit=[{2}] reg=[{3}] branch=[{4}] dirty=[{5}] ahead=[{6}] merged=[{7}] newest=[{8}] newestType=[{9}] note=[{10}]' -f `
                $w.Verdict, $w.PathRel, $w.HasDotGit, $w.Registered, $w.Branch, $w.Dirty, $w.Ahead, $w.MergedToMaster, $w.NewestWrite, $(if ($null -ne $w.NewestWrite) { $w.NewestWrite.GetType().Name } else { 'NULL' }), $w.Note)
    }
    [void]$sb.AppendLine('| {0} | {1} | {2} | {3} | {4} | {5} | {6} | {7} | {8} | {9} |' -f `
            $w.Verdict, $w.PathRel, $(if ($w.HasDotGit) { '是' } else { '否' }), $(if ($w.Registered) { '是' } else { '否' }), `
            $(if ($w.Branch) { $w.Branch } else { '—' }), $w.Dirty, $w.Ahead, $(if ($w.MergedToMaster) { $w.MergedToMaster } else { '—' }), (AgeText $w.NewestWrite), $w.Note)
}
[void]$sb.AppendLine('')
[void]$sb.AppendLine("## 清单2 ｜ 本地分支（共 $($brList.Count) 条；用户成文要求「仅保留 master」，当前多挂 $($nonMaster.Count) 条）")
[void]$sb.AppendLine('')
[void]$sb.AppendLine('| 判定 | 分支 | 已进 master | 超前 master | 被哪个副本占用 | 末次提交 | 说明 |')
[void]$sb.AppendLine('|---|---|---|---|---|---|---|')
foreach ($b in ($brList | Sort-Object Verdict, Name)) {
    [void]$sb.AppendLine('| {0} | {1} | {2} | {3} | {4} | {5} | {6} |' -f `
            $b.Verdict, $b.Name, $b.MergedToMaster, $b.AheadOfMaster, $(if ($b.CheckedOutIn) { $b.CheckedOutIn } else { '无' }), (AgeText $b.HeadDate), $b.Note)
}
[void]$sb.AppendLine('')
[void]$sb.AppendLine("## 清单3 ｜ temp 一次性脚本候选（顶层脚本 $($tempList.Count) 个，WARN $($tWarn.Count) 个）")
[void]$sb.AppendLine('')
[void]$sb.AppendLine('| 判定 | 文件（相对项目根） | 大小 | 最后写入 | 天数 | 入库引用数 | 名字启发 | 说明 |')
[void]$sb.AppendLine('|---|---|---|---|---|---|---|---|')
foreach ($t in ($tempList | Sort-Object Verdict, Name)) {
    [void]$sb.AppendLine('| {0} | {1} | {2:N0} | {3} | {4} | {5} | {6} | {7} |' -f `
            $t.Verdict, $t.RelPath, $t.Size, (FmtTime $t.LastWrite), $t.AgeDays, $t.RefHits, $t.NameHeuristic, $t.Note)
}
[void]$sb.AppendLine('')
[void]$sb.AppendLine('### temp 基数复点（两种口径都跑）')
foreach ($r in $recheck) {
    if ($r.Exists) {
        [void]$sb.AppendLine("- $($r.Root)：顶层条目 $($r.Top) ｜ 递归文件 $($r.Files) ｜ 递归子目录 $($r.Dirs) ｜ 递归脚本 $($r.Scripts)")
    }
    else {
        [void]$sb.AppendLine("- $($r.Root)：不存在（跳过）")
    }
}
[void]$sb.AppendLine('')
[void]$sb.AppendLine('## 附加线索 ｜ pid')
foreach ($p in $procList) {
    [void]$sb.AppendLine("- pid $($p.Pid)：$(if ($p.Alive) { '仍在运行 ' + $p.Name } else { '已不存在' }) ｜ $($p.Note)")
}
[void]$sb.AppendLine('')
[void]$sb.AppendLine("## 项目根自身脏状态（$($rootDirty.Count) 行，与副本无关，故意不并入判定）")
foreach ($rd in $rootDirty) { [void]$sb.AppendLine("- $rd") }
[void]$sb.AppendLine('')
[void]$sb.AppendLine('## 已知会假绿/会漏的地方')
[void]$sb.AppendLine('- 引用扫描只覆盖已入库文件；未入库文档里的引用看不到。')
[void]$sb.AppendLine('- 在飞判据取「目录 mtime + 脏文件 mtime + 分支末次提交时间」三者最新；被 .gitignore 掉的深层改动兜不住。')
[void]$sb.AppendLine('- 「已进 master」用 merge-base --is-ancestor 证明；squash-merge / rebase-merge 进来的分支会判成未进，宁保守不误删。')
[void]$sb.AppendLine('- 无 .git 的目录不发任何 git 命令（否则向上命中主仓，把主仓脏状态算到它头上）。')
WriteUtf8 $mdPath $sb.ToString() $true

ConvertTo-Json -InputObject $payload -Depth 6 | ForEach-Object { WriteUtf8 $jsonPath $_ $false }

if (-not $NoHtml) {
    $css = 'body{font-family:"Microsoft YaHei",Segoe UI,Arial,sans-serif;margin:24px;background:#f7f7f5;color:#222}' +
        'h1{font-size:20px}h2{font-size:16px;margin-top:28px}table{border-collapse:collapse;width:100%;background:#fff;font-size:13px}' +
        'th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#e8e8e4}' +
        '.WARN{background:#fff3cd}.BLOCK{background:#f8d7da}.KEEP{background:#d4edda}.INFO{background:#e7f3fe}' +
        '.bar{position:fixed;top:0;left:0;width:100%;height:4px;background:#b8860b}li{margin:3px 0}p{line-height:1.6}'
    $h = New-Object System.Text.StringBuilder
    [void]$h.AppendLine('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>U02 并行车道现场清单</title><style>' + $css + '</style></head><body>')
    [void]$h.AppendLine('<div class="bar"></div>')
    [void]$h.AppendLine('<h1>U02 并行车道现场清单（只报不删）</h1>')
    [void]$h.AppendLine('<p>跑的时间 <b>' + (Esc $Now.ToString('yyyy-MM-dd HH:mm:ss')) + '</b> ｜ 在飞护栏 ' + $GuardMinutes + ' 分钟 ｜ 项目根 ' + (Esc $RepoRootTrim) + '</p>')
    [void]$h.AppendLine('<div class="INFO" style="padding:10px;border:1px solid #b3d4fc;border-radius:6px"><b>怎么看：</b>' +
        '<b>WARN</b> = 建议交人确认后回收（本工具不删）；<b>BLOCK</b> = 在飞护栏内，绝对不许动；<b>KEEP</b> = 动了会丢东西；<b>INFO</b> = 只是状态。' +
        '<br>本页不删除任何东西，也不替你决定要不要删。绘约项目的记忆库不得导入或重建（用户 2026-09-04 已清档）。</div>')
    [void]$h.AppendLine('<h2>' + ("清单1 ｜ 工作副本（git 登记 {0} 行 / worktrees 目录 {1} 个 / 管理区 {2} 个 / 登记但目录不在 {3} 个）" -f $regPairs.Count, $diskDirs.Count, $adminNames.Count, $missReg.Count) + '</h2>')
    [void]$h.AppendLine('<table><tr><th>判定</th><th>路径（相对项目根）</th><th>有 .git</th><th>git 登记</th><th>分支</th><th>未提交行</th><th>超前 master</th><th>已进 master</th><th>最近写入</th><th>说明</th></tr>')
    foreach ($w in ($wtList | Sort-Object Verdict, PathRel)) {
        $cls = (($w.Verdict -split '-')[0])
        [void]$h.AppendLine('<tr class="' + $cls + '"><td>' + (Esc $w.Verdict) + '</td><td>' + (Esc $w.PathRel) + '</td><td>' + $(if ($w.HasDotGit) { '是' } else { '否' }) + '</td><td>' + $(if ($w.Registered) { '是' } else { '否' }) + '</td><td>' + (Esc $w.Branch) + '</td><td>' + $w.Dirty + '</td><td>' + $w.Ahead + '</td><td>' + (Esc $w.MergedToMaster) + '</td><td>' + (Esc (AgeText $w.NewestWrite)) + '</td><td>' + (Esc $w.Note) + '</td></tr>')
    }
    [void]$h.AppendLine('</table>')
    [void]$h.AppendLine('<h2>' + ("清单2 ｜ 本地分支（共 {0} 条；用户成文要求「仅保留 master」，当前多挂 {1} 条）" -f $brList.Count, $nonMaster.Count) + '</h2>')
    [void]$h.AppendLine('<table><tr><th>判定</th><th>分支</th><th>已进 master</th><th>超前 master</th><th>被哪个副本占用</th><th>末次提交</th><th>说明</th></tr>')
    foreach ($b in ($brList | Sort-Object Verdict, Name)) {
        $cls = (($b.Verdict -split '-')[0])
        [void]$h.AppendLine('<tr class="' + $cls + '"><td>' + (Esc $b.Verdict) + '</td><td>' + (Esc $b.Name) + '</td><td>' + (Esc $b.MergedToMaster) + '</td><td>' + $b.AheadOfMaster + '</td><td>' + $(if ($b.CheckedOutIn) { (Esc $b.CheckedOutIn) } else { '无' }) + '</td><td>' + (Esc (AgeText $b.HeadDate)) + '</td><td>' + (Esc $b.Note) + '</td></tr>')
    }
    [void]$h.AppendLine('</table>')
    [void]$h.AppendLine('<h2>' + ("清单3 ｜ temp 一次性脚本候选（顶层脚本 {0} 个）" -f $tempList.Count) + '</h2>')
    [void]$h.AppendLine('<table><tr><th>判定</th><th>文件</th><th>大小(字节)</th><th>最后写入</th><th>天数</th><th>入库引用数</th><th>名字启发</th><th>说明</th></tr>')
    foreach ($t in ($tempList | Sort-Object Verdict, Name)) {
        $cls = (($t.Verdict -split '-')[0])
        [void]$h.AppendLine('<tr class="' + $cls + '"><td>' + (Esc $t.Verdict) + '</td><td>' + (Esc $t.RelPath) + '</td><td>' + ('{0:N0}' -f $t.Size) + '</td><td>' + (Esc (FmtTime $t.LastWrite)) + '</td><td>' + $t.AgeDays + '</td><td>' + $t.RefHits + '</td><td>' + (Esc $t.NameHeuristic) + '</td><td>' + (Esc $t.Note) + '</td></tr>')
    }
    [void]$h.AppendLine('</table>')
    [void]$h.AppendLine('<h2>temp 基数复点（两种口径）+ pid 线索</h2><ul>')
    foreach ($r in $recheck) {
        if ($r.Exists) { [void]$h.AppendLine('<li>' + (Esc $r.Root) + '：顶层条目 ' + $r.Top + ' ｜ 递归文件 ' + $r.Files + ' ｜ 递归子目录 ' + $r.Dirs + ' ｜ 递归脚本 ' + $r.Scripts + '</li>') }
        else { [void]$h.AppendLine('<li>' + (Esc $r.Root) + '：不存在（跳过）</li>') }
    }
    foreach ($p in $procList) { [void]$h.AppendLine('<li>pid ' + $p.Pid + '：' + $(if ($p.Alive) { '仍在运行 ' + (Esc $p.Name) } else { '已不存在' }) + ' ｜ ' + (Esc $p.Note) + '</li>') }
    [void]$h.AppendLine('</ul>')
    [void]$h.AppendLine('<h2>已知会假绿/会漏的地方</h2><ul><li>引用扫描只覆盖已入库文件，未入库文档里的引用看不到。</li><li>在飞判据取「目录 mtime + 脏文件 mtime + 分支末次提交」三者最新；被 .gitignore 掉的深层改动兜不住。</li><li>「已进 master」用 merge-base --is-ancestor 证明；squash/rebase 合入的分支会判成未进，宁保守不误删。</li><li>主仓自身脏状态与副本无关，故意不并入任何副本判定。</li><li>本页不删除任何东西；"要不要删"由负责人拍板，删除请走回收站。</li></ul>')
    [void]$h.AppendLine('</body></html>')
    WriteUtf8 $htmlPath $h.ToString() $true
}

Say '=== 落盘（带时间戳，不覆盖既有文件）==='
foreach ($p in @($mdPath, $jsonPath, $htmlPath)) {
    if (Test-Path -LiteralPath $p) {
        $it = Get-Item -LiteralPath $p
        Say ('  {0}（{1:N0} 字节）' -f $p, $it.Length)
    }
}
Say ("退出码 0 = 清单已出（现场有没有垃圾另说）；本工具全程未删除、未修改被检查对象。")
exit 0
