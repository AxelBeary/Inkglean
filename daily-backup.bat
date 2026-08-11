@echo off
rem ============================================
rem 每日备份：DB + uploads（2026-08-11 用户拍板：DB 留存 3 份 / uploads 留存 2 份，轮转在脚本内置）
rem 由 Windows 计划任务 CommissionDailyBackup 每日 03:30 调用；日志追加到 data/backups/daily-backup.log
rem 容器 WORKDIR=/app，--prefix 指向 /app/server（批 E 审计修复交付）
rem ============================================
cd /d "%~dp0"
echo === %date% %time% daily-backup start === >> "%~dp0data\backups\daily-backup.log"
docker compose exec -T web npm --prefix /app/server run backup >> "%~dp0data\backups\daily-backup.log" 2>&1
if errorlevel 1 (
  echo DB_BACKUP_FAILED %time% >> "%~dp0data\backups\daily-backup.log"
  exit /b 1
)
docker compose exec -T web npm --prefix /app/server run backup:uploads >> "%~dp0data\backups\daily-backup.log" 2>&1
if errorlevel 1 (
  echo UPLOADS_BACKUP_FAILED %time% >> "%~dp0data\backups\daily-backup.log"
  exit /b 1
)
