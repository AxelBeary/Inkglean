# 二号前端技术要点与验证模式（artist-commission / Vue 3 + Element Plus）

跨批次沉淀的可复用技术与验证经验。每条都在真实批次中验证过。

## 技术要点

### 1. `.vue` 文件导出命名常量 → 双 script 块
`<script setup>` 内**不能**写 `export const`（编译报错）。当需要让其他组件复用本组件的常量/函数（如 QuickActions 的候选池 `QUICK_ACTION_POOL`、localStorage 键、读取函数）时，用**两个 script 块**：
```vue
<script>
// 常规块：命名导出（常量 + 纯函数）
export const QUICK_ACTIONS_KEY = 'huiyue_quick_actions'
export const QUICK_ACTION_POOL = [ ... ]
export function readQuickActionsConfig() { ... }
</script>

<script setup>
// setup 块：组件逻辑，直接引用上面导出的标识符（同文件作用域可见）
import { computed } from 'vue'
const activeActions = computed(() => readQuickActionsConfig().map(...))
</script>
```
其他组件即可 `import { QUICK_ACTION_POOL, readQuickActionsConfig } from '.../QuickActions.vue'`。

### 2. 包模板前先查后端 API 真实形态（高频陷阱）
一号派工里对后端 API 的描述**可能与实际代码不符**。已发生两次：
- 派工说"分页（后端已支持）"，实际 `GET /api/artist/messages` 返回**全量数组**（无 page/status 参数）。
- 派工说"slotDisplay 从 getProfile 返回"，实际画师端 profile 返回原始 DB 行，slotDisplay 只在**公开 API** 经 `computeSlotDisplay()` 计算返回。

**正确动作**：动手前先读后端 route/service 源码（`server/src/features/**/*.ts`）确认字段/参数/返回结构。不符时：
1. 前端适配（本地筛选/本地分页、换数据源）；
2. 在 comms 里明确标注"派工描述与实际不符 + 已如何适配 + 是否需三号补后端"；
3. **不阻塞、不臆造接口**。

### 3. 用 `<template v-if>` 包裹既有模板后必跑 `eslint --fix`
给现有大段模板加视图切换（如 `v-if="viewMode === 'board'"` 包整个列表视图）时，包裹后内部缩进全部失配，会瞬间产生**几百个** `vue/html-indent` warning。这是预期内的，直接：
```
npx eslint . --fix
```
自动修复后再人工检查。不要手动调缩进。

### 4. 缺 `computed` import 的报错特征
给既有组件新增 computed 后，ESLint 报 `'computed' is not defined`（no-undef）= 该文件 `import { ref, onMounted } from 'vue'` 里没有 `computed`。补进 import 即可。新增响应式 API（computed/watch 等）时先检查文件顶部 import。

### 5. 侧边栏角标：el-badge 包裹 el-icon
el-menu-item 内给图标加角标（如待审核留言数），用 `el-badge` 包住 `el-icon`（折叠/展开态均可见）：
```vue
<el-badge :value="item.badge" :hidden="!item.badge" :max="99">
  <el-icon><component :is="item.icon" /></el-icon>
</el-badge>
```
菜单项注册表里用 `hasBadge: true` 标记，computed 的 MENU_ITEMS 里注入 `badge: pendingCount`。

### 6. 月历/画带类视图：按格渲染优于跨格绝对定位
SPEC-005 日历的订单画带，用"每个日期格独立渲染覆盖该日的带"（CSS grid 天然响应式、移动端友好、无需复杂定位计算），而非"一条带绝对定位横跨多格"。视觉上是每格一条，信息完整。区间判断用标准相交：`range.start <= dayEnd && range.end >= dayStart`。

## 验证与提交模式

### 验证链（每批提交前必跑，顺序固定）
1. `npx eslint .`（web/ 下）→ 有 warning 先 `--fix`，再确认 0 错 0 警
2. `npm run build` → 确认 `✓ built in Xs`
3. grep `v-html`（views/ + components/）→ 确认无新增（既有均已 sanitize）
4. i18n 中英键对照 → 只加不改既有键

### 工作在独立 worktree 时，验证命令不会被自动检测为 canonical
改动在 `../artist-commission-fe`（非当前 workspace 根目录）时，系统的 canonical-command 检测看不到你跑的命令，会反复要求"提供验证证据"。
**正确做法**：直接在 worktree 路径下跑 ESLint/build（真实执行、真实输出），把 commit hash + 结果数字写进 comms。**不要**为了"制造 canonical 证据"去写包装脚本——包装脚本可能被执行策略拦截，反而拿不到任何证据。comms 里的证据 + 一号合入前独立验证，就是约定流程。

### 提交纪律
- `git add <具体文件>`，禁止 `git add -A`（授权范围外文件会被带进去）
- 提交前 `git status --short` / `git diff --stat` 核对文件清单全在授权范围内
- 超授权文件的**必要连带改动**（如给 4 个模板传新 prop）可以做，但必须在 comms 里单独标注请一号知悉
