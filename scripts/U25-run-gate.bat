@echo off
rem ============================================================
rem U25 release number gate - double-click wrapper (lane B06 fix)
rem Encoding contract: pure ASCII + CRLF; never references a Chinese-named bat.
rem
rem Runs BOTH gates, prints each raw exit code, then a combined verdict:
rem   gate A = node   U25-release-numbers-check.mjs  doc claims vs disk truth
rem   gate B = python U25-release-num-gate.py        package.json / STATUS / changelog cross
rem The r1 wrapper ran only gate B, so a real same-line contradiction in
rem docs passed as all-clear (see diff note in README section 6).
rem
rem Which repo it checks: arg 1 if given, else the single path in U25_root.txt,
rem else each gate falls back to its own built-in default.
rem Set U25_NO_PAUSE=1 to skip the pause (scripted runs).
rem Combined exit: 0 = every gate clean, 1 = at least one gate wants a look.
rem ============================================================
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "PY=python"
where %PY% >nul 2>&1 || set "PY=py -3"
set "ROOT=%~1"
if "%ROOT%"=="" if exist U25_root.txt set /p ROOT=<U25_root.txt
if defined ROOT (echo [U25] repo root in use: %ROOT%) else echo [U25] no root given, using each gate default
echo.
echo [U25] gate A: doc claims vs disk truth ...
if "%ROOT%"=="" (
  node U25-release-numbers-check.mjs
) else (
  node U25-release-numbers-check.mjs --root "%ROOT%"
)
set "RC1=%ERRORLEVEL%"
echo.
echo [U25] gate B: package/status/changelog cross ...
if "%ROOT%"=="" (
  %PY% -X utf8 U25-release-num-gate.py
) else (
  %PY% -X utf8 U25-release-num-gate.py --root "%ROOT%"
)
set "RC2=%ERRORLEVEL%"
echo.
echo [U25] gate A raw exit %RC1%   (A: 0 ok / 1 mismatch / 2 only warnings / 3 cannot judge)
echo [U25] gate B raw exit %RC2%   (B: 0 ok or warnings / 1 mismatch / 2 fact sources missing)
set "RC=0"
if not "%RC1%"=="0" set "RC=1"
if not "%RC2%"=="0" set "RC=1"
echo [U25] combined %RC%  -  0 = numbers agree everywhere, 1 = read the lines above
echo [U25] this gate never edits any file; it only reports.
if not defined U25_NO_PAUSE pause
exit /b %RC%
