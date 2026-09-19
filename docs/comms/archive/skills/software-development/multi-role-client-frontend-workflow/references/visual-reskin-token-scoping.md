# 大型视觉换肤批次：token 隔离 + 中断纪律 + 改写前验证

> 来源：v0.38 画师后台视觉重设计第一批（REQ-026，artist-commission，2026-08-05，二号）。
> 该批跨 12+ 文件，会话在工具迭代上限处被截断——此文件记录截断前已验证有效的做法与截断暴露的教训。

## 1. 客户端零影响的 token 作用域技术（已验证有效）

背景：theme.css 的 `:root` 变量被客户端 170+ 处引用，不能改值；后台要上全新 token 族。

方案（不碰 :root）：
- 新 CSS 文件里所有变量声明挂在 **条件属性选择器** `html[data-artist-theme="paper|ink"]` 上，而非 `:root`。
- 由后台骨架布局组件（ArtistLayout.vue）`onMounted → enterArtistScope()` 挂属性、`onUnmounted → leaveArtistScope()` 摘属性（逻辑放 theme store）。客户端路由下属性不存在 → 变量不存在 → 零影响。
- Teleport 到 body 的 EP 浮层仍在 html 子树内，变量经 DOM 继承自然生效，无需处理。
- **兼容映射层**：后台作用域内把旧语义变量（`--bg-page/--text-*` 等）映射到新 token，让批次内尚未换肤的页面自动跟随主题底色，避免中间态割裂（派工要求"不允许两套主题 token 并存"时的过渡手段）。
- Element Plus 换肤：`--el-*` 覆写同样写在条件属性块内。

## 2. 中断纪律（本批被截断暴露的最大教训）

截断时 worktree 状态：12 个文件已改但**未 commit**，且代码里已引用**尚未创建**的 i18n 键
（`menu.logoSeal`、`pref.artistToastInk` 等）——此时任何测试/构建都是坏的，一号无法验证。

规则：
1. **i18n 键先于或同步于引用代码落盘**。新增键是廉价改动，应在动页面模板前先批量写入 locales，
   绝不留"代码引用了不存在的键"的中间态。
2. **大批次按语义单元早 commit、多 commit**（派工本就允许多个语义 commit）。
   骨架+token 一 commit、每个页面换肤一 commit，截断时至少前几个单元是已验证的完整交付。
3. 被截断后的恢复汇报必须给出：已写文件清单、未补的 i18n 键清单、未做验证清单、
   测试对 class 名的依赖点——让续跑会话能直接接力。
4. **commit 粒度宁碎勿整，别等"这页写完"**：v0.38 接力会话二次验证了此教训——
   续跑轮严格执行了批量读文件、精确 patch、先基线验证，仍只完成 4 页中的 1 页
   （QueueBoard）就撞迭代上限，且**依然 0 commit**。大 .vue（1500+ 行）单页换肤
   本身就要 10-15 个工具调用。规则：locales 一批 commit、骨架/token 一批、
   每页换肤（哪怕只完成样式区+空态）立即 commit；截断时每多一个 commit
   下一轮就少一份"未验证遗留"。

## 2b. 接力接收验证（续跑会话第一步，v0.38 实测）

上一轮被截断留下的未提交代码里，可能引用着**尚未创建**的 i18n 键——
vitest/lint 全绿也发现不了（i18n 键缺失只在运行时渲染键名，测试不报）。
本批实测：`menu.logoSeal`（ArtistLayout 引用）和 `pref.artistToInk/artistToPaper/
artistToastInk/artistToastPaper`（ThemeToggle 引用）四键全部缺失。

规则：接力第一步（merge master + 基线测试之后、写任何新代码之前）：
1. 对上一轮新增/修改文件中所有 `$t('x.y')`/`t('x.y')` 引用，逐个 grep locales
   确认键存在（search_files pattern 用键名末段批量查即可）。
2. 缺失键立即补齐（这属于 locales 授权范围且是廉价修复），再开始续写页面。
3. **验证命令以 package.json 实际 scripts 为准，不以派工文件为准**：
   派工写"tsc 0 错"，实测 web 是纯 JS 项目（scripts 里只有 dev/build/lint/test:web），
   tsc 在 server 侧（`npm run typecheck`）。先读两个 package.json 的 scripts 段
   确定真实命令，避免对着不存在的命令空转。

## 3. 改写/删除前必须 grep 验证"安全"声明

派工文件声称"ThemeToggle/ThemePicker/theme store 目前仅后台使用，可安全改"——实测
`ThemePicker.vue` 被客户端 `LandingPage.vue`、`ClientFloatingActions.vue`、`Login.vue` 引用。
若按派工直改 ThemePicker，客户端直接破功（验收 10 客户端零影响红线）。

规则：任何"该文件只有 X 使用 / 可安全重写"的声明（无论来自派工还是记忆），
动手前 `search_files` 全仓 grep 组件名/导入路径确认引用面；
客户端引用存在 → 改用新组件并存方案（本例：后台改用独立 ThemeToggle，ThemePicker 原样不动）。

