# Multi-Agent Collaboration Rules (绘约 / Brushline-HuiYue)

Established 2026-07-29. Canonical source: `docs/soul/soul-*.md` (5 files) in the project repo.
Supplementary: `docs/协作规则.md`, `docs/templates/submit-*.md`.

## Roles

| # | Role | Scope |
|---|------|-------|
| 一号 | Project Lead (主理人) | Review, merge, release, risk control. Reports to user. |
| 二号 | Client Frontend | `web/src/views/client/**`, `web/src/components/templates/**`, `web/src/composables/use*.js`, `web/src/styles/templates.css`, `web/src/styles/palettes.css`, `web/src/embed/**` |
| 三号 | Backend + Artist UI | `server/src/**`, `server/tests/**`, `web/src/views/artist/**`, `web/src/views/admin/**`, `web/src/components/artist/**`, `web/src/components/admin/**`, `web/src/stores/artist.js`, `web/src/constants/order.js` |
| 四号 | Requirements | `docs/requirements/**`, `docs/tasks/**`, `docs/specs/**`, `docs/acceptance/**`, `docs/待修复问题清单.md`, `README.md`. NO code/config/deps. NOTE: `docs/plan-*.md` are technical implementation plans (SQL/API/component trees), owned by 一号 or the relevant tech role — 四号 does NOT modify them. |
| 五号 | Bug Audit & Fix | Minimal file set per bug, assigned by 一号. No fixed directory scope. |

## Branch Naming

- 二号: `feat/client-frontend-*` / `fix/client-frontend-*`
- 三号: `feat/backend-artist-*` / `fix/backend-artist-*`
- 五号: `fix/bug-*` / `hotfix/bug-*`
- 四号: works on `master` directly (docs only)
- All branches cut from latest `master`; only 一号 merges.
- Commit format: `type(scope): 描述` — 一号 rejects non-conforming messages.

## Shared File Coordination

| File | Rule |
|------|------|
| `web/src/api/index.js` | Each role adds own functions, alphabetical order insert. 一号 coordinates. |
| `web/src/locales/zh-CN.js` / `en.js` | Namespace split: `client.*` → 二号, `artist.*`/`admin.*` → 三号. 一号 coordinates. |
| `web/src/router/index.js` | Client routes → 二号, artist/admin routes → 三号. 一号 coordinates. |
| `web/src/components/shared/**` | Cross-role; 一号 coordinates |
| `web/src/styles/theme.css` | Cross-role (semantic vars + accent system); 一号 coordinates |
| `web/src/components/ThemePicker.vue` | Cross-role; 一号 coordinates |
| `web/src/stores/theme.js` | Cross-role; 一号 coordinates |
| `server/src/app.js` | 三号 only (route registration) |
| `server/src/db/init.js` | 三号 only; migrations = HIGH RISK |

## Hard Rules (project-wide, all roles)

These are non-negotiable coding standards enforced at review:

| Rule | Applies to | Requirement |
|------|-----------|-------------|
| **i18n** | 二号, 五号 (frontend) | All user-visible text via `$t()`/`$tm()`. No hardcoded zh/en. New keys must be bilingual (zh-CN.js + en.js). |
| **XSS** | 二号, 三号, 五号 | All `v-html` must pass through `sanitizeHtml()` (`web/src/utils/sanitize.js`). No exceptions. Backend stores via `escapeHtml()`. |
| **JSON Schema** | 三号, 五号 (backend) | All write routes (POST/PUT/DELETE) must have Fastify JSON Schema with `additionalProperties: false`. No exceptions. |
| **ESLint** | All code roles | `npx eslint .` zero errors zero warnings before commit. No new `eslint-disable` without 一号 approval. |
| **Verification** | 五号 | Backend: `cd server && npx vitest run`. Frontend: `cd web && npx eslint . && npm run build`. Full: both. |

## 一号 Additional Rules

- **信息不足时**: Cannot judge safety / missing context / uncertain contract → ask user or relevant role. Never guess, never pass, never merge.
- **提交规范**: Reject commits not matching `type(scope): 描述`. Require: impact scope, change description, self-test results. Interface/DB changes additionally note compatibility.

## Risk Levels

- **Low**: copy/style tweaks, docs, comments → 一号 checks and merges
- **Medium**: normal bugfix, non-core logic, UI interaction → 一号 verifies compatibility
- **High**: DB migration, payment/order/auth/income logic, batch data, prod config, major dep upgrade → MUST get explicit user confirmation with risk + rollback plan

