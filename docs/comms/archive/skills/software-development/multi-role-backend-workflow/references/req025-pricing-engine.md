# REQ-025 动态节点计价引擎（第一阶段实现，v0.37）

第一阶段（v0.37，三号，commit e9f3803 分支 v037-pricing-engine）只交付纯函数引擎 + 测试 + 迁移 v39，**零调用方**。第二阶段（接端点、切流、前端）需先读本文件。

## 文件位置

- `server/src/features/pricing/pricing-engine.ts` — 引擎（7 个导出纯函数 + 类型）
- `server/tests/pricing-engine.test.js` — 49 测试（案例 1~10 + 守恒破坏用例 + 迁移 v39 数据层）
- `server/src/db/init.js` — 迁移 v39（order_price_entries 账本表，CHECK 7 种 type）
- `server/src/shared/errors.ts` — `PRICING_CONSERVATION` 错误码
- 交付报告：`docs/comms/03-to-01-v037-REQ025计价引擎第一阶段交付报告-20260805.md`

## 引擎 API 摘要

| 函数 | 职责 | 关键规则 |
|------|------|---------|
| `sumEntryDeltas(entries)` | Σ 条目 delta = 总价 | R1 |
| `allocateInitial(installments, totalCents)` | 初始分配：round + 末节点吸尾差，ratioTotal = Σbp/10000（与 recalcInstallmentAmounts 同语义） | R3 |
| `computeLockedState(installments, paidTotalCents, completedStageIndex, prevLockedFlags?)` | 完成 OR 付清先到先锁；prevLockedFlags 支持回退不解锁；返回顺序填充 paidCents | R4 |
| `allocateDelta(installments, lockedFlags, deltaCents)` | 未锁节点按原始 bp 归一化，floor + 尾差归最后未锁；全锁进额外应收/应退；负 delta 非尾款（绝对位置 i<n-1）封顶 0，尾款节点在参与者中超额压尾款、不在则转额外应退（260830 审计 H-1 修正：旧口径按「最后参与者」豁免致中间节点静默写负） | R5/R6/R8/R10 |
| `deriveInstallmentProgress(installments, paidTotalCents)` | 顺序填充 + 超付抵扣；非尾款待收≥0，尾款可负 | R7/R8 |
| `applyRefund`（已删除） | 260830 审计批删除：与 allocateDelta 同构的休眠负金额路径（尾款判定错误），从未接服务层；退款减价单轨走 allocateDelta | — |
| `assertConservation(input)` | A1/A2/A3 守恒断言，失败抛 AppError(PRICING_CONSERVATION, 500) | R11 |

所有金额整数「分」；入参乱序安全（内部按 sortOrder 配对排序，lockedFlags 永不错位）。

## 关键设计决策（第二阶段必须遵守）

1. **A2 断言偏离 REQ-025 原文**：原文「总价 − 已收 = Σ 节点待收」在关单后收款场景不成立（收齐后加 50：已收 500、Σ待收 0）。实现为 `总价 − 已收 = Σ待收 + 额外应收 − 额外应退`；关单前额外项为 0 时与原文等价。已在 comms 向一号声明。
2. **applyRefund 冲的是「待收」不是「已收」**：退款 = 客户少付 = 未锁节点降价，不是把钱从已收里抠出来。初版实现错了，写测试前自查纠正。
3. **初始分配 vs 增量分摊是两套取整公式**：初始用 round + 末节点吸尾差（对齐现有 recalcInstallmentAmounts），增量用 floor + 尾差归最后未锁节点（R6）。不要统一。
4. **lockedFlags 配对排序模式**：任何「节点 + 平行布尔数组」的纯函数，先 `installments.map((inst,i)=>({inst, locked: lockedFlags[i]}))` 再 sort，否则内部排序会让标记错位。
5. **第二阶段接入提醒**：computeLockedState 的 prevLockedFlags 需要持久化（DB 加 locked 字段，属第二阶段迁移）；createOrder 写 base 条目也推迟到第二阶段（第一阶段不动 createOrder）。

## 测试数值基准

REQ-025 第三节边界案例 1~8 数值以文档纠正值为准（用户原稿有笔误：加 200 后完稿应为 140 不是 180；案例 3 分摊 88/66/46 尾差归完稿；案例 6 为 8888/6666/4446）。写新测试前**手工算好期望值再写断言**——本次两个测试失败都是自己期望值算错（不是引擎错）。
