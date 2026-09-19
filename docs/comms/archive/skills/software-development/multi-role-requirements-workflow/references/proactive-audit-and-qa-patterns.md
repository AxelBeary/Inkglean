# Proactive C-item Audit + Direct User Q&A Patterns

## Variant: Proactive C-item audit (空闲扫描)

When the user says "还有什么需要和我交流的" or 四号 is idle between dispatches, proactively scan ALL docs for unresolved decision items:

1. **Search**: `search_files` for `\[ \] \*\*C\d+` across `docs/requirements/` and `docs/specs/`
2. **Categorize** each open item into:
   - **Needs user decision**: genuine product/UX choice only the user can make
   - **Already covered by later spec**: a subsequent SPEC or拍板 session resolved it (mark `[x]` + "已被 X 覆盖（date）")
   - **Overdue/obsolete**: the version it belonged to shipped long ago (mark `[x]` + "已过时（date 清理）")
   - **Belongs to dev roles**: technical implementation choice for 二号/三号 (don't bother user)
3. **Present to user**: only the "needs user decision" group, all at once, with options + recommendations
4. **Batch-update**: after user confirms, patch ALL affected files in one pass, commit once

Key: don't present items the user doesn't need to decide. Filter aggressively. "没问题就直说没有" applies here too — if everything is covered, say so.

### Real example (2026-08-01)

Scanned all docs, found 23 open C-items. Categorized:
- 3 groups needed user (SPEC-002 ×4 questions, C43, C61)
- 7 already covered (C36/C42 by today's session, C38-40 by SPEC-004, C46-47 by dashboard spec)
- 2 obsolete (C48/C49, v0.13 shipped long ago)
- Rest belonged to dev roles (C44/C45/C52-C60)

User confirmed all 3 groups in one round. Batch-patched 5 files, one commit.

## Variant: Direct user Q&A session

When 一号 delegates user interaction to 四号 (e.g. "用户会直接找你交流 Q1~Q5"):

1. **Prepare**: read the dispatch comms file, update any already-resolved items (e.g. Q4/Q5 一号已定) before talking to user
2. **Present ALL questions at once**: user preference is "你整个出来我一起看". Format: numbered list, each with background → options table → your recommendation in bold. End with "不确定的标'再想想'也行"
3. **Accept brief answers**: user may reply "Q2 你建议都可以" or "A" — treat as full confirmation of your recommendation. Don't re-ask.
4. **Answer "what do we already have?"**: when user asks "我们已经有什么了", search actual code (not just docs) and present a status table: 后端 ✅/❌ / 前端 ✅/⚠️/❌ / 状态
5. **Fall to docs immediately**: after each confirmation round, update the draft/spec + commit + push. Don't batch across days.
6. **New requirements emerge**: user may add new features mid-conversation (e.g. "要不要加一个留言板？"). Treat as a new F-item: ask clarifying questions (who/what/where/limits), propose data model + API + 工时, get confirmation, add to the same doc.

### User answer patterns (observed)

| User says | Meaning |
|-----------|---------|
| "你建议都可以" / "建议都不错" | Accept ALL your recommendations wholesale |
| "A" / "先A吧" | Pick option A, often with "先" implying "can revisit later" |
| "A，但是改成……" | Accept direction + specify implementation detail (e.g. "A,改文案说清楚。不直接显示…hover显示详细说明"). Record the HOW verbatim as acceptance criterion. |
| "你的看法是什么" | Wants your genuine recommendation with reasoning, not a menu. Give verdict + justification. |
| "要不要加一个X？" | New requirement proposal — user wants your reaction + feasibility before committing |
| "我们已经有什么了" | Wants code-level status check before deciding, not doc-level |
| "工程量会多大？" | Needs concrete hours + ongoing maintenance cost before deciding |

### Presenting engineering tradeoffs

When user asks "选B工程量会多大？", give:
1. One-time dev cost (hours, broken down by layer)
2. **Ongoing maintenance cost** (the real deciding factor for this user)
3. Your judgment in one sentence
4. Let user decide — don't push

Example: C61 强调色影响后台 → "一次性 2-3h, 但真正成本是持续维护: 每个后台组件都得用CSS变量". User chose A (simpler) after seeing maintenance cost.

## Audit finding verification before user presentation

When relaying third-party audit findings to the user, **always verify the actual code first** — audit descriptions can be misleading or oversimplified.

**Pattern**: Audit says "code does X, docs say Y, inconsistent" → 四号 searches actual code → discovers the real situation is more nuanced → corrects the framing before presenting options.

**Real example (P1-4, 2026-08-01)**:
- Audit claim: "代码限制参考图最多 5 张，README 宣称 20 张"
- Code reality: TWO layers — client upload limit 5 per submission (`useOrderForm.js:303`), order lifecycle total 20 (`order-gallery.service.js:59`). SPEC-001 explicitly documented "两者不冲突".
- Corrected presentation: "不是功能 Bug，是文案/UI 表述不够清晰" → options focused on wording clarity, not code logic changes.

**Steps**:
1. Read the audit finding description
2. `search_files` for the actual limit/validation code (both frontend and backend)
3. Check if existing specs/docs already explain the design intent
4. If audit framing is wrong, explicitly say so: "审计说的不完全准确，实际情况是……"
5. Present options based on the REAL situation, not the audit's framing

**Why this matters**: If 四号 passes through the audit's framing uncritically, the user might approve unnecessary code changes (e.g. "改代码为 20") when the real fix is just a tooltip.

## Version scheduling analysis pattern

When user asks "你的看法是什么" about whether a large feature fits a version:

1. **Break hours by role** (not just total): "9h 分散在 3 个端（客户 2h + 画师 2h + 管理 1h + 后端 3h + 测试 1h），不是一个人扛 9h"
2. **Analyze parallel workability**: which items have zero dependencies and can start immediately? Which block others?
3. **Identify batching savings**: "4 模板适配只做一轮" — doing all template-touching features in one version avoids re-familiarization cost
4. **Name the real risk**: e.g. "三号后端队列偏长（~10h）" — then show mitigation
5. **Give a clear verdict**: "全进，没有需要推后的" — don't hedge

User preference: wants your genuine engineering judgment, not a menu of options. "你的看法是什么" = "告诉我你建议什么，我来拍".

## Git race condition in multi-agent parallel work

When multiple agents share the same repo (main worktree on master), another role may commit between your `git add` and `git commit`:

**Symptom**: `git commit` says "nothing added to commit" but `git show --stat <latest>` shows YOUR files in someone else's commit.

**Resolution**: Verify your changes are in the repo (`git show --stat HEAD` or `git log --oneline -5`). If content is correct, don't re-commit. The commit message will be wrong (belongs to the other role) but content integrity matters more. Note it in your comms if relevant.

**Prevention**: Chain `git add && git commit && git push` in a single terminal call to minimize the race window. Never split add and commit across separate tool calls when other agents are active.
