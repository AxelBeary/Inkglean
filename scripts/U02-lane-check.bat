@echo off
rem ============================================================
rem U02 lane inventory - double-click launcher (report only, deletes nothing)
rem Optional: drag a project folder onto this .bat to scan that repo.
rem ============================================================
chcp 65001 >nul
title U02 lane inventory (report only)
set "PS1=%~dp0U02-lane-check.ps1"
if not exist "%PS1%" (
  echo [ERROR] cannot find U02-lane-check.ps1 next to this .bat
  echo Put this .bat and the .ps1 in the same folder.
  pause
  exit /b 2
)
if "%~1"=="" (
  echo [NOTE] No project root given.
  echo This tool refuses to guess the repo root on purpose - see the message below.
  echo To scan a repo: drag the project folder onto this .bat, or pass -Root.
  echo.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
) else (
  echo Scanning project root: %~1
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Root "%~1"
)
echo.
echo Done. Exit code %ERRORLEVEL% - 0 means the tool ran fine (it never deletes anything).
pause
