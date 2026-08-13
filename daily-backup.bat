@echo off
rem ============================================
rem Daily backup: DB + uploads (2026-08-11 user decision: keep 3 DB / 2 uploads, rotation built-in)
rem P0-1 (2026-08-13): after DB backup run SQLite integrity check (scripts/verify-backup.mjs);
rem abort (exit 1) unless VERIFY_OK, so a corrupted artifact never passes downstream.
rem Invoked by Windows scheduled task CommissionDailyBackup at 03:30 daily; log appended to data/backups/daily-backup.log
rem Container WORKDIR=/app, --prefix points to /app/server (batch E audit fix)
rem Host needs node (>=22.6) and server/ deps installed (better-sqlite3 for verification)
rem NOTE: keep this file ASCII-only; non-ASCII bytes break cmd.exe batch parsing under GBK codepage
rem ============================================
setlocal EnableExtensions
cd /d "%~dp0"
if not exist "%~dp0data\backups" mkdir "%~dp0data\backups"
set "BACKUP_LOG=%~dp0data\backups\daily-backup.log"
set "TMP_OUT=%TEMP%\commission-backup-out-%RANDOM%.txt"

echo === %date% %time% daily-backup start === >> "%BACKUP_LOG%"

rem ---- 1) DB backup (VACUUM INTO), capture BACKUP_OK path ----
docker compose exec -T web npm --prefix /app/server run backup > "%TMP_OUT%" 2>&1
set "BACKUP_CODE=%ERRORLEVEL%"
type "%TMP_OUT%" >> "%BACKUP_LOG%"
if not "%BACKUP_CODE%"=="0" (
  echo DB_BACKUP_FAILED %time% >> "%BACKUP_LOG%"
  del "%TMP_OUT%" >nul 2>&1
  exit /b 1
)

set "VERIFY_TARGET="
for /f "usebackq tokens=1,* delims= " %%A in ("%TMP_OUT%") do (
  if "%%A"=="BACKUP_OK" set "VERIFY_TARGET=%%B"
)
if not defined VERIFY_TARGET (
  echo BACKUP_ARTIFACT_NOT_FOUND %time% >> "%BACKUP_LOG%"
  echo - FAILED to parse BACKUP_OK from npm run backup output, backup artifact unverified >> "%BACKUP_LOG%"
  del "%TMP_OUT%" >nul 2>&1
  exit /b 1
)

rem ---- 2) SQLite integrity verification (VERIFY_OK required, else abort) ----
where node >nul 2>&1
if errorlevel 1 (
  echo VERIFY_SKIPPED_NODE_MISSING %time%: node not found on host, cannot verify backup, aborting >> "%BACKUP_LOG%"
  echo - Next: install Node.js (>=22.6) or run from a machine with node on PATH, then re-run >> "%BACKUP_LOG%"
  del "%TMP_OUT%" >nul 2>&1
  exit /b 1
)
node scripts\verify-backup.mjs "%VERIFY_TARGET%" >> "%BACKUP_LOG%" 2>&1
if errorlevel 1 (
  echo VERIFY_FAILED %time%: backup artifact failed integrity check, aborting deploy chain >> "%BACKUP_LOG%"
  del "%TMP_OUT%" >nul 2>&1
  exit /b 1
)
echo VERIFY_OK_RECORDED %time% >> "%BACKUP_LOG%"

rem ---- 3) uploads backup ----
docker compose exec -T web npm --prefix /app/server run backup:uploads >> "%BACKUP_LOG%" 2>&1
if errorlevel 1 (
  echo UPLOADS_BACKUP_FAILED %time% >> "%BACKUP_LOG%"
  del "%TMP_OUT%" >nul 2>&1
  exit /b 1
)

del "%TMP_OUT%" >nul 2>&1
