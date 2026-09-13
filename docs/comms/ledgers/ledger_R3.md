# ledger_R3 · 第二轮定时开工 · E2E 合规链路批（W8）

> **性质**：R3 施工台账（不写 STATUS，收口由 R4 统一合并回写；E2E 新增用例数由 R4 同步 `accept-baseline.json`）。
> **触发**：2026-09-14 链式（W7 落地批完成后 now+10min 动态创建），独立 Quest，goal 模式自持推进，🟢 全自动施工。
> **依据**：`定时开工计划书-R3-E2E合规链路批-20260913.md` + 总纲第 2 节链式协议 + `ledger_P4.md §9.4`。
> **HEAD 起点**：`de923472`（工作区含 R1 未提交的 `web/src/**` 在途改动，非本会话产物）。不 commit、不 push（待 R4 提交令）。

---

## 一、新建 spec（本批唯一源码产物）

`e2e/tests/e11-compliance.spec.ts` — compliance 主页下架全链路 E2E，**单条 test、全 API 断言**，链路步骤：

1. **取对象 id**：`adminPage.request GET /api/admin/artists` → 按 `subdomain==='alice'` 定位数字 id（takedown/restore 按 `:id` 寻址）。
2. **举报**：`page.request POST /api/public/reports`（匿名客户，`targetType:'artist_home'` + `targetId:aliceId`）→ 断言 `201 {id}`；管理端 `GET /api/admin/reports?status=pending` 反查该举报在列、`target_type==='artist_home'`、`report_ip` 非空字符串（v75 取证，仅管理端可见）。
3. **下架**：`adminPage.request POST /api/admin/artists/{id}/home-takedown {reason}` → 断言 `{success:true}` 且 `already` 未定义。
4. **幂等**：再下架一次 → 断言 `{success:true, already:true}`。
5. **客户侧不可见**：`page.request GET /api/artists/alice` → 断言**最小载荷**（`status==='hidden'`、含 `id`，且**不含** `bio`/`artworks`/`rules`）——结构断言，**与 W7 文案解耦**。
6. **恢复**：`adminPage.request POST /api/admin/artists/{id}/home-restore {reason}` → 断言 `{success:true}`；`GET /api/artists/alice` 断言恢复可见（`status!=='hidden'`、含 `bio`）。
7. **留痕可查**（覆盖 v75「该表此前只写不读」）：`adminPage.request GET /api/admin/admin-actions?action=home_takedown|home_restore&targetType=artist&targetId={id}` → 断言按对象查到行、每行 `admin_ip` 非空 + `created_at` 在。
8. **不重复记账反证**：`home_takedown` 留痕 `total===1`（步骤 3 连续下架两次，第二次 `already` 不写账）。

## 二、前置校验结论（触发时先做）

- **后端四端点在位**：读 `server/src/features/compliance/compliance.routes.ts` 实核 `POST /api/public/reports`、`GET /api/admin/admin-actions`、`POST /api/admin/artists/:id/home-takedown`·`home-restore`、`POST /api/admin/content/artwork/:id/restore` 均已落地（v75/v76，P4 后端批）。✔
- **R1 完成度探测**：`git status` 确认 `web/src/views/admin/ReportManage.vue`·`ArtistManage.vue` 已被 R1 改（工作区脏，W3 已落地）。**但本批刻意只交 API 主链**——计划书 §一.6 的可选 UI 断言（进举报页点「下架主页」键）属加分项、且 UI 断言引入脆弱性与对 R1 前端的隐性依赖，按「API 断言为主、解耦前端批」的定调不做。如后续要补 UI 断言，另批处理。
- **环境就绪**：`global-setup` 起服务于 port 5099、`web/dist` 已由 R1 build 存在（e11 未触发重建）。探活走 fetch/health，无 .NET WPAD 挂死问题（未用 Invoke-WebRequest）。

## 三、口径校正（代码 vs 计划书冲突，以代码为准）

