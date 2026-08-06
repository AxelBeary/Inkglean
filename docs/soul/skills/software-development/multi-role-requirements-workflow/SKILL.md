---
name: multi-role-requirements-workflow
description: "Execute the 四号/需求整理者 role in 奚怡熊's multi-role collaboration system — structure oral requirements into formal REQ/SPEC docs with testable acceptance criteria, cross-role Q&A, review lifecycle, UX auditing, doc maintenance & REQ archiving. Use when dispatched as 四号 or when the user gives vague/oral requirements."
metadata:
  hermes:
    tags: [requirements, multi-role, collaboration, ux-audit, chinese-workflow, documentation]
    related_skills: [multi-role-bugfix-batch-workflow, feature-design-specs, codebase-audit]
---

# Multi-Role Requirements Workflow (四号/需求整理者 role)

> 四号流程参考（均在 references/）：`grilling-step0-code-first.md`（拷问前摸底）/ `batch-triage-external-proposals.md`（外部建议分桶）/ `doc-maintenance-and-req-archiving.md`（文档派工+changelog/验收清单 2 篇）/ `test-playbook-authoring.md`（执行手册派工：四段式+合入状态核实+过时文档检测+说明书版本同步变体）

奚怡熊 runs a five-role collaboration system (一号主理人 / 二号客户前端 / 三号后端画师 / 四号需求 / 五号Bug修复). Communication happens via `docs/comms/` files (协作规则 §12): each role writes `<NN>-to-01-<topic>-<date>.md` reports, 一号 writes `01-to-<NN>-*.md` instructions, and everyone reads `STATUS.md` at session start. The user should NOT have to relay messages verbally. This skill is for when you are dispatched as **四号 (the requirements organizer)** — receiving oral/vague requirements, verifying against codebase, structuring into formal documents, and managing the review lifecycle.

## Trigger

- User says "四号" or gives requirements to structure
- User describes features orally ("新需求：XXX") expecting formal documentation
- User asks to "深挖需求" or do a UX walkthrough
- User relays review decisions back ("审核通过，C1/C2 已确认")

## Hard rules

1. **Only modify**: `docs/requirements/**`, `docs/tasks/**`, `docs/specs/**`, `docs/acceptance/**`, `docs/待修复问题清单.md`, `README.md`. Never touch code, config, dependencies, or `docs/plan-*.md`.
2. **Verify before writing.** Never write a requirement based on docs alone — read the actual Vue components, services, DB schema, and routes to confirm "现状" claims. Mark verified facts as "（已核实）".
3. **Every 待确认 item must have a recommendation (建议).** This allows batch approval ("按建议执行") without 22 individual decisions.
4. **Acceptance criteria format**: "当……时，应该……" — testable, specific, no ambiguity.
5. **不产屎山** applies to docs too: don't create redundant requirement docs, merge related batches into one document.

## Workflow: New Requirements

### Phase 1: Context Loading

1. Read required docs in order: `docs/协作规则.md` → `docs/画师使用说明书.md` → `docs/开发自参考.md` → `docs/templates/submit-requirements.md`
2. Read `docs/待修复问题清单.md` and `docs/changelog.md` for current state
3. **Verify codebase**: read the actual components/services/DB related to the requirement. Batch independent reads in one turn.

### Phase 2: Structure Requirements

Document structure per requirement item (R-numbered):

```markdown
## R<N>：<title>

### 现状（已核实）
<Evidence from actual code — component names, field types, what exists/missing>

### 需求描述
<What to build, in plain language. Use tables for comparisons.>

### 待确认
- [ ] **C<N>**：<question>（建议：<recommendation>）

### 验收标准
1. 当<condition>时，应该<expected behavior>
```

Document-level sections:
- Header: 文档编号 / 目标版本 / 整理人 / 日期 / 状态 / 需求来源
- 需求总览 table: # / 需求 / 优先级 / 涉及端 / 依赖
- Per-requirement sections (above)
- 技术影响评估: DB migration table / 涉及角色 / 依赖关系与实施顺序 / 前端改动范围速览
- 建议（非需求，供参考）

### Phase 3: Submit for Review

Commit on **master** (四号 works directly on master per 协作规则).

**🔴 提交即转交**：`git push` 之后，**同一轮内**必须写 comms 转交文件（`04-to-01-<topic>-<date>.md`）并再次 commit + push。不等用户问"交给谁"。交付 = 代码提交 + comms 文件，两步一口气做完。

Output a structured 提交说明:

```
【角色】四号：需求整理者
【提交类型】需求文档
【修改文件】<path>（新建/更新）
【是否修改代码】否。
【是否修改配置】否。
【是否修改依赖】否。
【需求摘要】<one paragraph>
【涉及角色】客户（R?）、画师（R?）
【验收标准】共 N 条
【优先级】P1/P2/P3 breakdown
【依赖项】<DB migrations, inter-requirement deps>
【待确认问题】共 N 条（C?-C?），关键项：<list>
【申请】请一号审核...
```

### Phase 4: Post-Review Update

When 一号 relays decisions back:

1. Update header status: `已审核，开发中（一号审核通过 <date>）`
2. Confirmed items: `- [x] **C<N>**：~~original question~~ → **已确认：<decision>**`
3. Accepted recommendations: `- [x] **C<N>**：~~original question~~ → **按建议执行**：<recommendation text>`
4. Update 技术影响评估 to reflect decisions (e.g. migration table gains/loses fields)
5. Update 实施顺序 if decisions changed dependencies
6. Commit with descriptive message listing what was closed

### Phase 4b: Post-Review Incremental Expansion (追加)

Distinct from Phase 4 (closing C-items): 一号 sends a comms file saying "审核通过 + C<N> 用户输入已到 + 补 R<X>/R<Y>。直接在 REQ-NNN 末尾追加即可，不用重新交付。" This means a previously-deferred C-item now has user input that GENERATES new requirements. The workflow:

