# worktree 依赖安装与验证环境坑（2026-08-06 topbar 压缩批 / 视觉通病批1 实锤）

## npm install 污染 package.json（每次新 worktree 必踩）

- 新 worktree `web/` 无 node_modules，`npm install` 后 `npm approve-scripts esbuild vue-demi`（npm 的 allow-scripts 机制）会往 `web/package.json` 写 `allowScripts` 字段。
- 该字段是**本机工具配置，不是业务改动**，混进提交会被一号打回。
- 处理：commit 前 `git checkout -- web/package.json` 还原（node_modules 已装好，不影响测试）。**每次装完依赖都要查 `git status` 看 package.json 是否被动**。
- 依赖安装标准流程：`npm install --no-audit --no-fund` → `npm approve-scripts esbuild vue-demi` → `Test-Path node_modules\.bin\vite.cmd` 确认。

## 无法真实浏览器实测时：临时组件测试等效验证

- 场景：画师后台需登录态（TOTP），后端容器宿主访问超时（docker 内健康但 localhost 不通），vite dev 的 proxy 也走不通 → 无法真实浏览器进 dashboard。
- 替代方案：写**临时 vitest 组件测试**（`web/src/__tests__/*.tmp.test.js`），mock 掉 store/api/i18n/router/ThemeToggle/el-* 组件，用 happy-dom 模拟：
  - `window.matchMedia` mock（可切换宽度）——组件里 `isMobile`/`isNarrow` 用 `window.matchMedia('(max-width: 600px)')` 初始化，测试里按需返回 matches。
  - `localStorage.setItem('sidebar_collapsed','1')` 模拟折叠态。
  - `vi.mock('vue-i18n')` 返回 `locale: ref('zh-CN')`（注意 locale 是 ref，模板自动解包，mock 成字符串会走错分支）。
  - `$t` 用 `global.mocks: { $t: (k) => k }`（组件模板用全局 $t，不只 useI18n 的 t）。
  - el-* 组件 stub 掉（`vi.mock('element-plus')` 或 global.stubs），否则大量 Vue warn。
- 验证完**删除临时测试**（`Remove-Item`），不进仓库；全量 vitest 再跑一遍确认 215 基线无回归。
- 布局类改动（v-if 渲染分支）用组件测试覆盖渲染逻辑，与浏览器实测等效。

## ad-hoc 验证脚本（hermes-verify-* 惯例）

- 系统要求"提交前跑验证"时，可在系统 Temp 目录写 `hermes-verify-<批次>.mjs` 做静态断言（不依赖浏览器/后端）。
- **CRLF 坑**：Windows 下 `fs.readFileSync().includes()` 匹配 `\n` 会失败（文件是 `\r\n`），必须 `src.replace(/\r\n/g, '\n')` 归一化。
- 断言语义要精准：比如"按钮去 bounce"应检查**按钮规则块内**无 `var(--ease-bounce)`，而不是整个文件无该变量（变量可能保留给庆祝场景）。
- 验证完删除脚本。

## 其他

- `patch` 工具 lint 报 `Cannot find module 'D:\d\...'` 是 Windows `/d/` 路径假错（记忆已知），文件实际已写入，忽略。
- 写 .mjs 脚本时 `require('vue')` 在 vi.mock 提升前不可用 → 用 `vi.hoisted(() => { const { ref } = require('vue'); return { ref } })`。
