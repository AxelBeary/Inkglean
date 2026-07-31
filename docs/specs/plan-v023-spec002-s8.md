# v0.23 评估：SPEC-002 §八 拍板项（B6）

> **编号**：plan-v023-spec002-s8
> **作者**：四号（需求整理）
> **日期**：2026-08-01
> **状态**：✅ 全部已实施，无需排期
> **来源**：一号派工 01-to-04-v022-eval-20260801（B6 展开评估）
> **原始需求**：SPEC-002-R30d-流程状态机.md §八（已归档 archive/specs-done/）

---

## 1. 评估结论

**SPEC-002 §八 的 4 个拍板项全部已在代码中实施，无需再排期。**

---

## 2. 逐项代码验证（2026-08-01）

### ① 映射规则：按位置自动映射 — ✅ 已实施

**位置**：`server/src/features/order/order-workflow.service.js` L18-25 `mapStageToStatus()`

| 节点位置 | 映射状态 | 代码 |
|----------|----------|------|
| 第 1 个节点 | `pending` | `if (idx === 0) return 'pending'` |
| 第 2 个且收款 | `confirmed` | `if (idx === 1 && stages[idx].takes_payment) return 'confirmed'` |
| 中间节点 | `wip` | `return 'wip'` |
| 最后一个节点 | `done` | `if (idx === stages.length - 1) return 'done'` |

比拍板多一条 confirmed 规则（增强，不冲突）。

### ② 回退语义：显示节点名而非 revision — ✅ 已实施

**后端**：`order-workflow.service.js` L110 系统备注记录 `↩ 从「X」打回到「Y」`

**前端三处均显示节点名**：

| 页面 | 实现 |
|------|------|
| QueueBoard.vue L78-80 | revision 时显示 `↩ + 节点名` |
| OrderDetail.vue L73 | `↩` 标记 + 进度条仍显示当前节点名 |
| TrackOrder.vue L80-82 | 客户端显示 `↩ 回退到「节点名」` |

### ③ 新订单默认接入工作流 — ✅ 已实施

**位置**：`server/src/features/order/order.service.js` L154-160（`createOrder()` 事务内）

- 画师有工作流模板 → 自动设 `current_stage_id` 为第一节点
- 画师无模板 → 不接入（`enableTracking()` 可后续手动开启）

### ④ 客户可见度：节点名 + 进度条 — ✅ 已实施

| 页面 | 实现 |
|------|------|
| TrackOrder.vue L69-85 | OrderTimeline 组件 + el-progress 进度条 + `节点名 X/Y` |
| OrderDetail.vue L70-74 | OrderTimeline + `第 X / Y 步` |
| OrderTimeline.vue（共享） | 完整节点时间线：已完成 ✓ / 当前脉冲高亮 / 未开始灰色 / 收款 💰 |

---

## 3. 总结

| 拍板项 | 状态 | 关键位置 |
|--------|------|----------|
| ① 按位置自动映射 | ✅ | order-workflow.service.js:18-25 |
| ② 回退显示节点名 | ✅ | 后端 L110 + 前端三页面 |
| ③ 新订单默认接入 | ✅ | order.service.js:154-160 |
| ④ 客户可见节点名+进度条 | ✅ | TrackOrder.vue + OrderTimeline.vue |

---

## 4. 建议

从 v0.23 候选清单中移除 B6。STATUS.md 中"推 v0.23"列表应删除"B6 SPEC-002 §八"。
