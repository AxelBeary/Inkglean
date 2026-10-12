# ============================================================
# U02-lane-check.ps1  |  并行车道现场清理 —— 只出清单，不动任何东西
# 单元号：C-T07-09（含并项 C-T06-4）
#
# 它替你回答三件事：
#   1. 现在还挂着哪些工作副本（git 登记 vs 磁盘实有，差集）
#   2. 哪些本地分支的活已经进了主干（证据：merge-base --is-ancestor）
#   3. temp 里躺着哪些一次性启动脚本（未入库）
#
# 用法（最省事：cd 到项目根，敲一条命令）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File U02-lane-check.ps1
# 也可以指定项目根与报告目录：
#   ... -File U02-lane-check.ps1 -Root "D:\path\to\project" -ReportDir "D:\out"
#
# 本脚本 100% 只读：不 remove、不 branch -D、不 kill、不删文件、不写项目内任何地方。
# 唯一写出的东西 = -ReportDir 下的两份报告（.md 与 .html）。
# ============================================================

param(
    [string]$Root = '',
    [string]$Mainline = 'master',
    [int]$StaleMinutes = 30,
    [string]$WorktreesDir = '',
    [string]$ReportDir = '',
    [switch]$Deep,
    [switch]$SkipProcesses,
    [int]$FileScanCap = 30000
)

$ErrorActionPreference = 'Continue'
# R2 起：判据一律来自 U02-verdict.ps1（唯一事实源），与主入口 U02-lane-scan.ps1 共用同一份。
# 本件只做取数 + 输出形式（文本/md/HTML）；判级一律用共享函数返回的 Class，自己不再写 if 判据。
. (Join-Path $PSScriptRoot 'U02-verdict.ps1')
$scriptStart = Get-Date
$script:Items = @()
$script:Notes = @()
$script:Base = @{}

function Add-Item {
    param([string]$Section, [string]$Grade, [string]$Item, [string]$Detail, [string]$Evidence, [string]$Next,
          [string]$Class = 'info', [string]$VCode = '')
    $script:Items += [pscustomobject]@{
        Section  = $Section
        Grade    = $Grade
        Class    = $Class
        VCode    = $VCode
        Item     = $Item
        Detail   = $Detail
        Evidence = $Evidence
        Next     = $Next
    }
}

# R2：共享判据返回的 Code -> 本件自己的**显示词**。判级只看 Class（candidate/hold/blocked/warn/info），
# 显示词是排版，不参与判据 —— 两件套的差别到此为止，再往下就是同一份事实源。
$script:GradeOf = @{
    'CANDIDATE-CONFIRM'   = '可清·证据齐'
    'KEEP-REGISTERED'     = '勿动·在册副本'
    'KEEP-MAIN-ROOT'      = '勿动·主仓本身'
    'KEEP-MASTER'         = '勿动·主干'
    'KEEP-NOT-MERGED'     = '勿动·未进主干'
    'BLOCKED-BY-WORKTREE' = '勿动·被副本挡住'
    'WARN-ACTIVE'         = '待定·在飞'
    'WARN-NOT-EMPTY'      = '待定'
    'WARN-UNREG-WITHGIT'  = '待定'
    'WARN-RECENT'         = '待定'
    'WARN-AHEAD-UNKNOWN'  = '待定'
}
function Grade-Of($V) {
    if ($script:GradeOf.ContainsKey($V.Code)) { return $script:GradeOf[$V.Code] }
    return '待定'
}

function Invoke-Git {
    param([string]$Repo, [string[]]$Cmd)
    $raw = & git -C $Repo @Cmd 2>&1
    $code = $LASTEXITCODE
    $lines = @()
    foreach ($r in $raw) { $lines += [string]$r }
    return @{ Code = $code; Lines = $lines }
}

