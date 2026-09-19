# hermes-verify-<batch>.ps1 — Ad-hoc verification for bug-fix batches
# Usage: pwsh -File <this-script>
# Customize $root to the worktree path, then run. Delete after use.
$ErrorActionPreference = 'Stop'
$root = 'D:\Hermes Agent CN Desktop\workspace\artist-commission-bugfix'
$pass = 0; $fail = 0

function Check($name, $cmd, $dir) {
  Write-Host "`n=== $name ===" -ForegroundColor Cyan
  Push-Location $dir
  $output = Invoke-Expression $cmd 2>&1 | Out-String
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -eq 0) { Write-Host "PASS (exit 0)"; $script:pass++ }
  else { Write-Host "FAIL (exit $code)"; Write-Host $output; $script:fail++ }
  ($output -split "`n") | Where-Object { $_ -match 'Tests|Test Files|built|error|warning' } | ForEach-Object { Write-Host "  $_" }
}

Check 'vitest (server)' 'npx vitest run' "$root\server"
Check 'eslint (web)' 'npx eslint .' "$root\web"
Check 'vite build (web)' 'npm run build' "$root\web"

Write-Host "`n=== SUMMARY ===" -ForegroundColor Yellow
Write-Host "PASS: $pass / $($pass + $fail)"
if ($fail -gt 0) { exit 1 } else { exit 0 }
