# ============================================================
# U02-verdict.ps1 ｜ 判据唯一事实源（返工轮 R2，2026-09-29）
#
# 为什么要有这个文件：上一轮三路人各写各的判据，导致同一个现场、同一个目录里
# 两颗入口给出**相反结论**（主入口把 3 个在册并行副本判 KEEP-REGISTERED 别自动碰，
# 备用件把它们算进"可清 11 项"）。核验席用同一个根复现坐实了这一点。
#
# 从 R2 起：两颗入口（U02-lane-scan.ps1 主入口 / U02-lane-check.ps1 备用件）
# **只准调本文件的函数出判词**，自己不得再写一条 if 判据。
# 所以两颗入口的差别只剩输出形式（纯文本 / 带 HTML+md / 是否带写回开关），
# 判据、口径、计数全部同源，同一根必须得到同一行总判。
#
# 本文件是纯函数库：不删、不移、不写盘、不跑 git、不联网。
# 用法（在入口脚本里 dot-source）：  . (Join-Path $PSScriptRoot 'U02-verdict.ps1')
# ============================================================

$script:U02RuleVersion = 'U02-R2-20260929'

# —— 一次性脚本命名口径 C-2（唯一事实源，备用件过去只认 launch，主入口认 8 个词，现已同源）
$script:U02TempPattern = 'launch|probe|snippet|sandbox|wf-block|final-|run-gates|-mem-'
# —— 报告点名件口径 C-1（工单第三节原文点名的 815b3-launch-*.ps1）
$script:U02TempNamedWildcards = @('*815b3*', '*-launch-*')
# —— 本区已登记的项目根名单：缺 -Root 时**只印出来给人看**，绝不拿它当默认值去扫
$script:U02KnownRoots = @('D:\Hermes Agent CN Desktop\workspace\artist-commission')

# ------------------------------------------------------------
# 目录名 ↔ 分支名的匹配口径（备用件原来自己写了一份，现并入同源）
# 优先级：全等 > 「段/目录名」结尾 > 包含；命中即返回，不再往下匹配
# ------------------------------------------------------------
function Get-U02MatchedBranch {
    param([string]$DirName, $BranchNames)
    if ([string]::IsNullOrWhiteSpace($DirName) -or $null -eq $BranchNames) { return '' }
    foreach ($b in $BranchNames) { if ($b -eq $DirName) { return $b } }
    foreach ($b in $BranchNames) { if ($b.EndsWith('/' + $DirName)) { return $b } }
    foreach ($b in $BranchNames) { if ($b.Contains($DirName)) { return $b } }
    return ''
}