## 一号 Structured Review Format

Every review/merge/release report uses:

```
【任务理解】 — what was requested
【检查结果】 — what was inspected (branches, files, modules)
【问题列表】 — blocking / important / suggestions
【风险评估】 — low / medium / high
【合并建议】 — can merge / fix-then-merge / cannot merge / needs user confirmation
【发布建议】 — (if applicable) preconditions, rollback plan, monitoring points
```

## Comms File Convention (2026-07-29+)

All inter-role communication goes through `docs/comms/` — verbal/inline summaries are NOT deliverables ("写下来才算交付").

- `docs/comms/STATUS.md` — 一号 maintains; every role reads it BEFORE starting work
- `01-to-02-<topic>-<MMDD>.md` — 一号 → 二号 task dispatch / review results
- `02-to-01-<topic>-<MMDD>.md` — 二号 → 一号 progress / submissions / questions
- Same pattern for other role pairs (`01-to-03-*`, `03-to-01-*`, etc.)
- Single-author principle: only the sender writes their file

## Submission Templates (MANDATORY FORMAT)

Located at `docs/templates/` in the project:
- `submit-client-frontend.md` (二号)
- `submit-backend-artist.md` (三号)
- `submit-requirements.md` (四号)
- `submit-bugfix.md` (五号)

⚠️ **一号 correction (R21 review, 2026-07-30)**: 二号's first R21 submission was flagged as non-compliant — free-form summary instead of the template. 一号 let it pass once but stated "下次必须按模板". The template's full field list (角色/工作分支/任务编号/修改模块/修改内容/涉及文件/是否修改非客户前端文件/接口依赖/自测情况/可能影响/待确认问题/申请) is the minimum; do not paraphrase or skip fields. Copy the template verbatim and fill it in.

## Key Constraints

1. 二号/三号/五号 NEVER push to master directly
2. 二号/三号/五号 NEVER merge code
3. 四号 NEVER modifies code/config/deps/tests/plan-*.md
4. 五号 NEVER expands scope beyond the assigned bug fix
5. Any role discovering out-of-scope work MUST stop and report to 一号
6. High-risk ops require: risk description + impact scope + rollback plan + explicit user OK
7. Merge order: backend first → frontend core components → frontend integration/pages; run full tests after each merge

## Pre-Merge Checklist (enforced by 一号)

Before 一号 merges any feature branch:

