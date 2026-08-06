---
name: huiyue-visual-verification
description: 绘约(artist-commission)视觉修复/打磨的验证工作流——EP 组件视觉变量覆盖法、before/after 截图纪律（git stash 生成真实 before）、PIL diff 量化对比（明度/avgRGB 数字证据）。触发：五号/二号做视觉类修复（插画偏亮、颜色协调、空态视觉）需要前后对比证据时。
---

# 绘约视觉验证配方（v0.39 打磨批实证）

视觉类修复的验证核心：**用数字证据替代「看起来协调了」**。流程：隔离实例+登录 → 截 before → 修复 → build → 截 after → 量化对比 → 清理。

## 1. EP 组件视觉修复：CSS 变量覆盖法（el-empty 实证）

EP 组件（el-empty 等）内部 SVG 用组件级变量（`--el-empty-fill-color-0~9`），**在 :root 上查 getComputedStyle 是 unset**（组件内定义），变量未定义时渲染 fallback 黑色/默认色，视觉上「偏亮」或「黑成一团」。

修复：在业务组件 scoped style 里覆盖变量即可全局换色且**双主题自动适配**：
```css
.admin-page :deep(.el-empty) {
  --el-empty-fill-color-0: var(--paper2);
  --el-empty-fill-color-3: var(--ink4);  /* 映射到设计 token 的墨色层次 */
  --el-empty-fill-color-6: var(--ink2);
  /* 0~9 全映射，双主题各取各值 */
}
```
验证变量是否生效：`getComputedStyle(pathEl).fill` 应返回 token 解析值（如 `rgb(179,174,159)` = #B3AE9F）而非 EP 默认近白（#F7F8FC）或 fallback 黑色。

**影响面检查**：同页其他 el-empty（如留言管理空态）在同一 `:deep` 规则下自动一致；其他页面的同类组件不在作用域内，需报告说明（建议下批抽公共覆写）。

## 2. before/after 截图纪律（关键坑）

- **先截 before 再改代码**；同名文件重跑脚本会覆盖 before——输出名带 `-before`/`-after` 后缀，或分目录
- **真实 before 生成法**（改完代码才发现没截 before 时）：`git stash push -- <改动文件>` → `npm run build` → 截图 → `git stash pop` → `npm run build` 恢复。单文件 stash 安全，注意顺序别乱
- **整页截图定位不准**：插画/目标区域不在页面中心，中心区域像素统计全是背景色。用 PIL `ImageChops.difference(before, after).getbbox()` 自动定位差异区域（两张图唯一视觉差异就是修复点），再对 bbox 区域统计颜色
- **量化对比输出**：`before avgRGB (246,246,248) meanLum 246 → after (204,202,194) meanLum 202`——明度下降即「偏亮」修复实锤

## 3. Playwright 截图脚本要点

- 脚本放 **`web/e2e/`** 下（ESM import 按脚本位置找 node_modules，放根 e2e/ 找不到 web/node_modules 的 playwright；NODE_PATH 对 ESM 无效）
- 修改脚本用 **write_file 重写全文件**——PowerShell `Set-Content` 会破坏 UTF-8 中文（Get-Content 按系统编码读入再写回，中文字符串变乱码 SyntaxError）
- 登录选择器：el-input 无 aria-label，用 `input[placeholder="输入你的QQ号"]`；**管理员登录后跳 `/admin` 非 `/dashboard`**，waitForURL 用 `u => u.pathname !== '/login'`
- 隔离库 seed 用 `npx tsx src/db/seed.js`（`npm run db:seed` 的 node 跑会 ERR_MODULE_NOT_FOUND，seed 动态 import .ts）
- 主题切换：`localStorage.setItem('huiyue-artist-theme','ink')` + reload（AdminLayout enterArtistScope 从 localStorage 恢复）

## 4. 清理纪律

验证完：停隔离实例（process kill）→ 删测试库（`server/data/test-*.db*`）→ 删临时截图脚本 → `npm uninstall` 临时装的 playwright（package.json 净零）→ `git status --short` 确认仅交付文件。演示数据/临时产物绝不进交付。

## 5. i18n 键验证（改动 locales 时）

