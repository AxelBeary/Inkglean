@echo off
rem ============================================
rem Daily backup: DB + uploads (2026-08-11 user decision: keep 3 DB / 2 uploads, rotation built-in)
rem P0-1 (2026-08-13): after DB backup run SQLite integrity check (scripts/verify-backup.mjs);
rem abort (exit 1) unless VERIFY_OK, so a corrupted artifact never passes downstream.
rem Invoked by Windows scheduled task CommissionDailyBackup at 03:30 daily; log appended to data/backups/daily-backup.log
rem Container WORKDIR=/app, --prefix points to /app/server (batch E audit fix)
rem Host needs node (>=22.6) and server/ deps installed (better-sqlite3 for verification)
rem P2-E (2026-08-14): UTF-8 timestamps via scripts/backup-log.ps1 (no cmd %date%/%time% GBK garbage);
rem log rotation via scripts/rotate-log.ps1 (5MB x 3, best-effort)
rem NOTE: keep this file ASCII-only; non-ASCII bytes break cmd.exe batch parsing under GBK codepage
rem ============================================
setlocal EnableExtensions
cd /d "%~dp0"
if not exist "%~dp0data\backups" mkdir "%~dp0data\backups"
set "BACKUP_LOG=%~dp0data\backups\daily-backup.log"
set "TMP_OUT=%TEMP%\commission-backup-out-%RANDOM%.txt"

rem ---- 0) log rotation (best-effort) + UTF-8 timestamped start marker ----
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\rotate-log.ps1" -Path "%BACKUP_LOG%"
if errorlevel 1 echo ROTATE_LOG_WARN: rotation failed, continuing >> "%BACKUP_LOG%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-log.ps1" -LogPath "%BACKUP_LOG%" -Message "=== daily-backup start ==="

rem ---- 1) DB backup (VACUUM INTO), capture BACKUP_OK path ----
docker compose exec -T web npm --prefix /app/server run backup > "%TMP_OUT%" 2>&1
set "BACKUP_CODE=%ERRORLEVEL%"
type "%TMP_OUT%" >> "%BACKUP_LOG%"
if not "%BACKUP_CODE%"=="0" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-log.ps1" -LogPath "%BACKUP_LOG%" -Message "DB_BACKUP_FAILED"
  del "%TMP_OUT%" >nul 2>&1
  exit /b 1
)

set "VERIFY_TARGET="
for /f "usebackq tokens=1,* delims= " %%A in ("%TMP_OUT%") do (
  if "%%A"=="BACKUP_OK" set "VERIFY_TARGET=%%B"
)
if not defined VERIFY_TARGET (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-log.ps1" -LogPath "%BACKUP_LOG%" -Message "BACKUP_ARTIFACT_NOT_FOUND"
  echo - FAILED to parse BACKUP_OK from npm run backup output, backup artifact unverified >> "%BACKUP_LOG%"
  del "%TMP_OUT%" >nul 2>&1
  exit /b 1
)

rem ---- 2) SQLite integrity verification (VERIFY_OK required, else abort) ----
where node >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-log.ps1" -LogPath "%BACKUP_LOG%" -Message "VERIFY_SKIPPED_NODE_MISSING: node not found on host, cannot verify backup, aborting"
  echo - Next: install Node.js 22.6+ or run from a machine with node on PATH, then re-run >> "%BACKUP_LOG%"
  del "%TMP_OUT%" >nul 2>&1
  exit /b 1
)
node scripts\verify-backup.mjs "%VERIFY_TARGET%" >> "%BACKUP_LOG%" 2>&1
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-log.ps1" -LogPath "%BACKUP_LOG%" -Message "VERIFY_FAILED: backup artifact failed integrity check, aborting deploy chain"
  del "%TMP_OUT%" >nul 2>&1
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-log.ps1" -LogPath "%BACKUP_LOG%" -Message "VERIFY_OK_RECORDED"

rem ---- 3) uploads backup ----
docker compose exec -T web npm --prefix /app/server run backup:uploads >> "%BACKUP_LOG%" 2>&1
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-log.ps1" -LogPath "%BACKUP_LOG%" -Message "UPLOADS_BACKUP_FAILED"
  del "%TMP_OUT%" >nul 2>&1
  exit /b 1
)

del "%TMP_OUT%" >nul 2>&1
