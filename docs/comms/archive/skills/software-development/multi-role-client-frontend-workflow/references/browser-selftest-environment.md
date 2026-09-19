# Worktree 浏览器自测环境搭建（二号用）

> 派工验证标准常含"浏览器级自测路径"（如刷新→恢复草稿→状态回来）。worktree 里从零搭起一套可自测的前后端环境，完整套路如下（v0.33 草稿恢复任务实战验证）。

## 核心原则

- **独立 DB，不复制主 worktree 的 DB**。主库 schema 可能落后于当前代码（迁移只在 Docker 验证过）。正确做法：`server/data/` 留空 → 启动 server 时 `init.js` 自动跑全量迁移建新库（日志确认 `迁移 vNN: xxx 已应用`）。
- **种子数据用临时 `.cjs` 脚本**（`_tmp-seed.cjs`），放 `server/` 下，用 `better-sqlite3` 直接插最小可用数据（画师 + 触发目标功能所需的最少行）。**不进 git，用完删**。
- **端口避让**：主 worktree 的 server 占 3000。worktree server 用 `$env:PORT='3001'; npm run dev` 启动；vite 代理（`vite.config.js` 的 `/api`、`/uploads` target）**临时**改到 3001，自测完还原，**绝不 commit**。

## 步骤清单

1. `git worktree add <path> -b <branch> master`（一号可能已建，先 `Test-Path` 确认）
2. `web/` 和 `server/` 各跑 `npm install`（后台 + notify_on_complete，两个并行）
3. 确认 `server/data/` 不存在或为空；不存在则跳过（启动时自动建）
4. 后台启动 server：`$env:PORT='3001'; npm run dev`，wait 确认 `Server listening at http://127.0.0.1:3001` + 迁移日志
5. 临时 patch `web/vite.config.js` 代理 3000→3001（记住要还原）
6. 后台启动 vite：`npm run dev`
7. 写 `_tmp-seed.cjs` 种子脚本 → `node _tmp-seed.cjs`（先查目标表结构：读 `server/src/db/init.js` 的 CREATE TABLE + 迁移块）
8. 浏览器自测（见下方连接诊断）
9. **收尾**：还原 vite.config.js（`git checkout -- web/vite.config.js`）、删 `_tmp-*.cjs`、杀后台进程

## vite 连接诊断顺序（agent-browser 连不上时）

vite 默认可能只绑 IPv6（netstat 显示 `[::1]:5173`），且本机可能有系统代理（Clash 类，`HKCU:\...\Internet Settings` 的 ProxyServer）干扰 Chrome 对 localhost 的连接。按序诊断：

1. `netstat -ano | Select-String '5173'` — 看实际监听地址（`[::1]` vs `0.0.0.0`）
2. `curl.exe -s -o NUL -w '%{http_code}' http://127.0.0.1:5173/<path>` — 确认服务本身可达
3. `Invoke-WebRequest http://localhost:5173/` — PowerShell 走 localhost 解析，对比 IPv4/IPv6 行为
4. `Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' | Select ProxyEnable,ProxyServer` — 查系统代理
5. `agent-browser close --all` — 重置浏览器会话再重试

不要连续重试同一个失败 URL 超过 2 次——先诊断再换策略。

## 临时文件纪律

- `_tmp-*.cjs`（种子/诊断脚本）：`server/` 下，用完 `Remove-Item`，**绝不 commit**
- vite.config.js 代理改动：自测专用，交付前 `git checkout --` 还原
- commit 前 `git status --porcelain` 核对，只 add 授权文件（逐个列文件名，禁止 `git add -A`）

## 降级原则

浏览器自测因环境问题（代理/daemon 卡死）确实走不完时，如实写进交付 comms：单测覆盖了哪些数据路径（列出测试名 + 断言）、浏览器自测进行到哪一步、卡在哪。**不编造"已验证"**。一号审核时能独立判断风险。
