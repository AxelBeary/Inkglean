@echo off
rem ============================================
rem 拾绘 Inkglean · 启动网站（平时开机用，双击本文件即可）
rem 注意：本文件必须保存为 ANSI/GBK 编码（CMD 批处理对 UTF-8 解析有已知缺陷）
rem ============================================
if exist "%~dp0install.mjs" goto checknode

echo.
echo [文件不完整] 找不到搭档文件 install.mjs。
echo 请进入当初解压出来的那个文件夹，在里面双击本文件。
echo.
pause
exit /b 1

:checknode
where node >nul 2>nul
if not errorlevel 1 goto run

echo.
echo [缺少运行环境] 你的电脑还没有安装 Node.js。
echo 请先双击 install.bat 完成安装（它会引导你装好 Node.js）。
echo.
pause
exit /b 1

:run
node --no-deprecation "%~dp0install.mjs" --start %*
if not errorlevel 1 goto ok

echo.
echo 启动未成功，请根据上面的提示排查后重试。
pause
exit /b 1

:ok
pause
