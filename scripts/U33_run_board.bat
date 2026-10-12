@echo off
REM U33 pending-decision board - one double click: read-only parse, then open the one-page board.
REM This file is pure ASCII + CRLF on purpose (contract rule: bat must stay ASCII).
REM All Chinese text lives in the generated HTML page and the Python source, never in here.
REM Self-test mode: set U33_NO_OPEN=1 to run the parse without launching a browser or waiting for a key.
setlocal
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
REM U33 refuses to write its product inside the scanned repo (anti-cross-boundary guard).
REM Since this tool now lives in the repo (scripts\), send the board+json to a dir OUTSIDE the repo.
set "OUTDIR=%TEMP%\U33-pending"
if not exist "%OUTDIR%" mkdir "%OUTDIR%"
set "PYEXE="
where py >nul 2>nul && set "PYEXE=py"
if not defined PYEXE where python >nul 2>nul && set "PYEXE=python"
if not defined PYEXE (
  echo [U33] ERROR: no Python found on PATH. Install Python 3, then run this file again.
  if not "%U33_NO_OPEN%"=="1" pause
  exit /b 127
)
echo [U33] scanning docs\comms READ-ONLY and building the one-page board ...
"%PYEXE%" "%~dp0U33_pending_board.py" --out "%OUTDIR%" %*
set "RC=%ERRORLEVEL%"
echo [U33] python exit code = %RC%
if "%U33_NO_OPEN%"=="1" goto noshow
if not "%RC%"=="0" goto end
if exist "%OUTDIR%\U33_pending_board.html" start "" "%OUTDIR%\U33_pending_board.html"
echo [U33] opened the one-page board in your default browser: %OUTDIR%\U33_pending_board.html  (machine-readable copy: U33_queue.json)
goto end
:noshow
echo [U33] browser open skipped because U33_NO_OPEN=1 (self-test mode)
:end
if not "%U33_NO_OPEN%"=="1" pause
exit /b %RC%
