# Build optimization & monitoring (artist-commission)

## EP CSS 按需引入完整方案（v0.20 JS + v0.22 A4 CSS）

### 背景

v0.20 做了 JS 按需（unplugin-vue-components + ElementPlusResolver），但保留了全量 CSS import（`element-plus/dist/index.css`，358KB / gzip 93KB），原因是"避免样式覆盖顺序风险"。v0.22 A4 实证解决了这个风险并删除了全量 CSS。

### 操作步骤

1. **vite.config.js**：`ElementPlusResolver({ importStyle: false })` → `ElementPlusResolver({ importStyle: 'css' })`
   - 每个 el-* 组件注册时自动注入对应 theme-chalk CSS
   - `dts: false`（非 TS 项目）

2. **main.js**：删除 `import 'element-plus/dist/index.css'`

3. **main.js**：保留 `import 'element-plus/theme-chalk/dark/css-vars.css'`（暗色模式变量）

4. **main.js**：手动导入 3 个 JS API 组件样式（resolver 只覆盖模板中的 `<el-*>` 标签，JS API 调用不触发）：
   ```js
   import 'element-plus/theme-chalk/el-message.css'
   import 'element-plus/theme-chalk/el-message-box.css'
   import 'element-plus/theme-chalk/el-loading.css'
   ```
   确认方法：grep 项目中 `ElMessage`/`ElMessageBox`/`ElLoading`/`ElNotification` 的使用。本项目无 ElNotification，所以只需 3 个。

5. **不需要改的**：28 个文件中的 `import { ElMessage } from 'element-plus'` 命名导入（JS 已被 tree-shake）；errorHandler 中的 `import('element-plus')` 动态导入（vite 去重）。

### 样式覆盖顺序安全性证明

v0.20 担心的风险：theme.css 通过 `@import` 在 App.vue 中引入，如果 EP 的 base.css（定义 `:root { --el-* }` 变量）在 theme.css 之后加载，theme.css 的 `--el-*` 覆写会被 base.css 覆盖回去。

**实证结论：风险不存在。**

- 每个组件的 `style/css.mjs` 第一行是 `import "../../base/style/css.mjs"`（base.css 是依赖链的一部分）
- base.css 通过 main.js 的手动导入（el-message.css 等）或 resolver 自动注入进入 bundle，位于入口 chunk
- App.vue 的 `@import './styles/theme.css'` 在组件树解析后才注入（router → view → component 链路）
- 因此 base.css 始终在 theme.css 之前 → theme.css 的 `--el-*` 覆写生效

验证命令（实施前必跑）：
```powershell
# 确认组件 css.mjs 包含 base 依赖
Get-Content node_modules/element-plus/es/components/button/style/css.mjs
# 确认组件 CSS 不含 :root 变量定义（变量只在 base.css）
Select-String -Path node_modules/element-plus/theme-chalk/el-button.css -Pattern ':root' -Quiet
# 确认 base.css 含 :root 变量
Select-String -Path node_modules/element-plus/theme-chalk/base.css -Pattern ':root' -Quiet
```

### 结果

| 产物 | v0.20（全量 CSS） | v0.22 A4（按需 CSS） | 变化 |
|------|------|------|------|
| main CSS | 470.87 kB / gzip 92.85 kB | 123.63 kB / gzip 46.14 kB | **-74% / gzip -50%** |
| main JS | 389.18 kB | 402.66 kB | +Sentry ~13 kB |

### 回归验证

删除全局 CSS 可能静默破坏任何 EP 组件。vitest + ESLint + build 都抓不到缺失的组件样式。**必须跑 E2E 套件**（5 条路径覆盖 ElMessage/ElMessageBox/drawer/dialog/table/form）作为回归网。v0.22 A4 跑了 E2E 5/5 全绿。

---

## Sentry 前端 SDK 接入（v0.22 A1）

### 模式

```js
import * as Sentry from '@sentry/vue'

const app = createApp(App)

// DSN 为空则不初始化，零开销
const sentryDsn = import.meta.env.VITE_SENTRY_DSN
if (sentryDsn) {
  Sentry.init({
    app,
    dsn: sentryDsn,
    environment: import.meta.env.PROD ? 'production' : 'development',
    tracesSampleRate: 0
  })
}

// 在现有 errorHandler 内加一行——Sentry.init 未调用时 captureException 静默无操作
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', err, info)
  Sentry.captureException(err, { extra: { vueInfo: info } })
  // ...existing user-facing toast...
}
```

### 要点

- DSN 通过 `VITE_SENTRY_DSN` 环境变量注入（Dockerfile ARG 已就绪）
- `Sentry.init({ app })` 会自动包装 Vue 的 errorHandler——但本项目已有 S-10 自定义 errorHandler，所以改为在 handler 内手动 `captureException`，两者共存
- `tracesSampleRate: 0`（不采性能数据，只报错误）
- 无 DSN 时行为完全不变（captureException 是 no-op）
- `@sentry/vue` 加 dependencies（非 devDependencies）
