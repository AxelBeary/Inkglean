# rotate-log.ps1 - rotate a log file by size, keeping N copies (.1 newest, .N oldest)
#
# Usage:
#   pwsh scripts/rotate-log.ps1 -Path <logfile> [-MaxBytes 5242880] [-Keep 3]
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\rotate-log.ps1 -Path <logfile>
#
# Discipline (P2-E):
#   - No-op when the log is missing or still under MaxBytes.
#   - Uses return (not exit) so callers that invoke this script with & continue normally.
#   - Rotation failures are left to the caller to handle (deploy scripts WARN, batch is best-effort).
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [int]$MaxBytes = 5242880,
  [int]$Keep = 3
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Path)) { return }
$item = Get-Item -LiteralPath $Path
if ($item.Length -le $MaxBytes) { return }
if ($Keep -lt 2) { $Keep = 2 }

for ($i = $Keep - 1; $i -ge 1; $i--) {
  $src = "$Path.$i"
  $dst = "$Path.$($i + 1)"
  if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }
  if (Test-Path -LiteralPath $src) { Move-Item -LiteralPath $src -Destination $dst -Force }
}
Move-Item -LiteralPath $Path -Destination "$Path.1" -Force
