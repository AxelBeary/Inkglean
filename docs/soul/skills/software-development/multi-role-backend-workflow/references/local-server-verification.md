# 本地实测 / 响应头验证 / 静态缓存 / SPA 路由测试（artist-commission 后端）

三号环境批（B1 静态缓存头 + B2 uploads 响应头区分公开/签名）实测沉淀。
适用：需要「起服务 + curl 验证响应头」或「测 SPA 静态路由」的任务。

## 1. 起服务实测的正确姿势（Windows / tsx）

- **必须用 `npm run start`（= `tsx src/index.js`），不能 `node src/index.js`**：
  项目是 TS 渐进迁移，`file-sign.ts` 等共享模块以 `.js` 后缀 import 实际是 TS 文件，
  node 直跑报 `ERR_MODULE_NOT_FOUND`。tsx 才能解析。
- **环境变量必须与启动命令在同一 PowerShell 调用里 export**（或用 background 启动时内联）：
  `$env:PORT=...; $env:DB_PATH=...; $env:UPLOAD_DIR=...; $env:SESSION_SECRET=...; npx tsx src/index.js`
  - 后台进程（`terminal background=true`）的 env 是**启动那一刻的快照**；
    之后任何前台 `$env:` 都不影响已启动的进程。
  - **千万不要用默认 DB_PATH（./data/commission.db）跑本地服务**——会写主仓真实数据库！
    本地实测一律 `DB_PATH=<临时目录>/test.db`、`UPLOAD_DIR=<临时目录>`。
  - `dotenv/config` 不覆盖已存在的环境变量，所以 export 后 tsx 会用你的值（需在同一调用内）。
- 端口冲突：`EADDRINUSE 0.0.0.0:3000` 说明有别的实例占 3000，换 `PORT=3099` 之类。

## 2. 签名 URL 验证：生成与校验必须同 secret

`verifyFileToken` 用 `process.env.SESSION_SECRET`（生产 fail-fast，开发默认 dev-secret）。
curl 验证签名路径 200 前，**必须在同一终端调用里 export SESSION_SECRET 再生成签名**：

```powershell
$env:SESSION_SECRET = "...同服务进程的值..."
$sig = npx tsx -e "import { signFilePath } from './src/shared/file-sign.ts'; process.stdout.write(signFilePath('references/ref.png'))"
curl.exe -sI "http://localhost:3099/uploads/references/ref.png?sig=$sig"
```

- 假签名/无签名 → 403（签名校验先于 setHeaders，看不到响应头）。
- 公开路径（images/）无需签名，直接 200。
- 注意：`npx tsx -e` 是独立子进程，若 SESSION_SECRET 只在服务启动时 export 过、生成签名时没 export，
  会用 dev 默认 secret → 签名不匹配 → 403（曾误判为代码 bug）。

## 3. @fastify/static 的 setHeaders 行为（v10）

- 签名：`setHeaders(reply, filePath, stat)`，**第三参是绝对路径**（`normalize(join(root, path))`）。
- 区分公开/签名：`relative(UPLOAD_DIR, filePath)` 还原相对路径，再走 `isPublicUploadPath('/uploads/' + rel)`，
  与 onRequest 钩子的判定逻辑保持一致，避免「访问控制与响应头语义分叉」。
- @fastify/static 把 `cacheControl`/`maxAge`/`immutable` 透传给 @fastify/send，但
  **不同目录（公开 vs 签名）想给不同缓存策略时，setHeaders 回调里按路径分支最直接**。

## 4. SPA 静态路由测试模式（app.js 手动通配路由）

- app.js 的 `hasWebDist = existsSync(WEB_DIST)` 在 **buildApp 时求值**，
  测试默认不设 WEB_DIST → SPA 路由不注册。
- 测 SPA 缓存头：**每个用例自建临时 dist**（mkdtempSync + assets/ + index.html + 假文件），
  `process.env.WEB_DIST = dist` 后重新 buildApp，afterEach 清理 + `delete process.env.WEB_DIST`。
- 造临时上传文件：`mkdirSync(recursive)` + `writeFileSync`，测完 `rmSync(recursive, force)`。
- 已有模式参考：`server/tests/static-cache.test.js`（B1 缓存头 6 例 TC-ENV-06~11）、
  `server/tests/upload.routes.test.js` 末尾 B2 响应头 5 例（TC-ENV-01~05）。

## 5. 关键坑（本会话亲历）

- **后台进程 env 不共享**：export 只对「同一调用内」的子进程生效；跨调用（background 启动的服务
  vs 后续前台生成签名）env 各自独立。要共享就一条命令搞定，或把 secret 写进服务启动命令。
- **绝对路径最安全**：Hermes 的 patch/read/write_file 都吃绝对路径，终端 cwd 可能漂移
  （本会话出现过终端 cwd 串到别的 worktree），**一切 git 操作用 `git -C <绝对路径>`**，
  不要依赖 `workdir` 参数。
- **Windows 下 `node -e` / execFileSync 里 `npx.cmd` spawn EINVAL**：.cmd 需 `shell:true`，
  直接 `node <node_modules>/vitest/vitest.mjs run ...` 等价于 npx vitest。
- **响应头断言用 app.inject 而非真服务**：绝大多数场景（测试）inject 够用；
  真服务 curl 只在「确认真实网络行为/验证完整体验」时做，且务必临时目录 + 独立端口。
- **主仓 dist 可只读引用**：web/dist 是 gitignored 产物，worktree 里可能没有；
  本地实测 SPA 路由可用 `WEB_DIST=<主仓>/web/dist` 只读引用，不改主仓。
- **清理纪律**：实测结束停服务（process kill）+ 删临时目录 + 确认端口释放；
  交付报告里贴 curl 原始输出作为证据。
