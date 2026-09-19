# F4 回收站分页（功能型派工）+ 显示层脱敏陷阱 — 2026-08-05

五号执行 REQ-022 F4（管理后台回收站分页，每页 20 条）。低风险功能型派工全流程样例：
读派工 → merge master → 后端 service+route → 前端分页组件 → 路由测试 → 全量验证 → 交付报告。
分支 `f4-recycle-page`，commit `e4bdc4e`（代码）+ `46f475d`（报告），server 831/831（基线 824+7 新例）、
web 186/186、tsc 0、eslint 0。

## ⚠️ 陷阱 1（最重要）：显示层会把 Bearer 脱敏成 ***，复制即损坏代码

工具回显/read_file 会把 `` `Bearer ${...}` `` 显示成 `` *** ${...}` ``（脱敏发生在显示层，
磁盘字节本来是好的——但反过来也一样：**你从脱敏显示里复制代码再 patch 回去，写进磁盘的就是字面量 `***`**）。
本次因此把 8 处 `Authorization: \`Bearer ${...}\`` 写成 `*** ${`，vitest 直接
`RollupError: Parse failure: Expression expected`。

防护流程（凡写含 Bearer/token/Authorization 的代码必做）：
1. 不从工具回显复制这类代码行；凭记忆/规范手写，或从 `node -e` 读真实字节确认后再抄。
2. 写完后立即验证真实字节：`node --check <file>`（或 `Select-String -Pattern '\*\*\*' -SimpleMatch` 应为 0 命中）。
3. 若已污染：`patch replace_all` 把 `Authorization: *** ${` → `` Authorization: `Bearer ${ ``。

## 陷阱 2：派工写的测试路径与 vitest 配置冲突时，以配置为准

派工写测试放 `server/src/features/admin/__tests__/*`，但 `server/vitest.config.js` 的
include 是 `tests/**/*.test.js`——放到 `__tests__/` 根本不会被执行。本次按现有惯例追加到
`server/tests/admin.routes.test.js`（该文件已存在且就是 admin 路由测试的家）。
动手前先读 vitest.config.js 的 include，别照抄派工路径。

## 陷阱 3：期望值从「抄来的表达式」推导，别凭感觉写

路由参数钳位直接复制了订单分页同款表达式（`Math.max(1, Math.min(parseInt(x)||20, 100))`），
初版测试却期望 `pageSize=-5` 回退默认 20——实际该表达式把负值钳到 1。
教训：**先跑一遍测试再定期望**；行为与既有代码同款表达式一致时，改测试期望而不是改代码
（保持全站参数行为一致比"看起来更合理"重要）。已在测试注释里写明对齐关系。

## 其他要点

- **npm install 三处**：仓库根 package.json 只有 playwright；`server/` 和 `web/` 各自要 `npm install`，
  根目录装完 ≠ 子项目依赖就绪（`Test-Path server/node_modules/vitest` 验证）。
- **i18n 零新增键**：el-pagination 的「共 N 条 / Total X」由 App.vue 已有 `ElConfigProvider`
  （zh-cn/en 双 locale）内置提供——派工说「复用现有键则不新增」时，先查 ElConfigProvider 再决定。
- **响应契约变化要写明无第三方消费者**：`{items}` → `{items,total,page,pageSize}`，交付前
  grep 全仓确认调用点只有 AdminDashboard 一处，并写进报告。
- **mtime 倒序测试造数**：`writeFileSync` 后 `utimesSync(full, t, t)` 显式设置 mtime 构造
  可控时间序列；afterEach `rmSync(binRoot, {recursive,force})` 隔离（UPLOAD_DIR 已被
  vitest.config 指到 tmpdir）。
- patch 工具的自动 lint hook 在本机对 .js 报 `MODULE_NOT_FOUND`（路径 `/d/` 前缀转换 bug）
  是误报——以真实 `node --check` / 测试运行结果为准，别被 hook 报错带偏。
