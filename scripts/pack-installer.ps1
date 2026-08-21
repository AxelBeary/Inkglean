# pack-installer.ps1 — 拾绘安装包打包脚本（v1.0.0-beta.4 发版起定型，永久保存）
#
# 用法：pwsh scripts/pack-installer.ps1
#   自动读取 web/package.json 版本号，产出 inkglean-installer-v<版本>.zip
#   （1.0.0-beta.4 → inkglean-installer-v1.0.0-b4.zip，与 b1~b4 命名同口径）
#
# 配方来源：v1.0.0-beta.3 安装包（676 条目）实测反推 + beta.4 定型：
#   ①剔除 b3 误带的 server/uploads/.recycle-bin 垃圾图与 server/stderr.log
#   ②新增 daily-backup.bat（Windows 每日备份）与 THIRD-PARTY-NOTICES.md（第三方致谢）
# 中文名走 .NET ZipArchive UTF-8（既往口径：避 tar/Compress-Archive 乱码）
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot  # 脚本在 scripts/ 下，root 为仓库根

# ── 版本号取自 web/package.json（server 与其恒同）──
$pkg = Get-Content (Join-Path $root 'web/package.json') -Raw
if ($pkg -notmatch '"version":\s*"([^"]+)"') { throw '无法从 web/package.json 读取版本号' }
$version = $Matches[1]
$tag = 'v' + ($version -replace 'beta\.', 'b')
$outDir = Join-Path $root 'temp'
if (-not (Test-Path $outDir)) { $outDir = $root }
$out = Join-Path $outDir "inkglean-installer-$tag.zip"
if (Test-Path $out) { Remove-Item $out -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# ── 根目录白名单 ──
$rootFiles = @(
  '.dockerignore', '.env.example', '启动网站.bat', 'Caddyfile', 'docker-compose.yml',
  'Dockerfile', 'entrypoint.sh', 'install.bat', 'install.mjs', 'LICENSE',
  'package.json', 'README.md', 'setup.sh', 'daily-backup.bat', 'THIRD-PARTY-NOTICES.md'
)
# ── scripts/ 白名单（三个运营脚本，b3 同口径）──
$opsScripts = @('scripts/move-to-opt.sh', 'scripts/server-backup.sh', 'scripts/update.sh')

# ── server/ web/ 整树收录 + 排除段 ──
function Get-TreeFiles($dir, $excludes) {
  Get-ChildItem -Path (Join-Path $root $dir) -Recurse -File |
    Where-Object {
      $rel = $_.FullName.Substring($root.Length + 1) -replace '\\', '/'
      -not ($excludes | Where-Object { $rel -like $_ })
    } |
    ForEach-Object { $_.FullName.Substring($root.Length + 1) -replace '\\', '/' }
}
$serverExcludes = @('server/node_modules/*', 'server/data/*', 'server/uploads/*', 'server/stderr.log')
$webExcludes = @('web/node_modules/*', 'web/dist/*', 'web/temp-vuetsc-baseline.txt')

$files = @()
foreach ($f in $rootFiles) {
  if (Test-Path (Join-Path $root $f)) { $files += $f } else { Write-Warning "缺失根文件: $f" }
}
foreach ($f in $opsScripts) {
  if (Test-Path (Join-Path $root $f)) { $files += $f } else { Write-Warning "缺失脚本: $f" }
}
$files += Get-TreeFiles 'server' $serverExcludes
$files += Get-TreeFiles 'web' $webExcludes
$files = $files | Sort-Object -Unique

Write-Host "版本: $version -> $tag | 收录文件数: $($files.Count)"

$fs = [System.IO.File]::Open($out, [System.IO.FileMode]::Create)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
foreach ($rel in $files) {
  $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
  $es = $entry.Open()
  $bytes = [System.IO.File]::ReadAllBytes((Join-Path $root ($rel -replace '/', '\')))
  $es.Write($bytes, 0, $bytes.Length)
  $es.Dispose()
}
$zip.Dispose()
$fs.Dispose()

$size = (Get-Item $out).Length
Write-Host "完成: $out ($([math]::Round($size/1MB, 2)) MB, $($files.Count) 文件)"
