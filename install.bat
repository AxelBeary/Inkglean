@echo off
rem ============================================
rem 拾绘 Inkglean · Windows 一键安装（双击本文件即可）
rem 注意：本文件必须保存为 ANSI/GBK 编码（CMD 批处理对 UTF-8 解析有已知缺陷）
rem ============================================
if exist "%~dp0install.mjs" goto checknode

echo.
echo [文件不完整] 找不到搭档文件 install.mjs。
echo 请不要把 install.bat 单独拷出来使用。
echo 正确做法：把压缩包整个解压，然后进入解压出来的文件夹，
echo 在文件夹里面双击 install.bat。
echo.
pause
exit /b 1

:checknode
where node >nul 2>nul
if not errorlevel 1 goto run

echo.
echo [缺少运行环境] 你的电脑还没有安装 Node.js，已经帮你打开了下载页面。
echo 请在打开的网页里，点击 node-v22 开头、以 -x64.msi 结尾的那个文件下载，
echo 下载完双击安装，一路点"下一步"即可。
echo 装好以后，重新双击本文件继续安装。
echo.
start "" "https://nodejs.org/dist/latest-v22.x/"
pause
exit /b 1

:run
node --no-deprecation "%~dp0install.mjs" %*
if not errorlevel 1 goto ok

echo.
echo 安装未成功，请根据上面的提示排查后重新双击本文件。
pause
exit /b 1

:ok
pause
