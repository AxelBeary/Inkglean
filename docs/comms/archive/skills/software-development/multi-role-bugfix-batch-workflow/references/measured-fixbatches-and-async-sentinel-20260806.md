# 实测取证派工 + 异步组件哨兵陷阱 — 2026-08-06

两批实证：①约稿页实测修复批（W1-W4，评审指控多不实，纪律=先实测再修）；②吸底 CTA 哨兵修复批（四号定位 + 一号复核根因，但执行时发现根因比派工预判更深）。

## 批①：约稿页实测修复批（fix/orderform-selection）

### 纪律执行样板：评审指控"不实"判定流程
- **先实测再动手，不实测不改代码**。外部评审说"4 个选项选没选上完全看不出来"——实测（DOM computed style）发现选中 = 主色描边 + 浅底 + ✓ 印章（16px 主色），差异清晰 → 判定**不实，不改**。
- **部分属实**：评审说"摘要区显示'默认'"——实际无此文案（不实部分），但单画风未选尺寸时摘要显示「日系 合计 ¥0.00」缺引导（属实部分）。修法：摘要卡加 `v-if="selectedSize"` 空态判断 → 新 i18n key 引导语。
- **改测试期望 vs 改实现**：加 `v-if` 后既有测试断言 `.summary-tier` 无条件存在会挂——先判断"画风名始终显示是否合理"，合理则保留 `.summary-tier` 无条件渲染、只给价格区加空态，测试不动。**改实现适配既有测试，而非改测试迁就实现**（除非行为确实变了）。

### W4 动画收敛清单（同页同类过渡一次收敛）
tier-pick / style-pick `translateY(-3px)→(-2px)`、时长 `0.3s→0.15s`、`--ease-bounce→ease`；size-pick / step-dot / inspire-tag 同步收敛；**✓ 印章入场（tier-stamp-in）属庆祝时刻保留 bounce**。

### W2 EP 蓝根因（全站性，非约稿页独有）
EP base.css 的 `:root{--el-color-primary:#409eff}` 以独立 chunk（`_plugin-vue_export-helper-*.css`）晚于 theme.css 加载，同特异性 `:root` 后者赢 → 覆盖 theme.css 覆写。亮暗模式均受影响、所有主色按钮都是蓝的。根治 = `:root:root` 提高特异性（本批因 theme.css 被并行批占用，方案上报等裁决，最终由二号批 1 实施）。

### 隔离测试环境速查（无生产容器依赖）
`$env:DB_PATH=e2e/test-xxx.db; npx tsx src/db/seed.js` 造数据 → `npm run build` → `PORT=3999 + WEB_DIST=web/dist + ADMIN_QQ=10003 + node src/index.js` 起隔离 server（SPA 由 server 直出，不用 vite dev，因为 vite proxy 硬编码 3000 生产容器）→ Playwright headless 实测。临时探针脚本放 `web/` 下才能 import 到 `@playwright/test`（Node ESM 从脚本位置向上找 node_modules）。

## 批②：吸底 CTA 哨兵修复批（fix/sticky-cta）

### 根因比派工预判更深
派工说：异步组件 `defineExpose({sentinelEl})` 的 ref 不触发父组件 computed 重算 → 改传 `heroRef` 本身 + setup 里 `el?.sentinelEl?.value || el`。

**实测发现派工方案的 `?.value` 是错的**：
- Vue expose proxy **自动 unwrap ref**——`el.sentinelEl` 直接就是 DOM 元素，`.value` 是 undefined。
- 按派工写 `el?.sentinelEl?.value || el` → `.value` 为 undefined → fallback 到 `el`（组件实例）→ `IntersectionObserver.observe(组件实例)` 抛 `parameter 1 is not of type 'Element'`。
- **正确写法**：`const sentinel = el?.sentinelEl || el` + `if (!sentinel || !(sentinel instanceof Element)) return` 守卫。

### 诊断插桩流程（这次踩出的高效路径）
1. 源码加 `console.log` 打印 `el`、`el.sentinelEl` 的 type / instanceof 判断 → rebuild → 重启隔离 server。
2. **必须用全新 Playwright 实例抓 console**——Hermes 浏览器 console 有历史缓冲，会混入旧 chunk 日志（旧文件名）误导判断，`?cachebust=N` 和 `caches.delete` 都清不干净；Playwright 新实例的 `page.on('console')` 是干净的。
3. console 显示 `el.sentinelEl = {title:"",lang:"",...} | isElement = true` → 实锤 unwrap 行为。
4. 移除插桩 → 重验 → 功能通过（滚动后出现/回顶消失/按钮进下单页）。

### 测试断言过严的教训
4 模板验证脚本把 `stickyInDom`（初始元素存在性）纳入 PASS 判定——但吸底条是 `v-if="visible"` 控制的，初始 `visible=false` 时元素根本不在 DOM，`stickyInDom=false` 是**正确行为**不是失败。断言要看「滚动后出现」这个行为指标，不是 DOM 存在性。同理 folio 点击后 URL 停留在 `/artist/bob` 是点击时序（滚动等待不足）问题，不是产品缺陷——**脚本误报 vs 真 bug 要区分**，别把验证脚本瑕疵当成功能缺陷上报。

## 通用陷阱（两批共现）
- patch 工具 lint hook 报 `/d/` 路径 `MODULE_NOT_FOUND` 是 Windows 假错，编辑实际成功——以真实 `node --check`/测试为准（老坑复现）。
- 测试库 seed 后旧模型画师会被 F5 迁移自动建「默认」画风（styles 表有数据即走画风模式），实测前先查 `art_styles` 判断走哪个模式。
- 造测试数据直接 SQL 操作隔离库（better-sqlite3），PowerShell 内联 `node -e` 转义易碎，写临时 `.cjs` 脚本更可靠，用完即删。