新键写完后跑一次键完整性检查：import 双语言 locale 文件 → 断言新键存在非空 + 引用键双语言齐全 + 无重复键名 + 中文文件含中文/英文文件不含中文。临时脚本放系统 TEMP，跑完即删。

## 5.5 临时验证脚本断言纪律（ad-hoc 静态断言，2026-08-06 视觉通病批1）

写完代码用临时 Node 脚本对改动文件做静态断言（不进仓库、放系统 TEMP、脚本名带 `hermes-verify-` 前缀、跑完即删、`git status` 确认无临时产物）时：

- **Windows 文件 CRLF 行尾**：`fs.readFileSync` 读入是 `\r\n`，断言字符串里的 `\n` 匹配不上 → 误报 FAIL（实测 `includes('.el-button...{\n  transform')` 返回 false）。先 `const norm = s => s.replace(/\r\n/g, '\n')`，所有文件读取都过 norm 再断言。
- **断言语义先对齐交付结论**：写断言前先读自己的交付报告/研判结论，别写与结论矛盾的断言（实测：交付结论"bounce 变量保留供庆祝场景"，断言却写"整个文件无 ease-bounce"→ 误报）。断言验证"结论成立"，不是"绝对状态"。
- **hover 位移无法用 JS 触发真实 `:hover`**（伪类不吃合成事件，browser 工具也无 hover 原语）。改用 CSS 层叠论证替代：① 规则存在于 stylesheet（遍历 cssRules 查到 selector）；② 特异性必胜（双类 0,2,0 > EP 单类 0,1,0）；③ 元素 `matches('.双类选择器')` 为 true；④ transition 等非 hover 属性 computed 实测已生效。组合即确定性结论，无需真实指针。
- 断言失败先怀疑脚本本身（CRLF/语义/转义），再怀疑代码——用 `node -e` 单点探针确认是匹配问题还是代码问题。

## 6. EP base.css 按需注入顺序覆盖主题 :root 覆写（EP 蓝泄漏实证，2026-08-06）

**现象**：theme.css 在 `:root` 覆写 `--el-color-primary: var(--color-primary)`，但约稿页「下一步」按钮仍是 EP 出厂蓝 `#409eff`。

**诊断（浏览器 console，不用猜）**：
- `getComputedStyle(document.documentElement).getPropertyValue('--el-color-primary')` → `#409eff`（应是主题色）
- 遍历 styleSheets 找所有定义 `--el-color-primary` 的 `:root` 规则：应有两条，EP 在后（胜出）
- **EP base.css 的载体 chunk**：`document.querySelector('link[href*="_plugin-vue_export-helper"]')` 非空 = EP base css-vars 以独立懒加载 chunk 注入；`[...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.href.split('/').pop())` 列出全部 CSS 加载顺序，确认 `_plugin-vue_export-helper-*.css` 在 `main-*.css`（含 theme.css）**之后**——同特异性 `:root` 后者赢
- **全站影响面检查**：EP 蓝泄漏是路由懒加载 chunk 全局注入，不止单页——切到主页 `getComputedStyle(document.documentElement).getPropertyValue('--el-color-primary')` 仍为 `#409eff` 即证实全站按钮都蓝，报告时写「全站性问题」而非单页
- 按钮实际渲染色：`getComputedStyle(btn).backgroundColor` → `rgb(64,158,255)`

**修复（特异性提升，不改加载顺序）**：vite resolver 机制决定 EP base 天然晚于 SFC 样式注入，调序脆弱。用双伪类提升特异性，对加载顺序免疫：
```css
:root:root {  /* 双伪类 0,2,0 > EP 单 :root 0,1,0 */
  --el-color-primary: var(--color-primary);
  --el-color-primary-rgb: var(--color-primary-rgb); /* 静态 triplet，必须逐色维护，不能 color-mix */
  --el-color-primary-light-3: color-mix(in srgb, var(--color-primary) 70%, var(--bg-page));
  /* ... light-5/7/8/9/dark-2 同理 ... */
}
```
- **`--el-color-primary-rgb` 是静态 triplet**（如 `77, 232, 217`），EP 用于 rgba 场景，必须随每色维护（5 色×亮暗 10 组），不能 color-mix
- `.el-button` 的 transition 同样被 EP button.css 的 `.el-button{transition:0.1s}` 覆盖：改 `.el-button.el-button` 双类（0,2,0）压过，否则 computed 显示 0.1s 而非设置的 0.15s
- 功能色（success/warning/danger）若设计上保留 EP 出厂色，`:root:root` 块里继续 `var(--color-success)` 等，不受影响

