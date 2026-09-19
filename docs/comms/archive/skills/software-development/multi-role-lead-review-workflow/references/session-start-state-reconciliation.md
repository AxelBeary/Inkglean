# 开工状态核对 + 派工前接线验证（v0.36 波 2 盘点沉淀）

> 本文件是 SKILL.md 的延伸细节。SKILL.md 达 100K 上限无法再增补，curator 瘦身时应把此内容并入主流程并在 SKILL.md 加指针。

## 一、开工状态核对（HEAD 漂移 + comms 清理同节奏）

STATUS.md 记录的 HEAD 可能与实际漂移（上个会话补了 docs 提交、或压缩前来不及更新 STATUS）。开工第一步：

1. `git log --oneline -5` 对照 STATUS.md 的 HEAD 记录；`git status` 确认工作区干净、分支在 master。
2. 不一致时：对每个未知提交 `git show --stat --oneline` 核实内容——仅 docs/comms/soul 类可直接记账；涉及代码的必须先审清楚来源再记录。
3. 把 STATUS.md 的 HEAD 记录更新到位再干活——STATUS 必须自包含，角色刷新后只读它。

comms 清理同一节奏做：`git ls-files docs/comms` 列出 → 逐个确认已合入（含 note 类自查文件，教训已入 soul 后即可删）→ `git rm` 批量删 → 更新 STATUS → commit 前 `git status --short` 逐行核对暂存区 → commit + push 同链。

实例（2026-08-05）：STATUS 记 HEAD=a6cc152，实际 9885595（领先两个 docs 提交：soul 补教训 + STATUS 自包含刷新）。核实均为文档后记账，顺手清 17 个已合入 comms 文件，一次 commit+push。

## 二、派工前验证：追接线，不是查存在

v0.22 教训（盲信候选列表重复派工）是硬规则，执行深度要求：

- **grep 到组件/函数存在 ≠ 已完成**。必须追具体入口的接线。实例：QueueBoard 已挂载 DeliverDialog 且 `openDeliverFor()` 存在，但下拉 `command="delivered"` 走 `quickAction` 直调 `updateStatus`——弹窗只接到绿色主按钮，下拉入口没接，仍是真缺口。只看"组件在不在"会误判已完成、漏派。
- **确认"未完成"时顺手记下影响派工方案的复杂度**：如 createOrder 内联分期（L283-299）比 `generateInstallmentsForOrder` 多一个 `priceCalc.installments` 分支（新计价模型的分期来源），去重不是简单替换函数——写进派工注意事项，避免执行者踩坑。
- **验证结论表格化**（候选项 / 现状证据带行号 / 结论）随决策项一次呈给用户，既防重复派工又给用户拍板依据。

## 三、波 2 派工前的决策项打包

终验结果、遗留定夺（如终态订单是否生成分期）、派工分配，一次列全给用户拍板，不分批问。
