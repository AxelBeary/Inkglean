# 独立 worktree 浏览器实测全套环境搭建（五号-B H1，2026-08-04）

派工要求「浏览器实测」时，在独立 worktree 里从零搭起可登录、可造数据、可点验的全套环境。主仓在跑多路并行角色，端口/进程都可能冲突——本配方全程绕开，不碰别人。

## 0. 建 worktree + 同步 master
```powershell
# 主仓目录
git worktree add "D:\...\artist-commission-wt-05b" -b v036-w2-board-deliver master
# 进 worktree
cd "D:\...\artist-commission-wt-05b"
git merge master   # 通常 Already up to date；git branch --show-current + git log --oneline -3 确认
```

## 1. 装依赖（前后端都要，worktree 不共享 node_modules）
`server/` 和 `web/` 各跑一次 `npm install`。server 首次 `npm run db:init` 会因缺 dotenv 报 ERR_MODULE_NOT_FOUND——就是没装依赖，装完重跑即可。迁移会一路打到当前版本（v38）。

## 2. seed.js 要 tsx 跑，不能 node 跑
`server/src/db/seed.js` 内部 `import('../features/artist/workflow.service.js')`，但磁盘上实际是 `workflow.service.ts`（TS 迁移残留）。直接 `npm run db:seed` 报 ERR_MODULE_NOT_FOUND。
**绕开**（不改 seed.js，不在授权内）：`npx tsx src/db/seed.js`。
seed 只建画师/档位/工作流，**不建订单**——订单要自己用 API 造（见第 5 步）。

## 3. 端口冲突：3000 被占 → PORT=3001
主仓/其他角色的后端占着 3000（netstat 可能只显示 CLOSE_WAIT 残留，探测还超时，但 bind 就是 EADDRINUSE——别纠结，直接换端口）。
```powershell
cd server; $env:PORT='3001'; npm run start   # background=true
```
vite 默认 proxy 写死 `target: localhost:3000`，所以前端也要换代理（第 4 步）。

## 4. 临时 vite 配置覆盖代理 + 端口（测完删，绝不入库）
`web/vite.config.05b.mjs`：
```js
import baseConfig from './vite.config.js'
export default {
  ...baseConfig,
  server: { ...baseConfig.server, port: 5174, strictPort: true,
    proxy: {
      '/api':     { target: 'http://localhost:3001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true }
    } }
}
```
启动：`npx vite --config vite.config.05b.mjs`（background=true）。5173 若被占，`strictPort:true` 会立刻报错，换 5174。**实测结束必须 `Remove-Item` 删掉这个文件**（删了 vite 会自停报 config resolve 错，属正常）。

## 5. 造测试数据：curl 直调 API（先登录）
登录是发码制，码存 DB——直读最快：
```powershell
# a. 触发发码
curl.exe -s -X POST http://localhost:3001/api/auth/send-code -H 'Content-Type: application/json' -d '{\"qqNumber\":\"10001\"}'
# b. 读码（better-sqlite3，在 server/ 目录）
node -e "const db=require('better-sqlite3')('./data/commission.db');console.log(db.prepare('SELECT code FROM login_codes').get().code)"
# c. 验证拿 cookie
Set-Content "$env:TEMP\v.json" ('{"qqNumber":"10001","code":"'+$code+'"}') -NoNewline
curl.exe -s -c "$env:TEMP\05b-cookie.txt" -X POST http://localhost:3001/api/auth/verify -H 'Content-Type: application/json' -d "@$env:TEMP\v.json"
```
**BOM 陷阱（本次实踩）**：`Set-Content -NoNewline` 写出的 body 文件被 Fastify 拒为 `FST_ERR_CTP_INVALID_CONTENT_LENGTH`（BOM 污染长度）。**一律改用 BOM-less UTF-8**：
```powershell
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText("$env:TEMP\body.json", '{"clientQq":"20001"}', $utf8)
curl.exe -s -b "$env:TEMP\05b-cookie.txt" -X POST http://localhost:3001/api/artist/orders/manual -H 'Content-Type: application/json' -d "@$env:TEMP\body.json"
```
造「非工作流 done」单：manual 建单后 `PUT /stage {stageId:null}` 关跟踪，再逐个 `PUT /status` 推 confirmed→wip→done。
造「工作流 done」单：`PUT /stage {stageId:<最后节点id>}` 一步到位（status 自动映射 done）。
节点 id 直读 `artist_workflow_stages` 表。**注意**：`PUT /status` 对带 current_stage_id 的订单会被后端拒（要走 stage 接口，cancelled 除外）——所以先关跟踪。

## 6. 浏览器四路径点击验证
`browser_navigate http://localhost:5174/login` → 填 QQ → 获取码 → 再读 DB 拿新码 → 填码登录 → navigate `/queue`。逐路径点击，每次 `browser_snapshot(full=true)` 确认弹窗/状态：
1. 修复点入口（如下拉菜单项）→ 弹目标组件 ✅
2. 原主操作按钮 → 弹同一组件 ✅
3. 弹窗取消 → `browser_click` 取消后**直读 DB 确认 status 未变** ✅
4. 相邻路径（工作流订单）→ 无回归 ✅

## 7. 清理清单（交付前）
- `Remove-Item web/vite.config.05b.mjs`（临时配置，绝不入库）
- kill 后端 + vite 后台进程（process kill）
- `git status --short` 确认只剩授权文件被改；`git diff --stat` 核对改动行数
- 只 `git add <授权文件>`，禁 `git add -A`
- 临时 `$env:TEMP` json/cookie 文件可留（系统清理），但别提交

## 要点速记
- 独立 worktree = 自带 node_modules、自带 DB，一切独立，别指望主仓
- seed 建不了订单，订单必须 API 造；造之前先搞清目标状态机约束（工作流 vs 非工作流）
- 验证「状态没变」要直读 DB，别只看 UI
- 临时 vite 配置用完必删，commit 前 `git status` 兜底
