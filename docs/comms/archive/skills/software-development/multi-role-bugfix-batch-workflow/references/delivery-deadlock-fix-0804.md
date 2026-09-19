# 交付卡死修复（方案B）+ 批次A修复踩坑集（2026-08-04，五号）

分支 fix/delivery-deadlock（d40e473）+ fix/v035-audit-batch-a（64a56f7）。只记可复用教训。

## 1. Authorization 模板字符串被脱敏损坏（最高频陷阱）

用 patch/write_file 写 `headers: { Authorization: `Bearer ${token}` }` 时，工具链把含 "Bearer" 的模板字符串脱敏成字面量 `***'Bearer '}${token}``，整文件语法解析失败（vite: Unexpected token '**'，且报错不指行号）。

- **规则：新写测试代码一律用字符串拼接 `'Bearer ' + token`**，不用模板字符串。
- 诊断：测试文件突然整体 "invalid JS syntax" 但改动看起来没问题 → `Select-String -Pattern '\*\*\*'` 找脱敏残留。
- 已提交的老文件里的模板字符串不会被改写，只有新写入的会坏。

## 2. logActivity 的 ACTION_TYPES 联合类型

`activity-log.service.ts` 的 ACTION_TYPES 是 `as const` 联合类型。新操作想记日志时传新字符串（如 'delivery'）→ tsc 报错。

- **规则：不扩枚举**（扩了前端日志渲染端也要跟着改），复用现有类型 + detail 标记，如 `logActivity(id, 'status_change', 'artist', { from, to: 'delivered', noFile: true })`。

## 3. 分期金额"末节点吸收尾差"的正确实现

recalcInstallmentAmounts 原版各节点独立 Math.round，总和漂移 ±1~2 分。朴素修法"末节点 = 总价 − 前面之和"是错的：**节点比例之和可能不是 100%**（如单节点 30% 定金），会把 30% 节点算成 100% 总价，挂掉现有测试。

- **正确**：`ratioTotal = Math.round(totalCents × Σbasis_points / 10000)`；末节点 = ratioTotal − 前 N-1 之和。
- 必配回归测试：①三节点尾差场景断言总和 ②单节点比例≠100% 边界场景。

## 4. admin.routes.ts 的 TDZ（暂时性死区）

`intId`/`requireExistingArtist` 等是文件中部定义的 const/函数声明。给**定义行之前**注册的路由补 `schema: intId` 会在插件注册期求值未初始化 const → 崩溃。函数声明（requireExistingArtist）有提升可用，const（intId）不行。改路由前先看常量定义位置。

## 5. Element Plus / Vue 小坑

- **el-alert**：`:description` prop 和默认 slot 同时用会重复显示文字，二选一。
- **模板 :disabled 绑定的变量必须是 ref**：`let rulesLoaded = false` 在模板 `:disabled="!rulesLoaded"` 不响应式，改 `const rulesLoaded = ref(false)` 并同步脚本内所有 `.value`。

## 6. 共享弹窗抽取模式（DeliverDialog 范式）

OrderDetail 和 QueueBoard 共用交付弹窗的抽法：`v-model`（显隐）+ `:order-id` + `@delivered`（回传最新订单）；组件内 `watch(() => props.modelValue, open => { if (open) 重置内部状态 })`。看板侧直接弹窗不跳详情页时，@delivered 里刷新队列。

## 7. 子代理"报错"的验证方法

用户/UI 报"子代理失败"时，先读磁盘产物再决定是否重派：
- `cache/delegation/live/<delegation_id>/manifest.json` → tasks[].status（completed/failed 是 ground truth）
- `cache/delegation/subagent-summary-*.txt` → 完整报告内容
本会话两个子代理实际都 completed，只是结果回传层显示失败。直接重派会浪费 30+ 分钟。

## 8. 验证证据惯例（本项目已定型）

ad-hoc 聚焦验证脚本写 `C:\Users\<user>\AppData\Local\Temp\hermes-verify-<主题>.cjs`（静态检查改动点 + git 状态），跑完全过后删除；套件结果（tsc/vitest/eslint/build 数字）写进 comms 交付报告。verification hook 要的是"有证据"，不是"只跑套件"。

## 9. 可直接复跑的审计脚本（别手写临时脚本）

- `scripts/audit-i18n-keydiff.mjs` — 后端 errors.ts 错误码 vs 前端 locales errors.* 缺键对照（含中英不对称/空值/{占位符}），本地 `node scripts/audit-i18n-keydiff.mjs <项目根>`。它比的是"后端码→前端键"轴，与"中英互相对齐"轴是两回事（两结论可并存不矛盾）。
- `scripts/audit-demo-schema.cjs` — demo-data.ts INSERT 列 vs 真实表列对照（幻影列/NOT NULL 漏写/nullable 缺列），`docker cp` 进容器 `/app/server` 后 `node audit-demo-schema.cjs`（只读）。
- i18n 补键 / 种子完整性审计任务直接改这两个，别每次重写。
