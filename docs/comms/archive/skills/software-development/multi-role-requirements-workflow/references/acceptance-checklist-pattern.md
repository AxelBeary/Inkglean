# Acceptance Checklist (验收标准整理 — spec → developer-facing testable list)

When 一号 says "整理验收标准" or "缺一份面向开发者的验收清单" for an already-拍板 spec (e.g. plan-dashboard.md with C48–C58), the input is a COMPLETE spec with decisions made. The job is NOT to re-discuss requirements — it's to translate decisions into a checklist a developer can check off item by item.

## When to use

- Spec exists and is拍板 (all C-items confirmed)
- 一号 explicitly asks for "验收清单" or "验收标准整理"
- The spec has验收标准 sections but they're scattered per-feature, not consolidated for dev handoff

## Method

1. **Read the spec thoroughly** — extract every C-item decision, every "不做" item, every layout diagram
2. **Read existing code** — understand what already exists (current Dashboard.vue structure, existing components) so the checklist references real file names and real patterns
3. **Read related specs** — if the feature depends on another spec (e.g. SPEC-004), read that too and document the衔接点 (interface points)
4. **Write per-module sections**, each containing:
   - 验收条件 table: # / 当…… / 应该…… / 验证方式
   - **三态处理** (loading/empty/error) — THIS IS THE KEY VALUE-ADD. Specs rarely cover these explicitly, but developers need to know. Pattern:
     - 加载态: skeleton/placeholder (specify what)
     - 空状态: exact text or behavior (quote spec if available)
     - 错误态: error message + retry button / silent degradation (specify which)
   - 数据规格: units (cents vs yuan), time fields, timezone handling, SQL fragments
5. **Write cross-module rules**: module independence (one failure ≠ white screen), load order, responsive breakpoints, i18n, performance constraints
6. **Write test matrix**: test type / coverage / responsible role
7. **Write "不在本清单范围"**: explicitly list what's excluded and why (prevents scope creep during dev)
8. **Write "待确认问题"**: things the spec didn't cover that need 一号/二号/三号 input (e.g. chart library selection, edge case behavior)

## Key value-adds over the source spec

| What you add | Why it matters |
|---|---|
| 三态处理 per module | Specs say "show X when Y" but never say "show skeleton while loading" or "show retry button on error". Developers will ask. |
| 验证方式 column | "目视" vs "构造数据验证" vs "DevTools模拟" — tells QA how to check |
| 数据规格 | Cents vs yuan, timezone edge cases, SQL field names — prevents backend/frontend mismatch |
| 跨模块规则 | Module independence, load parallelism, i18n — architectural constraints not in any single feature spec |
| 测试矩阵 | Who tests what — prevents "I thought 二号 was testing that" |
| 衔接点 section | When feature depends on another spec, document exact API/field/route dependencies |

## Document structure

```markdown
# v<X.Y> <feature>验收标准（开发者清单）

> 用途：面向二号/三号的验收清单，逐项对照即可判断"做完了没有"

## 0. 总览
Table: 模块 / spec章节 / 后端API / 前端组件 / 依赖
+ 全局规则 (刷新策略, 设计原则)

## 1~N. <Each module>
### N.1 验收条件
Table: # / 当…… / 应该…… / 验证方式
### N.2 三态处理
Table: 状态 / 表现
### N.3 数据规格 (if applicable)

## N+1. 跨模块通用规则
Module independence / load order / breakpoints / i18n / performance

## N+2. 测试矩阵
Table: 测试类型 / 覆盖范围 / 负责

## N+3. 不在本清单范围
Table: 项 / 原因

## N+4. 待确认问题
Table: # / 问题 / 建议 / 需谁确认
```

## Pitfalls

- **Don't re-open settled decisions**: The spec says C48=柱状图. Don't write "建议考虑折线图". Just write the acceptance criteria for柱状图.
- **Don't invent requirements**: If the spec says "列表随任务数量伸缩，折叠上限做出来再定", write "v1 不设硬上限" in the checklist, don't invent a 15-item fold rule.
- **Mark suggestions as suggestions**: 三态处理 details (skeleton vs spinner, exact error text) are your recommendations. Mark "建议" where the spec didn't specify.
- **Existing code changes**: If the spec implies removing/modifying existing UI (e.g. 4 stat cards → 3), call it out explicitly in the checklist. Developers need to know what to DELETE, not just what to add.
- **Flag ambiguities as Q-items**: If the spec layout diagram shows ×3 cards but existing code has ×4, don't silently pick one. Write a Q-item for 一号 to confirm. (This happened: Q4 in dashboard acceptance.)

## Real example (v0.18 仪表盘)

Source: plan-dashboard.md (C48–C58, 316 lines). Output: plan-v018-dashboard-acceptance.md (346 lines, 40+ acceptance conditions across 6 modules). Key additions: 三态处理 per module, SPEC-004 衔接点 section, test matrix, 5 Q-items (2 resolved by 一号 same day: stat cards 4→3 confirmed, default panel entry removed from layout).