## 4. 换肤不换结构：测试耦合的 class 名

vitest 用真实 class 选择器断言（如 `.mo-field`、`.tier-card`、`.next-due-banner`、
`.style-addon-item`、`.form-item-label`）。换肤只改样式块与 token 引用，
**不改模板 class 名**；确需改名先读 `views/artist/__tests__/*.test.js` 的断言面。

## 5. 预算与并行技巧

- 14 项计划的大视觉批极易撞工具迭代上限。缓解：批量读文件（一次多个 read_file/search）、
  样式改动用精确 patch 而非整文件重写、**npm install 在后台先跑**（编辑期间并行安装）。
- 大文件（60-80KB 的 .vue）先 `Select-String` 定位 `<template>/<script>/<style>` 边界行号，
  只读需要的段。
- 死键清理（如 sendCode/codeSent）先 grep 确认零引用再删——本批确认过仅 locales 两处定义、无引用。

## 6. 主题覆写的双类名别名（scoped 类 + 全局别名，v0.38 QueueBoard 实测）

深色主题下要让实心色块（色带/按钮）提亮，token 文件里的覆写选择器是
`html[data-theme="ink"] .band-doing { ... }` 这类**全局类名**——但页面 scoped
样式里元素挂的是 `cal-band--formal` 这种 scoped 类。两者对不上，覆写不生效。

解法（本批 QueueBoard bandClass 采用）：**一个元素同时输出两个类**——
- scoped 语义类（`cal-band--formal`）：负责页面内基础样式，scoped CSS 命中；
- 全局别名（`band-doing`/`band-over`/`band-done`）：专门给 token 文件的
  `html[data-theme=ink] .band-*` 覆写命中。

```js
// bandClass 返回数组：[scoped类, 全局别名]
function bandClass(order) {
  if (done) return ['cal-band--done', 'band-done']
  if (overdue) return ['cal-band--overdue', 'band-over']
  return [base, 'band-doing']
}
```

模板里 `:class="bandClass(order)"` 直接吃数组。要点：**改 bandClass 前先读
token 文件里覆写用的确切类名**（本批 artist-tokens.css 已预先写了
`band-doing/band-over/band-done`，必须对齐，不能自己另起类名）。
同理，换肤新增的全局覆写类要在 token 文件与页面之间对一遍命名。

## 7. 第二批（剩余页面）踩坑补记（v0.38 第二批，2026-08-05）

### 7a. token 作用域不止 ArtistLayout——骨架外的后台页也要挂
ArtistLayout 只包住登录后的画师后台页。**Login / 管理后台（AdminLayout 及其子页）**
在 ArtistLayout 之外，同样要挂作用域否则拿不到 token：
```js
import { onMounted, onUnmounted } from 'vue'
import { useThemeStore } from '../../stores/theme.js'
const themeStore = useThemeStore()
// 复用第一批 enter/leave 机制（机制本身不动）
onMounted(() => themeStore.enterArtistScope())
onUnmounted(() => themeStore.leaveArtistScope())
```
客户端零影响断言不变：客户端路由下 `html[data-artist-theme]` 必须为 null。
注意这是"在授权外组件里加生命周期钩子"的边界动作——AdminLayout 等文件可能不在
派工白名单，属于完成任务的必要依赖，**动手照做，但必须在交付报告里逐文件注明
超授权原因**，让一号审核时有据可查（本批 AdminLayout.vue 即此例）。

### 7b. 残留扫描的两个误报模式
全量扫 `var\(--text-|--bg-|--border-|--el-|--color-` 时会遇到：
1. **注释里的变量名**（如修复说明注释"原 var(--color-primary)…"）——用
   `Where-Object { $_.Line -notmatch '^\s*/\*|^\s*\*' }` 过滤后再人工确认。
2. **带 fallback 的合法回退写法** `var(--ink, var(--text-primary))`（CardHead/InkEmpty
   这类组件为脱离后台作用域也能渲染而写的双保险）——这是对的，不是残留，
   扫描模式用 `, var\(--` 排除或逐个确认。

### 7c. 旧变量无直接映射时的语义映射决策（别机械换色）
| 旧变量 | 映射到 | 依据 |
|--------|--------|------|
| `--color-gold`（金） | `--zhe` 赭石 | 赭石=暖中性/客户/优先级，金色语义位 |
| `--el-color-warning`（橙） | `--th` 藤黄 | 藤黄=待确认/缓冲提醒 |
| `--el-color-success` | `--sl` 石绿 | 石绿=完成/成功 |
| `--el-color-danger` | `--zs` 朱砂 | 朱砂=危险/逾期 |
| `--color-primary` 数字/金额处 | `--ink` + `var(--f-d)` | **统计数字墨色不上色铁律** |
换前先问"这个颜色在说什么状态"，按 7 色语义一对一表选 token，
不要 `--el-color-X` → 同名字 token 的机械替换（会把"待确认"错配成"主色"）。
**例外：组件自身的 HSL 分段色系不换**（如 PaymentBar 的 `hsl(var(--seg-hue)…)`
分段辨识色 + `html.dark` 自适配块）——那是组件私有色彩系统，只换它的
边框/文字层次旧变量（`--border-color`→`--line`、`--text-*`→`--ink*`）。

