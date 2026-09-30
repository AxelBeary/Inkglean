# rotate-log.ps1 - rotate a log file by size, keeping N copies (.1 newest, .N oldest)
#
# Usage:
#   pwsh scripts/rotate-log.ps1 -Path <logfile> [-MaxBytes 5242880] [-Keep 3]
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\rotate-log.ps1 -Path <logfile>
#   pwsh scripts/rotate-log.ps1          # no -Path: rotate every log on the MANAGED list
#
# MANAGED list: logs taken over by this script's default rotation convention
#   (same MaxBytes/Keep as existing wiring). Called with no -Path, each entry is
#   rotated best-effort. data/server.log: local non-Docker server log written by
#   install.mjs (spawn stdio append); Docker topology logs stay on json-file 10m x 3
#   in docker-compose.yml and are NOT listed here (see docs/OPS.md server-log section).
#
# Discipline (P2-E):
#   - No-op when the log is missing or still under MaxBytes.
#   - Uses return (not exit) so callers that invoke this script with & continue normally.
#   - Rotation failures are left to the caller to handle (deploy scripts WARN, batch is best-effort).
param(
  [string]$Path,
  [int]$MaxBytes = 5242880,
  [int]$Keep = 3
)
$ErrorActionPreference = 'Stop'

$MANAGED = @(
  (Join-Path (Split-Path $PSScriptRoot -Parent) 'data\server.log')
)

function Rotate-One([string]$Target) {
  if (-not (Test-Path -LiteralPath $Target)) { return }
  $item = Get-Item -LiteralPath $Target
  if ($item.Length -le $MaxBytes) { return }
  if ($Keep -lt 2) { $Keep = 2 }

  for ($i = $Keep - 1; $i -ge 1; $i--) {
    $src = "$Target.$i"
    $dst = "$Target.$($i + 1)"
    if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }
    if (Test-Path -LiteralPath $src) { Move-Item -LiteralPath $src -Destination $dst -Force }
  }
  Move-Item -LiteralPath $Target -Destination "$Target.1" -Force
}

if ($Path) { Rotate-One $Path; return }

# no -Path: sweep the MANAGED list, best-effort per entry (one failure must not block the rest)
foreach ($log in $MANAGED) {
  try { Rotate-One $log } catch { Write-Warning "rotate failed for $log : $($_.Exception.Message)" }
}
