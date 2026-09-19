# 四号 Session Patterns (2026-08-01)

## Pre-交流 Preparation

When dispatched to wait for user discussion (e.g., "等用户找你交流 P1-4 和 v0.19 排期"):
1. Read STATUS.md + dispatch comms file
2. Batch-read ALL relevant specs, requirements, and code (5+ files in parallel)
3. Verify code claims from comms with `search_files` — comms authors simplify/misunderstand
4. Present code-verified background immediately when user arrives

Real case: P1-4 described as "代码限 5 张，README 写 20 张" but code verification revealed TWO-LAYER limits (5 per upload, 20 per order lifecycle) that aren't contradictory.

## Decision Presentation

- Present ALL decision items at once ("你整个出来我一起看")
- Give explicit recommendations with reasoning for each
- User will batch-respond; don't drip-feed

## 转达占位备案 = Minimal Handling

When another role says "占一行即可，不用 comms，不用估工时":
- One `patch` to tracker file → one commit → done
- No comms file, no spec, no analysis

## Branch Verification

In shared worktrees, run `git branch --show-current` in the SAME command chain as `git add && git commit`, not just at session start. Another agent's operations can change branch state between your checkout and commit.

If the role allows docs commits on master (四号 does), committing on master is acceptable — but verify first.

## 拍板即落文档

User says "ok。做" → immediately patch docs + commit + push + write comms. Don't batch. Oral拍板 has a short half-life.

## Evaluation Triage (展开评估)

When dispatched to "展开评估" a candidate list (e.g., "B5/B6/B7 展开评估，产出 spec"):

1. **Verify code FIRST for every item** — don't assume the candidate list is accurate. Items may have been implemented in previous versions without updating the tracker. Real case: B5 (系统自检) and B6 (SPEC-002 §八) were both fully implemented; only B7 was genuinely undone.
2. Already-done items → write a short confirmation spec (evidence table: file + line + status). Recommend removal from candidate list.
3. Not-done items → write full spec (design + data model + API + acceptance criteria + estimates + decision items).
4. Use **parallel subagents** for code investigation when items touch different code areas (3 items → 3 parallel subagents, ~55s total vs ~3min serial).
5. Present all decision items to user in one batch with recommendations.

## User拍板 May Not Match Offered Options

Present options A/B but be ready for the user to give a **custom hybrid answer**. Real case: Q2 offered "A 只显示总额 / B 总额+分期明细" but user said "已付 下期应付 待付款 总额？进度条形式很棒" — a third option with four data points. Don't force-fit; update the spec to match what the user actually said, verbatim.

## User Thinks in Accounting Terms

When designing financial features, the user frames decisions in accounting language: "计总账" (general ledger), "负数冲销" (negative offset). This means:
- Prefer audit-trail designs (negative entries over deletions)
- Frame financial UIs as 流水 (ledger) not just "records"
- "多收" is not just a display issue — it affects the books
