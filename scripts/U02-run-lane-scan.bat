@echo off
rem U02-run-lane-scan.bat | C-T07-09 parallel-lane site clean scan (report only, no delete)
rem Double-click to run. Pure ASCII + CRLF by design.
chcp 65001 >nul
cd /d "%~dp0"
echo Running U02 lane scan (read-only, default mode = report only) ...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "U02-lane-scan.ps1" -ReportFile "scan-latest.txt"
set "RC=%ERRORLEVEL%"
echo.
echo ExitCode=%RC%
echo Full text also saved to: %~dp0scan-latest.txt
pause
