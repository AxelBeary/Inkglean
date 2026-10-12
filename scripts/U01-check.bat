@echo off
rem ============================================================
rem U01-check.bat - one-click launcher for the backup freshness watchdog
rem Unit C-T08-04 | batch toolshop-2026-09-29 | owner: artist-commission team
rem Keeps this file ASCII-only + CRLF (cmd.exe parses GBK otherwise).
rem Reads only: it never deletes, never overwrites backups, never touches the server.
rem Exit codes: 0=OK  1=FAIL  2=WARN  3=node missing / arg error
rem
rem Double-click: prints the verdict and writes a single-page board next to this file.
rem Set U01_NO_PAUSE=1 to skip the final pause (for automation).
rem Extra args pass through to the .mjs, e.g.:
rem   U01-check.bat --server-json my-server-reading.json
rem   U01-check.bat --repo "D:\some\other\checkout" --max-age-hours 48
rem ============================================================
setlocal
set "HERE=%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo [U01] node is not on PATH. Install Node.js 22.6+, or run the .mjs on a machine that has it.
  if "%U01_NO_PAUSE%"=="" pause
  exit /b 3
)
pushd "%HERE%" >nul
node "U01-backup-freshness.mjs" --html "%HERE%U01-freshness-board.html" --json "%HERE%U01-freshness-last.json" %*
set "RC=%ERRORLEVEL%"
popd >nul
echo.
echo [U01] watchdog exit code = %RC%   (0=OK 1=FAIL 2=WARN 3=env or arg error)
echo [U01] board page: %HERE%U01-freshness-board.html
if "%U01_NO_PAUSE%"=="" pause
exit /b %RC%
