# ============================================
# restore-uploads.ps1 —— uploads 备份恢复（P2-E，2026-08-14）
#
# 与 rollback.ps1 互补：rollback.ps1 只恢复 DB，本脚本只恢复 uploads 文件。
# 完整回滚顺序：DB（rollback.ps1 / restore-db.ts）→ uploads（本脚本）。
#
# 用法：
#   pwsh scripts/restore-uploads.ps1                          # 恢复最近一份 uploads 归档
#   pwsh scripts/restore-uploads.ps1 -Archive C:\...\uploads-2026-08-13T00-00-00-000Z.tar.gz
#   pwsh scripts/restore-uploads.ps1 -UploadsDir D:\data\uploads
#
# 纪律：
#   - 解压前先 tar -tzf 列出归档：空归档/不可读归档拒绝恢复；
#     含绝对路径或 .. 段落的归档拒绝恢复（防路径逃逸）。
#   - 解压为覆盖式合并（tar 语义），恢复前自行确认 uploads 现状。
#   - 本脚本不触碰 DB、不写新日志文件；成功输出 RESTORE_UPLOADS_OK 供留证。
# ============================================
param(
  [string]$Archive = '',
  [string]$UploadsDir = ''
)
$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT

$BACKUP_DIR = Join-Path $ROOT 'data\backups'
if (-not $UploadsDir) { $UploadsDir = Join-Path $ROOT 'uploads' }

if (-not $Archive) {
  $candidates = @(Get-ChildItem -Path $BACKUP_DIR -Filter 'uploads-*.tar.gz' -File -ErrorAction SilentlyContinue |
    Sort-Object Name | Select-Object -Last 1)
  if ($candidates.Count -gt 0) { $Archive = $candidates[0].FullName }
}
if (-not $Archive -or -not (Test-Path -LiteralPath $Archive)) {
  Write-Error "未找到 uploads 归档（$BACKUP_DIR 下无 uploads-*.tar.gz，或指定文件不存在：$Archive）"
  exit 1
}

$archiveItem = Get-Item -LiteralPath $Archive
Write-Host "归档：$($archiveItem.FullName)（$($archiveItem.Length) bytes）"

New-Item -ItemType Directory -Force -Path $UploadsDir | Out-Null

# 预检：列档 + 空归档拒绝 + 不安全路径拒绝
$listOut = & tar.exe -tzf $Archive 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Error "无法读取归档（tar 退出码 $LASTEXITCODE）：$(( $listOut | Out-String ).Trim())"
  exit 1
}
$entries = @($listOut | Where-Object { $_ })
if ($entries.Count -eq 0) {
  Write-Error "归档为空，拒绝恢复：$($archiveItem.Name)"
  exit 1
}
$unsafe = @($entries | Where-Object { $_ -match '^/' -or (($_ -split '[/\\]') -contains '..') })
if ($unsafe.Count -gt 0) {
  Write-Error "归档含不安全路径，拒绝恢复：$($unsafe -join ', ')"
  exit 1
}

Write-Host "归档内容 $($entries.Count) 项，开始解压到 $UploadsDir ..."
& tar.exe -xzf $Archive -C $UploadsDir
if ($LASTEXITCODE -ne 0) {
  Write-Error "解压失败（tar 退出码 $LASTEXITCODE）"
  exit 1
}
Write-Host "RESTORE_UPLOADS_OK $($archiveItem.Name) -> $UploadsDir（$($entries.Count) 项）"