# ------------------------------------------------------------
# 工作副本（worktrees/ 下每个磁盘目录）的判词
# 顺序即优先级，缺一个入参就按默认值走；返回值 Class ∈ candidate|hold|blocked|warn|info
# ------------------------------------------------------------
function Get-U02WorktreeVerdict {
    param(
        [bool]$IsMainRoot = $false,        # 这个目录就是主仓本身
        [bool]$Registered = $false,        # git worktree list 里有登记
        [bool]$HasGit = $false,            # 目录里有 .git（没 .git 就不是工作副本）
        [int]$FileCount = 0,               # 递归数到的文件数（在册副本不数，省时间）
        [int]$DirtyLines = -1,             # git status --porcelain 行数，-1=n/a
        [bool]$InFlight = $false,          # 在飞护栏窗口内动过
        [bool]$HasMatchedBranch = $false,  # 按目录名匹配到了同名分支
        [bool]$BranchInMain = $false       # 那个同名分支已进主干
    )
    if ($IsMainRoot) {
        return [pscustomobject]@{ Class = 'hold'; Code = 'KEEP-MAIN-ROOT'; Why = '主仓路径本身，永不在回收范围' }
    }
    if ($InFlight) {
        return [pscustomobject]@{ Class = 'warn'; Code = 'WARN-ACTIVE'; Why = '在飞护栏拦截：窗口内还有活动，本轮一律不得回收' }
    }
    # 裁判红线：并行窗口在开工时不能自动清（工单第四节 L247/L366）→ 在册副本一律别动，
    # 哪怕它工作区干净、分支已进主干，也只能由人判断收不收（DirtyLines/BranchInMain 只进说明，不改判级）
    if ($Registered) {
        $sub = 'git 仍登记，属并行窗口在册副本，交人判断是否收工'
        if ($DirtyLines -gt 0) { $sub = $sub + "（工作区还有 $DirtyLines 行未提交，这就是没合出去的施工）" }
        elseif ($BranchInMain) { $sub = $sub + '（分支尖端虽已进主干，但"副本干净"不等于"隔壁窗口没在用它"，所以仍列别动）' }
        return [pscustomobject]@{ Class = 'hold'; Code = 'KEEP-REGISTERED'; Why = $sub }
    }
    if ($HasMatchedBranch -and -not $BranchInMain) {
        return [pscustomobject]@{ Class = 'hold'; Code = 'KEEP-NOT-MERGED'; Why = '未登记，但同名分支还有主干没有的提交 —— 回收等于丢施工' }
    }
    if (-not $HasGit -and $FileCount -eq 0) {
        return [pscustomobject]@{ Class = 'candidate'; Code = 'CANDIDATE-CONFIRM'; Why = '磁盘有目录/git 无登记/内无 .git 且内含 0 个文件 —— 空残留文件夹，不是工作副本' }
    }
    if (-not $HasGit) {
        return [pscustomobject]@{ Class = 'warn'; Code = 'WARN-NOT-EMPTY'; Why = "无登记无 .git，但里面还有 $FileCount 个文件 —— 先人工看一眼再谈回收" }
    }
    return [pscustomobject]@{ Class = 'warn'; Code = 'WARN-UNREG-WITHGIT'; Why = '有 .git 但未登记，需人工核对（可能登记名与目录名不一致）' }
}

# ------------------------------------------------------------
# 本地分支的判词（主干名 / 是否已进主干 / 是否被某个在册副本检出）
# ------------------------------------------------------------
function Get-U02BranchVerdict {
    param(
        [bool]$IsMainline = $false,
        [bool]$InMain = $false,
        [bool]$AheadUnknown = $false,
        [string]$OccupiedBy = ''
    )
    if ($IsMainline) {
        return [pscustomobject]@{ Class = 'hold'; Code = 'KEEP-MASTER'; Why = '当前检出的主干，永不列候选' }
    }
    if (-not $InMain) {
        return [pscustomobject]@{ Class = 'hold'; Code = 'KEEP-NOT-MERGED'; Why = '未进主干，删了就等于丢未合入的施工 —— 一律不动' }
    }
    if ($OccupiedBy -ne '') {
        return [pscustomobject]@{ Class = 'blocked'; Code = 'BLOCKED-BY-WORKTREE'; Why = "已进主干，但仍被工作副本检出（$OccupiedBy）—— 先收工作副本再谈分支" }
    }
    if ($AheadUnknown) {
        return [pscustomobject]@{ Class = 'warn'; Code = 'WARN-AHEAD-UNKNOWN'; Why = '祖先判定说已进主干，但 ahead 计数读不到 —— 判据不清，不判死' }
    }
    return [pscustomobject]@{ Class = 'candidate'; Code = 'CANDIDATE-CONFIRM'; Why = '已进主干（merge-base 祖先判定 yes）且无工作副本占用' }
}