1. **Read the comms instruction file** (e.g. `01-to-04-req010-review-0730.md`). It contains: review verdict, user's verbatim input, 一号's design judgments (already relayed to user), and explicit scope ("补入 R51/R52, 关闭 C47, 一个 commit").
2. **Verify code for the NEW items** — same discipline as initial planning. The user input is directional ("截稿日与今日待办"), but you must establish ground truth: does the DB have a `deadline` field? (grep → no.) Does the stats API have a "today" dimension? (read service → no, only month.) Record findings as "现状（已核实）" in the new R-sections.
3. **Update the 候选项总览 table**: add rows for new R-items, renumber subsequent rows, remove the closed C-item row (or mark it struck-through). Keep the table as the single index.
4. **Close the resolved C-item** in the "待用户输入项" section: strikethrough title + ✅ + short decision summary + "已拆为 R<X> + R<Y>".
5. **Append full R-sections at the end** of the document (after the existing 建议 section). Each gets: 用户原声 / 一号设计判断（已确认）/ 现状（已核实）/ 需求描述 / 验收标准 / 技术影响 / 待确认(if any) / 工作量.
6. **Update the 技术影响汇总 tables**: add new migration rows, new frontend file entries.
7. **Update or append a 排期建议 section**: if the doc already has one, append an "更新后的排期建议" section (don't silently edit the old one — the delta is informative for reviewers). Place new items into the correct tier based on dependencies.
8. **One commit, no new comms file** (per instruction "不用重新交付"). Commit message: `docs: REQ-NNN 追加 R<X>/R<Y>（<summary>）+ 关闭 C<N>`. Push immediately.

**Key discipline**: the new R-items are FULL requirements (code-verified, with acceptance criteria), not placeholders. The user input + 一号 design judgment together constitute a "已拍板" direction — you're filling in the verified details, not asking for more confirmation. Only genuinely ambiguous implementation questions get a new C-item (e.g. C62: "今日待办口径 — 固定规则 vs 画师自定义?").

## Workflow: UX Walkthrough (体验走查)

When asked to find missing features or体验问题:

1. **Systematically read each page/component** — don't rely on memory, read actual files
2. **Run the test suite and build** as part of the walkthrough (`npx vitest run`, `npm run build`). Code reading misses runtime issues: missing directories (ENV-1: uploads/ not auto-created), stale test counts in docs, build warnings. A 2-minute test run catches things an hour of reading won't.
3. **Apply the "本能级" bar**: would a first-time user know what to do without any instructions? If not, it's a gap.
4. **Categorize findings**:
   - P1: blocks core workflow or causes confusion in daily use
   - P2: noticeable gap, users will ask about it
   - P3: polish, nice-to-have
   - v-future: high engineering cost, defer to next version
5. **"明确不做" section**: for things that seem like they should be done but aren't worth it, state explicitly with reasoning (frequency × cost × perceived value)
6. **Use real-world analogies** in requirement descriptions: "类似快递物流追踪条" > "步骤条组件"

## Workflow: User Feedback Triage (用户反馈研判)

Distinct from a proactive UX walkthrough: the user dumps a batch of **raw experience complaints** (often colloquial, "哇 X 太烂了 什么都没有") and asks you to "研判一下". Your job is to triage, not just transcribe. The user's standing instruction: **用户反馈优先级最高；现实世界隐喻原样保留，不要抽象化；区分 Bug 和 需求**.

1. **Verify each complaint against code FIRST** — read the actual component the complaint targets. Complaints mix true gaps, already-shipped features the user didn't find, and half-finished features. You cannot triage without ground truth.
2. **Answer any embedded direct question prominently.** Raw feedback often contains a literal question ("计算器我们做了吗 怎么没找到啊?"). Answer it explicitly and up front in your reply ("做了，但不在手动录单页——这正是 R3"), BEFORE the structured doc. Don't bury it.
3. **Split every item into Bug vs 需求 vs 已拍板决策 vs 待确认**:
   - **Bug** = existing feature doesn't work / is half-built. Route to 五号, NOT through the requirements process. Record it in `docs/待修复问题清单.md` with a clear **（转五号）** tag, the exact file:line, and the fact that the backend API may already exist (common: API done, frontend button missing).
   - **需求** = new feature / improvement. Gets an R-number and full acceptance criteria.
   - **已拍板决策** = user already decided the direction (e.g. "手动录单合并进订单管理；须知编辑合并进主页设置"). NO C-item needed, NO 建议 needed — the direction is final. Treatment: record the decision verbatim with date, then plan implementation (验收标准 cover "功能不丢失" + "旧路由重定向" + "菜单项变化"). The only open questions are implementation-level (抽屉/弹窗/内嵌? by 二号定), not directional.
   - **待确认** = user asks a question ("有必要加吗？""统一为滑块？"). Gets a C-item with 四号建议. The 建议 should be opinionated and actionable — the user wants to batch-approve ("按建议执行"), not deliberate each item.
   - **Half-and-half items exist** (e.g. "画师不能增减参考图" = missing delete button is a Bug, adding images is a 需求). Split them explicitly in a研判总览 table.
   - **"Can't do X" ≠ "X doesn't exist"**: Before recording "feature missing", check if the UI element EXISTS but is hidden behind an over-restrictive `v-if`. Example: ManualOrder.vue has a price input (`el-input-number`) but gated by `v-if="form.tierId"` — user says "没法输价格" when the real bug is the conditional visibility. This is a Bug (wrong guard), not a 需求 (missing feature). Grep for the feature's component/field name before concluding it's absent.
4. **Note absorption**: if a confirmed Bug will be subsumed by a planned 需求 (e.g. UI-1 delete-button absorbed by R18 图库), say so — and give a fallback ("若 R18 排期较晚，建议五号先做 UI-1 临时补上，30 分钟").
5. **Output a 研判总览 table first**: # / 用户原声(verbatim) / 类型(Bug/需求/半半) / 去向(R-number or 转五号). Keep the user's original wording in a quote column — do NOT sanitize their metaphors into UX jargon.
6. Then write the R-numbered requirement doc as usual (Phase 2/3).
7. **Split a large mixed dump by persona, then consolidate the handoff.** When one feedback dump spans both the client-facing pages (客户主页/下单页) and the artist backend (录单/看板/仪表盘), write TWO requirement docs (e.g. REQ-005 客户侧 / REQ-006 画师侧) rather than one giant doc — they have different implementers (二号 vs 三号), different migration footprints, and different review concerns. But write ONE consolidated handoff comms file (`04-to-01-...`) with a single 待确认 table aggregating every C-item across both docs, so 一号/用户 can batch-approve in one pass instead of hunting through two documents. Number C-items and R-items continuously across the batch (don't restart at 1 per doc) so the consolidated table has no collisions.

## Workflow: Verifying a User-Reported "X fails to load / displays broken" Bug

When the user reports a visual loading failure (image broken, thumbnail 加载失败, asset 404), do NOT record it as a bare symptom. Do layered elimination so the 待修复问题清单 entry names the root cause AND lists what was ruled out — that is what makes it actionable for 五号.

Verify in this order (each step eliminates a layer; batch the independent reads):

1. **Is the service up?** `curl -s -o NUL -w "%{http_code}" http://localhost:3000/` (expect 200). This project runs in Docker — the live DB/uploads are in the container, mapped from project-root `./data` and `./uploads` (NOT `server/data`, which may be a stale local copy missing newer columns).
2. **Read the frontend render code.** Find the `:src` binding. The key discriminator: is the bound URL field `undefined` (never populated) or a real URL that 403/404s?
   - `undefined` URL + a truthy "asset exists" flag (e.g. `v-if="row.focus_image_path"`) ⇒ the API **response-shaping/enrichment layer** never ran. File and signing are probably fine — jump to step 5.
   - Real URL that 403s ⇒ signing/permission layer — continue to step 3.
3. **Does the file physically exist?** Check `uploads/<subdir>/<name>` on disk and the DB row referencing it.
4. **Does signing work when invoked directly?** Generate a signed URL inside the container (`docker exec -w /app/server commission-web node --input-type=module -e "import { signedUrl } from './src/shared/file-sign.js'; console.log(signedUrl('<path>'))"`) then fetch it from BOTH inside and outside the container. 200 ⇒ signing is innocent; the bug is upstream in response shaping.
5. **Compare a sibling endpoint that DOES work.** This project enriches file-path fields with signed URLs at the ROUTES layer (not the service). If the queue board shows the image but the order list doesn't, diff the two handlers — the working one is your oracle. The recurring defect: enrichment references the wrong response key (service returns `{items, total}` but the route maps `result.orders`), so it silently never runs.

Record in 待修复问题清单 with: exact file:line, a root-cause one-liner, a "已验证排除" checklist (✅ signing works / ✅ file exists / ✅ sibling endpoint works), the one-line fix, and blast radius (which pages are and aren't affected). Tag **（转五号）** or **（转三号/五号）**.

**This is a recurring bug CLASS, not a one-off — sweep for siblings.** File-path fields are enriched with signed URLs at the ROUTES layer, and each route does it by hand, so every route that returns a file path is an independent chance to forget. When you find ONE instance (UI-3: order list mapped `result.orders` instead of `result.items`; UI-4: reorder route returned raw service data with no enrichment at all), immediately grep every route that returns that field (`focus_image_path`, `file_path`, `image_path`, `url`) and diff each against the known-good sibling. One session yielded three instances (UI-3/4/5) from one user complaint. Recommend in the 清单 that 五号 do a full sweep + add a regression test, rather than fixing one route and waiting for the next report.

## Workflow: Verifying a "preview/overlay/popup is trapped or misplaced" Bug

Distinct from a load failure: the asset loads fine, but a fullscreen preview, dialog, or popper renders **confined inside a small tile** or in the wrong place. User phrasings: "点作品展示不会全屏放大，而是错误在小图块里又加了个图层显示", "弹窗位置不对，被困在那个框里".

**Root-cause class (memorize this):** Per CSS spec, any ancestor with a non-`none` `transform` — *even an identity transform like `translateY(0)`* — or `filter`, `perspective`, or `will-change: transform` becomes the **containing block for `position: fixed` descendants**. Overlays that expect to fill the viewport (Element Plus `el-image` preview viewer, poppers, fixed dialogs) then get confined to that ancestor's box instead of the screen.

**The recurring trigger in this codebase:** scroll-reveal animations. `.tpl-reveal.tpl-visible { animation: tpl-fade-up ... forwards }` — the `forwards` fill-mode leaves `transform: translateY(0)` *permanently* on every animated element (e.g. each gallery item). So an `el-image` inside it has its fixed-position preview viewer trapped in the ~200px tile. The animation "finishes" but the transform never clears.

**How to confirm:** inspect the trapped overlay's ancestor chain for a computed `transform` / `filter` / `will-change` that isn't `none`. If the overlay's nearest positioned/transformed ancestor is a small tile, that's the containing block.

**Fix directions (cleanest first):**
1. **Teleport the overlay to `<body>`** so it escapes the containing block entirely. `el-image` has a `preview-teleported` prop for exactly this — note the codebase is INCONSISTENT: `OrderList.vue` uses `preview-teleported` but `TplGallery.vue` does NOT. Adding it is usually the one-line fix.
2. Clear the transform after the reveal animation (don't leave `forwards` holding `translateY(0)`), or apply the reveal animation to a wrapper that does NOT host the overlay.
3. Avoid `transform`/`filter` on ancestors of fixed overlays generally.

When triaging as 四号: this is a **Bug (转五号)**, not a 需求 — record in 待修复问题清单 with the exact component, the ancestor carrying the transform, and the `preview-teleported` fix. It often co-occurs with a separate genuine 需求 (e.g. "长图被裁成正方形" = grid `height: 200px` + `fit: cover` is a *layout* 需求, distinct from the trapped-preview Bug) — split them, don't merge.

## Workflow: Verifying a "can't navigate back / stuck / dead-end" Bug

Distinct from load-failures and trapped-overlays: everything renders, but the user gets **stranded** — "点返回会跳到 X，然后回不来了，只能重新登录", "进得去出不来". User phrasings: "无法再返回管理后台", "回不去", "卡住了", "只能重新登录".

**Root-cause class (memorize this):** a one-way edge in the navigation graph. A "返回"/back button routes to a destination whose **layout shell has no menu entry leading back**. The button works as coded — the trap is that the destination is a cul-de-sac. Backends-with-multiple-portals (artist portal + admin portal sharing one login) are the classic breeding ground: a privileged user can cross from portal A into portal B, but portal B's sidebar only lists portal-B items, so there's no edge back to A.

**How to confirm (trace the graph, don't just read the button):**
1. Read the back button's target: `@back="$router.push('/X')"` — where does it actually go? (Note the label may lie: a button titled "返回后台" may push to the *artist* dashboard, not the admin panel — read the code, not the i18n label.)
2. Read the **destination's layout shell** menu registry (e.g. `ArtistLayout.vue` `MENU_ITEMS`). Enumerate every menu edge. Is there ANY edge back to where the user came from?
3. If the destination shell has no return edge → confirmed dead-end. The bug is the missing edge, not the button.
4. Check sibling pages: often the sub-pages' back buttons are correct (point to their own portal root) and only the portal ROOT's back button + the shared shell's missing menu item combine to create the trap. Say so — it scopes the fix.

**Fix directions:** add a conditional menu entry to the shared shell for the privileged role (e.g. `ArtistLayout` shows a "管理后台" item when `store.isAdmin`), AND/OR fix the portal-root back button's target. Usually both. This is a **Bug (转二号, pure frontend)**, ~20 min.

**Triage note:** a dead-end frequently travels with a separate 需求 the user voices in the same breath (e.g. "管理员回不去" + "要不管理员可以隐藏自己的约稿页"). Split them: the dead-end is a Bug; the hide-page ask is a 需求 (see the role-as-entity-row pitfall below).

## Workflow: Consultative Feasibility Analysis (用户问"能不能加X")

Distinct from feedback triage (user complains about something broken) and version planning (一号 hands you a candidate list). Here the user floats a NEW capability as an open question — "是否可以增加一个给指定画师单独定制的主页的功能？" — and wants your JUDGMENT before committing to anything. **Do NOT immediately write a REQ doc.** The user is thinking out loud and needs a sparring partner, not a scribe. Writing a full requirement at this stage is premature and wastes the round.

1. **Disambiguate first — the question usually has 2+ interpretations.** A phrase like "给指定画师单独定制主页" can mean (A) platform hand-builds a bespoke page per artist, OR (B) self-serve deeper customization within the existing template system. These lead to opposite architectures. Lay out the interpretations explicitly and give your read on which the user likely means — but ask, don't assume. The user often confirms one and refines ("兼容专人专页...或者直接一个单独的页面去部署").

2. **Apply the 屎山 test as a first-class criterion.** This user's core bottom line is 不产屎山. For each interpretation, assess: does it scale linearly in maintenance cost? (Per-artist bespoke pages = every platform update must be hand-ported to N custom pages =屎山, reject.) Does it break the multi-tenant "change once, all benefit" property? Frame the recommendation around maintenance/extension cost, not just "is it cool" — that's how this user decides.

3. **Ground the recommendation in existing infrastructure.** Before proposing anything new, grep for what already exists that the feature could lean on. In this session: public APIs (`GET /api/artists/:subdomain`, `/api/public/pricing/:subdomain`), an independent order route (`/artist/:subdomain/order`), and an embed-tab UI placeholder already existed — so a "smart link page" or "embed widget" could be built WITHOUT touching the main codebase. Naming the existing hooks makes the recommendation concrete and low-risk, and reassures the 不产屎山 constraint.

4. **Offer a tiered path, not a binary.** Present the option as graduated forms (light→heavy) with engineering cost + monetization logic per tier, and recommend starting at the lightest tier that proves the value. Real example: 智能链接页 (small, independent project) → 嵌入组件 (medium, embed tab already stubbed) → 全定制主页 (large, = second template engine, defer). The user picks a tier; you don't pre-commit them to the heaviest.

5. **Answer embedded sub-questions directly and honestly.** For feasibility checks ("好加吗？会屎山吗？"), give a straight verdict + the one trap + how to avoid it. For batch difficulty questions ("难度有多大？"×N), use tiered A/B/C with clear recommendation — see `references/grilling-difficulty-patterns.md`.

6. **Only write the REQ doc once the user says "计入"/"做".** Until then you're consulting. When they confirm, THEN structure it: confirmed items get R-sections + 验收标准; explicitly-deferred tiers get a **占位备案** block (name + confirmed core concept + "待未来版本规划展开", NO invented detail — see the placeholder promotion tiers in Version Planning); rejected tiers get a one-line "暂不做 + 原因". Capture the user's tier decisions verbatim ("第二层等后端基本稳定去考虑，第三层有风险暂时pass") so the deferral rationale is on record.

7. **Surface genuinely-open design questions as C-items, but only the ones that block implementation.** Don't pad. In this session only ONE C-item survived (C61: does accent color also affect the artist backend or only the client homepage?) — everything else the user had already decided. A lean C-list signals you understood the decisions; a bloated one signals you weren't listening.

**Tone for this workflow:** decisive and opinionated, not hedging. The user explicitly values being told "I don't recommend A, here's why" over a balanced menu. Lead with your recommendation, back it with the maintenance-cost argument, then list the alternatives fairly. Attach-and-defer is the usual right answer for monetization ideas floated early ("现在思考有点早" — the user agreed).

## Workflow: Version Planning (版本规划 from 候选清单)

When 一号 sends a candidate list for a future version ("v0.13 候选项：签名刷新 / 嵌入白名单 / SRI...") and asks 四号 to "整理", this is distinct from new-requirement structuring — you're turning a rough backlog into a prioritized, verified planning document.

1. **Read ALL input sources in parallel, then cross-reference.** Typical inputs: STATUS.md 待排期 + prior REQ docs with deferred items + 五号审计报告 + 决策记录 comms. Items mentioned in multiple sources get deduplicated (one row, cite the strongest source). Priority assignment heuristic: user explicit statements ("一定要""超级想要") > STATUS 待排期 > REQ deferred P1 > 审计 suggestions. Engineering size (S/M/L) must be grounded in code knowledge (S=pure CSS/few lines, M=new field+API+component, L=new subsystem/design system).

2. **Verify each candidate's code status BEFORE writing.** Don't take the candidate list at face value. For each item, grep/read the codebase to establish ground truth:
   - "SRI/CSRF" → grep `csrf|sri|integrity` across the project. Zero matches = "完全没做" (stronger than "未实现").
   - "模板外链" → check EACH template file individually. May find only 1 of 4 templates has it (R15 only did Classic).
   - "login_codes 迁移" → read schema vs actual migration scripts. Schema may be fixed but migration for existing DBs absent.
   - Record the verification result per item in a table (候选项 / 现状 / 结论).

3. **Absorb deferred items from prior REQ docs.** Check earlier requirement docs for items explicitly tagged "v0.13" or "需技术方案先行" (e.g. REQ-006 R30d). Roll them into the planning doc with a cross-reference ("详细需求见 REQ-006 R30"), don't re-write them.

4. **Document structure and location depend on maturity:**
   - **Draft for 一号 review** → comms file (`docs/comms/04-to-01-vXYZ规划草案-MMDD.md`). Structure: P0/P1/P2 candidate tables (each row: # / 需求 / 来源 / 涉及端 / 工程量 / 前置 / 说明) + 用户待确认项 table + 工艺随手项 + 排期建议. Lighter than a full REQ — no per-item 验收标准 yet, just enough for 一号 to approve scope and priority.
   - **Approved plan** → `docs/requirements/REQ-NNN-vX.YY规划.md` with full per-item sections (问题/需求描述/验收标准/技术方向/风险提示). Only write this after 一号 approves the draft.
   
   Full REQ structure (`docs/requirements/REQ-NNN-vX.YY规划.md`):
   - 候选项总览 table: # / 需求 / 优先级 / 类型(体验/安全/功能/技术债) / 工程量 / 依赖
   - Per-item sections: 问题 (what's wrong now, with code evidence) / 需求描述 / 验收标准 / 技术方向(供X号参考, with 2-3 options + recommendation) / 风险提示
   - **排期建议** section: group into 前期(小快灵,可并行) / 后期(需方案先行) / 延vNext(有硬依赖), with role assignments (二号/三号)
   - 待确认问题汇总: aggregate all C-items, including inherited ones from prior docs

5. **Dependencies determine phasing, not priority alone.** An item may be P1 but blocked by an undecided architectural question (e.g. R36 嵌入白名单 depends on P1-5 子域名方案). Flag these as "延 vNext" with the specific blocker named, rather than forcing them into the current version.

6. **Handoff**: one comms file (`04-to-01-vXYZ-planning-MMDD.md`) with a summary table + 排期建议 + 待确认 list. Keep it short — the detail is in the REQ doc.

7. **Name-only reservations ("X 备案到 vNext")**: The user will sometimes reserve a slot with ONLY a name and no detail ("R38『订单附加工作项』备案到 v0.14 候选"). Do NOT flesh it out with invented requirements — you have no ground truth. Instead make an explicit **placeholder reservation**: add the row to the vNext candidate table AND a short note stating plainly that 需求描述/验收标准/工程量 are all UNDEFINED pending the user's elaboration ("当前仅有名称，待实际操作人补充具体诉求后由四号整理成完整需求"). Assign the next R-number so the slot is reserved and collision-free. Then, in your reply, (a) confirm it's parked, and (b) ask the one clarifying question that would let you flesh it out (offer 2-3 concrete guesses — "额外收费项？子任务清单？修改次数记录？" — so the user can pick fast, but make clear you're NOT asserting any of them). A reserved-but-empty slot is correct; a fabricated requirement is not.

   **Placeholders have promotion tiers — don't jump straight to full.** A name-only reservation often gets elaborated incrementally across later messages. Handle each tier with the matching amount of structure, never more:
   - **Tier 0 — name only** ("R38 备案到 v0.14"): row in candidate table + a note that 需求描述/验收标准/工程量 are all UNDEFINED. (As above.)
   - **Tier 1 — core concept confirmed, detail deferred**: the user later supplies the *essence* but explicitly says detail comes later ("快完稿了客户突然加需求，画师加钱，计入尾款。核心概念明确，细节等 v0.14 规划时再展开"). Promote the note: record the confirmed core concept as a short list of **key attributes** (here: per-order 附加项 / 每项可计价 / 计入尾款+客户可见), then a "**待 vNext 规划展开**" bullet list of the open questions you already know will need answers (录入入口、客户确认流程、与现有增项/报价快照的关系、尾款计算、客户进度页展示). Still NO acceptance criteria, NO invented mechanism — those wait for the planning round. The user's verbatim "核心概念" sentence goes in as a quote.
   - **Tier 2 — full requirement**: only when the user actually asks to build it. Then it gets R-section + 验收标准 like any requirement.
   The discipline: each tier adds exactly the structure the user has earned you, and the "待展开" list at Tier 1 is what makes the eventual planning round fast. Writing acceptance criteria at Tier 1 is fabrication; leaving a Tier-1 concept as a bare Tier-0 name is under-recording.

### Variant: 排期草案 with multiple方案 (schedule options for user to pick)

Distinct from the candidate→prioritized-plan format above. This fires when 一号 says "产出排期草案" and the version has MULTIPLE viable execution orders. The deliverable is `docs/specs/plan-v<NN>-schedule.md` — a schedule document, not a requirements document.

**Structure:**

```markdown
## 1. 候选池（按优先级排序）
Table: # / 项 / 工时 / spec状态(✅完整/❌需设计) / 前置条件 / 备注

## 2. 待用户决策项
Table: # / 问题 / 选项 / 建议 (D-numbered, not C-numbered — scheduling decisions)

## 3. 排期方案 (2-3 options)
### 方案 A：<name>（推荐）
ASCII timeline: 第一批→第二批→第三批
- 总工时 / 风险 / 适合场景
### 方案 B：<name>
...

## 4. vNext 预备案
Table: 项 / 工时 / 状态

## 5. 依赖关系图 (ASCII arrows)

## 6. 需要用户拍板 (D-items table)
```

**Key disciplines:**
- **D-items (scheduling decisions) are numbered separately from C-items (design decisions).** D1-D4 for "画师主页放v0.18还是v0.19", C48-C58 for "柱状图还是折线图". Don't mix numbering sequences.
- **Each方案 has: total工时 + risk + "适合" one-liner.** The user picks by scenario fit ("想稳→A, 想快→B"), not by feature list.
- **User batch-approves D-items even more tersely than C-items** — "嗯，按照你的建议" covers 4 decisions. Recommendations must be opinionated and one-line.
- **Post-confirmation: update status + replace "需要用户拍板" section with "用户已拍板决策" + final排期 ASCII.** Same in-place upgrade pattern as 预研草案→规格.
- **The排期草案 is NOT a REQ doc** — no R-numbers, no 验收标准, no 技术影响评估. It's a scheduling artifact for 一号 to派工 from.

**Judgment call — "先转交还是一起转交":** When the user asks whether to relay 一号's task immediately or wait, the answer is: if the task is fully within 四号's authority (docs only, no code), can be completed in one session, and requires no user decision to START, just do it and hand off once at the end. Don't create unnecessary relay round-trips. Only pause to relay early if you hit a blocker that requires user/一号 input to proceed.

## Workflow: Post-Version Retrospective → soul-file consolidation (复盘)

After a version ships, the user runs a cross-role retrospective (复盘). Each role's agent emits "建议加入系统提示词的内容" — rules learned from that round's incidents. The user then asks 四号 (or whoever is active) to **persist these into the soul files**. This is a 四号-authorized task: soul files live under `docs/soul/soul-NN-<role>.md` (inside `docs/`), so they're in scope.

1. **Locate the soul files**: `docs/soul/soul-01-lead.md` (一号), `soul-02-client-frontend.md` (二号), `soul-03-backend-artist.md` (三号), `soul-04-requirements.md` (四号), `soul-05-bugfix.md` (五号). Read each target file's tail to find the append point (they end with a `## 通信机制` section usually).
2. **Append each role's retrospective rules under a dated heading** at the end of THAT role's file: `## <标题>（<date> <事故> 后新增）`. Keep the rules verbatim from the role's own writeup — don't paraphrase their hard-won lessons. Each rule is a bolded imperative + the incident rationale.
3. **Cross-cutting rules go in EVERY file.** When the user adds a rule that applies to all roles (e.g. "思考和过程必须全中文"), add it to ALL FIVE soul files as a `## 语言硬规则` section near the top (right after the role's intro paragraph), not just one. Verify all five got it.
4. **De-duplicate against existing content.** Soul files already have rules like "代码必须在 git 里" / "禁止 git add -A" / "先读 STATUS.md". The retrospective writeups usually call out what's NOT needed ("不需要加的：已有机制覆盖") — respect that, don't re-add covered rules. Only add the genuinely new ones.
5. **Commit all touched soul files together** with one message: `docs: soul 更新 — 复盘规则入库 + <cross-cutting rule>`. Stage `docs/soul/` explicitly (verify with `git diff --cached --stat` that exactly the soul files are staged — concurrent agents may have other docs pending).
6. **Also produce the user-facing relay output**: a consolidated "给一号的复盘合并输出" block with each role's rules in fenced markdown, ready for the user to copy into each agent's system prompt. The soul files are the durable home; the relay block is for the user's immediate dispatch.

**Soul files are system-prompt source-of-truth, refreshed on /new.** Per project convention (memory: "soul/comms不gitignore" + "soul/刷新后生效"), soul edits take effect when a role's session restarts. So soul edits are how you make a retrospective lesson stick across sessions — more durable than memory, and role-scoped. Treat a retrospective as incomplete until the rules are in the soul files, not just discussed.

## Workflow: Technical Design Spec (SPEC) with Cross-Role Q&A

When 一号 asks for a detailed technical design (not just requirements — actual schema, API contracts, migration plans, security matrices), produce a `docs/specs/SPEC-NNN-*.md`. This goes beyond REQ docs: it specifies HOW, not just WHAT.

### Phase A: Ground the design in code, not assumptions

Before writing any design section, read the actual code it touches:
- The signing/auth mechanism (which paths are public vs signed, where signing happens)
- The upload pipeline (directories, validation, existing endpoints)
- The DB schema (existing columns, migration patterns)
- **Existing endpoints** — the #1 self-correction source. You may design "新增 POST /api/X" when the endpoint already exists and only needs extension. Always grep routes before proposing new ones.
- **Directory naming conventions** — e.g., upload subdirs keyed by artistId vs orderId. If your design assumes an ID that doesn't exist at upload time (e.g., orderId before the record is created), the convention is wrong. Check what IDs are available at each step.

Record self-corrections explicitly in the spec header ("四号自纠：原写X，实际Y，已修正"). This models honesty and prevents reviewers from trusting the wrong version.

### Phase B: Cross-role question loop

When the design hits backend/implementation questions you can't answer from code alone:

1. **Write a structured question doc** (`docs/specs/SPEC-NNN-提问单-致X号.md`): numbered questions grouped by topic (A/B/C...), each with context (exact file:line you verified), your proposed answer or options, and "请确认/请选择". End with a "已核实事实" appendix so the respondent doesn't re-verify what you already confirmed.
2. **Give the user a copy-paste-ready version** in your reply (the user is the relay hub).
3. **When answers come back, VERIFY each one against code before merging** — same discipline as relayed status claims. Cross-role technical answers are hypotheses, not facts:
   - If they cite a line number, read that line (it may be wrong — one respondent cited "line 431" for a function that was actually at line 478).
   - If they claim "X already handles Y", grep for it yourself.
   - If they give an empirical result (e.g., "SQLite DEFAULT fills存量行 with 'client'"), reproduce it with a throwaway script when feasible.
   - If they discover a risk you missed (e.g., GC data-loss), escalate it to a **hard precondition** in the spec, not a footnote.
4. **Merge verified answers into the spec**, tagging each with its source ("三号 Q5 已定", "四号已复现验证"). Update the risk table: mark resolved items ✅, escalate new risks 🔴.
5. **Commit the finalized spec** with a message listing what changed from the draft.

### Phase C: Security/access matrix (for file-handling features)

When the design touches file storage, produce a **签名矩阵** table: every directory × (public? / signing mechanism / which requirement). Plus a **检查清单** the implementer ticks per item. This prevents the recurring "new file-path field returned unsigned → 403" bug class. The matrix must cover:
- Every existing directory (images/, references/, deliverables/)
- Every NEW directory the design introduces
- Every field that returns a file path to the frontend (must be signed at the routes layer, never raw from service)
- **Orphan-file GC collection**: any new file-path column MUST be added to the GC collector, or in-use files get deleted (see `multi-agent-collaboration-setup` references/db-migration-review.md → "File-Path Columns → Orphan-File GC")

## Workflow: Interactive SPEC Co-Design with User (用户交互细化→SPEC)

Distinct from Cross-Role Q&A (四号↔三号 technical questions) and Batch Decision Confirmation (user confirms pre-formed options). This fires when 一号 dispatches 四号 to write a SPEC, but the design has **interaction details only the user can decide** — the user IS the product owner and the questions are about user-facing behavior, not technical implementation. Example: 名额与缓冲系统 — the data model is clear but "递补是自动还是手动？缓冲区客户看到什么？" are product decisions.

### When this fires

- 一号's comms says "和用户交流细化交互细节" + "产出 SPEC-NNN"
- The task has a clear system model but multiple interaction forks that affect UX
- The user's prior input is directional ("画师设 N 单，有缓冲") but not interaction-level specific

### Structure (follow this order strictly)

1. **Read ALL relevant code/docs first** — batch-read the components, DB schema, existing SPECs, and dashboard pages the system will touch. You need ground truth to ask informed questions, not generic ones.

2. **Restate the model back to the user** — "我理解的模型：" followed by a bullet list of the system's core mechanics AS YOU UNDERSTAND THEM from the user's prior input. This serves two purposes: (a) confirms you understood correctly before asking questions on a wrong foundation, (b) gives the user a concrete artifact to correct ("不对，pending 不占名额" → actually they said it does, re-read).

3. **Ask numbered questions, each with a recommendation** — format:
   ```
   **Q1：<one-line question>**
   <2-3 sentences explaining the fork and its consequences>
   - A）<option> — <one-line tradeoff>
   - B）<option> — <one-line tradeoff>
   我建议 A（<reason>），因为<user-value argument>。
   ```
   Rules:
   - Max 5-7 questions per round. More than that overwhelms; fewer means you're under-specifying.
   - Each recommendation must cite a USER VALUE argument (not a technical convenience). "客户最怕交了钱没消息" > "实现更简单".
   - Questions should be INDEPENDENT — the user can answer in any order. If Q3 depends on Q1's answer, say so explicitly.
   - Include at least one question the user probably hasn't thought about (the "edge case" question) — this demonstrates you've thought deeper than the brief. Example: "释放名额 ≠ 自动重开接单" — the user mentioned it in passing but didn't specify the UI behavior.

4. **If the task also includes a simpler decision (like C46 方案选择)**, present it in the SAME reply but as a separate section with 2-3 visual/layout options. Read the actual component code first (Dashboard.vue) and describe what exists NOW so the user can visualize the merge. Each option gets: name / what it looks like / pros / cons / your recommendation.

5. **Wait for ALL answers before writing the SPEC.** Don't write half a SPEC and ask "should I continue?" — the user expects one complete deliverable after the Q&A round.

6. **Write the SPEC** incorporating all answers. Tag each design decision with its source: "用户 Q1 拍板：自动递补" or "按四号建议（用户未反对）". The SPEC structure follows the existing Technical Design Spec workflow (Phase A/B/C).

### Multi-round iteration (not one-shot)

Complex systems (名额与缓冲, 付款模型) need 2-3 rounds of Q&A, not one. The rhythm:

1. **Round 1**: Restate model + ask 5-7 core questions. User answers, often with NEW ideas that improve your proposals (e.g. you offered A/B/C for缓冲区管理, user says "看板给个滑块允许切换到缓冲区怎么样？" — better than all three). Evaluate user proposals on merits; if better, say so and integrate.
2. **Round 2**: Confirm understanding of Round 1 answers + ask follow-up edge cases. The user's answers often UNIFY multiple questions into one principle ("这几个类似问题我们再探讨 看看能不能一个逻辑搞定"). When the user signals unification intent, find the common rule that covers all their scenarios and present it as "两条规则" or "一个模型" — don't keep per-scenario patches.
3. **Round 3 (gap analysis)**: The user will ask "你先看我还有什么遗漏的？" — this is an explicit request for proactive gap analysis. List every edge case they haven't addressed (L1-L6 style: 缓冲期间付不付定金？涨价了按什么价？调大N怎么办？). Each gap gets your recommendation. The user batch-confirms ("按你说的") or modifies.
4. **Only after ALL rounds**: write the SPEC. Don't write half a SPEC between rounds.

**User's "一个逻辑搞定" preference**: When multiple scenarios share structure (名额释放/递补/重开/显示), the user explicitly wants a UNIFIED rule set, not per-scenario handling. Present it as "规则一：X / 规则二：Y" with a scenario-coverage table showing how every case maps to the rules. This is a design philosophy preference — unified > per-case, always.

**User proposes architectural upgrades mid-conversation**: The user may float a better model (e.g. "做成客户已付额度池去计算怎么样？") that supersedes your proposal. Evaluate on merits — if genuinely better, say so plainly ("额度池全面胜出"). But if it's too large for the current version, propose deferral with a concrete plan: "v0.17 用最小改动 X，v0.18 做额度池（SPEC-005 单独设计）". Record the deferred model as a **备案** section in the current SPEC (data model direction + scenario coverage table + migration notes). The user confirms deferral tersely ("可以 往后放") — don't re-argue.

### Updating an existing SPEC (补充, not rewrite)

When user交流 produces new decisions about an ALREADY-WRITTEN SPEC (e.g. SPEC-003 gets three new sections after user交流):

1. **Update the header status line** to note the补充: `待用户确认（2026-07-31 四号与用户交流后补充 §3.5 / §5.5 / §11）`
2. **Add new sections via targeted patches** (§3.5, §5.5, §11), inserted at the logical position (after the related existing section). Don't rewrite the whole SPEC.
3. **New sections follow the same rigor** as the original: scenario tables, code snippets, API contracts, migration notes. Tag each with its source ("2026-07-31 用户拍板").
4. **Cross-reference future work**: if a section defers work to a future version (额度池 → SPEC-005), name the future SPEC number and what it will contain, so the next session can pick it up.
5. **Commit the SPEC update + the comms完成状态 together** in one commit.

### Pitfall: explaining decision options too abstractly

When the user says "能麻烦再解释下吗" about a decision point, they need CONCRETE VISUAL EXAMPLES, not abstract descriptions. Show what each option looks like ON THE ACTUAL SCREEN using ASCII mockups with real data from their project (real order numbers, real client names, real statuses). Bad: "A 是摘要式，显示前几条". Good: a fenced block showing exactly what the画师 sees — order numbers, client names, status tags, deadline dates, the "查看全部 →" link. The user is non-technical and visual; they decide by pointing at a picture, not by parsing a description. Include the user's own domain language in the mockup (逾期标红, 标签区分).

### Pitfall: user's C-item answer is richer than the option letter

When the user confirms a C-item, their answer often contains embedded constraints BEYOND the option description. Example: C51 wasn't just "B 合并式" but "B + 零对照 + 到期自动升序 + 逾期标红 + 标签区分 + 列表随任务伸缩 + 折叠上限做出来再定". These embedded constraints are MORE important than the option letter — they are the user's actual design intent. Capture ALL of them as individual 验收标准 lines. Missing one (e.g. forgetting "逾期标红") means the implementer builds the letter of the decision but not the spirit.

### Pitfall: "做出来不行再说" = explicit v1-defer pattern

When the user says "做出来不行再说" or "需要设个折叠上限？做出来不行再说", this is a deliberate decision: v1 does NOT implement the constraint, but the constraint is acknowledged as a future possibility. Record it as: "v1 不设硬上限，列表随任务伸缩；如果实测单多时过长，再加折叠（如超过 15 条折叠 + '展开全部'）——做出来再定". This is NOT an open C-item — it's a closed decision with a conditional future trigger. Don't re-ask it in the next planning round.

### Pitfall: side-scoped decisions — confirm which side explicitly

A decision may apply to ONLY ONE side of the platform (artist panel vs client frontend). When the user confirms a visual/interaction decision, they often ask to confirm scope ("这个是画师面板的对吧 用户前端不这么设计对吧？"). Always state the scope boundary explicitly in the requirement: "此进度条样式仅限画师面板。客户前端走 SPEC-004 §3 的文字规则，不显示进度条". Without this, implementers naturally apply a decision to both sides (DRY instinct), producing the wrong client-facing behavior.

### Pitfall: user floats an unrelated feature idea mid-decision-session

During a C-item confirmation round, the user will remember related-but-separate ideas ("你提醒我了 画师之前有个别需求一个社恐复制粘贴回复功能 这个我们之后讨论"). Handling: (1) acknowledge in one line, (2) add it to the "不在本规格范围" section as a 占位备案 row (name + "用户占位备案，待后续讨论"), (3) do NOT create a C-item, do NOT expand, do NOT estimate. It's a parking slot, not a requirement. The soul file's 占位备案模式 applies — record the name and the fact it's reserved, nothing more.

### Workflow: 占位备案 → User-Initiated Full Spec (parking slot promotion)

Distinct from Consultative Feasibility (user floats "能不能加X") and Interactive SPEC Co-Design (一号 dispatches SPEC with user interaction). This fires when the user **voluntarily picks up a previously parked feature** and says "开始讨论吧" — no 一号 dispatch, no prior technical grounding. The feature exists only as a name + one-line concept in a prior doc's "不在范围" section.

**Rhythm (typically 2-3 rounds of Q&A, then write):**

1. **Round 1 — direction questions (3-5 questions):** Ask about the core mechanics. Format each as a question with 2-3 concrete options + your recommendation. Example: "话术挂在哪？A 节点编辑里加输入框 / B 独立模板库页面 / C 全局模板。我建议 A，少一个页面。" The user answers tersely, often adding constraints you didn't ask about ("需要允许画师自己做流程模板库" / "要带变量").

2. **Round 2 — detail questions (3-5 questions):** Drill into the constraints the user added. Variables: which ones? Input method? Button behavior? Edge cases? The user's answers here are often very specific and include implementation-level decisions ("点qq直接复制文案并提醒：已复制节点文案，正在唤起qq（等一秒后转到qq协议）").

3. **Round 3 — confirmation + scope check:** Restate all decisions back as a compact table, confirm nothing is missing, then write.

**Key disciplines:**
- **Don't write the spec between rounds.** Wait until ALL questions are answered. The user expects one complete deliverable.
- **Capture user's exact interaction choreography.** When the user specifies a button behavior sequence ("复制 → 提示 → 1秒 → 唤起"), record it as a numbered step list in the spec, not a paraphrase.
- **Default content is minimal.** The user's pattern: "我们默认给个很简单的，画师可以自己去改" — system provides a bare-minimum default (one sentence), user customizes. Record the exact default string.
- **Bug discovery during discussion:** The user will mention potential bugs in passing ("现在的节点和比例功能是不能手动输入具体数值的 不确定是不是bug"). Record these in `docs/待修复问题清单.md` immediately (new file if it doesn't exist), tagged with discovery context. Don't let them get lost in the feature discussion.
- **"拼接不考虑" = explicit scope-out.** When the user rejects a complexity ("拼接这种东西不考虑...真收到反馈再考虑"), record it in "不在本规格范围" with their verbatim reasoning. This prevents future sessions from re-proposing it.
- **Output file naming:** `docs/specs/plan-<feature-slug>.md` (same convention as 预研 drafts). Comms: `04-to-01-<feature>-<date>.md`.

### Batch C-Item Presentation Format (用户说"你整个出来 我一起看")

When the user wants ALL decision points at once (not one-by-one), present in this format:

```markdown
## v<X.YY> <feature>决策点（C<N>~C<M>）

---

### C<N>｜<one-line title>

| 选项 | 说明 |
|------|------|
| A <name> | <one-line description> |
| B <name> | <one-line description> |

**建议 <letter>**。<one-sentence reason tied to user values>.

---
```

Rules:
- Horizontal rule (`---`) between each C-item for visual separation
- Title format: `C<N>｜<title>` (fullwidth pipe for visual weight)
- Options as a table (scannable), not bullet list
- Recommendation is bold + one sentence. Reason cites user values (性能/不重/已熟悉), not technical convenience.
- End with: "11 个都在这了。你可以逐个拍，也可以'全按建议'一句话过，或者挑几个改。" — explicitly offering batch approval.

The user's response patterns: "C48A C49no C50A..." (terse letter picks) OR modifications with embedded constraints. Both are valid — capture the modifications as the authoritative decision, not the original option text.

### Pitfall: questions that are too abstract

Bad: "缓冲区怎么管理？" (too open, user doesn't know what to decide)
Good: "画师后台怎么管缓冲区？A）排期看板加一个'缓冲区'分组 B）订单列表加筛选标签 C）仪表盘加概览卡片。我建议 A，因为画师日常就在看板上操作。"

The user decides BETWEEN concrete options, not in a vacuum. Your job is to make the options concrete enough that picking one feels like pointing at a picture, not writing an essay.

### Pitfall: restating the model wrong

If the user's prior input contains a specific mechanic (e.g. "pending 就占名额"), do NOT soften it in your restatement ("可能需要确认 pending 是否占名额"). Restate it as a fact they said, then ask about the IMPLICATIONS (e.g. "pending 占名额 → 那客户取消订单时名额立即释放还是需要画师确认？"). The user gets frustrated when you re-ask what they already decided.

## Workflow: Feature Pre-Research Draft (预研草案)

Distinct from Version Planning (candidate list → prioritized plan) and External Design Reference Analysis (HTML prototype deep-dive). This fires when 一号 dispatches 四号 during a development lull to **pre-research a future feature area** — producing a draft plan document that combines code audit, user design reference extraction, and C-item generation. The goal: when the feature's turn comes, the design conversation starts from a verified foundation, not from scratch.

### When this fires

- 一号's comms says "预研" + gives direction via already-confirmed C-items (e.g. "C46 已拍板：推 v0.18 / C47 已拍板方向：收入统计 + 快捷操作区 + 最近活动/待办")
- The task is explicitly "v0.17 开发期间你空闲，提前做" — parallel to other roles' active development
- Output is a `docs/specs/plan-<feature>.md` draft (NOT `docs/requirements/REQ-NNN`, NOT `docs/specs/SPEC-NNN`)

### Variant: Fragment Aggregation — see `references/fragment-aggregation-variant.md` (lighter than full预研: keyword sweep across existing docs, not code audit). Includes Phase 2: direct user Q&A → doc upgrade from 预研 to 用户已确认.

### Variant: Acceptance Checklist — see `references/acceptance-checklist-pattern.md` (translating a拍板 spec into developer-facing验收清单: 三态处理, 验证方式, test matrix, 衔接点). Use when 一号 says "整理验收标准".

### Input gathering (batch all independent reads)

1. **Read the dispatch comms** — extract confirmed directions and authorized output files
2. **Read the existing component** being redesigned — full read, not grep
3. **Read the DB schema + relevant services** — what data fields exist, what stats APIs return
4. **Read related SPECs** — integration surfaces
5. **Scan temp/ design references** — filenames ARE user evaluations

### Document structure

```markdown
# v<X.YY> <feature>需求草案

> 编号：plan-<feature>
> 状态：草案，待用户拍板决策点后交一号审核
> 关联：<confirmed C-items> / <related SPECs>
> 前置条件：<what must ship first>

## 0. 现状盘点
<Module-by-module table of what exists NOW, with source (R-number/初版)>
<问题 list: what's missing/wrong>

## 1-N. Per-module sections
Each module gets:
### X.1 现状 (what the backend/frontend already has)
### X.2 需求 (what to build, with options where undecided)
### X.3 验收标准 ("当……时，应该……")

## N+1. 整体布局 (layout options with ASCII diagrams)

## N+2. 用户点评提取 (from temp/ design references)
Table: 用户原声(文件名) / 提取的设计点 / 本草案对应章节
+ 设计原则 list (distilled from user evaluations)

## N+3. 需要用户拍板的决策点
Table: # / 问题 / 选项 / 建议 (C-items numbered continuously from global sequence)

## N+4. 不在本草案范围
Table: 功能 / 原因 (explicitly scope OUT things user mentioned but deferred)

## N+5. 工程量估算（粗估，待三号确认）
Table: 层 / 工作 / 时间

## N+6. 依赖项
Table: 依赖 / 状态 / 说明
```

### Key disciplines

- **C-items numbered continuously** from the global sequence (check STATUS.md or prior REQ docs for the last used number). Never restart at C1.
- **Every C-item has a 建议** — the user batch-approves ("按建议执行"), not deliberates each.
- **设计原则 section is mandatory** — extract from temp/ filenames. Format: numbered list of principles with user's verbatim quote as evidence (e.g. "页面不能太重——用户原声：'感觉这个页面有点重了'"). These principles constrain ALL module designs and prevent future scope creep.
- **"不在范围" section is mandatory** — user evaluations in temp/ will mention features that sound relevant but aren't (e.g. "联系客户功能", "服务自检"). Explicitly listing them with reasons prevents 一号 from accidentally including them.
- **工程量 is 粗估** — label it "待三号确认". Don't pretend precision. Chart library selection, API complexity, etc. are backend decisions.
- **Layout options use ASCII diagrams** — the user is non-technical and visual. A `┌──┬──┐` diagram communicates more than three paragraphs of prose.

### Comms handoff

Concise (`04-to-01-<topic>-<date>.md`):
1. 交付物 path
2. 内容概要 (one paragraph, four bullet points max)
3. C-item decision table (# / 问题 / 建议) — the user reads THIS table to batch-approve
4. 设计原则 (3-5 bullets, extracted from user feedback)
5. 粗估工时 (one line)
6. 申请 (one sentence: "请一号审核草案结构是否完整，C 项清单是否可转交用户拍板")

### Pitfall: confusing 预研 with REQ

A 预研 draft does NOT have: R-numbers, per-item 验收标准 at requirement level, 技术影响评估 with migration tables, or 排期建议. It HAS: per-module 验收标准 (behavioral, for the future implementer), C-item options, and 粗估. Don't over-structure the draft — it's a conversation starter, not a construction blueprint.

### Post-confirmation upgrade (草案 → 规格, in place)

The 预研 draft may be confirmed directly by the user in a 四号↔user decision round (per the soul file's "与用户直接交流" rule — 四号 discusses decision questions with the user directly, no 一号 relay needed). When all C-items are settled, upgrade the document IN PLACE rather than creating a new REQ:

1. **Status line**: "草案，待用户拍板决策点后交一号审核" → "用户已拍板（C48~C58），待一号审核排期"
2. **C-item section renamed**: "需要用户拍板的决策点" → "已拍板决策汇总", each row gets confirmation date + FINAL conclusion (the user's modification overrides your 建议 — record the actual decision, not your recommendation)
3. **验收标准 refined to match decisions**: the user's inline constraints beyond the original option description (e.g. C51 合并式 + "零对照/到期自动升序/逾期标红/标签区分") become specific 验收标准 lines — they are the most precise expression of user intent
4. **工程量 re-estimated**: decisions change scope (one session: 合并列表 sorting logic + 双栏响应式 added 4h, 13h→17h). Update the table and note the delta reason
5. **Comms handoff updated**: from "交付+决策点清单（待拍板）" to "交付（用户已拍板）" with a conclusion table
6. **One commit**, message includes the C-item range and key decisions

The upgraded plan-*.md remains a plan document (still no R-numbers), but is now the authoritative spec for 一号 to 排期. It gets folded into a version REQ only if/when 一号 creates one during 排期.

## Workflow: Developer Acceptance Checklist (验收标准整理 from confirmed spec)

Distinct from 预研草案 (producing a spec) and REQ docs (structuring requirements). This fires when a spec is ALREADY CONFIRMED (all C-items拍板) and 一号 says "整理验收标准/验收清单" — the job is translating design decisions into a developer-facing checklist that answers "怎么算做完了" for each module.

### When this fires

- 一号's comms says "缺一份面向开发者的验收清单" for a confirmed spec
- The spec has all C-items resolved (status: "用户已拍板")
- Output is `docs/specs/plan-v<NN>-<feature>-acceptance.md`

### Input gathering

1. **Read the confirmed spec** (plan-*.md) — extract every module's验收标准 and已拍板决策
2. **Read the existing component code** being redesigned — compare spec's layout diagram against actual code to detect gaps (e.g. spec says "统计卡片 ×3" but code has ×4 → Q-item for一号)
3. **Read related SPECs** for integration surfaces (e.g. SPEC-004 for名额概览卡 data source and jump target)

### Document structure

```markdown
# v<X.YY> <feature>验收标准（开发者清单）

> 关联：<confirmed spec> / <related SPECs>
> 用途：面向二号/三号的验收清单，逐项对照即可判断"做完了没有"

## 0. 总览
Table: 模块 / spec章节 / 后端API / 前端组件 / 依赖
+ 数据刷新策略（全局）
+ 设计原则（from user原声）

## 1-N. Per-module sections
Each module gets:
### X.1 验收条件
Table: # / 当…… / 应该…… / 验证方式
### X.2 三态处理
Table: 状态(加载/空/错误) / 表现
### X.3 数据规格 (if API-backed)

## N+1. 跨模块通用规则
- 模块独立性（一个失败不阻塞其他）
- 加载顺序（布局框架先渲染 → 各模块并行请求）
- 响应式断点
- 国际化
- 性能约束

## N+2. 测试矩阵
Table: 测试类型 / 覆盖范围 / 负责角色

## N+3. 不在本清单范围

## N+4. 待确认问题
Table: # / 问题 / 建议 / 需谁确认
```

### Key disciplines

- **三态处理 is the main value-add over the spec.** The confirmed spec has "当……应该……" criteria but rarely specifies加载态/空状态/错误态 per module. Systematically add these for EVERY module. Patterns: API-backed modules get骨架屏+错误态+重试按钮; static modules (快捷操作) get "不适用"; auxiliary modules (名额卡) get静默降级 on error.
- **Cross-module rules are architectural constraints** that no single module's spec section owns: module independence, parallel loading, responsive breakpoints, i18n, performance (不轮询). Extract these from the spec's设计原则 section and make them explicit testable rules.
- **Spec-vs-code gap detection**: Compare the spec's layout diagram against the actual component code. Discrepancies become Q-items for一号 (e.g. "spec says ×3 cards but code has ×4 — confirm removal" / "spec layout omits R8 default panel entry — confirm keep/remove"). These are NOT C-items (not user design decisions) — they're implementation clarifications for一号.
- **Integration surfaces get explicit衔接点 tables**: When a module depends on another system (SPEC-004), list every touchpoint: data source (reuse which query), field dependency (which migration), jump target (which route must exist), client-side isolation (what NOT to show on client). This prevents the implementer from building a duplicate API or missing a prerequisite.
- **Test matrix assigns responsibility**: Each test type (后端单测/前端手动/集成/回归) gets a responsible role. This lets一号派工 directly from the checklist.
- **Numbering**: Use module-prefixed numbers (1.1, 1.2, 2.1...) not global sequential — developers reference by module.

### Comms handoff

Concise (`04-to-01-<topic>-<date>.md`):
1. 交付物 path
2. 要点 (3-5 bullets: how many验收条件, what三态 covers, integration points, test matrix)
3. 待一号定的问题 (Q-items from spec-vs-code gaps)
4. 需用户确认的问题 (if any — from the related draft, not the acceptance checklist itself)
5. "验收标准可在第二批派工时直接附给二号/三号"

## Workflow: C-Item Lifecycle Management (跨版本待确认项清理)

C-items (待确认问题) accumulate across REQ docs and versions. When STATUS.md says "12 个未关闭 C 项" or a new planning round starts, do a systematic sweep:

1. **Collect all open C-items** from every REQ doc (REQ-005/006/007/008...) + 待修复问题清单. Grep for `- [ ] **C` across `docs/requirements/` and `docs/待修复问题清单.md`.

2. **Close factually-resolved items** — a C-item is closed when:
   - The feature it asked about was implemented (verify via git log / code read, not just doc claims)
   - The user already confirmed it in a prior session (check `[x]` marks + confirmation dates)
   - STATUS.md explicitly says the blocker is resolved (e.g. "P1-5 已关闭")
   - Mark closed items with a table: # / 问题 / 关闭依据 / 验证方式. **Verify before closing** — same discipline as any status claim. `git log --grep` empty ≠ not done (history-rewriting trap).

3. **Group remaining open items by priority for the user**:
   - **高优先级**（影响当前版本实施）: items whose answer changes HOW the current sprint's features are built
   - **可延后**（影响未来版本）: items for deferred features (v0.15+)
   This lets the user batch-confirm the urgent ones and ignore the rest for now.

4. **Number C-items continuously across all docs** — never restart numbering per document. If REQ-007 ended at C51, REQ-008 starts at C52. This prevents collision in the consolidated handoff table.

5. **In the comms handoff**, present C-items as a single consolidated table (not scattered per-REQ-doc), grouped by priority tier, each with 四号建议. The goal: user reads ONE table, marks "同意/不同意/修改" per row, done. Don't make them hunt through 4 documents.

6. **When user batch-confirms**, update ALL source docs (not just the planning doc) — each C-item lives in its origin REQ doc. Mark `[x]` + confirmation date + decision text. This is the "决策变更传播" rule: one confirmation cascades to every file that references the item.

7. **一号 relay to user — batch approval UX**: When 一号 presents C-items to the user for batch confirmation:
   - Group by priority: 🔴 高优先级（影响当前版本实施）first, 🟡 可延后（影响未来版本）second.
   - Each row: # / 问题 / 四号建议 / 你的决定（blank for user to fill）.
   - User response categories to handle: "按建议"（accept）/ "改：X"（modify）/ "不做"（reject）/ "延后思考"（defer to later round）/ "正在问"（consulting others, park）/ "要详细商讨"（needs expansion）/ direct question about feasibility.
   - For **"详细商讨"** items: expand into 2-3 concrete options（方案 A/B/C）with tradeoff analysis and a clear recommendation. Don't just restate the question — the user wants structured analysis to decide from.
   - For **direct feasibility questions** (e.g. "是否可以引入长按删除？会带来问题吗？"): answer with a structured analysis BEFORE continuing the batch. Don't defer. See the mobile-interaction pitfall below.
   - For **misunderstandings** (e.g. user thinks C57 多选下载 and C58 多选删除进入方式 are linked when they're independent): clarify the relationship explicitly, then re-present the affected item for decision.
   - After all decisions collected: update ALL source REQ docs (per step 6), update STATUS.md, write 开工指令 to implementing roles (二号/三号/五号).

## Workflow: STATUS.md-Driven Feedback Intake (输入清单驱动)

The standard intake pattern: 一号 writes a numbered feedback table into STATUS.md ("下轮四号输入清单"), then dispatches 四号 with "读 STATUS.md". This is the session's task list — treat it as authoritative.

1. **Read STATUS.md FIRST** — before anything else. It contains: current master HEAD (verify with `git log --oneline -5`), role status, the feedback table, and the "开工指令".
2. **The feedback table IS the todo list.** Each row has: # / 内容 / 类型. The 类型 column tells you the triage category (需求/待确认/决策/Bug). Use it as the starting classification, but verify against code — the type column is 一号's initial guess, not gospel.
3. **Batch-read all code files referenced by the feedback items** before writing anything. Use parallel subagents (delegate_task) for large file sets — e.g. 3 subagents each reading 4 Vue components. Don't serialize reads when items are independent.
4. **One REQ doc per planning round**, not per feedback item. All 9 items go into `REQ-NNN-vX.YY规划.md` as R-sections. The doc is the single source of truth for that version's requirements.
5. **Restore files you didn't modify.** STATUS.md is 一号-maintained (四号只读). If `git status` shows it modified (e.g. a prior session or subagent touched it), `git checkout -- docs/comms/STATUS.md` before staging your own files. Only stage files you authored this session.

## Workflow: Batch Decision Confirmation with Embedded Design Questions

Distinct from C-Item Lifecycle (sweeping open items) and Consultative Feasibility (open "能不能加X"). This fires when the user confirms MULTIPLE decisions in one message, and one or more contain an embedded design sub-question or difficulty check. Example: "R38-② 先做单方面加 保留一个qq或者其他通知的未来接口（现在先不做）/ C62 固定 / C41 默认永不过期，设置一个可过期功能（顶掉？并存？）（难做吗）"

**Handling sequence:**

1. **Acknowledge confirmed directions immediately** — don't re-ask or re-present what's decided. "收到" per item is enough.
2. **For embedded difficulty/design questions, do a quick code-grounded check** (lighter than full Consultative Feasibility):
   - Grep/read the relevant code (2-3 searches max, batch them)
   - Give a **difficulty verdict**: 小/中/大 + time estimate + what layers are touched (迁移/后端/前端)
   - If there's a **design fork** (e.g. "顶掉 vs 并存", "单条 vs 列表"), present as a comparison table: 方案 / 做法 / 复杂度 / 适合场景. Give a clear recommendation tied to the product's stated positioning (e.g. "小公告"定位 → 顶掉).
   - Ask for the ONE remaining pick. Don't write docs until answered.
3. **"v1 简单 + 预留接口" decision pattern**: The user frequently decides "do the minimal version now, architecturally leave room for X later" (e.g. "先做单方面加，保留通知接口现在不做"). Record this in the requirement as TWO explicit statements: (a) v1 scope (what IS built), (b) future extension point (what is NOT built but must not be architecturally blocked). In 验收标准, only cover v1 behavior. In 技术影响 or 建议, note the extension point ("数据模型预留 notify_channel 字段可能性，v1 不实现"). This prevents implementers from over-engineering OR from painting themselves into a corner.
4. **Wait for ALL sub-questions answered before committing docs.** The user expects "拍完一起落文档" — batch the doc update + commit after the last fork is resolved, not after each individual confirmation.

**"顶掉 vs 并存" is a recurring design fork** in this project (single-item-replace vs list-coexist). When it appears: assess complexity delta (usually 小 vs 中-大), check product positioning (轻量功能 → 顶掉; 系统级功能 → 并存), and recommend accordingly. The user values the positioning argument over the feature-count argument.

**"需要加确认/撤销提示吗?" — destructiveness analysis framework:** The user (or a relayed画师 question) will ask whether a new interaction needs a confirmation dialog or undo toast. Answer with a structured 3-factor check, NOT a gut feeling:
1. **Destructive?** Does the operation permanently delete or lose data? (Replace focus image ≠ delete image — old image stays in gallery. Delete note = destructive.)
2. **Reversible?** Can the user trivially undo by repeating the action? (Drag another image to re-replace = trivially reversible. Delete a note with attached file = hard to reverse.)
3. **Intentional?** Is the gesture deliberate and unambiguous? (Dragging a file onto a specific target = high intent. A single click on a small ✕ = lower intent, easier to misfire.)
**Verdict matrix:** non-destructive + reversible + high-intent → NO confirmation (just a success toast). Destructive OR hard-to-reverse → confirmation (level per C59: single-delete = ElMessageBox popup; batch ≥3 / cancel order = slider). Low-intent + destructive → strongest confirmation. Record the analysis in the requirement doc so the implementer doesn't second-guess it (e.g. "不需要确认弹窗——旧焦点图保留在订单图库中，替换焦点不是破坏性操作").

**User relays third-party (画师) feedback + adds own design sub-question:** Distinct from direct user complaints. The user quotes a画师 request verbatim, then tacks on their OWN design concern ("我的想法是...需要加一个撤销提示吗"). Handling: (a) treat the画师's words as the 需求来源 (quote them in the R-section), (b) answer the user's design question FIRST using the destructiveness framework above — this is a consultative sub-question that must resolve before the requirement is complete, (c) only write the R-section + commit after the design fork is answered. The user's design concern is a decision input, not a separate requirement.

**Confirmation requirements are per-scenario, NOT global — encode the contrast for the implementer:** The same physical gesture (drag an image onto a target to replace it) may need a confirmation dialog in ONE place but not another, depending on destructiveness. Real example from this project: replacing a 看板焦点图 needs NO confirm (old image stays in the order gallery — non-destructive), but replacing a 档位示例图 DOES need confirm + a saved history version (old example image is otherwise lost — destructive). When you document two such sibling interactions, add an explicit **⚠️ 行为差异对比表** to BOTH R-sections (columns: 覆盖确认 / 覆盖后旧图去向 / 页内拖拽) and a one-line warning ("画师对两个场景给了不同指示，不要统一行为"). Implementers naturally want to DRY up two near-identical drop handlers into one shared component — the contrast table is what stops them from accidentally unifying the confirmation behavior. This is the destructiveness framework made visible at the doc level.

**In-app image drag (dragging an existing `<img>` on the page, not a file from the OS):** When a user asks "能不能把页面里的图直接拖到框框上传", the answer is yes with a specific technique worth recording in the requirement's 技术要点: dragging an `<img>` element gives the browser's dataTransfer a **URL** (the image src), NOT a File object. So the handler must branch: if `dataTransfer.files` has an image → normal upload; else read the URL, and **if it belongs to the platform's own `/uploads/` path, skip re-upload entirely** and just set that existing path on the target (one API call, no duplicate file). External-web images can't be fetched (CORS) — ignore or show "仅支持平台内图片". This is a cheap, high-delight feature (drag one tier's example image onto another tier) and reuses the same drop handler as file-drop, so when a drag-upload requirement appears, proactively offer the in-app variant rather than waiting to be asked.

**同图防呆 (same-image drag prevention) — universal rule for ALL drag-upload interactions:** When documenting any drag-to-upload/replace feature, ALWAYS include a "同图防呆" requirement: if the dragged image (identified by its `/uploads/` path) is already the current image at the target location, do NOTHING — no upload, no confirmation dialog, no history write, silent ignore. This prevents accidental "re-drop" from triggering unnecessary operations. Implementation: one early-return comparison in the drop handler (`if (draggedPath === target.currentImagePath) return`). Key edge cases the user will ask about:
- **Same filename, different content**: NOT a problem — the platform uses `nanoid(12)` random filenames at upload time (upload.routes.js), original filenames are discarded. Two files named "abc.jpg" get completely different platform paths.
- **Cross-entity drag (order A's image dragged to order B)**: This is a LEGITIMATE operation (path differs → no防呆 trigger → normal execution). Don't add confirmation for cross-entity drags — the source entity keeps its image, the target just gains one. Only same-target-same-image is the "accidental" case.
- **File drag from OS**: Always a new file (no platform path to compare), so 同图防呆 never triggers — normal upload flow.
Record this as a numbered requirement point AND an acceptance criterion ("当画师拖入的图片就是该位置当前图（同一路径）时，应该不做任何操作（静默忽略）"). Add it to the ⚠️ 行为差异对比表 as a row showing both scenarios share the same防呆 behavior (unlike confirmation behavior which differs).

**Third-party "code quality" observations are tech debt, not requirements — route to 一号/三号, don't write an R-section:** A user or third party may report something with zero user-facing behavior change, e.g. "本项目已经出现了七百行以上的大文件". This is NOT a 需求 (no user can perceive it, no acceptance criterion of the form "当……时应该……" makes sense). Handling: (1) VERIFY with real data — run a line-count sweep over project source, EXCLUDING `node_modules` (a naive `Get-ChildItem -Recurse` drowns you in 35000-line vendor files; filter to `web/src` + `server/src` + `server/tests` and sort descending). Name the actual offenders with line counts (OrderDetail.vue 907, order.service.js 678...). (2) Record it in the **comms handoff as a ⚠️ 技术债提醒 section explicitly tagged "非需求，转一号/三号"** — never as an R-numbered requirement. (3) Add an actionable hook: tie the refactor to upcoming work that already touches the file ("v0.15 的 R40/R46/R51 都改 OrderDetail.vue，结合改动顺手拆分，避免越改越大"). The split itself is a technical DECISION owned by 一号/三号, not 四号 — you surface the evidence and the timing opportunity, you don't prescribe the component decomposition.

**"太丑" / pure aesthetic complaints cannot produce acceptance criteria — create a placeholder R-section with a C-item for direction:** When feedback is "X 太丑" with no specifics, you CANNOT write testable acceptance criteria ("当……时应该……" what?). Handling: (1) Read the component to describe the current state factually (what layout, what framework defaults, what's missing visually). (2) Create an R-section with 现状 + a C-item asking for DIRECTION (not "do you want it pretty?" but concrete dimensions: 布局? 配色? 风格不搭? 像政府网站?). Offer 3-5 possible axes of improvement as bullet options so the user/画师 can point at one. (3) Mark 工作量 as "待定（视方向）" and 验收标准 as "待 C<N> 方向确认后补充". (4) Do NOT invent a design direction yourself — aesthetic preferences are the user's domain. The R-section is a parking slot until direction arrives. This is the Tier-0→Tier-1 placeholder promotion pattern applied to design feedback.

**Second round — direction arrives as a numbered complaint list:** The user typically responds to the C-item with a numbered list of concrete axes (e.g. "① 上个世纪表单感 ② 没有提醒约谁 ③ 价格表无交互 ④ 横向空间浪费"). When this arrives: (1) Verify each axis against code (e.g. "没有提醒约谁" → read OrderForm.vue → confirm zero artist identity info on page). (2) Restructure the R-section into **lettered sub-sections** (58a/58b/58c/58d), one per axis — each gets its own 需求描述 points and its own acceptance criteria. (3) The user's verbatim quotes go into 需求来源 as a multi-line blockquote. (4) Close the C-item with a summary of all axes. (5) Estimate 工作量 per sub-section and sum. (6) If one axis spawns a NEW interaction on a DIFFERENT component (e.g. "价格表无交互" → TplTierGrid.vue needs a "约这个" button), include it in the same R-section but note the additional file in 技术影响. (7) A sub-feature the user mentions but explicitly defers ("详细信息按钮 加入未来清单") gets a one-line note in the C-item closure, NOT a separate R-section — it's a future-list item, not a current requirement.

**Post-confirmation implementation edge-case questions — answer with code evidence, don't create new requirements:** After confirming a feature direction, the user often asks "but what about X?" implementation edge cases (e.g. "如果a用户传了abc.jpg，b也传一个abc.jpg名字一样内容不一样 怎么处理" or "如果画师把订单a的图不小心拖动到b单子上"). These are NOT new requirements — they're confidence checks on the existing design. Handling: (1) Answer immediately with code-grounded evidence (read the upload handler, check filename generation, verify path uniqueness). (2) If the answer is "already handled by existing infrastructure" (e.g. nanoid random filenames make collision impossible), say so plainly with the file:line proof. (3) If the answer reveals a genuine gap, THEN escalate to a requirement point (add to the existing R-section's 需求描述, not a new R-number). (4) Update the R-section's 技术要点 or add a FAQ-style note so the implementer sees the edge case was considered. The user's question style ("我比较笨 有两个问题") is self-deprecating but the questions are sharp — treat them as design review, not hand-holding.

**Explaining a mechanism "怎么实现的" to this non-programmer user — plain-language-first, no condescension:** The user will ask how a requirement you documented would actually be implemented ("那个同图防呆再和我交流下是怎么实现的？"). Per the user profile, they don't code and rely on AI for all technical work, so they want to UNDERSTAND the design they're approving — not to implement it. Handling: (1) Lead with a one-sentence plain-language core ("拖图松手时，先看你拖来的图和目标位置现在的图是不是同一张——是的话什么都不做"). Use real-world framing, not jargon. (2) Use comparison tables for branches (两种拖法 / 两种结果) — tables beat prose for "if A then X, if B then Y". (3) Show a TINY code snippet only as "给二号看的" (for the implementer), clearly labeled as optional detail — the user reads around it, the implementer uses it. Never make the code the main explanation. (4) Anticipate the NEXT edge case they'll worry about and address it (they asked about same-filename collision and cross-order drag right after). (5) Self-deprecation ("我比较笨") is conversational, NOT a signal to oversimplify or talk down — the questions are technically sharp. Answer the real question with full rigor, just in accessible language. This is the "先给人话解释，再补专业术语" user preference applied to design explanation.

**"能不能像 Y 一样做 X" 机制复用可行性问题 — 先查 Y 的机制链路，再评估 X 与 Y 的本质差异:** 用户在决策中途指着现有机制问新页面能否复用（"下单页能和画师约稿页一样有多款画师可以选？"）。处理：(1) 先在代码里查 Y 的机制完整链路（DB 字段 → API 读写 → 选择 UI → 渲染注册表 → 预览参数），逐环节报 file:line，用具体证据回答"能照搬"——用户想知道"路子铺好了没"，不是抽象可行性；(2) 指出 X 与 Y 的本质差异——主页模板是纯展示（加模板=换布局壳），下单页是表单（每模板各写逻辑=屎山），差异决定实施顺序而非能不能做；(3) 给分阶段路径：先做那个必然强制逻辑抽取的功能（分步引导天然要求把表单逻辑抽成 composable），抽完后多模板=加壳，成本骤降；(4) 只问一个小决策点（独立选 vs 跟着主页走），其余自己定。核心公式：**机制复用可行性 = Y 的机制存在性（代码证据）+ X 与 Y 的本质差异（决定实施顺序）**。只答"能做"不指出差异是不负责任；只讲差异不确认机制存在是空谈。

**用户的混合方案可能优于你的二元提案 — 更好就直说:** 你提方案 B（分字段存储），用户说"方案A配个后备怎么样？能识别就自动识别，不能识别就变其他让画师自己点"——同时拿到 A 的省事和 B 的结构化干净。处理：(1) 直接承认"你这个方案比我的好"，不圆场不贬低——用户重视被告知真相，包括"你的方案更好"；(2) 说清为什么更好（只填一个框 + 存的数据仍结构化，两者兼得）；(3) 补充用户没想到的实现细节（平台识别表 bilibili.com→B站、实时"✓ 识别为 B站"反馈、识别失败弹下拉手动选）——用户给方向，你填验证过的细节；(4) 决策记录里把最终方案记为"用户提案"而非你的建议。二元提案（A 或 B）常不完整，用户作为产品负责人常提出兼取两者的第三条路；按 merits 评估，不按是谁的提案评估。

**批量决策的交付物是决策记录，不是 REQ 文档**（`04-to-01-X决策记录-MMDD.md`）：决策已拍板，无需现状核实和验收标准（那是后续 REQ 文档的事）。结构：① 已确认决策表（# / 决策项 / 结论 ✅做/❌不做/⏳推迟 / 备注，用用户原话或一句话概括）；② 新增需求（决策过程中用户提出并成为新方向的问题，如"下单页多模板"）：机制说明 + 关键约束 + 实施顺序表（阶段/内容/负责角色）；③ 任务拆分建议（子任务/内容/角色/前置，供一号排期参考，非强制计划）；④ 结尾"请一号：审核 + 排期 + 分配 X 号任务"。与 REQ 的分工：决策记录记"决定了什么"（快，决策当天落盘），REQ 记"建什么+怎么验收"（排期后写，带验收标准）。不要混写——决策记录里写验收标准是越位，REQ 里只写决策是失职。交付时给用户一句话转达（"去读 docs/comms/04-to-01-X决策记录-MMDD.md"），不输出文件内容——文件在 git 里，一号直接读。

## Workflow: Lightweight Proposal → 一号研判 → User Confirmation Loop

Distinct from Consultative Feasibility (user↔四号 open question) and full SPEC workflow (一号 dispatches detailed design). This fires when the user floats a capability, 四号 writes a **deliberately light proposal** (not a full spec), and 一号 does a technical 研判 before it goes back to the user for confirmation.

### When this fires

- User says "写个文件丢给一号研判下" — explicit request for 一号 technical review, not user-level design discussion
- The feature is small enough for a proposal (≤1 page) but has technical dimensions the user can't judge (Docker accuracy, security checks, runtime requirements)

### Lifecycle

1. **四号 writes lightweight proposal** (`docs/specs/plan-<feature>.md`): need + check items table + interaction sketch + 粗估 + "待一号研判" questions. Status: "提案，待一号研判". Deliberately THINNER than a full spec — no 验收标准, no data model, no API contracts. The point is to give 一号 enough to judge feasibility and priority.
2. **一号 研判** (happens in 一号's session, 四号 not involved): 一号 adjusts check items (adds JWT_SECRET check, adds Node version display, downgrades 磁盘空间 to "参考"), assigns priority tier, picks entry point (admin vs artist), and writes a comms file back (`01-to-04-<topic>-研判+交流-<date>.md`) with structured confirmation points.
3. **四号 receives 一号's confirmation points and discusses with user**: The comms file has numbered questions (入口位置? 展示方式? 磁盘保留? 诊断包? 排期?). 四号 presents them to the user conversationally — NOT as a formal C-item table (these are 一号's technical adjustments, not user design decisions). The user picks quickly ("管理后台加个系统菜单 / B / 仅供参考 / 可以 / 可以安排0.19").
4. **四号 upgrades proposal to full spec IN PLACE**: Status → "用户已拍板，待一号排期". Adds: 验收标准, confirmed check items (with 一号's adjustments integrated), interaction details (折叠展开), data handling notes (不持久化), 工程量 re-estimate. Integrates 一号's technical additions as confirmed items, tagging source ("一号研判新增").
5. **Comms handoff** (`04-to-01-<topic>交付-<date>.md`): conclusion table + 粗估 + "请一号确认规格，排入 v0.XX".

### Key disciplines

- **The proposal is NOT a spec.** Resist the urge to write 验收标准 at proposal stage — 一号 may reject or reshape the feature entirely. The proposal's job is to enable 一号's judgment, not to pre-commit the design.
- **一号's adjustments are authoritative on technical matters.** When 一号 says "磁盘空间降级为参考项（Docker 内容器值不准）" or "新增 JWT_SECRET 检查", these are technical facts the user can't evaluate — integrate them without re-asking the user (just inform: "一号指出 Docker 内磁盘值可能不准，标注'仅供参考'").
- **User confirmation points from 一号 are presented conversationally**, not as a formal C-item batch. They're typically 3-5 quick picks, not design deliberations. The user answers in one terse message.
- **Performance/cost questions from the user get mechanism-level answers** (see pitfall below).

## Workflow: External Design Reference Analysis (外部设计素材深度分析)

Distinct from all other workflows: the user gives you a batch of **AI-generated design prototypes** (HTML files from Claude Artifacts / v0 / 即梦 etc.) with their own evaluations baked into filenames or accompanying notes. Your job: read the actual CSS/HTML code, cross-reference with user evaluations, and produce a structured **"可吸收功能 + 避坑点"** analysis document. This is NOT a REQ doc with acceptance criteria — it's reference analysis that feeds into future REQ docs like R58 (约稿页视觉改版).

### When this fires

- User says "看下这个文件夹" pointing to a directory of HTML design prototypes
- User says "深度分析我文件名的评价，给每个项目筛选有用的功能或者我们需躲开的坑点"
- File naming convention: filenames ARE the user's evaluations (e.g. `这个非常优雅 可圈可点 一个本月档期进度条.html`)

### Analysis method (三轮交叉)

1. **代码层**：Read the first 200 lines of each HTML (CSS variables, layout grid/flex/sticky, animation keyframes, interaction state machines, texture/decoration techniques). Focus on what's technically extractable.
2. **用户评价层**：The filename IS the evaluation. Parse it for: explicit praise ("超级想要", "一定要", "绝佳"), qualified praise ("可以考虑参考", "好评", "还不错"), design questions ("怎么样?", "有必要吗"), and criticisms ("太丑", "有点卡", "功能太少").
3. **可行性层**：For each promising feature, assess: can this map to Vue3 + Element Plus + our existing architecture? Mark as 🔴 (strongly recommend), 🟡 (optional/decoration), or just describe the tradeoff.

### Document structure

```markdown
# 绘约平台 · AI 生成设计原型深度分析

## 一、分析方法
## 二、按页面类型分类分析
   ### 每个原型：用户评价 → ✅可吸收功能表 (功能/代码技术/实施建议) → ⚠️避坑点 → 💡用户嵌入的设计问题
## 三、跨页面共性模式提炼
   ### 🟢 应该统一吸收的设计模式
   ### 🔴 应该避免的设计陷阱
## 四、按用户评价的直接建议排序
   ### 第一优先（"超级想要""一定要"）→ 第二优先（"可以考虑"）→ 第三优先（"未来"）
## 五、用户提出的待讨论问题汇总
## 六、对当前版本相关需求（如 R58）的直接建议
```

### Key analysis dimensions to cover

| 维度 | 检查内容 |
|------|----------|
| **CSS 变量体系** | 是否有完整的 custom properties？accent 色如何定义？暗色/亮色模式？ |
| **布局策略** | grid/flex/sticky 的使用场景，宽屏 vs 移动端的处理 |
| **动画技术** | pulse ring / scroll reveal / Ken Burns / bounce / elastic transitions |
| **纹理/质感** | SVG feTurbulence grain / repeating-linear-gradient 纹理 / mix-blend-mode |
| **交互状态机** | hover/active/selected/disabled 四态的 CSS 过渡 |
| **拖拽相关** | SortableJS ghost/drag 样式，drop mask，handle 设计 |
| **导航模式** | sticky 顶栏滚动变色、rail 侧边导览、分段进度条 |
| **空状态处理** | 有无 placeholder？筛选后留空位是否补位？ |

### Pitfall detection heuristics

- **信息密度过高**：单页超过 5 个独立功能区 → 用户会说"离谱"
- **重装饰轻功能**：大量 SVG 滤镜+多层渐变+同时运行的 CSS 动画 → "有点卡"
- **不相关的社交指标**：回复时间、粉丝数等在约稿平台无意义 → "对我们没有用"
- **动画滥用**：`will-change` 到处使用，`steps()` 动画同时运行 3+ 个 → 移动端性能灾难
- **移动端不可用**：三栏/四栏 grid 在 <768px 无回落方案
- **功能过重**：平台内消息、托管支付、BGM 播放 → "有点重了"

### Output style

- 每个可吸收功能用表格：功能名 / 代码技术 / 实施建议（含优先级标记 🔴🟡）
- 用户原话用 blockquote（`>`）保留，不做抽象化
- 与现有项目架构的兼容性判断必须具体（"可用 Vue transition 组件实现""需要 Element Plus el-image 的 preview-teleported"）
- 结尾汇总所有用户嵌入的设计问题（Q1-Qn），附四号初步分析

### Commit

- 文件名：`REQ-NNN-H5设计原型分析-可吸收功能与避坑点.md`
- 放在 `docs/requirements/`
- 不在文档中写验收标准或 R 编号需求——这是分析报告，不是需求文档

### 后续阶段：决策简报（用户要求"重新写给我看"）

分析报告是写给一号的技术文档（表格、标记、file:line），但用户拍板时需要每个决策点用大白话展开。用户会说"能帮我用详细的话重新写给我看吗"。这是独立交付物，不是报告的重复：

每个决策点按固定结构展开：
1. **现在是什么样**（现状，一两句人话）
2. **X 是什么**（提案的具体体验，用场景描述不用术语）
3. **为什么好 / 代价**（用户评价原话 + 工程量判断，诚实说"推倒重来"还是"几行代码"）
4. **我的建议 + 理由**（有立场，不列菜单让用户选）

> 📎 审计发现处理 + 排期定稿 + 技术债占位模式详见 `references/audit-findings-and-scheduling.md`

纪律：
- 用户已拍板的项不再展开论证，一句话确认即可
- 用户反提的方案（如 QQ 跳转+复制并存）按 merits 评估，更好就直说并补实现细节
- 决策过程中用户冒出的新方向问题（"能像 Y 一样做 X 吗"）走机制复用可行性流程（见 Batch Decision Confirmation 工作流）
- 结尾给决策汇总表（# / 决策 / 结论），标注哪些待用户拍板、哪些已确认
- 全部拍板后才写决策记录 comms 文件（见 Batch Decision Confirmation → 决策记录结构）

---

## Workflow: Rapid-Fire 待命 Session (多轮决策流)

Distinct from a planned batch (STATUS.md-driven intake) or a single feedback dump. This fires when 一号 says "待命，等反馈" and then the user streams decisions/feedback across MANY short messages over a session. Each message may contain: a decision on a prior C-item, a new feedback item, a design sub-question, or a mix. The rhythm is: user speaks → you verify + answer + update docs + commit → user speaks again.

**Handling discipline:**
1. **Each message gets its own verify→answer→update→commit cycle.** Don't batch across user messages — the user expects immediate doc persistence ("口头拍板即时落文档"). A decision confirmed at 14:00 should be committed by 14:02, not held for a 15:00 batch.
2. **Decisions first, questions second, docs third.** When a message contains both confirmations AND new questions (e.g. "C66 好的，C67 只保留两个" + "同图防呆怎么实现的？"), acknowledge the decisions in one line, answer the question with code evidence, THEN update docs. The user's question is a conversation, not a task — answer it conversationally before doing the doc work.
3. **New feedback items arriving mid-stream get the full triage treatment** — don't shortcut just because you're in "update mode". Read the code, classify (Bug/需求/已拍板), write R-section or 待修复清单 entry, update 总览 table, update 排期 table. Each new item is as rigorous as the first.
4. **Comms files accumulate — write one per TOPIC, not per message.** If three messages all concern the same topic (e.g. 档位页: initial feedback → C63/C64/C65 decisions → C66/C67 decisions), they go into the same or sequential comms files by topic, not one file per message. But don't retroactively merge already-committed comms files.
5. **Track your own C-item inventory mentally.** When the user confirms C66 and C67 in one message but C68 is still open in a different R-section, don't accidentally close C68 or forget it exists. The 总览 table's "依赖" column is your tracking mechanism — update it each round.
6. **One-liner acknowledgments for pure status messages.** When 一号 says "审核通过，继续待命" or "R53 纳入批次1", respond with one line ("收到，待命") — no doc update needed, no commit. Save tool calls for actual content changes.

**End-of-session comms inventory:** The user will eventually ask "把我要转交一号的内容输出给我（有几个文件？）". This is a handoff request. Handling: (1) Search `docs/comms/` for all `04-to-01-*` files from today's date. (2) Output a table: # / filename / one-line content summary. (3) Tell the user the ONE sentence to say to 一号: "去 docs/comms/ 读 04-to-01 开头的 N 个文件". (4) Do NOT output file contents — the files are in git, 一号 reads them directly. The user is NOT a relay (hard rule). The inventory table is so the user knows the SCOPE of what was delivered, not to copy-paste content.

## Pitfalls

- **User asks "对性能有影响吗" / "会有垃圾爆炸吗" — answer with mechanism, not reassurance**: This non-programmer user's performance intuition is "more stuff = slower = eventually breaks". When they ask whether a feature has performance cost or data accumulation risk, they need the MECHANISM explained in one sentence each, not a generic "no worries". Pattern: (1) State the execution model ("点一下才跑，不点不跑" / "同一次请求多返回几个字段，前端 CSS 藏起来"). (2) State the data lifecycle ("不存数据库、不写文件、刷新就没了" / "临时生成，下载完服务器不留"). (3) Explicitly negate their specific fear ("没有历史数据 → 不会垃圾爆炸 → 不会产生孤儿文件"). Three short beats, each one sentence. The user then decides instantly ("B"). Don't over-explain — they asked ONE question and want ONE clear answer, not a lecture. But DO answer both sub-questions when they ask two ("对性能有影响吗？老的检测数据会有垃圾爆炸的情况吗？" = two questions, two answers).
- **Wrong branch (two variants)**: Other roles (二号/三号/五号) may have switched the working branch. ALWAYS run `git branch --show-current` before EVERY commit — not just the first one in a session. **Variant A (discovered before commit):** you're on the wrong branch when you go to stage. Fix: `git checkout master` then stage+commit normally. **Variant B (discovered AFTER commit — the sneakier one):** you committed successfully on master earlier in the session, but between that commit and your NEXT commit, another agent switched the branch. Your new commit silently lands on their feature branch (e.g. `feat/backend-artist-v014`). `git push origin master` says "Everything up-to-date" because master didn't advance. **Detection:** the commit message shows `[feat/xxx hash]` instead of `[master hash]`, OR push says up-to-date despite you just committing. **Recovery:** `git checkout master` → `git cherry-pick <hash>` → `git push origin master`. The duplicate commit on the feature branch is harmless (git auto-resolves on merge). Do NOT use `git reset HEAD~1` + stash in this variant — the commit is already on the wrong branch and reset would lose it from that branch too; cherry-pick is the clean fix. **Prevention:** check branch immediately before each `git add`/`git commit` pair, especially in multi-agent sessions where branch switches happen without your knowledge.
- **Unverified "现状"**: Writing "当前没有X" without reading the actual component leads to wrong requirements. Always verify. Example: ThemePicker was already in 4 templates but missing from 2 pages — only discoverable by reading code.
- **Merging batches**: When user gives a second batch of requirements mid-session, merge into the existing doc (update 总览 table, renumber if needed, update 技术影响评估 holistically). Don't create a separate doc for related requirements.
- **Over-specifying design**: 四号 structures requirements, not design specs. For visual/design decisions (C16 模板风格), note the decision and point to 一号's task book for details. Don't duplicate design specs in requirement docs.
- **Stale package-lock.json**: `git stash pop` may surface modified `package-lock.json` from other roles' work. Only `git add` your own files, never stage lock files.
- **Shared workspace, concurrent agents**: Other roles' agents may be editing the same repo simultaneously. Two consequences: (1) the patch tool may warn "file was modified by sibling subagent ... after your last read" — when it fires, re-read the file before writing so you don't clobber their edits; (2) `git status` will show untracked files that belong to OTHER roles (e.g. a `05-to-01-*.md` from 五号, or a stray `data/` dir). NEVER `git add -A` / `git add .` — stage ONLY the specific files you authored this session, by explicit path. Verify with `git diff --cached --stat` before committing that the staged set is exactly your files.
- **Trusting a requirement doc's own status header over git reality**: A doc may say "R3 尚未开发 / 待排期" while R3 was actually merged to master by another role days ago. Before asserting ANY requirement's implementation status, verify against code — never echo a doc's status field as fact. When 一号 relays a correction, fix it everywhere it appears (the prose, the 总览 table, the 技术影响评估, and the 与已有需求关系 table), not just the one line cited.
- **`git log --grep` empty ≠ "never existed" (history-rewriting trap)**: This project rewrites master history (cherry-picks, squash-merges), which DELETES the original merge commits. `git log --oneline --grep="<feature>"` returning nothing does NOT prove a feature was never built — the commit may still be in the object library, just no longer reachable from a branch tip. In one session I concluded "R3 not implemented" AND "v0.11.x not merged" purely from empty grep results; both were wrong — 一号 cherry-picked them back (`3afc28d`, `0fe5391`). **Ground-truth verification order when status is in doubt:** (1) read the actual component/service file — does the code exist in the working tree? This is the strongest signal; (2) `git merge-base --is-ancestor <hash> master` (exit 0 = on master) when you have a candidate hash; (3) check `git log --all` and the remote, not just current branch; (4) only THEN trust grep. The rule: **搜不到 ≠ 没做过** (can't find it ≠ never did it). A clean working-tree read beats any git-history inference.
- **Verify relayed corrections in BOTH directions, and keep a 状态流转记录**: When 一号 relays a fact correction ("R3 已恢复，cherry-pick 为 3afc28d"), don't just apply it — verify it the same way you'd verify your own claim (`git merge-base --is-ancestor 3afc28d master` + re-read the component). Relayed facts are not exempt from the verify-before-writing rule. When a status flips more than once in a session (open → closed → reopened → closed), preserve a short **状态流转记录** block in the doc narrating the flips with commit hashes and the root cause, explicitly tagged "留档为训". This turns a misjudgment into durable institutional memory and lets a future reader trust the final state. It also models honesty — record your own error plainly rather than silently overwriting it.
- **A user design decision overrides your prior 建议 — reconcile it across EVERY doc, not just the cited line**: When the user settles a design question differently from what you recommended (e.g. you wrote R30a "宽屏多列/侧边面板" and the user says "排期看板还是要一行一条"), this is not a one-line edit. The recommendation you overrode may be echoed in the 需求描述, the 验收标准, AND a separate planning doc (REQ-007's 排期 table) that cross-references the requirement. Grep ALL requirement/planning docs for the affected R-number and reconcile every mention — strike the old direction (~~多列~~), state the confirmed one with the user's verbatim phrasing and date, and update the acceptance criterion to encode the constraint as a hard requirement ("卡片应该保持一行一条（不拆多列）"). Keep the original 建议 visible-but-struck rather than silently deleting it, so a future reader sees the decision was deliberate. This generalizes beyond storage: ANY user design correction (layout, mechanism, scope) cascades the same way.
- **Storage-mechanism decisions cascade through the doc**: When 一号 changes WHERE a setting is stored (e.g. C33 "改 localStorage，不走后端"), it's not a one-line edit — it removes a row from the migration table, moves the requirement from "需迁移/v0.12" to "纯前端/v0.11.x", changes the 实施顺序, and may contradict a 建议 entry that assumed the old mechanism. After such a decision, grep the whole doc for the affected requirement ID and reconcile every mention. Flag the deliberate divergence explicitly (e.g. "R20 localStorage vs R8 后端 is intentional, not inconsistency") so a future reader doesn't "fix" it back.
- **Privileged role implemented as an entity row → inherits unwanted public surface**: When a special role (admin, system account) is modeled as just another row in an entity table (e.g. admin = an `artists` row with `subdomain='admin'`), it silently inherits ALL the behaviors of that entity — including ones that make no sense for the role. An admin gets a public commission homepage `/artist/admin` that can't be turned off, because `status` (open/full/break) only gates ordering, not page visibility. When a user reports something odd about a privileged account ("管理员怎么有个约稿页"), check whether it's an entity row before assuming a dedicated admin model. The fix is usually a generic capability on the entity rather than an admin special-case — and frame the 待确认 as "只给该角色 vs 开放给所有实体" (recommend: all entities, since 'temporarily hide my page' is a universal need and avoids role special-casing). **Design preference for this user — reuse existing state machinery before adding a new column:** when the new "mode" maps cleanly onto an existing enum/state field, EXTEND that enum rather than adding a parallel boolean flag. Real example: to hide a page, the user rejected a new `page_visible` column and chose to add a 4th value `hidden` to the existing `artists.status` CHECK constraint (open/full/break/**hidden**) — "直接可以在状态功能里做~多一个隐藏功能". Rationale: zero new field, zero migration-of-a-new-concept, zero learning cost (users already know the status switch), and the mode is naturally mutually-exclusive with the other states. So present BOTH framings (new flag vs extend-enum) and lean toward extend-enum when the semantics are state-like; only use a separate flag when the capability is orthogonal to existing state (e.g. page can be hidden AND status independently tracked). Record as a 需求 (needs CHECK-constraint migration + settings toggle + route guard), not a Bug.
- **Missing referenced artifact → build from what you have, flag the gap, NEVER fabricate**: 一号 will sometimes say "X 已发给你 / 参考二号三号的预研笔记" but the artifact is genuinely absent. Before concluding it's missing, search exhaustively: `docs/`, `temp/`, last-24h-modified files (`Get-ChildItem -Recurse -Filter *.md | Where LastWriteTime -gt (Get-Date).AddHours(-24)`), and `git log` for recent additions. If truly missing: (1) DO NOT invent citations or write as if you read it — a plausible-looking fabricated reference is the worst possible outcome; (2) build the deliverable from the sources you DO have (一号's stated constraints + the requirement doc + your own line-by-line code verification); (3) flag the gap prominently and honestly at the TOP of the deliverable AND in your reply ("预研笔记未找到，本设计基于①拍板约束②REQ-003③代码核实，若找到请告知路径，我核对后补充或修正"). Honesty about a missing input beats a confident fabrication every time. This is the verify-before-writing rule applied to inputs you're *told* exist — being told something exists is not evidence that it does.
- **"只有X" complaints often mean old-system-still-visible, not new-system-broken**: When a feature was implemented incrementally (e.g. R30d added a workflow stage system ALONGSIDE the old fixed-status el-steps), the user's complaint ("状态流转太差，只有制作中") targets the OLD system that still renders for certain orders (old orders, tracking-disabled orders). The new system works fine — the bug is that both systems coexist and the old one is the default/fallback. Before proposing "build a new X", check if a newer mechanism ALREADY EXISTS but only covers a subset of cases. The fix is usually: make the new system the primary display, demote/hide the old one, ensure fallback cases still get useful info. This saves a full rebuild when the real work is a frontend reorganization.
- **Interaction-swap requirements must address touch/mobile**: When a user says "X和Y互换" (e.g. "单击放大，小钩设焦点"), the desktop design is straightforward but mobile has no hover state. Any button that currently appears on hover (悬停) becomes invisible on touch. The requirement MUST include a mobile-accessibility acceptance criterion (e.g. "手机端 ✓ 按钮常驻显示") and a C-item if the approach isn't obvious. Don't let the implementer discover the touch gap during development.
- **"一刷新就没了" / form data loss complaints → two-layer fix pattern**: When a user reports that filling a form and refreshing loses everything, the requirement has two layers: (a) **防误触** (beforeunload warning — 5 lines, zero cost, always do this), (b) **草稿恢复** (sessionStorage/localStorage auto-save + restore on mount — 30-40min). Layer (a) is P0 (prevents the pain), layer (b) is P1 (eliminates it). Key implementation details to specify: isolate drafts by context key (e.g. per-artist subdomain), clear on successful submit, restore already-uploaded file paths (files are on server, only the path list is lost), and don't restore if the form was intentionally submitted. This pattern applies to ANY multi-field form page (order forms, settings pages, manual entry).
- **User proposes a new mobile interaction → structured feasibility analysis**: When the user asks "是否可以引入长按删除？会带来问题吗？", don't just say yes/no. Analyze across 5 dimensions: (1) **浏览器原生冲突** — long-press on images triggers native "save image" menu, needs `-webkit-touch-callout: none` + `contextmenu` prevention, inconsistent across browsers; (2) **与滚动/滑动冲突** — finger dwell time triggers long-press during scroll, needs touch-move threshold (>10px cancels), custom touch handler complexity; (3) **可发现性** — hidden gesture, new users won't discover it, desktop has no equivalent; (4) **与现有交互冲突** — if single-tap = preview, long-press = delete, need custom tap/long-press timer to disambiguate (Element Plus has no native support); (5) **现有模式复用** — check if the goal is already achievable via confirmed patterns (e.g. multi-select mode for batch delete, ✓ button for focus). **Recommendation pattern**: if the proposed interaction adds a NEW gesture concept not used elsewhere in the app, recommend AGAINST and point to the existing pattern that covers the same need. Consistency > cleverness. If the interaction is genuinely needed (no existing pattern covers it), specify the exact implementation guardrails (thresholds, fallbacks, desktop equivalent).

## Verification & reporting

**Pre-commit checklist (MANDATORY before every `git add`/`git commit` pair, not just the first in a session):**
1. `git branch --show-current` → must say `master`. If not: `git checkout master` first.
2. `git status --short` → confirm only your files are modified/untracked. Other roles' files (comms from 五号, stray `data/`) must NOT be staged.
3. Stage by explicit path only (never `git add -A` / `git add .`).
4. `git diff --cached --stat` → verify staged set is exactly your files.

**Post-commit confirmation:**
- `git log --oneline -1` shows your commit on master (check the `[master <hash>]` prefix — if it says `[feat/xxx <hash>]` you committed on the wrong branch, see Pitfalls → Wrong branch Variant B)
- `git branch --show-current` = master
- `git push origin master` advances (if it says "Everything up-to-date" despite you just committing, the commit landed on a different branch)
- File exists at expected path