- 计划书 §一.5 写「`targetType=artist_home`」，但 `compliance.service.ts:182/198` 的 `writeAdminAction` 对主页下架/恢复实际落 `target_type='artist'`（以画师为对象）——`admin_actions.target_type` 与 `reports.target_type` **不同名**。e11 留痕查询按代码用 `targetType=artist`。举报侧仍用 `reports.target_type='artist_home'`（正确）。

## 四、门禁数字（主代理亲跑，完整原文）

- **单跑 e11**：`npx playwright test e2e/tests/e11-compliance.spec.ts` → `1 passed (9.4s)`，`EXITCODE=0`。
- **全量 E2E（交付门禁）**：仓库根 `npm run test:e2e` → `Running 14 tests using 1 worker` / **`14 passed (34.6s)`**，`EXITCODE=0`。
- **基线**：E2E 原 **13** → 加 e11（1 条 test）后实测 **14**（勿照抄，已实测核对）。请 R4 同步 `accept-baseline.json`（E2E 13→14）。

## 五、解耦声明

- 客户侧「不可见」断言用**最小载荷结构判定**（`status==='hidden'` + 不含 `bio`/`artworks`/`rules`），**不校验任何主页提示文案字符串** → 与 R2/W7 文案口径（停等中）完全解耦，文案怎么改都不会红本用例。
- 作品下架链（需先造 artworks，seed 不播种）列为计划书 §三的**可选加分**，本批**未做**，只交主页下架链（计划书明确不强求）。

## 六、自检关（全过）

1. `git status --porcelain e2e/` → 仅 `?? e2e/tests/e11-compliance.spec.ts`，未新建/改 fixture、未改 `global-setup.ts`·`token-store.ts`·`totp-util.ts`。✔
2. 禁区零命中：`server/`·`desktop/`·`shared/`·`docs/comms/STATUS.md`·`scripts/accept-baseline.json` 本会话**无任何改动**（`web/src/**` 的 M 为 R1 在途产物，非本会话）。✔
3. e11 复用 `fixtures/auth.ts` 的 `page`（客户）+ `adminPage`（已 step-up），与 E9/E10 同款 API 驱动。✔
4. 幂等断言（`already:true`）+ 不重复记账反证（`total===1`）在位。✔
5. 取证落 gitignored `temp/`（`r3-e11-run1.log`、`r3-e2e-full.log`），不入库。✔

## 七、遗留 / 交 R4

- 本批 **+1 E2E 用例**（13→14），请 R4 同步 `scripts/accept-baseline.json`。
- 可选 UI 断言（举报页下架键）、作品下架链：本批未做，如要补另批处理。
- 未 commit / 未 push，待 R4 提交令。
- ⚠ **链断（须人工续链）**：本会话尝试用 `manage_scheduled_task`（schedule MCP）创建再下一批 R5（now+10min、goalEnabled=true），但当前环境 schedule 服务不可用（`not found MCPHost severName: schedule`，skill 亦回报服务不可用），**R5 未创建 → 链条在 R3→R5 环断开**。R3 本身已完成（E2E 14 全绿 + 本 ledger）。请主会话/用户按 R2 补救方式手工续链：另起会话读 `定时开工计划书-R5-依赖与CI健康批-20260913.md` 施工，或待 schedule 服务恢复后重挂 R5。

## 八、用户改时指令 + 待服务恢复即发参数（2026-09-14）

- **用户改口**：不再走链式 +10min，改为**固定时间**把后两批钉上：R5 → **2026-09-14 01:00**、R4 → **2026-09-14 03:00**（timezone Asia/Shanghai、repeat.frequency=none、goalEnabled=true、kind=agentTurn）。因改固定时刻，R5 的 message 须注明「R4 已由主会话挂在 03:00，完成后不重复创建 R4」。
- **状态**：schedule MCP 服务本会话多次（list/create）均报 `not found MCPHost severName: schedule`，**两条任务未能创建**，待服务恢复由主会话即刻补发（参数已存本节，无需用户再报）。
- **R3 施工对当前态复核**：用户手改 `e11-compliance.spec.ts` 后，主会话重跑 `npm run test:e2e` → **`14 passed`**（EXITCODE=0），合规链门禁仍绿。