# ------------------------------------------------------------
# temp 里单个文件的判词（年龄两档）
# ------------------------------------------------------------
function Get-U02TempVerdict {
    param([double]$AgeMinutes, [double]$AgeDays, [int]$InFlightMinutes = 30, [int]$QuietDays = 3)
    if ($AgeMinutes -lt $InFlightMinutes) {
        return [pscustomobject]@{ Class = 'warn'; Code = 'WARN-ACTIVE'; Why = "在飞护栏：< $InFlightMinutes 分钟内刚写过" }
    }
    if ($AgeDays -gt $QuietDays) {
        return [pscustomobject]@{ Class = 'candidate'; Code = 'CANDIDATE-CONFIRM'; Why = "命中一次性命名，且静默 > $QuietDays 天" }
    }
    return [pscustomobject]@{ Class = 'warn'; Code = 'WARN-RECENT'; Why = "命中命名但只静默了 $AgeDays 天（<= $QuietDays）—— 可能还在用，不列候选" }
}

# ------------------------------------------------------------
# temp 段的扫描口径也同源：只看**指定 temp 根的顶层**、只认 `.ps1`、
# C-1 点名件优先（同一文件不重复计），C-2 按命名命中，未命中的只报个数不出候选。
# （备用件原来递归扫 2 万文件、还去动系统 temp，所以两边数不一样 —— 现在都调这个。）
# ------------------------------------------------------------
function Select-U02TempItems {
    param(
        [string]$TempDir,
        [datetime]$Now,
        [int]$InFlightMinutes = 30,
        [int]$QuietDays = 3,
        [int]$MaxList = 30
    )
    $res = [ordered]@{
        Ok = $false; Exists = $false; Entries = 0; Files = 0; Dirs = 0; Ps1 = 0
        Missed = 0; Named = 0; Hit = 0; Truncated = $false; Newest = $null; Items = @()
    }
    if ([string]::IsNullOrWhiteSpace($TempDir) -or -not (Test-Path -LiteralPath $TempDir)) { return $res }
    $res['Exists'] = $true; $res['Ok'] = $true
    $all = @(Get-ChildItem -LiteralPath $TempDir -Force -ErrorAction SilentlyContinue)
    $files = @($all | Where-Object { -not $_.PSIsContainer })
    $dirs = @($all | Where-Object { $_.PSIsContainer })
    $ps1 = @($files | Where-Object { $_.Extension -eq '.ps1' })
    $res['Entries'] = $all.Count; $res['Files'] = $files.Count; $res['Dirs'] = $dirs.Count; $res['Ps1'] = $ps1.Count
    if ($files.Count -gt 0) { $res['Newest'] = ($files | Measure-Object -Property LastWriteTime -Maximum).Maximum }

    $list = @(); $taken = @{}
    # C-1：报告点名件优先
    foreach ($f in @($files | Where-Object { $_.PSIsContainer -eq $false } | Sort-Object LastWriteTime)) {
        $isNamed = $false
        foreach ($w in $script:U02TempNamedWildcards) { if ($f.Name -like $w) { $isNamed = $true; break } }
        if (-not $isNamed) { continue }
        $res['Named'] = $res['Named'] + 1
        $taken[$f.FullName.ToLower()] = $true
        $am = ($Now - $f.LastWriteTime).TotalMinutes; $ad = [math]::Round(($Now - $f.LastWriteTime).TotalDays, 1)
        $v = Get-U02TempVerdict -AgeMinutes $am -AgeDays $ad -InFlightMinutes $InFlightMinutes -QuietDays $QuietDays
        $list += [pscustomobject]@{ Source = 'C-1'; Name = $f.Name; Path = $f.FullName; Bytes = $f.Length
            Mtime = $f.LastWriteTime; AgeDays = $ad; Class = 'candidate'; Code = 'CANDIDATE-CONFIRM'
            Why = '报告点名件（815b3 / -launch- 命名），命中即候选；静默 ' + $ad + ' 天' }
    }
    # C-2：自建一次性命名口径
    foreach ($f in ($ps1 | Sort-Object LastWriteTime)) {
        if ($taken.ContainsKey($f.FullName.ToLower())) { continue }
        if ($f.Name -notmatch $script:U02TempPattern) { continue }
        $res['Hit'] = $res['Hit'] + 1
        $taken[$f.FullName.ToLower()] = $true
        $am = ($Now - $f.LastWriteTime).TotalMinutes; $ad = [math]::Round(($Now - $f.LastWriteTime).TotalDays, 1)
        $v = Get-U02TempVerdict -AgeMinutes $am -AgeDays $ad -InFlightMinutes $InFlightMinutes -QuietDays $QuietDays
        $list += [pscustomobject]@{ Source = 'C-2'; Name = $f.Name; Path = $f.FullName; Bytes = $f.Length
            Mtime = $f.LastWriteTime; AgeDays = $ad; Class = $v.Class; Code = $v.Code; Why = $v.Why }
    }
    $res['Missed'] = $ps1.Count - $res['Hit'] - $res['Named']
    if ($list.Count -gt $MaxList) {
        $res['Truncated'] = $true
        $list = @($list | Select-Object -First $MaxList)
    }
    $res['Items'] = @($list)
    return [pscustomobject]$res
}

