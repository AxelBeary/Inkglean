# F5 留言筛选批（五号，2026-08-05）——后端参数化筛选 + ⚠️ npm approve-scripts 污染陷阱

## ⚠️ 陷阱（本批最大收获）：npm approve-scripts 自动改写 package.json

本机 npm 配置有 allow-scripts 策略：worktree 里 `npm install` 装好后，`npm approve-scripts esbuild`（批准 postinstall 才能跑 vitest/vite）会**自动往该包的 package.json 写入 `allowScripts` 字段**。

- 症状：提交前 `git diff --stat` 发现 server/package.json、web/package.json 被改，但不在授权列表。
- 识别：diff 内容是新增 `"allowScripts": { "esbuild@x.y.z": true }` 块——工具行为，非本批改动。
- 处置：`git checkout -- server/package.json web/package.json` 还原后继续。**不入库**（主仓没这字段，入库会污染）。
- 教训：worktree 装依赖后、提交前，`git diff --stat` 核对这一步就是抓这个的——本批靠它抓到了。

## 三维筛选模式（可复用）

后端：`getXxx(filters = {})` 动态 WHERE 拼装（clauses 数组 + params 数组，`clauses.length ? 'WHERE '+clauses.join(' AND ') : ''`）。路由层负责清洗：枚举白名单（非法值忽略，与全站 getArtistOrders 惯例一致）、parseInt + Number.isNaN 判断、字符串严格比较（replied 只认 '1'/'0'）。

前端：三个 clearable el-select + 单一 `loadXxx()` 重请求函数（不在前端过滤全量）；onMounted 末尾调一次；筛选下拉数据源复用页面已加载的列表（如 artists）。

## 测试惯例

- service 层用例加进既有 `guestbook.test.js`（fixture 函数 seedFilterFixture 造数：覆盖 状态×回复×画师 三维组合）。
- HTTP 层用例新建独立文件（`guestbook-admin-filter.test.js`），照 `admin.routes.test.js` 惯例：setAdmin 写 platform_config + createSession 造 token + app.inject。
- 基线核对：派工给基线 831，新增 14 例 → 845，数字对账写进交付报告。

## 验证命令（worktree 内）

```powershell
cd server; npm install; npm approve-scripts esbuild; npx vitest run; npx tsc --noEmit
cd ../web; npm install; npm approve-scripts esbuild; npx vitest run; npx eslint .; npm run build
```
（patch 工具对 .js 报 `/d/...` 路径假 lint 错是 Windows 已知坑，忽略）
