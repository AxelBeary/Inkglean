@echo off
rem ============================================
rem 每日备份：DB + uploads（2026-08-11 用户拍板：DB 留存 3 份 / uploads 留存 2 份，轮转在脚本内置）
rem P0-1（2026-08-13）：DB 备份后追加 SQLite 完整性校验（scripts/verify-backup.mjs），
rem 未出 VERIFY_OK 即 exit 1，防止「备份了但产物损坏」继续往下走。
rem 由 Windows 计划任务 CommissionDailyBackup 每日 03:30 调用；日志追加到 data/backups/daily-backup.log
rem 容器 WORKDIR=/app，--prefix 指向 /app/server（批 E 审计修复交付）
rem 宿主需有 node（>=22.6）且 server/ 依赖已安装（better-sqlite3 供校验用）
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