function Norm-Path {
    param([string]$P)
    if ([string]::IsNullOrWhiteSpace($P)) { return '' }
    $t = $P.Trim().Trim('"')
    $t = $t.Replace('/', '\')
    while ($t.Length -gt 1 -and $t.EndsWith('\')) { $t = $t.Substring(0, $t.Length - 1) }
    return $t.ToLowerInvariant()
}

function From-Epoch {
    param([long]$Sec)
    if ($Sec -le 0) { return $null }
    return [DateTimeOffset]::FromUnixTimeSeconds($Sec).LocalDateTime
}

function Format-Bytes {
    param([long]$B)
    if ($B -ge 1073741824) { return ('{0:N2} GB' -f ($B / 1073741824)) }
    if ($B -ge 1048576) { return ('{0:N2} MB' -f ($B / 1048576)) }
    if ($B -ge 1024) { return ('{0:N1} KB' -f ($B / 1024)) }
    return ("$B B")
}

# 数目录内容：口径 = 不含 node_modules 与 .git（否则一条并行副本光依赖就几万文件，会把"有内容"判成假阳性）
function Count-Content {
    param([string]$Path, [int]$Cap)
    $n = 0; $bytes = 0; $newest = $null; $trunc = $false
    $stack = New-Object System.Collections.Generic.Stack[string]
    $stack.Push($Path)
    while ($stack.Count -gt 0) {
        $cur = $stack.Pop()
        $ens = @()
        try { $ens = @(Get-ChildItem -LiteralPath $cur -Force -ErrorAction SilentlyContinue) } catch { $ens = @() }
        foreach ($e in $ens) {
            if ($e.PSIsContainer) {
                if ($e.Name -eq 'node_modules' -or $e.Name -eq '.git') { continue }
                $stack.Push($e.FullName)
            }
            else {
                if ($e.Name -eq '.git') { continue }
                $n++
                if ($n -ge $Cap) { $trunc = $true; break }
                $bytes += $e.Length
                if ($null -eq $newest -or $e.LastWriteTime -gt $newest) { $newest = $e.LastWriteTime }
            }
        }
        if ($trunc) { break }
    }
    return @{ Count = $n; Bytes = $bytes; Newest = $newest; Truncated = $trunc }
}

function Esc {
    param($S)
    if ($null -eq $S) { return '' }
    $t = [string]$S
    $t = $t.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;')
    return $t
}

# ------------------------------------------------------------
# 0. 项目根：R2 硬改 —— **必须显式给 -Root，且它自己就得是仓库根**。
#    上一版默认"当前目录向上 12 层找 .git"，在本车间里直接双击会一路爬到 G:\backup，
#    把整片备份区当成项目根扫（核验席实测：报出"未提交改动 18071 个"的假现场）。
#    宁可不跑，也不替你猜根、不扫全盘。
# ------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($Root)) {
    Write-Host (Get-U02NeedRootMessage)
    exit 2
}
try { $Root = (Resolve-Path -LiteralPath $Root).Path } catch { Write-Host "[失败] 路径不存在：$Root"; exit 2 }
if (-not (Test-Path -LiteralPath (Join-Path $Root '.git'))) {
    Write-Host (Get-U02NeedRootMessage)
    Write-Host ''
    Write-Host "[失败] 你给的这个根自己没有 .git：$Root"
    Write-Host '        本件不再往上找父目录（那正是扫全盘的入口）。请把 -Root 指到真正的仓库根。'
    exit 2
}

if ([string]::IsNullOrWhiteSpace($ReportDir)) { $ReportDir = $PSScriptRoot }
if ([string]::IsNullOrWhiteSpace($ReportDir)) { $ReportDir = (Get-Location).Path }
if (-not (Test-Path -LiteralPath $ReportDir)) {
    try { New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null } catch { }
}

$now = Get-Date
$cutoff = $now.AddMinutes(-$StaleMinutes)

# 主干名：给的不存在就退回当前分支
$chk = Invoke-Git -Repo $Root -Cmd @('rev-parse', '--verify', $Mainline)
if ($chk.Code -ne 0) {
    $cur = Invoke-Git -Repo $Root -Cmd @('rev-parse', '--abbrev-ref', 'HEAD')
    if ($cur.Code -eq 0 -and $cur.Lines.Count -gt 0) {
        $script:Notes += "主干名 '$Mainline' 在本仓库不存在，已退回当前分支 '$($cur.Lines[0])' 做对照。"
        $Mainline = $cur.Lines[0]
    }
    else {
        Write-Host "[失败] 读不到分支，git 可能坏了。"
        exit 2
    }
}
$mlRes = Invoke-Git -Repo $Root -Cmd @('rev-parse', $Mainline)
$mlSha = ''
if ($mlRes.Lines.Count -gt 0) { $mlSha = $mlRes.Lines[0] }

# ------------------------------------------------------------
# 1. 登记口径 A：git worktree list --porcelain
# ------------------------------------------------------------
$wtRes = Invoke-Git -Repo $Root -Cmd @('worktree', 'list', '--porcelain')
if ($wtRes.Code -ne 0) {
    Write-Host "[失败] git worktree list 跑不通：$($wtRes.Lines -join ' ')"
    exit 2
}
$registered = @()
$curWt = $null
foreach ($line in $wtRes.Lines) {
    if ($line -like 'worktree *') {
        if ($null -ne $curWt) { $registered += $curWt }
        $curWt = [pscustomobject]@{ Path = $line.Substring(9); Branch = ''; Head = ''; Detached = $false }
    }
    elseif ($line -like 'HEAD *') { if ($null -ne $curWt) { $curWt.Head = $line.Substring(5) } }
    elseif ($line -like 'branch *') { if ($null -ne $curWt) { $curWt.Branch = $line.Substring(7).Replace('refs/heads/', '') } }
    elseif ($line -eq 'detached') { if ($null -ne $curWt) { $curWt.Detached = $true } }
}
if ($null -ne $curWt) { $registered += $curWt }

# 登记口径 B：.git/worktrees 管理目录数（与 A 双口径并报，防止 A 被手改过导致假绿）
$gitDirRes = Invoke-Git -Repo $Root -Cmd @('rev-parse', '--absolute-git-dir')
$gitDir = ''
if ($gitDirRes.Lines.Count -gt 0) { $gitDir = $gitDirRes.Lines[0].Trim() }
$adminDir = Join-Path $gitDir 'worktrees'
$adminNames = @()
if (Test-Path -LiteralPath $adminDir) {
    $adminNames = @(Get-ChildItem -LiteralPath $adminDir -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
}

$rootNorm = Norm-Path $Root
$laneRegs = @($registered | Where-Object { (Norm-Path $_.Path) -ne $rootNorm })

# ------------------------------------------------------------
# 2. 分支表：每条非主干分支 → 是否已进主干（ahead=0 + is-ancestor）
# ------------------------------------------------------------
$refRes = Invoke-Git -Repo $Root -Cmd @('for-each-ref', '--format=%(refname:short)%09%(objectname:short)%09%(committerdate:unix)', 'refs/heads')
$branches = @()
foreach ($line in $refRes.Lines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line -split "`t"
    if ($parts.Count -lt 3) { continue }
    $branches += [pscustomobject]@{
        Name  = $parts[0]
        Sha   = $parts[1]
        Ctime = (From-Epoch ([long]$parts[2]))
    }
}

$branchInfo = @{}
foreach ($b in $branches) {
    $aheadRes = Invoke-Git -Repo $Root -Cmd @('rev-list', '--count', "$Mainline..$($b.Name)")
    $ahead = -1
    if ($aheadRes.Code -eq 0 -and $aheadRes.Lines.Count -gt 0) { $ahead = [int]$aheadRes.Lines[0] }
    $ancRes = Invoke-Git -Repo $Root -Cmd @('merge-base', '--is-ancestor', $b.Name, $Mainline)
    $inMain = ($ancRes.Code -eq 0)
    # 是否被某个登记副本占用
    $holder = ''
    foreach ($r in $laneRegs) { if ($r.Branch -eq $b.Name) { $holder = $r.Path } }
    $branchInfo[$b.Name] = @{ Ahead = $ahead; InMain = $inMain; Holder = $holder; Ctime = $b.Ctime }
}

# ------------------------------------------------------------
# 3. 差集：磁盘 worktrees 目录 vs git 登记
# ------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($WorktreesDir)) { $WorktreesDir = Join-Path $Root 'worktrees' }
$diskLanes = @()
if (Test-Path -LiteralPath $WorktreesDir) {
    $diskLanes = @(Get-ChildItem -LiteralPath $WorktreesDir -Directory -Force -ErrorAction SilentlyContinue)
}
else {
    # 防"看着干净其实没看"：没有这个目录不等于没问题，只是本项目不按这个布局放副本
    Add-Item '车道对账' '信息' $WorktreesDir `
        '这个项目根下面没有 worktrees\ 目录，本项没看成（不是"干净"，是"没这个地方"）' `
        '本工具按绘约现场约定在 <项目根>\worktrees 找并行副本；别的布局用 -WorktreesDir 指过去' `
        '-'
    $script:Notes += "worktrees 目录口径：$WorktreesDir 不存在，车道对账一项未执行（不是判为干净）。"
}
$diskNorms = @($diskLanes | ForEach-Object { Norm-Path $_.FullName })
$regNorms = @($registered | ForEach-Object { Norm-Path $_.Path })

function Match-Branch {
    param([string]$DirName)
    foreach ($b in $branches) {
        if ($b.Name -eq $DirName) { return $b.Name }
    }
    foreach ($b in $branches) {
        if ($b.Name.EndsWith('/' + $DirName)) { return $b.Name }
        if ($b.Name.Contains($DirName)) { return $b.Name }
    }
    return ''
}

foreach ($d in $diskLanes) {
    $dn = Norm-Path $d.FullName
    $isReg = ($regNorms -contains $dn)
    $hasGit = (Test-Path -LiteralPath (Join-Path $d.FullName '.git'))
    $ageMin = [int](($now - $d.LastWriteTime).TotalMinutes)
    $inFlight = ($d.LastWriteTime -gt $cutoff)

    # 只在"磁盘有、git 没登记"时才去数文件：在册副本动辄 2-5 万文件，全量走一遍会拖死一条命令
    $content = $null; $newestTxt = ''; $capTxt = ''
    if (-not $isReg) {
        $content = Count-Content -Path $d.FullName -Cap $FileScanCap
        $newestTxt = '无文件'
        if ($null -ne $content.Newest) { $newestTxt = $content.Newest.ToString('yyyy-MM-dd HH:mm') }
        if ($content.Truncated) { $capTxt = "（文件数超 $FileScanCap 已截断）" }
    }

    if (-not $isReg) {
        # 孤儿：磁盘有、git 无登记
        $mb = Match-Branch $d.Name
        $mbTxt = '按目录名没匹配到任何分支'
        $mergedKnown = $false
        if ($mb -ne '') {
            $mbTxt = "同名分支 $mb 已进主干（ahead=$($branchInfo[$mb].Ahead)）"
            $mergedKnown = ($branchInfo[$mb].InMain -and $branchInfo[$mb].Ahead -eq 0)
        }

        $whyIn = ''
        if ($inFlight) { $whyIn = "目录 $($d.LastWriteTime.ToString('HH:mm')) 刚动过，在 $StaleMinutes 分钟窗口内" }
        $deepIn = $false
        if ($Deep -and -not $inFlight -and $null -ne $content.Newest -and $content.Newest -gt $cutoff) {
            $deepIn = $true
            $whyIn = "里面有文件 $($content.Newest.ToString('HH:mm')) 被改过，在窗口内"
        }

        # R2：判级整条走共享事实源，本段不再自己写 if（-Deep 看到的"里面有文件刚动过"并入 InFlight）
        $vv = Get-U02WorktreeVerdict -Registered $false -HasGit $hasGit -FileCount $content.Count -DirtyLines -1 `
            -InFlight ($inFlight -or $deepIn) -HasMatchedBranch ($mb -ne '') -BranchInMain $mergedKnown
        $nx = '本工具判它别动；要收由你亲自确认（顺序：先副本后分支）'
        if ($vv.Class -eq 'candidate') { $nx = "你确认后自己敲：Remove-Item -LiteralPath '$($d.FullName)' -Recurse -Force（走回收站更稳，别用 rm）" }
        elseif ($vv.Class -eq 'warn') { $nx = '先自己点开看一眼有没有没合出去的活，再决定' }
        Add-Item -Section '车道对账' -Grade (Grade-Of $vv) -Item $d.Name -Detail $vv.Why `
            -Evidence "目录 mtime $($d.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))（$ageMin 分钟前）；分支旁证：$mbTxt；含文件 $($content.Count) 个 / $(Format-Bytes $content.Bytes) $capTxt；最新文件：$newestTxt；$whyIn" `
            -Next $nx -Class $vv.Class -VCode $vv.Code
    }
}

# 反向：登记了但磁盘目录没了 = 失效登记
foreach ($r in $laneRegs) {
    if (-not ($diskNorms -contains (Norm-Path $r.Path)) -and -not (Test-Path -LiteralPath $r.Path)) {
        Add-Item -Section '车道对账' -Grade '待定·登记失效' -Item $r.Path `
            -Detail 'git 还登记着，但这个目录已经不存在了（要 prune，但先人工确认不是挂载盘没插）' `
            -Evidence "分支 $($r.Branch)；副本 HEAD $($r.Head.Substring(0, [Math]::Min(8, $r.Head.Length)))" `
            -Next "你确认后自己敲：git -C '$Root' worktree prune" -Class 'warn' -VCode 'WARN-STALE-REG'
    }
}

# 在册副本体检：干净 / 有未提交施工 / 是否已进主干 / 是否在飞
foreach ($r in $laneRegs) {
    $p = $r.Path
    if (-not (Test-Path -LiteralPath $p)) { continue }
    $st = Invoke-Git -Repo $p -Cmd @('status', '--porcelain')
    $dirty = 0
    if ($st.Code -eq 0) { $dirty = @($st.Lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count }
    $di = $null
    if ($branchInfo.ContainsKey($r.Branch)) { $di = $branchInfo[$r.Branch] }
    $dirItem = Get-Item -LiteralPath $p -ErrorAction SilentlyContinue
    $inFlight = ($null -ne $dirItem -and $dirItem.LastWriteTime -gt $cutoff)
    $ctInFlight = ($null -ne $di -and $null -ne $di.Ctime -and $di.Ctime -gt $cutoff)
    $lbl = Split-Path -Leaf (Norm-Path $p)

    # R2 硬修（核验席坐实的那条）：在册并行副本**一律别动**，不再因为"工作区干净 + 分支已进主干"
    # 就被列进可清。工单第四节原话"并行窗口在开工时不能自动清（L247 防撞车 / L366 防和隔壁项目撞车）"，
    # 判据来自共享事实源，与主入口同一份。
    $inM = ($null -ne $di -and $di.InMain -and $di.Ahead -eq 0)
    $hasGitP = Test-Path -LiteralPath (Join-Path $p '.git')
    $vv = Get-U02WorktreeVerdict -Registered $true -HasGit $hasGitP -DirtyLines $dirty `
        -InFlight ($inFlight -or $ctInFlight) -HasMatchedBranch ($null -ne $di) -BranchInMain $inM
    $evTxt = "分支 $($r.Branch)；status $dirty 行；"
    if ($null -eq $di) { $evTxt += '分支尖端读不到（HEAD ' + $r.Head + '）' }
    elseif ($inM) { $evTxt += 'ahead=0 且 is-ancestor 通过' }
    else { $evTxt += "ahead=$($di.Ahead)" }
    if ($inFlight) { $evTxt += '；目录 mtime ' + $dirItem.LastWriteTime.ToString('HH:mm') + ' 刚动过' }
    elseif ($ctInFlight) { $evTxt += '；分支最后提交 ' + $di.Ctime.ToString('MM-dd HH:mm') + ' 在窗口内' }
    $nx = '要收由你亲自确认，顺序不能反：先 git -C 项目根 worktree remove 这个副本，再 branch -d 分支（本工具不代做）'
    if ($vv.Class -eq 'warn') { $nx = '等这路窗口收工后再跑本工具' }
    Add-Item -Section '在册副本' -Grade (Grade-Of $vv) -Item $lbl -Detail $vv.Why -Evidence $evTxt `
        -Next $nx -Class $vv.Class -VCode $vv.Code
}

# ------------------------------------------------------------
# 4. 分支清单（含未挂副本的裸分支）
# ------------------------------------------------------------
foreach ($b in $branches) {
    if ($b.Name -eq $Mainline) {
        # R2：主干也登记成一条"别动"，否则两件套的计数集不一样（主入口同样记这一条）
        $vvm = Get-U02BranchVerdict -IsMainline $true
        Add-Item -Section '分支对账' -Grade (Grade-Of $vvm) -Item $b.Name -Detail $vvm.Why `
            -Evidence '当前检出主干' -Next '-' -Class $vvm.Class -VCode $vvm.Code
        continue
    }
    $di = $branchInfo[$b.Name]
    $holderTxt = '没挂在任何副本上'
    if ($di.Holder -ne '') { $holderTxt = "挂在副本 $($di.Holder)" }
    $ctTxt = '时间未知'
    if ($null -ne $di.Ctime) { $ctTxt = $di.Ctime.ToString('yyyy-MM-dd HH:mm') }
    $behind = '?'
    if ($di.Ahead -eq 0 -and $di.InMain) {
        $behRes = Invoke-Git -Repo $Root -Cmd @('rev-list', '--count', "$($b.Name)..$Mainline")
        if ($behRes.Code -eq 0 -and $behRes.Lines.Count -gt 0) { $behind = $behRes.Lines[0] }
    }
    $vv3 = Get-U02BranchVerdict -IsMainline $false -InMain $di.InMain -OccupiedBy $di.Holder `
        -AheadUnknown ($di.Ahead -lt 0)
    $evTxt = "ahead=$($di.Ahead) / behind=$behind；$holderTxt；最后提交 $ctTxt"
    $nx = '本工具不代剪分支（不越界拍板）'
    if ($vv3.Class -eq 'candidate') { $nx = '你确认后自己敲：git -C ' + $Root + ' branch -d ' + $b.Name }
    elseif ($vv3.Class -eq 'blocked') { $nx = '先把那个在册副本收了，再谈分支（顺序不能反）' }
    elseif ($di.Ahead -gt 0) { $nx = '先合或先 cherry-pick，别删' }
    Add-Item -Section '分支对账' -Grade (Grade-Of $vv3) -Item $b.Name -Detail $vv3.Why `
        -Evidence $evTxt -Next $nx -Class $vv3.Class -VCode $vv3.Code
}

# ------------------------------------------------------------
# 5. temp 一次性启动脚本
# ------------------------------------------------------------
# R2：temp 段的**扫描口径 + 判级**整体换成共享事实源里的 Select-U02TempItems。
# 上一版两件套在这里是两套口径（本件只认 launch 命名、还递归扫两万个文件，主入口认 8 个命名词、只扫顶层），
# 所以同一个根 temp 数不一样。现在统一：只扫**项目自己的 temp 根顶层**的 .ps1；系统 temp 只出信息不出候选。
$projTemp = (Join-Path $Root 'AGENTS\temp')
if (-not (Test-Path -LiteralPath $projTemp)) { $projTemp = (Join-Path $Root 'temp') }
foreach ($tp in @($projTemp, $env:TEMP)) {
    if ([string]::IsNullOrWhiteSpace($tp)) { continue }
    $isProj = ((Norm-Path $tp) -eq (Norm-Path $projTemp))
    if (-not (Test-Path -LiteralPath $tp)) {
        Add-Item -Section 'temp 一次性件' -Grade '信息' -Item $tp -Detail '这个 temp 根不存在（外部报告里写过的 <项目根>\temp 已换代）' -Evidence '-' -Next '-' -Class 'info'
        continue
    }
    if (-not $isProj) {
        Add-Item -Section 'temp 一次性件' -Grade '信息' -Item $tp -Detail '系统 temp：按共享口径**不出候选**（Windows 自己的 GUID 临时文件会被当成一次性脚本，全是假阳性）' -Evidence '候选只来自项目自己的 temp 根顶层' -Next '-' -Class 'info'
        continue
    }
    $ts = Select-U02TempItems -TempDir $tp -Now $now -InFlightMinutes $StaleMinutes -QuietDays 3
    $newestTxt = '（空）'
    if ($null -ne $ts.Newest) { $newestTxt = $ts.Newest.ToString('yyyy-MM-dd HH:mm') }
    $script:Notes += ("$tp —— 共享口径 " + $script:U02RuleVersion + "：顶层条目 $($ts.Entries)（文件 $($ts.Files) + 子目录 $($ts.Dirs)）；.ps1 $($ts.Ps1) 个；C-1 点名 $($ts.Named) 个；C-2 命中 $($ts.Hit) 个；未命中 $($ts.Missed) 个本轮不列；最近活动 $newestTxt")
    if ($ts.Named -eq 0) { $script:Notes += "$tp —— [口径 C-1] 报告点名的 815b3-launch-*.ps1：0 命中（路径与命名都已换代，见 差异.md）" }
    if ($ts.Items.Count -eq 0) {
        Add-Item -Section 'temp 一次性件' -Grade '信息' -Item $tp -Detail '共享口径下没有命中的一次性脚本' -Evidence "条目 $($ts.Entries)／.ps1 $($ts.Ps1) 个" -Next '-' -Class 'info'
    }
    foreach ($it in $ts.Items) {
        $nx = '可能还在用，先别动'
        if ($it.Class -eq 'candidate') { $nx = '确认里面没有你还要复用的参数后，自己挪走或删（本工具不代删）' }
        Add-Item -Section 'temp 一次性件' -Grade (Grade-Of $it) -Item $it.Name `
            -Detail ("[" + $it.Source + "] " + $it.Why) `
            -Evidence "$($it.Bytes) B；mtime $($it.Mtime.ToString('yyyy-MM-dd HH:mm'))（$($it.AgeDays) 天前）；所在 temp 根在 .gitignore 里" `
            -Next $nx -Class $it.Class -VCode $it.Code
    }
    if ($ts.Truncated) {
        Add-Item -Section 'temp 一次性件' -Grade '待定·已截断' -Item "$tp 命中条数超过 30" -Detail '后面还有没列出来的，不是没有' -Evidence '-' -Next '到这个目录里自己再翻一遍' -Class 'warn' -VCode 'WARN-TRUNCATED'
    }
    if ($ts.Missed -gt 0) {
        Add-Item -Section 'temp 一次性件' -Grade '信息' -Item "$tp 里其余 $($ts.Missed) 个 .ps1" -Detail '没命中一次性命名，所以不出候选（不是判它安全，是不替你看内容）' -Evidence '-' -Next '-' -Class 'info'
    }
}

# ------------------------------------------------------------
# 6. 在场进程（只列名 + CPU 是否在动；本件不判"僵死"）
# ------------------------------------------------------------
if (-not $SkipProcesses) {
    $p1 = @{}
    $selfSkip = 0
    foreach ($proc in (Get-Process -ErrorAction SilentlyContinue)) {
        if ($proc.Name -match '^(codex|git|node)$') {
            try {
                # 本工具自己也在反复调 git：把"本次运行之后才冒出来的"剔掉，否则报告里会出现工具自己造出来的进程（假阳性）
                if ($null -ne $proc.StartTime -and $proc.StartTime -gt $scriptStart) { $selfSkip++; continue }
                $p1[$proc.Id] = @{ Name = $proc.Name; Cpu = $proc.CPU; Start = $proc.StartTime }
            } catch { }
        }
    }
    if ($selfSkip -gt 0) { $script:Notes += "在场进程口径：跳过 $($selfSkip) 个本次运行启动之后才出现的 codex/git/node 进程（多半是本工具自己调 git 产生的子进程），不当作现场残留。" }
    Start-Sleep -Seconds 2
    foreach ($id in @($p1.Keys)) {
        $cpu2 = $null; $name2 = $p1[$id].Name
        try {
            $live = Get-Process -Id $id -ErrorAction SilentlyContinue
            if ($null -ne $live) { $cpu2 = $live.CPU }
        } catch { }
        if ($null -eq $cpu2) {
            Add-Item '在场进程' '信息' "$name2 pid=$id" '这 2 秒里已经退出（正常收工）' '-' '-'
            continue
        }
        $d = [Math]::Round(($cpu2 - $p1[$id].Cpu), 3)
        $stTxt = '未知'
        if ($null -ne $p1[$id].Start) { $stTxt = $p1[$id].Start.ToString('yyyy-MM-dd HH:mm') }
        if ($d -eq 0) {
            Add-Item '在场进程' '待定' "$name2 pid=$id" '这 2 秒 CPU 没涨——只是线索，不等于卡死' "启动时间 $stTxt；CPU 累计 $([Math]::Round($cpu2,2)) 秒" '要看它是不是在等网络/等人；本工具不 kill 任何进程'
        }
        else {
            Add-Item '在场进程' '信息' "$name2 pid=$id" "在干活（这 2 秒 CPU +$d 秒）" "启动时间 $stTxt" '-'
        }
    }
    if ($p1.Count -eq 0) {
        Add-Item '在场进程' '信息' 'codex / git / node' '一个都没在跑' '-' '-'
    }
}

# ------------------------------------------------------------
# 7. 主仓自身状态（收口时最容易撞车的对象）
# ------------------------------------------------------------
$mainSt = Invoke-Git -Repo $Root -Cmd @('status', '--porcelain')
$mainDirty = 0
if ($mainSt.Code -eq 0) { $mainDirty = @($mainSt.Lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count }
$headRes = Invoke-Git -Repo $Root -Cmd @('rev-parse', '--abbrev-ref', 'HEAD')
$headName = '?'
if ($headRes.Lines.Count -gt 0) { $headName = $headRes.Lines[0] }
$script:Base = @{
    Root        = $Root
    Mainline    = $Mainline
    Head        = $headName
    WtListLines = $registered.Count
    AdminNames  = $adminNames.Count
    DiskDirs    = $diskLanes.Count
    Branches    = $branches.Count
    MainDirty   = $mainDirty
    Stale       = $StaleMinutes
}

# ------------------------------------------------------------
# 8. 输出
# ------------------------------------------------------------
$colors = @{
    '勿动·有未提交' = 'Red'; '勿动·未进主干' = 'Red'; '勿动·在飞' = 'DarkYellow'
    '待定' = 'Yellow'; '可清·已进主干' = 'DarkGreen'; '可清·证据齐' = 'Green'
    '可清·登记失效' = 'DarkCyan'; '信息' = 'DarkGray'
    # R2 新显示词（判级一律来自共享事实源的 Class，这里只管上色）
    '勿动·在册副本' = 'DarkYellow'; '勿动·被副本挡住' = 'DarkYellow'; '勿动·主干' = 'DarkCyan'
    '勿动·主仓本身' = 'DarkCyan'; '待定·在飞' = 'DarkYellow'; '待定·登记失效' = 'DarkCyan'
    '待定·已截断' = 'DarkCyan'
}

$lines = @()
$lines += '=== U02 并行车道现场清单 · 只报不删 ==='
$lines += "项目根 : $($script:Base.Root)"
$lines += "主干   : $($script:Base.Mainline)（当前 HEAD 在 $($script:Base.Head)）"
$lines += "在飞窗口: 最近 $($script:Base.Stale) 分钟动过的一律标勿动"
$lines += "时间   : $($now.ToString('yyyy-MM-dd HH:mm:ss'))"
$lines += ''
$lines += "基数（自己实测）: git worktree list 登记 $($script:Base.WtListLines) 条（含主仓） / .git\worktrees 管理项 $($script:Base.AdminNames) 个 / 磁盘 worktrees\ 目录 $($script:Base.DiskDirs) 个 / git branch $($script:Base.Branches) 条 / 主仓未提交改动 $($script:Base.MainDirty) 行"
if ($script:Base.MainDirty -gt 0) {
    $lines += "提醒: 主仓现在有 $($script:Base.MainDirty) 行未提交改动——可能有别的窗口正开着工。"
}
$lines += ''

foreach ($sec in @('车道对账', '在册副本', '分支对账', 'temp 一次性件', '在场进程')) {
    $secItems = @($script:Items | Where-Object { $_.Section -eq $sec })
    $lines += "--- [$sec] $($secItems.Count) 项 ---"
    if ($secItems.Count -eq 0) { $lines += '  （没有）' }
    foreach ($it in $secItems) {
        $lines += "  [$($it.Grade)] $($it.Item)"
        $lines += "        状态: $($it.Detail)"
        $lines += "        证据: $($it.Evidence)"
        if ($it.Next -ne '-') { $lines += "        下一步(你自己敲): $($it.Next)" }
    }
    $lines += ''
}

$nClear = @($script:Items | Where-Object { $_.Class -eq 'candidate' }).Count
$nHold = @($script:Items | Where-Object { $_.Class -eq 'hold' -or $_.Class -eq 'blocked' }).Count
$nTbd = @($script:Items | Where-Object { $_.Class -eq 'warn' }).Count
# 这一行由共享事实源生成，主入口印的是**同一行**（同一根 → 同一行，这是可核对的硬约定）
$kindOf = { param($s) if ($s -eq '分支对账') { 'branch' } elseif ($s -eq 'temp 一次性件') { 'file' } else { 'dir' } }
$lines += (Get-U02VerdictLine -Items @($script:Items | Where-Object { $_.Class -ne 'info' } |
    ForEach-Object { @{ Kind = (& $kindOf $_.Section); Class = $_.Class; Code = $_.VCode } }))
$lines += '>>> 结论：可清（判据与主入口同源，等你点头） ' + $nClear + ' 项 ／ 别动（含被副本挡住的分支） ' + $nHold + ' 项 ／ 要你判断（WARN，判据不清不判死） ' + $nTbd + ' 项'
$lines += '>>> 本工具没删、没改、没移动任何东西；要动手的是你，不是它。'
$lines += ''
foreach ($n in $script:Notes) { $lines += "口径: $n" }

$text = $lines -join "`r`n"
foreach ($ln in $lines) {
    $col = 'Gray'
    if ($ln -match '^\s*\[([^\]]+)\]') {
        $g = $matches[1]
        if ($colors.ContainsKey($g)) { $col = $colors[$g] }
        elseif ($g -like '勿动*') { $col = 'Red' }
        elseif ($g -like '可清*') { $col = 'Green' }
        elseif ($g -eq '待定') { $col = 'Yellow' }
    }
    elseif ($ln.StartsWith('>>> ')) { $col = 'White' }
    elseif ($ln.StartsWith('=== ') -or $ln.StartsWith('--- ')) { $col = 'Cyan' }
    Write-Host $ln -ForegroundColor $col
}

# 落报告
$stamp = $now.ToString('yyyyMMdd-HHmmss')
$mdPath = Join-Path $ReportDir "U02-现场清单-$stamp.md"
$htmlPath = Join-Path $ReportDir "U02-现场清单-$stamp.html"

$md = @()
$md += '# U02 并行车道现场清单（' + $now.ToString('yyyy-MM-dd HH:mm') + '）'
$md += ''
$md += "- 项目根：``$($script:Base.Root)``"
$md += "- 主干：$($script:Base.Mainline)（当前 HEAD：$($script:Base.Head)）"
$md += "- 在飞窗口：$($script:Base.Stale) 分钟"
$md += "- 基数实测：worktree list 登记 $($script:Base.WtListLines) 条（含主仓）／.git\worktrees 管理项 $($script:Base.AdminNames) 个／磁盘目录 $($script:Base.DiskDirs) 个／分支 $($script:Base.Branches) 条／主仓未提交 $($script:Base.MainDirty) 行"
$md += ''
$md += "**结论：可清 $nClear 项 ／ 别动 $nHold 项 ／ 要你判断 $nTbd 项。**本工具只报不删。"
$md += ''
foreach ($sec in @('车道对账', '在册副本', '分支对账', 'temp 一次性件', '在场进程')) {
    $secItems = @($script:Items | Where-Object { $_.Section -eq $sec })
    $md += "## $sec（$($secItems.Count) 项）"
    $md += ''
    if ($secItems.Count -eq 0) { $md += '（没有）'; $md += ''; continue }
    $md += '| 判级 | 对象 | 现在是什么状态 | 凭什么这么判 | 你确认后自己敲 |'
    $md += '| --- | --- | --- | --- | --- |'
    foreach ($it in $secItems) {
        $md += '| ' + $it.Grade + ' | ' + (Esc $it.Item) + ' | ' + (Esc $it.Detail) + ' | ' + (Esc $it.Evidence) + ' | ' + (Esc $it.Next) + ' |'
    }
    $md += ''
}
$md += '## 判据口径'
$md += ''
foreach ($n in $script:Notes) { $md += "- $n" }
[System.IO.File]::WriteAllText($mdPath, (($md -join "`r`n") + "`r`n"), (New-Object System.Text.UTF8Encoding($true)))

$css = 'body{font-family:"Microsoft YaHei",Segoe UI,Arial,sans-serif;margin:24px;background:#f6f7f9;color:#222;max-width:1180px}h1{font-size:20px}h2{font-size:16px;margin-top:26px;border-left:4px solid #4a7dbb;padding-left:8px}.meta{font-size:13px;color:#444;line-height:1.7;word-break:break-all}.verdict{background:#fff;border:1px solid #dcdfe4;border-radius:10px;padding:14px 18px;margin:16px 0;font-size:15px}table{border-collapse:collapse;width:100%;background:#fff;font-size:13px;table-layout:fixed}th,td{border:1px solid #dcdfe4;padding:7px 9px;text-align:left;vertical-align:top;word-break:break-word;overflow-wrap:anywhere}th{background:#eef2f7;word-break:normal}code{background:#f0f2f5;padding:1px 4px;border-radius:4px;word-break:break-all}.g-red{color:#b42318;font-weight:700}.g-yel{color:#a15c00;font-weight:700}.g-grn{color:#1a7f37;font-weight:700}.g-gry{color:#667085}.lane{background:#fff;border-radius:10px;padding:6px 14px 14px;margin-bottom:14px;border:1px solid #e6e8ec}'
function GradeClass {
    param([string]$G)
    if ($G -like '勿动*') { return 'g-red' }
    if ($G -eq '待定') { return 'g-yel' }
    if ($G -like '可清*') { return 'g-grn' }
    return 'g-gry'
}
$hb = @()
$hb += '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>U02 并行车道现场清单</title><style>' + $css + '</style></head><body>'
$hb += '<h1>U02 并行车道现场清单 · 只报不删</h1>'
$hb += '<div class="meta">项目根：<code>' + (Esc $script:Base.Root) + '</code><br>主干：' + (Esc $script:Base.Mainline) + '（当前 HEAD：' + (Esc $script:Base.Head) + '）· 在飞窗口 ' + $script:Base.Stale + ' 分钟 · 生成 ' + $now.ToString('yyyy-MM-dd HH:mm:ss') + '<br>基数实测：worktree list 登记 ' + $script:Base.WtListLines + ' 条（含主仓）／.git\worktrees 管理项 ' + $script:Base.AdminNames + ' 个／磁盘 worktrees\ 目录 ' + $script:Base.DiskDirs + ' 个／分支 ' + $script:Base.Branches + ' 条／主仓未提交 ' + $script:Base.MainDirty + ' 行</div>'
$hb += '<div class="verdict"><b>结论：</b>可清（证据齐，等你点头）<b>' + $nClear + '</b> 项 ／ 别动（有未合入施工或在飞）<b>' + $nHold + '</b> 项 ／ 要你判断 <b>' + $nTbd + '</b> 项。<br>这个工具没有删、改、移动任何东西。<b>下一步做什么由你定。</b></div>'
foreach ($sec in @('车道对账', '在册副本', '分支对账', 'temp 一次性件', '在场进程')) {
    $secItems = @($script:Items | Where-Object { $_.Section -eq $sec })
    $hb += '<div class="lane"><h2>' + $sec + '（' + $secItems.Count + ' 项）</h2>'
    if ($secItems.Count -eq 0) { $hb += '<p>（没有）</p></div>'; continue }
    $hb += '<table><tr><th style="width:9%">判级</th><th style="width:22%">对象</th><th style="width:25%">现在是什么状态</th><th style="width:24%">凭什么这么判</th><th style="width:20%">你确认后自己敲</th></tr>'
    foreach ($it in $secItems) {
        $hb += '<tr><td class="' + (GradeClass $it.Grade) + '">' + (Esc $it.Grade) + '</td><td><code>' + (Esc $it.Item) + '</code></td><td>' + (Esc $it.Detail) + '</td><td>' + (Esc $it.Evidence) + '</td><td>' + (Esc $it.Next) + '</td></tr>'
    }
    $hb += '</table></div>'
}
$hb += '<div class="lane"><h2>判据口径</h2><ul>'
foreach ($n in $script:Notes) { $hb += '<li>' + (Esc $n) + '</li>' }
$hb += '</ul><p style="font-size:12px;color:#667085">注意：本工具在孤儿目录里不跑 git 命令——那里没有 .git，git 会往上找到主仓，把主仓的改动算到孤儿头上（假阳性）。口径详见 README。</p></div>'
$hb += '</body></html>'
[System.IO.File]::WriteAllText($htmlPath, (($hb -join "`r`n") + "`r`n"), (New-Object System.Text.UTF8Encoding($true)))

Write-Host ""
Write-Host "报告已写出（只写了这两个文件，别处没动）："
Write-Host "  $mdPath"
Write-Host "  $htmlPath"
exit 0