**验证顺序**：改文件前先 console 注入测试（`document.head.appendChild(style)` 写 `:root:root{...}` 看变量是否变主题色）→ 方案可行再改文件 → 改后遍历 5 色×亮暗 10 组断言 `--el-color-primary` + `--el-color-primary-rgb` 与 theme.css 定义一致。

## 7. 四模板主页只读巡检（classic/gallery/folio/atelier，2026-08-06 模板体检批）

四号派工「客户端模板体检批」是只读批（零代码改动），要起 dev server 逐模板亮/暗 + 有/空数据实测。完整配方见 `references/template-check-readonly-inspection.md`，核心要点：

**环境（多角色并行 worktree 冲突时）**
- 3000 被他人 CLOSE_WAIT 套接字占用时：netstat 只见 CLOSE_WAIT 无 LISTENING，Get-NetTCPConnection -State Listen 查不到，但 tsx bind 仍报 EADDRINUSE。**不杀他人进程**，server 起 3001（`$env:PORT='3001'`），vite 用临时配置
- **vite proxy 硬编码 3000**：复制仓库 vite.config.js 改 proxy target→3001 存 `web/vite.tpl-check.config.mjs`（不入库，测完即删），`npx vite --config vite.tpl-check.config.mjs` 起 5175
- seed 用 `npx tsx src/db/seed.js`（`npm run db:seed` 的 node 跑挂，同 §3）

**demo 数据（seed 无作品/头像/公告/画风）**
- 临时脚本放 `server/scripts/tpl-demo-*.mjs`（测完即删），import 相对路径 `'../src/db/connection.js'`
- 测试图：System.Drawing 纯色 800x600 PNG 写入 `uploads/images/{artistId}/`
- **画风只返回 1 个**是 `multi_style_enabled=0` 门控（设计行为非 bug）；测多画风 UI 需 `UPDATE artists SET multi_style_enabled=1`
- 坑：PowerShell `npx tsx -e "..."` 内嵌 SQL 单引号炸（Unterminated string literal）——**写 .mjs 文件再跑，别用 -e**

**视觉量化检查（无 vision 模型时）**
- **先确认亮/暗模式**：browser 默认可能暗色（html.dark=true），此时 CTA 渲染色是暗色变体（#4de8d9 而非 #34dbcb），不查会误判 EP 蓝泄漏
- browser_console 表达式**分小块**（长表达式报 SyntaxError: Unexpected end of input）
- 指标：`html.dark`/data-palette/data-accent、`.tpl-status-dot` 背景（open=success绿/full=warning橙）、CTA getComputedStyle 背景（对比 palettes.css 亮暗两套）、破图计数 `[...img].filter(i=>i.complete&&i.naturalWidth===0).length`、EP 泄漏 `.el-button/.el-tag` 计数+色、CTA 重复数（含"约稿"文案 button）

**本批已实锤缺陷（入清单）**：
- **三模板吸底 CTA 永不触发（gallery/folio/atelier，P1）**：heroSentinel computed 拿不到 heroRef（null）→ useStickyCta 的 watch 拿到 undefined 直接 return，IntersectionObserver 从未建立 → TplStickyCta visible 恒 false。排查法（Vue 组件状态读取）见 references/template-check-readonly-inspection.md
- **TplTierGrid「选择此档位」未随画师 status 禁用（P1）**：只判断 showcase，没查 artist.status；TplStyleGrid 同缺
- folio 导航锚点缺失（空数据时 #gallery 不存在，点击无反应）
- seed 幂等性差（price_tiers 重复档位，bob 主页可见 2 次"全身插画 ¥350"）
- TplHero 按钮 0.25s 动画时长违规（四模板共享，批 1 漏网项）
- atelier 硬编码 Noto Serif SC 而非 var(--font-display)

