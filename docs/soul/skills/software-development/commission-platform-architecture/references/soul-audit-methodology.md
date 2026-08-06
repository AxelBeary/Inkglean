# Soul File Audit Methodology

How to audit multi-agent role definition files (`docs/soul/soul-*.md`) against project reality.

## When to Run

- On project lead handoff / new session
- After any major version release that adds new coding standards
- After security audits that establish new rules
- When a role repeatedly violates a rule that "should be obvious"

## Audit Steps

### 1. Extract Established Rules from Project Docs

Read these files and list every **hard rule** (not suggestion):
- `docs/changelog.md` — look for "修复" entries that established new patterns (e.g., "all v-html must use sanitizeHtml")
- `docs/开发自参考.md` — "已知注意事项" section contains numbered rules
- `docs/维护说明书.md` — security section
- `docs/待修复问题清单.md` — P0/P1 fixes that became permanent standards

Output: a checklist of rules like:
- [ ] All `v-html` → `sanitizeHtml()`
- [ ] All write routes → JSON Schema `additionalProperties: false`
- [ ] All user-visible text → `$t()`
- [ ] ESLint zero warnings
- [ ] etc.

### 2. Cross-Reference Against Soul Files

For each rule from step 1, check: **does the relevant soul file explicitly state this rule?**

Key insight: rules that exist only in changelog/开发自参考 but NOT in soul files will be violated by agents who only read their soul file. The soul file is the agent's single source of truth — if it's not there, it doesn't exist for them.

### 3. File Ownership Gap Analysis

List every directory/file pattern in the project. For each, verify:
- Exactly one role has it in "允许修改", OR
- It's in a "需要协调" list for the roles that might touch it

Common gaps found:
- Theme system files (`theme.css`, `ThemePicker.vue`, `stores/theme.js`) — cross-cutting, often missing from both frontend and backend roles
- Shared components (`components/shared/**`) — same
- New files added since soul was written (check git log for new paths)

### 4. Stale Permission Check

Verify soul file permissions match actual project structure:
- Are listed paths still valid? (renames, deletions)
- Are new directories unlisted? (e.g., `docs/plan-*.md` created after soul was written)
- Does the "不在我职责内" list cover new additions?

### 5. Safety Rule Completeness

Each soul file should have:
- [ ] "停下来报告的情况" section (stop-and-report triggers)
- [ ] Explicit "信息不足时" behavior (don't guess)
- [ ] Verification commands (what to run before submitting)
- [ ] ESLint/lint requirement stated explicitly
- [ ] Commit format requirement

### 6. Cross-Role Consistency

- Role A's "不在我职责内" should match Role B's "允许修改" (no orphan files, no double-ownership)
- Coordination lists should be symmetric (if 二号 lists X as "needs 一号 coordination", 三号 should too if they might touch it)
- Risk level definitions should be identical across all files

## Common Findings (from 2026-07-29 audit)

| Finding | Root Cause | Fix |
|---------|-----------|-----|
| i18n rule missing from frontend soul | Rule established in v0.10.0 changelog but never propagated | Add as "硬规则" bullet |
| XSS rule missing | Established in v0.5 audit (P0-2) but predates soul files | Add as "硬规则" bullet |
| JSON Schema rule missing from backend soul | Established in v0.6.2 (P1-8) | Add as "硬规则" bullet |
| theme.css/ThemePicker unowned | Added in v0.7.1, soul files written later but missed cross-cutting files | Add to "需要一号协调" in both roles |
| plan-*.md in 四号 permissions | Soul author assumed all docs/ is requirements; plan files contain SQL/API specs | Remove, add note |
| No verification commands in bugfix soul | Assumed "obvious" — but agents need explicit commands | Add vitest/eslint/build commands |
| No "信息不足" rule in lead soul | Present in original system prompt but lost in soul condensation | Add as dedicated section |

## Output Format

Report as:
```
| # | File | Problem | Severity | Fix |
```
Severity: 阻塞 (safety rule missing) / 重要 (ownership gap, quality rule missing) / 建议 (clarity, completeness)