# ------------------------------------------------------------
# 总判行：两颗入口都必须原样印这一行（同一根 → 同一行，这是可核对的硬约定）
# $Items 每项： @{ Kind='dir'|'branch'|'file'; Class='candidate'|'hold'|'blocked'|'warn'|'info'; Code='' }
# ------------------------------------------------------------
function Get-U02VerdictLine {
    param($Items)
    $a = @($Items)
    $cand = @($a | Where-Object { $_.Class -eq 'candidate' })
    $d = @($cand | Where-Object { $_.Kind -eq 'dir' }).Count
    $b = @($cand | Where-Object { $_.Kind -eq 'branch' }).Count
    $t = @($cand | Where-Object { $_.Kind -eq 'file' }).Count
    $bl = @($a | Where-Object { $_.Class -eq 'blocked' }).Count
    $hd = @($a | Where-Object { $_.Class -eq 'hold' }).Count
    $rg = @($a | Where-Object { $_.Class -eq 'hold' -and $_.Code -eq 'KEEP-REGISTERED' }).Count
    $w = @($a | Where-Object { $_.Class -eq 'warn' }).Count
    return ('【判据 ' + $script:U02RuleVersion + '·唯一事实源】候选 ' + ($d + $b + $t) +
        '（副本 ' + $d + '／分支 ' + $b + '／temp ' + $t + '）· 被在册副本挡住的分支 ' + $bl +
        ' · 别动 ' + $hd + '（其中在册并行副本 ' + $rg + '）· WARN ' + $w)
}

# ------------------------------------------------------------
# 缺 -Root 时的报错文案（备用件 R2 的硬改：宁可不跑，也不默认往上找 .git 扫全盘）
# ------------------------------------------------------------
function Get-U02NeedRootMessage {
    $s = @()
    $s += '[失败] 必须显式给 -Root，本工具不再猜项目根。'
    $s += '        原因：默认值原来是"当前目录向上 12 层找 .git"，在别处双击会一路爬到上层大仓，'
    $s += '        把整片备份区当成项目根扫（实测报出"未提交改动 18071 个"那种假现场）。'
    $s += '        宁可不跑，也不替你扫全盘。'
    $s += '怎么办（三选一）：'
    $s += '  1) 命令里加参数：  -Root "D:\路径\项目"'
    $s += '  2) 把项目文件夹**拖**到 U02-lane-check.bat 上（拖进去就等于给了 -Root）'
    $s += '  3) 用主入口 U02-lane-scan.ps1 / U02-run-lane-scan.bat —— 它默认根就写死在下面这份名单的第一项'
    $s += '本区已登记的项目根名单（只是给你抄，不会自动去扫）：'
    foreach ($k in $script:U02KnownRoots) { $s += '    ' + $k }
    return ($s -join "`r`n")
}
