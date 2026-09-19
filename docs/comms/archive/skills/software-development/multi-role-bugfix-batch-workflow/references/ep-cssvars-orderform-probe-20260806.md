# EP 按需引入 css-vars 覆盖 theme.css + 约稿页画风测试数据配方（2026-08-06 约稿页实测修复批）

## 背景

外部前端 AI 评审指控约稿页「下一步按钮是 EP 出厂蓝不是主色青绿」。实测证实为真，根因是 **Element Plus 按需引入的 base.css `:root` 变量以独立 chunk 形式在 theme.css 之后加载，同特异性（`:root`）后定义覆盖 theme.css 的覆写**。亮暗模式均受影响。

## 根因链（排查路径）

1. `web/src/styles/theme.css:92-99` 已定义 `:root { --el-color-primary: var(--color-primary) }` —— 设计正确。
2. theme.css 通过 `App.vue:19` 的 `@import` 引入；main.js 里 import 的是 `element-plus/theme-chalk/dark/css-vars.css` + `palettes.css` + `templates.css`（**不直接 import theme.css**）。
3. 路由懒加载组件（如 OrderForm 的依赖链 useOrderForm.js → `import { ElMessage, ElMessageBox } from 'element-plus'`）把 EP base.css 带成独立 chunk `_plugin-vue_export-helper-*.css`。
4. 该 chunk 的 `:root { --el-color-primary: #409eff; --el-color-primary-rgb: 64,158,255 }` 在**路由进入时才加载**，晚于 main.css（含 theme.css）→ 同特异性后者赢 → `--el-color-primary` = #409eff（EP 蓝）。
5. `html.dark` 下 EP dark css-vars 的 `html.dark` 选择器特异性 (0,1,1) 更高，同样覆盖 theme.css 的 `:root`。

## 验证方法（浏览器 console 取证）

```js
// 找出所有定义 --el-color-primary 的规则及其来源 chunk 顺序
(() => { const out = []; for (const s of document.styleSheets) { try { for (const r of s.cssRules) {
  const sel = r.selectorText || '';
  if (sel.includes(':root') || sel.includes('html')) {
    const v = (r.style && r.style.getPropertyValue('--el-color-primary')) || '';
    if (v) out.push({ sheet: (s.href || 'inline').split('/').pop(), sel: sel.slice(0, 50), val: v.trim() });
  } } } catch(e) {} } return out; })()
// 结果里 _plugin-vue_export-helper-*.css 的 :root val=#409eff 在 main-*.css 之后 → 覆盖成立
```

```js
// 亮暗模式变量实测（注意：亮色下 :root 也覆盖，不是只有暗色）
(() => { document.documentElement.classList.remove('dark'); const v = getComputedStyle(document.documentElement).getPropertyValue('--el-color-primary').trim(); document.documentElement.classList.add('dark'); return v; })()
```

## 修复方向（需一号确认，动 main.js 或 vite.config.js）

- **方案①（推荐）**：`vite.config.js` 的 `ElementPlusResolver({ importStyle: 'css' })` 下显式保证 EP base.css（:root 变量）在 theme.css **之前**加载——vite.config.js:13 注释声明的设计意图「base.css 位于 theme.css 之前」已被懒加载 chunk 打破。
- **方案②**：theme.css 覆写加更高特异性选择器（会动 theme.css，与二号视觉批冲突，不推荐）。
- 纯 CSS 兜底：全局样式里 `:root` 之后再加一条覆盖（同特异性后定义赢），但治标不治本。

## 约稿页画风测试数据配方（seed 后 art_styles 为空）

seed.js 不插入画风；F5 迁移只对「已建但零画风」的旧画师建默认画风，且迁移表已标记应用过 → 新测试库 seed 后 `art_styles` 为空，Alice 走**旧模型档位**。要测画风模式需手动 INSERT：

```sql
-- art_styles 有 cover_image 列，显式传 sort_order + is_active 共 5 个占位符
-- VALUES (?,?,?,?,?) 漏写占位符 → better-sqlite3 RangeError: Too many parameter values
INSERT INTO art_styles (artist_id, name, description, sort_order, is_active) VALUES (?, ?, ?, ?, ?);
INSERT INTO style_sizes (art_style_id, name, base_price, sort_order) VALUES (?, ?, ?, ?);
-- 增项：模板 + 关联（表名 style_addons，无 addon_options 表）
INSERT INTO addon_templates (artist_id, name, control_type, pricing_mode, default_price, options, sort_order) VALUES (?, '复杂背景', 'switch', 'fixed', 30, null, 0);
INSERT INTO style_addons (art_style_id, addon_template_id, is_enabled) VALUES (?, ?, 1);
-- 注意：DELETE 前先删 style_addons（外键引用 style_sizes/art_styles），防重复 seed 报错
```

- 单画风（styles.length===1）：`isMultiStyle=false`，`selectedStyle` 自动选中唯一项 → 约稿页直接进「选尺寸」步骤（步骤指示器 3 步：选尺寸/选增项/写需求/联系方式）。
- 多画风（styles.length>1）：出现「选画风」步骤（4 步）。
- 摘要空态：单画风未选尺寸时摘要显示「画风名 合计 ¥0.00」（不走 v-else 的 summary-empty 分支）——评审说「默认」占位**不实**，但缺引导文案属实。

## Windows 工作流坑（本批实证）

1. **server 日志缓冲**：后台启动命令尾加 `| Select-Object -Last N` 会把输出缓冲到进程结束才显示（server 是长驻进程 → 永远看不到日志）。改用重定向：`node src/index.js *> e2e\server-3999.log`（* 重定向 stderr），健康检查用 `Invoke-WebRequest -TimeoutSec 5` 单发，不要用带 `-TimeoutSec 2` 的循环（每次失败等满 2s，25 次循环必超时）。
2. **node -e 引号地狱**：PowerShell 下 `node -e "..."` 里嵌 SQL 单引号/双引号常被 Invoke-Expression 破坏（ParserError: MissingArgument）。**改 write_file 写 .cjs 脚本再 node 执行**，避免一切转义。
3. **Playwright 脚本放 web/ 下运行**：脚本 import '@playwright/test'，Node 从脚本位置向上找 node_modules；脚本放 e2e/ 会找不到（e2e 无 node_modules），复制到 web/ 目录跑即可。Playwright 包用 `npm install --no-save @playwright/test`（web 目录）+ `npx playwright install chromium`。