1. **Rebase onto latest master** — `git fetch origin && git rebase origin/master`. Branches based on stale master will be rejected (missing security fixes, other roles' changes).
2. **Conflict resolution principle**: both sides preserved. Security fixes (P0) are never dropped; new features are never dropped. When in doubt, ask 一号.
3. **Post-rebase verification**: `npx vitest run` (all tests pass) + `npx eslint .` (zero warnings) on both server and web.
4. **Submission notes** follow the role's template (`docs/templates/submit-*.md`).
5. **Security header / CSP changes require browser verification** — test suites (`app.inject()`) do NOT enforce CSP; only a real browser blocks `new Function()` / inline scripts / eval. After merging any change to `app.js` CSP headers, 一号 must: (a) rebuild container, (b) open `localhost:3000` in a browser, (c) confirm the page renders (not white-screen). The 2026-07-30 incident: `script-src 'self'` without `'unsafe-eval'` passed all 197 tests but white-screened every browser because Vue's runtime compiler uses `new Function()`.

## Out-of-Scope File Touches (越权放行)

When a role's change necessarily touches a file outside their authorization (e.g., 三号 adding error codes to `server/src/shared/errors.js`):
- The change must be **purely additive** (new constants, new mappings) — no modifications to existing entries.
- 一号 reviews and may grant a one-time pass, recorded in the review notes.
- Repeated needs → 一号 adds the file to the role's authorization list for future tasks.
- The submitting role MUST flag the out-of-scope touch in their submission notes.

## 五号 Bug Fix Execution Workflow (proven pipeline)

The full cycle from task book to merge-ready branch, refined over 5+ batches (P0-security, P1, P0-hotfix, R7, R9):

### 1. Worktree Setup
```powershell
cd "D:\Hermes Agent CN Desktop\workspace\artist-commission"
git pull origin master
git worktree add ../artist-commission-bugfix -b fix/bug-<batch> master
cd ../artist-commission-bugfix
cd server && npm install && cd ..
cd web && npm install && cd ..   # only if frontend files in scope
```
Worktree `node_modules` are NOT shared — always `npm install` in the worktree.

### 2. Read ALL Authorized Files First
Batch-read every file in the authorization list before making any changes. This prevents patch conflicts and reveals cross-file dependencies (e.g., schema field names must match service destructuring).

### 3. Batch Independent Patches
Apply all non-dependent file modifications in parallel (one tool call per file). Only serialize when a later patch depends on an earlier one's result.

### 4. Verification Evidence Chain (mandatory, three layers)
| Layer | Command | What it proves |
|-------|---------|----------------|
| Suite | `cd server && npx vitest run` | No regression (114+ tests) |
| Lint | `cd server && npx eslint .` + `cd web && npx eslint .` | Code style, zero warnings |
| Ad-hoc | `hermes-verify-<batch>.mjs` in `%TEMP%` | Each fix item's code structure is present |

The Hermes verification system tracks evidence freshness. After committing, **re-run the full chain** — stale evidence from a prior batch will be flagged even if the current batch passed earlier. The ad-hoc script must:
- Use `hermes-verify-` filename prefix under `C:\Users\<user>\AppData\Local\Temp\`
- Assert each fix item individually with labeled messages (`'H-1a'`, `'P0-3b'`)
- Filter comment lines when asserting removal (`!l.trim().startsWith('//')`)
- Be deleted (`Remove-Item`) after passing
- Be explicitly summarized as "ad-hoc verification, not suite green"

### 5. Commit + Push + Submit
```powershell
git add <only authorized files>
git status --short   # verify no unauthorized files staged
git commit -m "fix(scope): 批次描述 — 逐条编号"
git push origin fix/bug-<batch>
```
Commit message lists every fix ID. Submission notes follow `docs/templates/submit-bugfix.md` (14 fields). Key fields: 修复文件列表, 是否超出最小修复范围, 是否涉及高风险模块, 修复后验证.

### 6. Rebase (when 一号 requests)
```powershell
git fetch origin
git rebase origin/master
# resolve conflicts per 一号's principles (usually: keep master's version for config files)
npx vitest run && npx eslint .   # post-rebase verification
git push origin fix/bug-<batch> --force-with-lease
```

## Multi-Branch Merge Coordination (proven pattern)

When multiple roles submit branches concurrently, 一号 must merge in a strict order and rebase each subsequent branch:

```
1. Merge branch A (e.g., P1 security fixes)
2. Rebase branch B onto new master (e.g., R1+R4 frontend)
3. Verify B's diff only contains B's changes (no phantom reversions)
4. Merge branch B
5. Rebase branch C onto new master (e.g., R3 backend)
6. Merge branch C
```

**Phantom reversion detection**: When a branch is based on stale master, `git diff master..branch` shows ALL differences — including "undoing" changes that were merged after the branch was cut. This looks like the branch is reverting security fixes or other roles' work. **It is almost always a rebase problem, not intentional sabotage.** Before rejecting a branch for "reverting P1 fixes," check: is the branch's base commit older than the P1 merge? If yes, rebase first, then re-examine the diff.

**Post-rebase diff check**: After rebase, `git diff origin/master..HEAD --stat` should show ONLY the branch's own files. If it shows files the branch never touched (e.g., `admin.routes.js` in a Settings.vue-only branch), the rebase failed silently or there's a cherry-pick issue.

**Worktree + stash interaction**: If the main worktree has uncommitted changes (e.g., temporary docker-compose.yml ports opening for user preview), `git rebase` in that worktree will fail with "unstaged changes." Either stash first (`git stash push -m "temp" -- docker-compose.yml`) or do the rebase in the branch's own worktree.

**Remote branch cleanup after merge**: Always `git push origin --delete <branch>` + `git branch -D <local>` + `git worktree remove` after merging. Stale remote branches confuse other agents' `git fetch` and may cause them to rebase onto wrong tips.

## Dependency Upgrade Verification Protocol

When upgrading a dependency by a major version (e.g., @fastify/static 8→10):

1. **Read the changelog for breaking changes** — especially callback signature changes
2. **Run the test suite** — necessary but NOT sufficient (tests may not exercise all code paths)
3. **Rebuild the container and test with real HTTP requests** — `fetch('http://localhost:3000/uploads/images/...')` must return 200 with correct headers
4. **Check container logs** — `docker logs commission-web --tail 30` for runtime TypeErrors
5. **Verify ALL callback/hook signatures** — not just the ones that fail in tests. `setHeaders`, `onRequest`, `preHandler`, `setNotFoundHandler` may all have changed parameter types.

The @fastify/static 8→10 incident: `setHeaders` callback parameter changed from Node `ServerResponse` (`.setHeader()`) to Fastify `Reply` (`.header()`). Tests passed (they use `app.inject()` which doesn't exercise static file serving). All images returned 500 in production. Root cause was only visible in container logs.

## 四号 Document Audit Workflow (proven pattern)

When a release stabilizes (all features merged, tests green), 一号 dispatches 四号 for a full documentation audit:

1. **四号 directly updates** docs in their permission scope: `docs/画师使用说明书.md`, `docs/待修复问题清单.md`, `README.md`, `docs/requirements/**`.
2. **四号 audits but does NOT modify** technical docs: `docs/开发自参考.md`, `docs/维护说明书.md`, `docs/开发→生产切换指南.md`, `docs/changelog.md`, `docs/plan-*.md`, `docs/协作规则.md`.
3. **四号 outputs a structured 技术文档过期清单** — a table per file: `| 文件 | 过期条目 | 当前内容 | 应改为 |`. This goes to 一号.
4. **一号 arranges technical doc updates** — either does them directly or delegates to parallel subagents (proven: 3 subagents for changelog / 开发自参考 / 维护说明书+切换指南, ~2.5 min total). Each subagent gets the specific stale items + instruction to read the full file first + match existing format.
5. **一号 reviews and commits** all doc changes in one batch commit.

Key: 四号's audit checklist items must be verified against actual source code (not assumed). The 过期清单 format makes it trivial for 一号 to delegate without re-reading every file.

## Development Environment Conventions

- **ports 3000 default open**: `docker-compose.yml` keeps `ports: ["3000:3000"]` uncommented during development so the user can browse `http://localhost:3000` at any time. Production deployment comments it out (documented in `docs/开发→生产切换指南.md`). This was explicitly requested by the user ("ports可以在研发时持续开放吗 我好随时体验、指出问题").
- **Container rebuild after merges**: After merging feature branches that touch backend code, rebuild with `docker compose up -d --build web` so the user sees changes immediately.
- **Temporary port changes**: If ports were temporarily commented/uncommented for a specific test, restore the default state and commit the canonical version. Don't leave uncommitted docker-compose.yml changes lingering.

## Authorization Gap Pre-Check (proven pattern)

When a task book says "API already exists" or "backend route exists," the executing role must verify at ALL layers before starting:

1. **Backend route** — does the endpoint exist in `*.routes.js`? (e.g., `DELETE /api/artist/orders/:id/references/:refId`)
2. **Frontend API wrapper** — does `web/src/api/index.js` have the corresponding method? (e.g., `deleteReference: (id, refId) => api.delete(...)`)
3. **Component usage** — does the target component import and call the method?

If layer 2 is missing (common — backend routes are added by 三号 but frontend wrappers are forgotten), the fixer should **stop and request authorization expansion** for `api/index.js` rather than working around it. 一号 grants a one-line pass (the addition is purely additive, matching the existing pattern). This happened with UI-1: 五号 discovered `deleteReference` was missing from `api/index.js`, escalated, got authorization, and completed in one pass.

## Requirements Document Fact-Check (一号 review duty)

When 四号 submits a requirements document that references the status of prior requirements (e.g., "R3 已审核通过，尚未开发"), 一号 must verify against `git log` before accepting. In REQ-003, 四号 wrote "R3 尚未开发" but R3 was already merged (commit `7c08698`). The user's feedback ("手动录单界面功能太烂了") was from a pre-R3 experience. Catching this prevents duplicate work allocation.

Rule: any claim about "not yet implemented" or "pending development" in a requirements doc gets a `git log --oneline --all --grep="<feature>"` check before 一号 approves the document.

**Strengthened discipline (post-R3 incident)**: Code search returning zero matches does NOT prove "never done." Commits can be unreachable from any branch tip after a history rewrite while still existing in the object store. The verification sequence is:
1. `git log --oneline --all --grep="<keyword>"` — searches all refs
2. If zero: `git reflog --all --grep="<keyword>"` — searches reflog (includes lost merges)
3. If found in reflog: `git cat-file -t <sha>` — confirms object survives
4. Only after ALL three return nothing can you conclude "never implemented"

This happened twice in one project: P0+R7 merge disappeared (recovered via cherry-pick), then R3 merge disappeared (recovered via cherry-pick). Both times, `git log --grep` on master returned zero, but `git reflog --all` found the lost commit.

## Master History Rewrite Recovery (proven pattern, occurred 2×)

When master's history is rewritten by an external process (force-push, rebase, or unknown cause), previously merged commits disappear from `git log master` but survive in git's object store. Symptoms: a feature that was merged and tested is suddenly "missing" from the codebase; `git log --grep="<feature>"` returns zero matches on master.

**Recovery procedure:**

```powershell
# 1. Search reflog across ALL refs for the lost commit
git reflog --all --grep="<keyword>" | Select-Object -First 5
# Example output: 8e53a58 HEAD@{25}: merge 3d335a6: Merge made by the 'ort' strategy.

# 2. Verify the commit object still exists
git cat-file -t 3d335a6        # → "commit"
git log --oneline 3d335a6 -1   # → "feat(R3): 快速录单页面补全..."

# 3. Check what it changed
git diff 3d335a6^..3d335a6 --stat

# 4. Cherry-pick (use --no-commit to handle conflicts manually)
git cherry-pick 3d335a6 --no-commit

# 5. Resolve conflicts (usually in shared files like api/index.js, locale files)
#    Principle: keep BOTH sides (the lost feature + everything merged since)

# 6. Commit with provenance note
git commit -m "feat(R3): ...（cherry-pick 恢复，原 commit 3d335a6 因 master 历史重写丢失）"

# 7. Verify: full test suite + build + container rebuild
```

**Conflict resolution during cherry-pick recovery:**
- `api/index.js`: both the lost feature's method AND any methods added since must coexist (alphabetical order)
- Locale files: both the lost feature's keys AND any keys added since must coexist (trailing comma on first entry)
- Route files: the lost feature's endpoint code may need adaptation if surrounding code changed (e.g., a helper function was extracted after the original merge)

**Prevention**: The root cause of the history rewrite is unknown (possibly a force-push by an agent or CI). After recovery, monitor for recurrence. If it happens a third time, investigate `git reflog` timestamps to identify the actor.

**Key diagnostic**: If a role reports "feature X was never implemented" but you have memory of merging it, run `git reflog --all --grep="X"` BEFORE accepting the report. The code may exist in the object store but be unreachable from any branch tip.

## Tainted Branch Extraction (proven pattern, occurred 2×)

When a role's branch contains correct code fixes BUT also unauthorized document changes (deletions, status rollbacks, out-of-scope edits), **do NOT merge the branch**. Instead:

1. **Read the branch diff** to identify which changes are authorized (code) vs unauthorized (docs)
2. **Apply only the authorized code changes** to master manually (via `patch` tool or direct edit)
3. **Verify**: test suite + build + lint
4. **Commit** with a message noting the fix origin (e.g., "五号代码，一号提取入库")
5. **Delete the branch** without merging (`git push origin --delete <branch>`, `git branch -D`, `git worktree remove`)
6. **Inform the role**: "Branch rejected due to unauthorized document changes. Code fix extracted manually. Only modify authorized files in future."

Observed instances:
- ENV-1 branch: correct `mkdirSync` fix + unauthorized R3 status rollback + PROC-1 rollback + REQ-004 deletion
- UI-2 branch: correct QueueBoard CSS fix + unauthorized SPEC-001 (353-line design doc) deletion

**Why not merge and revert the docs?** Because the branch's git history would contain the unauthorized deletion as a legitimate commit, confusing future `git log` and `git blame`. Clean extraction keeps master history honest.

**Escalation**: First occurrence → warn the role. Second occurrence → warn + note in handoff document. Third occurrence → escalate to user.

## End-of-Day Handoff Document (proven pattern)

When the user signals end of work ("今天的工作时间即将结束"), produce `docs/HANDOFF-<date>.md` containing:

1. **Current master**: HEAD sha, test count, build status, container status
2. **Today's completions**: table of commits with descriptions
3. **In-progress (not merged)**: branches with local commits, worktrees still active
4. **Pending (next session)**: prioritized task list with role assignments
5. **Known issues**: history rewrites, role discipline problems, architectural gotchas
6. **Quick recovery commands**: copy-paste block to restore the dev environment
7. **Requirements progress**: full table of all requirements with status

Commit and push the handoff doc. This ensures any session (or person) can resume without re-reading the entire conversation.

## Version-Close Workflow (proven pattern, v0.15)

When all code for a version is merged and the user confirms "没事了", execute this sequence:

### 1. Immediate (same session)
- **STATUS.md** → mark version complete, update HEAD/tests/build/migration state
- **Container rebuild** → `docker compose up -d --build` so user can test
- **README.md** → test count, feature list (add version's features), changelog link version range
- **changelog.md** → add version section (功能/迁移/测试/安全/文档 subsections)
- **REQ status** → flip the version's REQ doc from "待审核" to "已关闭（vX 全部实施，N 测试通过）"
- **soul files** → update migration version reference (e.g., "v1–v14" → "v1–v15") AND add any new discipline rules surfaced by the version's retrospective (e.g., a self-report-verification rule after agents skipped sub-tasks, a task-completeness rule after a role jumped ahead). The retro is the trigger — every incident that needed a workaround should land as a soul rule so the next version starts already guarded.
- **.gitignore** → check for new runtime dirs that appeared during development

### 2. Project-wide audit (3 parallel subagents)
Dispatch simultaneously:
| Agent | Scope | Output |
|-------|-------|--------|
| File audit | comms/ stale files, temp dirs, .gitignore gaps, TODO/FIXME, orphaned tests, root-level junk | Structured table: path / issue / recommendation |
| Code audit | Files >500 lines, duplicated logic (count occurrences), magic numbers, dead CSS, unused exports | Prioritized list: severity / file:line / issue / fix |
| Doc audit | README vs reality, REQ statuses, soul version refs, 待修复清单 open items, changelog gaps | Table: file / current / needed / priority |

### 3. Triage results
- **Fix now** (docs-only, no code risk): README, changelog, REQ status, soul refs, .gitignore
- **Fix after pending branches merge**: comms cleanup (roles may still reference files), 待修复清单 (tonight's fixes not yet merged)
- **Schedule next version**: tech debt (file splitting, constant extraction, utility dedup)

### 4. Comms lifecycle purge
**Per-merge habit ("合入即删")**: delete each dispatch/submission comms file immediately after its branch merges to master — don't accumulate. This keeps `docs/comms/` to ~6 files (STATUS + active references) throughout the version, not 20+. One commit per cleanup batch: `docs: comms清理 — 删除N个已完成文件`.

**Version-close batch**: after ALL roles finish, sweep any remaining completed files. Keep only STATUS.md + still-active reference docs (design reports, planning drafts, audit reports that inform next version). Typical accumulation if per-merge deletion is skipped: 20-30 files per version.

### 5. Tech debt inventory
From the code audit, create a prioritized list in STATUS.md's "next version" section:
- 🔴 HIGH: duplicated logic ×N (extract constant/helper), files >800 lines (split)
- 🟡 MED: repeated patterns ×4-8 (extract utility), magic numbers
- 🟢 LOW: single-use utilities, cosmetic inconsistencies

## Mid-Task Steering: Interrupt vs Wait (proven decision rule)

When new information arrives while a role is mid-execution (e.g., R55 added while 二号 is doing R46+R40+R53):

**Wait (default)** if:
- The new task touches DIFFERENT files than the current task (no merge conflict risk)
- The current task is nearly done or the role has already committed
- The new info is "nice to have" context, not a correction to current work

**Interrupt** if:
- The new info CORRECTS something the role is currently implementing (wrong API, wrong spec)
- The new task touches the SAME files and would create a rebase conflict if done separately
- The role is about to commit something that will need immediate rework

When waiting: queue the instruction in a comms file, deliver it when the role reports completion. The user relays messages to agents — produce ready-to-send copy (话术) that the user can forward verbatim.

**User's triage expectation**: When multiple agents have pending items, the user asks "你判断好了 谁的直接发 谁的要改 我去做" — the lead must make the judgment call (which instructions are ready to send as-is, which need modification) and present a clear decision table, not defer back to the user.

## Incomplete Delivery Detection (review duty)

An agent can submit clean, correct code for task B while **silently skipping task A** from the same dispatch. The submitted code passes all checks (tests, lint, build), the submission report is well-formatted, and the merge looks safe — but half the assigned work is missing. Observed: 三号 dispatched "BUG-3 去重 → R58-7 模板字段" delivered only R58-7; BUG-3's error code (`REFERENCE_DUPLICATE`) was absent from `errors.js` and `order.service.js` was untouched.

**Review checklist addition**: Before merging any branch from a multi-task dispatch, cross-reference the dispatch comms file's task list against the actual `git diff --stat`:

1. Open the dispatch file (e.g., `01-to-03-BUG3去重-0731.md`) — note every task/fix ID listed
2. `git diff master..branch --stat` — verify each dispatched task has corresponding file changes
3. For each task: grep the diff for the expected artifacts (new error codes, new functions, new test cases)
4. If a task is missing: **do not merge yet** — write a re-dispatch comms file (`01-to-03-BUG3补派-0731.md`) referencing the original, and create a fresh worktree+branch for the missing work

**Why the submission report won't catch this**: The agent's self-report describes what they DID do (accurately), not what they skipped. A report saying "R58-7 完成" is truthful even when BUG-3 was never started. The only reliable check is diff-vs-dispatch cross-reference.

**Re-dispatch pattern**: Keep the re-dispatch minimal — reference the original comms file, state which task was missed, provide a fresh branch/worktree. Do NOT re-explain the full task; the original dispatch file is still in the repo.

## Roles Committing Directly to Master (discipline violation, observed 2026-07-31)

A role's worktree shares the repo's object store with the main worktree. If a role runs `git commit` while checked out on `master` (instead of their feature branch), the commit lands **directly on master**, bypassing 一号's review entirely. Observed: 三号 pushed `1f0aee8 docs: 三号技术债清理完成状态更新` straight onto master from the main worktree — a harmless comms-status edit, but the same path could push unreviewed code.

**Detection**: before merging, run `git log --oneline origin/master..master` (or `git log -5 master`) and look for commits you did NOT make. Any author/commit you don't recognize is a role's direct-to-master push.

**Response**:
- If the stray commit is docs/comms-only and harmless: leave it, note the discipline breach to the role.
- If it touches code: treat as unauthorized — review the diff, revert if needed (`git revert <sha>`), and escalate.
- **Prevention in dispatch instructions**: restate "在 worktree 工作，不要碰主 worktree" AND "只能 commit 到你的 feature 分支，禁止在 master 上 commit". The main worktree must stay parked on master with NO role commits on it.

## Worktree Cleanup After Merge (proven sequence)

After merging a role's branch, clean up in this order — getting it wrong leaves dangling worktrees that block branch deletion:

```powershell
# 1. Remove the worktree FIRST (branch deletion fails while a worktree checks out the branch)
git worktree remove --force ../artist-commission-wtNN   # --force needed: test artifacts / untracked files
# 2. Then delete the branch
git branch -d feat/...    # -d refuses unmerged branches; use -D only for genuinely-obsolete ones (e.g. closed ENV-1)
# 3. Verify
git worktree list         # should show only the main worktree on master
```

**Gotchas**:
- `git worktree remove` (without `--force`) fails with "contains modified or untracked files" when the worktree has test output / temp files. Use `--force` for role worktrees you've already merged.
- `git branch -d <branch>` fails with "branch used by worktree at ..." if you delete the branch BEFORE removing its worktree. Always worktree-first.
- A branch merged via `git merge --no-edit` from a stale base may show as "not fully merged" to `-d` if its tip commit isn't an ancestor — verify with `git log --oneline master..<branch>` (empty = fully merged) before reaching for `-D`.
- The main worktree (`artist-commission`) is NEVER removed — it stays on master permanently (一号's workspace).

## Dispatching Idle Roles (utilization pattern)

The user expects 一号 to keep idle roles productive rather than leaving them waiting ("用户关注空闲角色利用率"). When a role finishes and others are still busy:
- **五号 (audit role)**: dispatch read-only audits that don't block anyone — `order.service.js` split analysis, `docs/` staleness audit, pre-existing test-failure root-cause. Output is a comms report, NOT code changes. These feed future dispatches (e.g., the split plan became 三号's next task).
- **四号 (requirements role)**: dispatch next-version planning ONLY after the current version's scope is locked — planning mid-flight produces churn.
- **一号 does the trivial docs cleanup directly** (archive stale docs, purge completed comms) rather than dispatching a role for a 2-minute task — saves a round-trip. Reserve role dispatch for work needing judgment or code.
- Document/quality-check tasks belong to 五号 (audit role), NOT 四号 (requirements role).

## Docker Compose Service vs Container Name (operational pitfall)

In this project the compose **service** is named `web` but the **container** is named `commission-web` (via `container_name:`). `docker compose stop web` works; `docker compose stop commission-web` fails with "no such service". Conversely `docker exec`/`docker logs` take the CONTAINER name (`commission-web`). Rule: `docker compose <cmd> <service>` uses the YAML key; `docker <cmd> <container>` uses `container_name`. When stopping for a DB restore, use `docker compose stop web`.

## Stale Branch List Detection (roles report already-merged work)

A role may report "N branches pending review" when some (or most) were already merged in a prior round. Observed: 三号 listed 5 branches as "待审核", but 4 were already merged to master — only `refactor/v016-order-split` was new. 二号 similarly reported R58 batch2 which was already at `9ab232f`.

**Before reviewing ANY branch, check if it's actually unmerged:**
```powershell
git log --oneline master..<branch>
# Empty output = already merged, skip review
# Non-empty = has new commits, proceed with review
```

**When a role reports multiple branches:**
1. Run `git log --oneline master..<branch>` for EACH branch in the list
2. Separate into "already merged" (empty output) and "genuinely new" (non-empty)
3. Only review the genuinely new ones
4. Tell the role: "X/Y/Z 已在之前合入，只审 A 和 B"

## C-Item Relay Expansion (一号 → 用户 decision format)

When relaying C-items to the user for batch confirmation, the user may respond "除了 X 按建议，其他每一个都展开一下". This means each undecided item needs the FULL expansion format:

```
### C<N>：<question>

**现状**：<what exists now, 1-2 sentences>

**选项**：
- **A. <option>**（四号建议）：<concrete scenario + tradeoff>
- **B. <option>**：<concrete scenario + tradeoff>

你倾向哪个？
```

Rules:
- Each option gets a concrete USER-FACING scenario, not abstract descriptions
- Include a clear recommendation with reasoning
- For items the user says "按建议", one-line confirmation is enough
- For items the user modifies, record the user's version as the decision

**Hybrid proposals from the user**: The user frequently proposes a third option combining elements. When this happens: (1) restate the model back to confirm understanding, (2) identify NEW sub-questions it spawns, (3) dispatch 四号 to write a full SPEC with interactive co-design.

## Next-Version Planning + SPEC Co-Design Cycle (proven pattern, v0.16→v0.17)

When the current version's scope is locked and code is stabilizing, run the planning cycle through 四号 (requirements role):

1. **四号 drafts a candidate backlog** (`04-to-01-vX规划草案.md`): every pending item pulled from the design-research report, STATUS待排期, open REQs, and audit findings. Each item tagged P0/P1/P2 with 涉及端 (frontend/backend/fullstack), 工程量 (S/M/L), 前置依赖. Undecided items listed separately as "用户待确认" (C-items).
2. **一号 reviews + proposes a batched schedule** (第一批小快灵 → 全栈中型 → SPEC-dependent → 画师主页 → 推迟). Present to user for confirmation.
3. **User confirms C-items** — either "按建议" (accept 四号's recommendation) or "展开一下" (each option expanded per the C-Item Relay format). User frequently proposes hybrid third options.
4. **四号 co-designs full SPECs interactively with the user** for complex features (e.g., 名额与缓冲系统, 附加工作项). The user and 四号 talk directly through 2-3 rounds; 四号 writes `docs/specs/SPEC-00N-*.md` with data model, API design, migration, test plan, 工程量 estimate. 一号 reviews the SPEC (not the conversation).
5. **一号 merges migration version numbers** — when two SPECs both need a migration, combine them into ONE migration version (e.g., SPEC-003's new table + SPEC-004's new columns both → v17) to avoid version collisions.

**Key division of labor**: 四号 owns requirements elicitation and SPEC authoring; the user co-designs interactively with 四号; 一号 reviews the finished SPEC and owns scheduling + migration-version arbitration. 一号 does NOT relay design discussions — the user talks to 四号 directly (comms file records the outcome).

## Common Pitfalls in This Pipeline
- **`seed.js` top-level `await import()`**: If adding dynamic imports to a non-async function, ESLint catches it (`Cannot use keyword 'await' outside an async function`). Change `const seed = () =>` to `const seed = async () =>`.
- **Unused variable warnings in tests**: Destructured-but-unused variables (`const { code } = ...`) trigger `no-unused-vars`. Simplify test logic rather than adding eslint-disable.
- **`git add` precision**: Only stage authorized files. `package-lock.json` changes from `npm install` must NOT be staged (they're worktree artifacts).
