# Element Plus 按需引入下 CSS 变量覆写失效的根治（2026-08-06 视觉通病批1 实锤）

## 症状

- 页面按钮/主色元素显示 EP 出厂蓝 `#409eff`，而不是主题主色（如 `#4de8d9`）。
- `getComputedStyle(document.documentElement).getPropertyValue('--el-color-primary')` 返回 `#409eff`，而 theme.css 明明写了覆写。

## 根因（两层，都实测确认）

1. **EP base.css 加载时序在 theme.css 之后**：`unplugin-vue-components` + `ElementPlusResolver({ importStyle: 'css' })` 按需注入时，EP `theme-chalk/base.css`（含 `:root { --el-color-primary:#409eff; ... }`）自动注入，DOM 里挂在 theme.css 之后。CSS 同特异性（都是单 `:root`）后定义者胜 → EP 出厂值覆盖 theme.css 覆写。
   - 泄漏范围不止主色：`--el-color-primary-rgb`、`light-3/5/7/8/9`、`dark-2` 整组变量全被覆盖。
   - 浏览器验证法：遍历 `document.styleSheets`，找所有 `:root` 规则里定义 `--el-color-primary` 的，会看到 `var(--color-primary)` 和 `#409eff` 两条并存。
2. **EP button.css 自带 `.el-button { transition: 0.1s }`**：同样加载更晚，覆盖 theme.css 的 `.el-button` transition（即使 theme.css 写的是 `0.15s`，computed 仍显示 `0.1s`）。

## 修复（优先级提升，而非调加载顺序）

调加载顺序脆弱（vite resolver 机制决定 EP base 天然晚于 SFC 样式注入），改用**特异性提升**，对加载顺序不敏感：

```css
/* theme.css */
/* 双伪类 :root:root 特异性 0,2,0 压过 EP base 单 :root 的 0,1,0 */
:root:root {
  --el-color-primary: var(--color-primary);
  --el-color-primary-rgb: var(--color-primary-rgb); /* 需自行定义 */
  --el-color-primary-light-3: color-mix(in srgb, var(--color-primary) 70%, var(--bg-page));
  /* ...其余 light/dark 变体同理 */
}

/* 全局按钮三态：双类 .el-button.el-button 压过 EP button.css 的单类 */
.el-button.el-button {
  transition: transform 0.15s ease, box-shadow 0.15s ease,
              background-color 0.15s, border-color 0.15s, color 0.15s;
}
.el-button.el-button:hover:not(:disabled):not(.is-loading) {
  transform: translateY(-2px);
}
```

- `--el-color-primary-rgb` 是静态 triplet（`52, 219, 203` 形式），不能 color-mix 产出，必须在每个主色变量块里同步维护（5 色 × 亮暗 = 10 组）。
- 浏览器预验证法（改文件前先在 console 注入验证）：`document.head.appendChild(<style>:root:root{--el-color-primary:var(--color-primary)}</style>)` 后读变量，确认变为主题色。

## 验证要点

- 修复后按钮 enabled 背景应等于主题色 rgb（如 `rgb(77, 232, 217)` = `#4de8d9`），不是 `rgb(64, 158, 255)`。
- 10 组组合（5 色 × 亮暗）逐一 `setAttribute('data-accent', n)` + `classList` 切 dark 后读变量。
- 功能色（success/warning/danger）**有意**保持 EP 出厂色（项目设计决策 theme.css:28-31），本方案不动它们。

## 附带坑：Windows CRLF 破坏文件内容断言

ad-hoc 验证脚本用 `fs.readFileSync().includes('...')` 断言 CSS/Vue 文件内容时，Windows 文件是 `\r\n`，`\n` 匹配不上 → 断言假失败。脚本必须归一化：`src.replace(/\r\n/g, '\n')` 再匹配。
