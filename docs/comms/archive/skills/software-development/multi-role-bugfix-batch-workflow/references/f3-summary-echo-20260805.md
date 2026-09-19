# REQ-022 F3 约稿表单摘要回显（五号，2026-08-05）

前端展示类派工（非 Bug 修复）的标准执行模式。派工文件：`01-to-05-F3表单回显-20260805.md`。

## 派工特征（与 Bug 批的差异）

- 一号已核实现状并写明「勿重复调研」——直接读派工给的行号范围下刀，不重新调研
- 授权文件极小：单个 .vue + locales 两个（仅新增键）+ `__tests__/*`
- 明确黑名单：views/artist/（二号视觉批并行）、server/、docs/
- 验证口径派工指定：web vitest 全绿（基线数字）+ tsc 0 + lint 0；server 不受影响不用跑

## 实现模式（摘要卡回显类）

1. 插入点选「双模式分支之外的公共位置」：`<aside class="summary-card">` 的 `summary-title` 之后、`<template v-if="isStyleMode">` 之前——一处改动覆盖画风模式+旧模型两个分支，不用重复写两遍
2. 空值语义：`form.clientName.trim()` / `form.description.trim()` 各自控制行显隐，整块 `v-if` 用 `||`；纯空白视为空（不显示占位灰字）
3. 长文本截断：`display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden` + `word-break:break-word`，不加展开按钮（派工明言「工程量小的非核心倾向简单方案」）
4. i18n 双 locale 各加两键，紧跟现有 summaryTitle 行放置，注释标需求号
5. 测试复用现有 stepnav 测试的 mock 方案：`vi.mock('../../../composables/useOrderForm.js')` + `h = vi.hoisted(...)` 可控实例，`h.build(mode)` 构造 legacy/single/multi 三模式；mount 时 stub ClientFloatingActions + mock `$t: key=>key`（断言直接查 i18n key 字符串）

## 验证数字

- 基线 web vitest 186/186 → 修改后 192/192（新增 OrderForm.summary.test.js 6 例）
- eslint 0 错；server `npm run typecheck` 0 错（tsc 在 server 侧，web 是纯 JS 无 tsc 脚本）
- server node_modules 在 worktree 里缺失时需先 `npm install` 再 typecheck

## ⚠️ 手测迭代预算教训（本次中断根因）

5 步下单向导逐步 click + snapshot 手测消耗 15+ 次工具调用，打光迭代预算，导致**截图/报告/commit 三步未交付**。规则：

- 已知 DOM 结构时用 `browser_console` 表达式连推：`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('下一步'))?.click()`，一步一调用、免 snapshot
- 只在证据点用 browser_vision/截图
- 手测前预留 ≥15 次迭代给报告写作 + commit（写报告 `05-to-01-F3表单回显-交付-20260805.md` → git add 白名单逐文件 → 单行 commit → 不推送不合并）
- 中断续作：浏览器会话停在第 5 步（联系方式页，描述已填），直接填昵称 → 截图两张（填写态+长描述截断态）→ 补报告+commit

## worktree 手测端口现状（多 worktree 并行常态）

- **3000 = docker 容器 commission-web**（healthy），API 端点 `/api/artists` 返回 demo 画师 alice/bob/carol。worktree 里另起 server 必 EADDRINUSE——起了立即 kill，直接用容器后端
- **5173 常被别的 worktree 的 vite 占着**（本次是 artist-commission-webguard），vite 自动顺延到 5174/5175，以输出 `Local:` 行为准；vite proxy `/api` → 3000 自动生效
- 手测组合 = worktree vite（新端口）+ 容器后端，前端改动即时可见

## patch 工具误报

`patch` 对 web 下 .js 文件跑 `node --check` 时把盘符路径归一成 `D:\d\...` 报 MODULE_NOT_FOUND——是工具路径 bug 不是语法错。用 `node --check '完整盘符路径'` 手动验证即可（本次 zh-CN.js/en.js 实测 syntax-ok）。