### 7d. 统计数字上色是跨页面通病，grep 一次找齐
第一批漏了 dashboard 子组件（GreetingHero/QuickActions/TodoList/SlotOverview/
ActivityFeed/StatusSwitch 六件套旧变量全在）、RevenueChart 主数值、
AdminDashboard `.stat-num`、StageListView `.pay-badge`、ArtStyleManager 价格等。
第二批开工第一件事：**对 views/artist + views/admin + components/artist +
components/admin 全目录跑残留扫描**，一次列全再逐文件修，别一页页撞。
数字类选择器特征：`.xxx-num/.xxx-total/.xxx-price/.pay-badge` +
`color: var(--color-primary|--el-color-primary)` → 一律改 `var(--ink)`，
金额/比例加 `font-variant-numeric: tabular-nums`，大字数值加 `font-family: var(--f-d)`。

### 7e. 撞迭代上限前的"commit 预算"操作法（本批再次 0 commit 撞线）
第二批又在"全部代码写完 + 验证全绿"后撞上限，依然 0 commit——比第一批更亏
（代码全写完却没锁定）。规则 2/4 的"早 commit"在大页面换肤时仍会输：
单页换肤 10-15 调用，7 页就是 70-100 调用，加上验证与截图，总量必超。
**预算操作法**：把"写代码"与"验证+截图"视为两段预算——
1. 换肤阶段每完成 2-3 页立即 commit（`style(web): v038第二批换肤——X/Y/Z 页`），
   commit message 里写清"进行中"也可以，宁碎勿整；
2. 验证/截图是消耗大户（build + 起服务 + 20 张截图 ≈ 30+ 调用），
   **必须在所有页面 commit 之后才开始**，绝不把验证排在 commit 之前；
3. 预估调用数：剩余页数 × 12 + 40（验证截图）> 剩余预算时，先砍截图张数
   （≥12 是底线，客户端抽查 3 张不可省）或先 commit 再报告，不做完美主义全量。

### 7g. 接收 0-commit 中断态的恢复操作法（v0.38 第六轮实测）
7e 的预算法仍可能失守（第五轮：代码全写完 + 验证全绿 + 20 张截图生成，依然 0 commit
撞线）。恢复轮的正确顺序（实测一次成功）：
1. **第一动作 = `git status --short` 核对工作区**，确认改动文件清单与上轮报告一致；
2. **立即分语义 commit 锁定，不先重新验证**——上轮验证数据（vitest/eslint/build 数字、
   截图路径）直接引用写进 commit message 与交付报告（注明实跑时间即可）；
   一号合入前会独立复验，重复跑全套是浪费恢复轮预算；
3. 分段建议（实测 5 段，28 文件）：A 记账修复+组件补漏（fix:）/ B 页面换肤（style:）/
   C 管理后台（style:）/ D 漏网组件（style:）/ E 报告+截图（docs:）。
   每段 add 后先 `git diff --cached --name-only` 核对暂存区再 commit；
4. 锁定后才做收尾：删临时脚本/测试库/截图缓存外的痕迹、杀测试服务器、写交付报告
   （含未跟踪截图目录）并 commit。交付报告里逐项披露测试数据清理。

### 7f. 截图环境速查（环境基础在 huiyue-browser-regression-testing skill）
WEB_DIST 模式隔离实例（PORT=3100 + test-xxx.db + WEB_DIST=web/dist），
TOTP 双账号真实登录（无后门）：
- **双账号**：同一密钥注入两账号后分别 verify——alice `10001`（isAdmin=false）/
  admin `10003`（isAdmin=true）。管理员 context 的 initScript 须额外
  `localStorage.setItem('artist_is_admin','1')`，否则 requiresAdmin 守卫踢回 dashboard。
- **登录页截图**：守卫看 `artist_logged_in` 标记——截前
  `page.evaluate(() => localStorage.removeItem('artist_logged_in'))`，截完恢复 `'1'`。
- **主题作用域三连断言**（验收 2/10 的脚本证据，别只靠肉眼）：宣纸页
  `getAttribute('data-artist-theme') === 'paper'` → 点 `.artist-theme-btn` 切墨黑 →
  `=== 'ink'` → `page.reload()` 后仍 `=== 'ink'`（持久化）→ 客户端路由必须 `=== null`。
- 批次顺序（单脚本 20 张约 2-3 分钟）：宣纸组 → 登录页 → 切墨黑 → 墨黑组 →
  reload 断言 → 管理后台（换 admin context）→ 客户端（全新无 cookie context）。
