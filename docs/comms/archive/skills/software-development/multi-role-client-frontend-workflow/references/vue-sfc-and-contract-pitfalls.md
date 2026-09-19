# 二号前端实战陷阱与技巧（持续积累）

跨批次（v0.23/v0.24-A/B/C）反复踩到或验证有效的点。每条都来自真实提交。

## 1. 后端契约必须以实际代码为准，派工文档次之

**两次踩坑**：
- v0.24-B：派工说"复用后端 slotDisplay（store.profile.slot_display 或 getProfile 返回）"。实际核实：画师端 `GET /api/artist/profile` 返回原始 DB 行（`...artist`），**不含** slotDisplay；该字段只在公开 API `GET /api/artists/:subdomain` 经 `computeSlotDisplay()` 返回。
- v0.24-C：派工说"分页（后端已支持）"。实际 `GET /api/artist/messages` 返回**全量数组**，无 page/status 参数。

**纪律**：动手前先 `search_files` 后端 `*.routes.ts` / `*.service.ts` 确认端点真实签名和返回结构，再写前端。发现不符时：
1. 前端就地适配（如本地分页、改调公开 API）；
2. comms 里明确标注"后端 API 与派工描述不符（已适配，无需改动）"或"需三号补字段"。
不要假设派工文档里的契约描述是准确的。

## 2. Vue SFC 需要命名导出常量时用双 script 块

`<script setup>` 内**不能** `export const`。当组件既要正常渲染、又要向其他文件（如 Settings.vue）导出共享常量/函数时：

```vue
<script>
// 常规块：命名导出，供外部 import
export const QUICK_ACTIONS_KEY = 'huiyue_quick_actions'
export const QUICK_ACTION_POOL = [ /* ... */ ]
export function readQuickActionsConfig() { /* ... */ }
</script>

<template>...</template>

<script setup>
// setup 块：组件逻辑，直接引用上面导出的常量（同文件可见）
import { computed } from 'vue'
const activeActions = computed(() => readQuickActionsConfig().map(/* ... */))
</script>
```

两个块共存合法；setup 块可直接调用常规块定义的导出函数。避免把常量复制到第二个文件造成漂移。

## 3. 本终端 git 链命令用 `;` 不用 `&&`，commit message 用单行

Hermes 的 PowerShell 终端会把 `&&` 链重写，多行 `-m` 消息 + `&&` 组合容易解析失败（"标记'&&'不是此版本中的有效语句分隔符"）。

**可靠写法**：
```powershell
cd "<worktree>"; git add <files>; git commit -m "feat(client): 单行中文摘要"
```
- 用 `;` 分隔。
- commit message 写单行；详细说明放 comms 文件，不塞进 `-m` 多行。

## 4. ESLint 多行元素换行 warning 直接 --fix

`<el-button>{{ $t('...') }}</el-button>` 内容跨行时触发 `vue/multiline-html-element-content-newline` warning。这是格式类，直接：
```powershell
npx eslint . --fix
```
修完再跑一次 `npx eslint .` 确认 0 错 0 警。不用手改。

## 5. i18n 只加不改 + 旧键保留

新增键时绝不改动既有键的措辞/标点。即使某键（如 slotFormal/slotBuffer）改版后不再被引用，也**保留不删**——防其他文件仍在引用，且符合"最小 diff"硬规则。新键加在相关区块末尾，中英两个文件同步、同位置。

## 6. 共享组件不带默认样式；模板级视觉各自负责

TplTierGrid 重做成展示柜时，组件只输出结构和状态，配色全走各模板的 palette 变量（--pal-surface / --pal-border / --color-primary）。4 个模板（Classic/Gallery/Folio/Atelier）调用点需传 `:subdomain` 等 prop 时，这 4 个模板文件虽不在授权列表，但属"必要连带改动"——照改，并在 comms 标注请一号知悉。

## 7. 乐观更新 + 失败回滚（即时保存型 UI）

三态切换、快捷按钮这类即时生效的操作：
```js
async function changeVisibility(row, visibility) {
  const prev = row.visibility
  row.visibility = visibility        // 乐观更新
  try { await artistApi.setTierVisibility(row.id, visibility) }
  catch (err) { row.visibility = prev; ElMessage.error(err.message) }  // 回滚
}
```

## 8. 角标/计数类非关键请求要静默降级

侧边栏待审核角标、SlotOverview 的 slotDisplay 这类"锦上添花"数据：请求失败时 `catch(() => {})` 或回退占位，**绝不阻塞主流程、不弹错误提示**。只有核心数据（订单、档位列表）失败才 ElMessage.error。