**已排除（实测）**：EP 出厂色无泄漏（亮暗色值全走设计系统）、空态 el-avatar 首字兜底无破图、"全封面"画廊有兜底不空、classic 同页 2 CTA 为设计意图。

**只读批铁律**：临时文件不入库、交付前 `git status` 干净、报告区分「据实测」与「代码静态观察」。交付后用户对缺陷清单逐项拍板时，落档流程见 references/template-check-readonly-inspection.md「拍板后落档流程」（拍板原文逐字记录、全节同步更新、区分确认维持 vs 新增规则、新规则标注补 REQ）。

## 8. 摘要卡空态修复：v-if 渲染分支 + 语义对齐（2026-08-06 约稿页实测批 W3）

**现象**：单画风约稿页未选尺寸时，摘要卡显示「日系 合计 ¥0.00」——误导（好像选了但价格是 0），而非引导文案。

**根因链（读代码 + 实测）**：`isStyleMode = styles.length > 0`（useOrderForm.js:45），**单画风时 `selectedStyleId` 自动选中唯一画风**（L48-50）→ 摘要卡 `template v-if="isStyleMode"` 分支必然进入（OrderForm.vue L442-461），`selectedStyle?.name` + `displayPrice.toFixed(2)` 无条件渲染 → 未选尺寸时 `styleDisplayPrice = selectedSize?.base_price ?? 0`（useOrderForm.js:356）= 0 → 显示 ¥0.00。`v-else` 的 `.summary-empty`（L482）永远走不到。

**修复**：摘要卡画风模式分支价格区加 `v-if="selectedSize"` + `v-else class="summary-empty"` 引导；**但 `.summary-tier`（画风名）保留无条件渲染**——单画风已自动选中，顶部显示画风名是合理信息，测试也断言 `.summary-tier` 恒存在（OrderForm.summary.test.js:196）。新增 i18n key `summaryNoSize`（zh-CN/en.js 双语言）。
```html
<div v-if="selectedSize" class="summary-total">
  <span>{{ $t('orderForm.receiptTotal') }}</span>
  <span class="summary-total-amt">¥{{ displayPrice.toFixed(2) }}</span>
</div>
<div v-else class="summary-empty">{{ $t('orderForm.summaryNoSize') }}</div>
```

**教训**：
- **`v-if` 空态分支要思考「哪部分是合理常显信息、哪部分是真空态」**——画风名是常显，价格区才是空态；一刀切全 `v-if` 会破坏既有测试（`.summary-tier` 断言挂）
- 评审指控「显示占位文本'默认'」不实（无此文案），但「空态缺引导」属实——**报告要分「指控不实」与「背后真问题」两层写**
- 空态文案语义要精确：旧模型用 `summaryNoTier`（选档位），画风模式新增 `summaryNoSize`（选尺寸），不复用语义不同的 key

## 9. 隔离实例起测试 server 的坑（2026-08-06 约稿页实测批）

- **`Select-Object -Last N` 管道缓冲**：`node ... 2>&1 | Select-Object -Last 30` 会让 server 日志全部缓冲到进程结束才输出，且进程退出时管道把子进程也带走——**起长驻 server 直接重定向到日志文件**（`*> "e2e\server-3999.log"`），health check 用单独 terminal 轮询
- health 轮询循环**单次 Invoke-WebRequest 每次等满 -TimeoutSec**（连 fail 也会等满 2s×25 次 = 超时）——先 `Start-Sleep 3` 再单次请求更可靠，或直接 `Get-NetTCPConnection -LocalPort` 查监听
- server 起在 127.0.0.1:3999 监听即算 OK（日志显示 `Server listening at http://127.0.0.1:3999`），不必等 SPA fallback 验证
- 临时 seed 脚本（造画风/尺寸/增项）写 `.cjs` 放 server/ 下跑完即删；**PowerShell `node -e` 内嵌 SQL 单引号必炸**（同 §7），一律写文件再跑
- better-sqlite3 临时脚本 require 绝对路径（`require('D:/.../server/node_modules/better-sqlite3')`），别依赖 cwd
