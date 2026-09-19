# Fragment Aggregation (需求碎片汇总 — lighter than full预研)

When 一号 says "整理用户之前提过的相关需求碎片" for a feature that exists only as a one-line placeholder in the排期 (e.g. "画师主页（点赞/瀑布流/公告/看板 UI）"), the input is NOT a code audit + design reference analysis — it's a **keyword sweep across all existing docs**. The feature has no dedicated spec yet; its requirements are scattered as R-sections, C-items, and user quotes across 4-5 different REQ docs.

## Method

1. **Grep all docs for feature keywords** (batch 3-4 searches): feature name ("画师主页"), sub-feature names ("瀑布流", "点赞", "公告", "看板"), English equivalents ("ArtistHome", "waterfall", "like"). Use `file_glob: *.md` to cover requirements/, specs/, comms/, archive/.
2. **For each hit, extract**: user原声 (verbatim quote), source doc + section, current status (已拍板/待确认/未讨论), and any existing验收标准.
3. **Consolidate into a fragment table**: # / 功能 / 来源 / 用户原声 / 已拍板内容 / 待确认 / 状态.
4. **Assess共用 vs 独立**: Read the existing component architecture (e.g. ArtistHome.vue + 4 templates + shared TplGallery/TplTiers) and determine whether each fragment maps to a shared component change or needs an independent new component.
5. **Output**: `docs/specs/plan-v<NN>-<feature>-draft.md` with: fragment table + 功能清单草案(粗估工时) + 共用组件分析 + 待用户确认问题 + 建议优先级.

## Key differences from full预研

- No 现状盘点 module-by-module code audit
- No temp/ design reference analysis
- No ASCII layout diagrams
- No C-item options with recommendations
- The fragments already HAVE C-items in their source docs (C36, C41, C42) — cite them, don't re-create them
- The draft's job is to make the scattered fragments visible in one place and flag what's still undefined

## Most valuable output

The "待用户确认" list — especially when a placeholder term is ambiguous (e.g. Q1: "看板 UI 具体指什么？是 SPEC-004 §3 客户端名额显示（已排期）？还是独立的公开排期展示板？"). This is what unblocks the next planning round.

## Document structure

```markdown
# v<X.YY> <feature>需求草案（预研）

> 状态：预研草案（非正式 spec，待用户讨论后细化）
> 关联：<source REQ docs> / <排期占位>

## 1. 需求碎片汇总（已有记录）
### 1.N <fragment name>
**来源**：<REQ-NNN §X>
**用户原声**：> "..."
**已拍板**：<confirmed items with dates>
**待确认**：<open C-items, cited not re-created>
**状态**：<assessment>

## 2. 功能清单草案 + 粗估工时
Table: # / 功能 / 工时 / 前置 / 备注

## 3. 与现有<page>的关系
### 3.1 现有架构 (component tree)
### 3.2 共用 vs 独立判断
Table: 功能 / 共用组件？ / 说明

## 4. 待用户确认问题
Table: # / 问题 / 背景

## 5. 建议优先级
Table: 优先级 / 功能 / 理由

## 6. 下一步
```

## Real example (v0.19 画师主页)

Fragments found: 点赞(REQ-011 §7, "超级想要"), 瀑布流(REQ-005 R23, C36待确认), 小公告(REQ-006 R29, C41已拍板/C42待确认), 看板UI(排期占位, 含义不明). All mapped to shared components (TplGallery/TplAnnouncement/ArtworkLikeButton). Key blocker: "看板 UI" ambiguity — could be already-scheduled SPEC-004 §3 frontend or a new feature.

---

## Phase 2: User Direct Q&A → Doc Upgrade

When 一号 delegates "用户会直接找你交流 Q1~Q5", the draft enters a confirmation loop that upgrades it from 预研 to 用户已确认.

### Workflow

1. **Present ALL questions at once** (user preference: "你整个出来我一起看"). Each question: background context + options table + your recommendation bolded. End with "你可以逐条回，也可以一起说".
2. **Interpret user shorthand correctly**:
   - "建议都不错" / "你建议都可以" = approve ALL recommendations as stated
   - "A" / "B" / "C" = pick that option
   - "可以" = confirmed, proceed
   - "要不要加一个X？" = NEW requirement emerging mid-conversation
   - "我们已经有什么了" = user wants code-verified status before deciding
3. **Code verification for status questions**: When user asks "what do we already have", grep the actual codebase (not just docs) for existing implementations. Report: backend done? frontend done? which templates? This is 事实验证原则 applied to feature status. Example: slotDisplay was backend-complete but only 1/4 templates rendered it.
4. **New requirement capture**: When user introduces a new feature mid-Q&A (e.g. "要不要加一个留言板？"):
   - Acknowledge the idea positively
   - Immediately present structured detail questions (who/what/where/limits/审核) as a table with recommendations
   - User confirms → write full spec section (acceptance criteria + data model + API design + time estimate) in the same doc update
5. **Immediate doc update + commit**: After all Q&A concludes, rewrite the draft doc in one pass:
   - Add §0 "已拍板决策汇总" table at top (question / conclusion / date)
   - Upgrade each feature section: add验收标准 (numbered "当……应该……"), data model (SQL), API design (method/path/permission table), time estimate breakdown
   - Update status line: "预研草案" → "用户已确认方向，待一号审核排期"
   - Remove resolved "待确认" items, replace with confirmed conclusions
   - Commit + push + write comms转交 file in same session
6. **Comms转交**: Summarize拍板 results + updated功能清单 with new total工时 + flag any scope changes (e.g. "留言板新增 9h，比原估多一倍").

### Document structure (upgraded)

```markdown
# v<X.Y> <feature>需求草案

> 状态：用户已确认方向（Q1~QN 全部拍板），待一号审核排期
> 用户交流记录：<date>，四号与用户N轮交流，全部决策已拍板

## 0. 已拍板决策汇总
Table: # / 问题 / 结论 / 确认日期

## 1~N. <Each feature>
### N.1 来源 + 用户原声
### N.2 交互规则（用户已拍板）— table
### N.3 验收标准 — numbered "当……应该……"
### N.4 数据模型 — SQL block (建议，待三号确认)
### N.5 API 设计 — method/path/permission table (建议，待三号确认)
### N.6 粗估工时 — per-layer breakdown

## N+1. 功能清单总览
Table: # / 功能 / 工时 / 优先级 / 状态

## N+2. 与现有架构的关系
Component tree + new shared components table

## N+3. 待三号/二号确认
Table: # / 问题 / 需谁确认

## N+4. 下一步
```

### Pitfalls

- **Don't re-ask what's already confirmed**: If user said "建议都不错", don't come back with "确认一下Q2a是A对吗？" — just record it as confirmed.
- **Scope change flagging**: When a new requirement adds significant工时 (e.g. 留言板 9h doubled the estimate), explicitly flag this in comms so 一号 can adjust排期. Don't bury it.
- **"归入已有" vs "新增"**: When a question resolves to "this is already covered by existing work" (e.g. 看板UI = SPEC-004 收尾), explicitly strike it from the new feature list and note where it belongs. Don't leave it as a zombie line item.
- **Data model/API are suggestions**: Always mark "建议，待三号确认" — 四号 proposes, 三号 disposes. Never present these as final technical decisions.
