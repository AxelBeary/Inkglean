# F5 留言筛选 + 文档同步批 + 第三方打磨批（2026-08-05，五号）

三个批次的共性教训：worktree 环境污染、派工重投循环、纯前端打磨技法。

## 1. ⚠️ npm approve-scripts 会污染 package.json（越权风险）

worktree 里 `npm install` 后 esbuild 的 postinstall 被 allow-scripts 插件拦截，需跑
`npm approve-scripts esbuild` 才能用 vitest/vite。该命令会把
`"allowScripts": { "esbuild@x.y.z": true }` **写进 package.json** —— 而 package.json
几乎从不在授权文件列表里。

- F5 批提交前 `git diff --stat` 发现 server/web 两个 package.json 被改 → `git checkout -- <file>` 还原后才提交。
- 纪律：worktree 装过依赖的批次，提交前 diff 核对必须逐个文件看，package.json/package-lock.json 是高频污染点。

## 2. ⚠️ 派工重投循环（桌面端/provider 问题）→ 断点恢复协议

同一份派工文本曾一字不差送达 8+ 次。根因（agent.log 实锤）：provider 流式连接中断
（`Streaming failed before delivery: Connection error` / `Request timed out`）→
conversation loop 重试 + 桌面端把用户消息整条重投为新轮次。用户侧只发过一次。

**角色响应协议（每次重投都照做，绝不重做）**：
1. `git branch --show-current` + `git status --short` + `git log --oneline -3` + `git diff --stat` 定位断点；
2. 已 commit → 只报「重复送达，任务已在 `<hash>` 交付」，不重复提交、不重写报告；
3. 改到一半 → 核对现有 diff 与断点一致后从断点续做；
4. 连续重投多轮时提醒用户/一号排查派工循环，避免空转烧 token。

## 3. 验证证据纪律

系统核验器反复判定「未执行验证」时，**直接在 worktree 里跑 canonical 命令**
（`npx vitest run` / `npx eslint .` / `npm run build` / `npx tsc --noEmit`）并引用新鲜输出。
不要包成 Temp 下的 hermes-verify-*.ps1 再执行——脚本执行可能被审批超时 BLOCKED，
反而拿不到证据；canonical 命令直跑本身就是证据。纯 docs 批无需跑测试，grep 复验即证据。

## 4. 文档 grep 红线验证技法（文档同步批）

派工要求「某 token 在 docs/ 下只剩 changelog 与 archive」时：
1. 先全量 grep 列出所有命中，逐一分类：豁免区（changelog 历史账本 / archive/ /
   comms 派工任务原文本身含该 token / STATUS.md 一号只读）vs 产品文档残留；
2. 只改产品文档；改写时用描述性措辞保留语义（如 `login_codes 表` → 「登录码数据表」），
   迁移史条目保留但补「已随 vX 移除」标注，不删历史行；
3. 豁免区命中逐条写进交付报告说明为何不动；
4. 顺带发现的**代码**残留（如 init.js 死建表 SQL、注释引用已删接口）只写报告不动手。

## 5. Element Plus 客户端打磨技法（打磨批 A/B/C/E）

- **E · el-page-header 无障碍名重复**：EP 2.14.3 page-header 的 icon div 自动带
  `aria-label = title prop`，与 title 文本叠加读屏读两遍。修法：保留 :title prop，
  title 插槽内容包 `<span aria-hidden="true">`——icon aria-label 成为唯一无障碍名，视觉零变化。
  **务必 grep 全站 el-page-header 用法**：报告只提一处，实际有 3 处（TrackOrder/OrderForm/DeliveryPage）。
- **B · 亮色对比度（AA）**：el-alert is-light warning 文字默认 = `--el-color-warning`
  #e6a23c，浅橙底约 2.2:1。scoped CSS 覆盖：
  `html:not(.dark) .x { color: #855e0a }` + `html:not(.dark) .x :deep(.el-alert__description) { color: #855e0a }`
  ≈5.4:1 达 AA。`html:not(.dark)` 作用域保证暗色零影响（红线：只调亮色）。
- **C · placeholder 调深**：页面容器上 `html:not(.dark) .page { --el-input-placeholder-color: #6c6e72; }`
  （默认 #a8abb2 白底约 2.5:1 → #6c6e72 ≈5.1:1）。
- **A · 色名 i18n**：青/碧/蓝/靛/紫 → Teal/Turquoise/Blue/Indigo/Violet
  （英语传统色名，派工红线「信达雅，别直译成单字」）。数组存 i18n 键，模板 `t(a.nameKey)`。
- **浏览器实测**：
  - `browser_console` expression 返回裸对象/IIFE → 序列化成 null；必须 `JSON.stringify({...})` 包一层。
  - EN 实测流程：点语言切换 → 打开色板 → `browser_snapshot` 读 tooltip 里的 accessible name（比截图快）。
  - CSS 变量是否生效：console 里 `getComputedStyle(容器).getPropertyValue('--el-xxx')` 精确核验。
