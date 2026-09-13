# ledger_R1 · 第二轮定时开工 · web 前端配套批（W1~W6）

> **性质**：R1 施工台账（不写 STATUS，收口由 R4 统一合并回写；本批新增用例数由 R4 同步 `accept-baseline.json`）。
> **触发**：2026-09-13 22:01 schedule 独立 Quest，🟢 全自动施工。
> **依据**：`定时开工计划书-R1-web前端配套批-20260913.md` + `落地契约-P4-v75v76-20260913.md` + `ledger_P4.md §9.5`。
> **HEAD 起点**：`de923472`（工作区干净后开工）。不 commit、不 push（待 R4 提交令）。

---

## 一、改了哪些文件（W1~W6 逐项）

**新建（2）**
- `web/src/views/admin/AdminActions.vue` — W1 处置留痕页（时间/来源IP/动作/对象/原因 + 动作·对象类型·条数筛选）
- `web/src/views/admin/__tests__/AdminActions.test.ts` — W1 页单测（3 例）

**API 层（5）**
- `web/src/api/modules/compliance.ts` — 新增 `getAdminActions` / `homeTakedown` / `homeRestore` / `restoreArtwork`（**barrel 未改**，`api/index.ts`·`api/types.ts` 一字未动）
- `web/src/api/types/compliance.ts` — `ReportItem` 补 `report_ip?`；新增 `HomeTakedownResult` / `HomeRestoreResult` / `AdminActionItem` / `AdminActionsResult`
- `web/src/api/types/admin.ts` — `AdminArtistItem` 补 `home_takedown_at` / `home_takedown_reason`
- `web/src/api/types/artist.ts` — `ArtistProfileResult` 补 `home_takedown: { at; reason } | null`
- `web/src/api/types/artwork.ts` — `Artwork` 补 `takedown_at?` / `takedown_reason?`

**组件（5，含路由/导航）**
- `web/src/views/admin/ReportManage.vue` — W2 来源 IP 列（容空 `—`）+ W3 `artist_home` 行并列「下架/恢复主页」双键（含 step-up）
- `web/src/views/admin/ArtistManage.vue` — W3 操作列「下架/恢复主页」双键 + 名称列「主页已下架」标签（含 step-up）
- `web/src/views/admin/ArtistDetailDrawer.vue` — W5 作品 tab 已下架徽标（悬浮看原因）+ 恢复键
- `web/src/views/artist/ArtworkManage.vue` — W5 画师端只读「已下架」徽标（主图卡 + 网格卡，恢复由管理员，画师端不可自恢复）
- `web/src/components/ArtistLayout.vue` — W4 画师后台主页被下架横幅（读 `profile.home_takedown`）
- `web/src/router/index.ts` — W1 路由 `/admin/admin-actions`
- `web/src/components/admin/AdminLayout.vue` — W1 导航项（ops 组，Document 图标）

**测试（4，含 honesty）**
- `web/src/views/admin/__tests__/ArtistManage.ban.test.ts` — 扩 mock `homeTakedown`/`homeRestore` + 3 例（下架/恢复/step-up）
- `web/src/views/admin/__tests__/ReportManage.stepup.test.ts` — 扩 mock `homeTakedown` + IP 渲染断言 + 下架键用例
- `web/src/views/admin/__tests__/ArtistDetailDrawer.test.ts` — 扩 mock `complianceApi.restoreArtwork` + 恢复链路 2 例
- `web/src/locales/__tests__/honestyCopy.p1-0912.test.ts` — W6 隐私日期断言 `2026-09-12`→`2026-09-13`（中英各一，见 §五）

**locale（2，单写者＝本批串行）**：见 §三。

## 二、新增 API 方法与 DTO 字段

| 方法 | 端点 | 结果类型 |
|---|---|---|
| `getAdminActions(params?)` | `GET /admin/admin-actions` | `AdminActionsResult { rows: AdminActionItem[]; total }` |
| `homeTakedown(id, reason?)` | `POST /admin/artists/:id/home-takedown` | `HomeTakedownResult { success; already? }` |
| `homeRestore(id, reason?)` | `POST /admin/artists/:id/home-restore` | `HomeRestoreResult { success }` |
| `restoreArtwork(id, reason?)` | `POST /admin/content/artwork/:id/restore` | `HomeRestoreResult { success }` |

补字段：`ReportItem.report_ip?`、`AdminArtistItem.home_takedown_at/_reason`、`ArtistProfileResult.home_takedown`、`Artwork.takedown_at?/_reason?`。均按后端实测形状核对（`compliance.routes.ts`、`admin-artist.routes.ts:32-39`、`artist.routes.ts:135-137`、`compliance.service.ts:38-48`），行号未钉死、以代码实况为准。

## 三、locale 改了哪些区（中英成对，check:i18n key-diff 绿）

- **`compliance.admin`**：W2 `colReportIp`；W3 `homeTakedown/homeRestore/homeTakedownConfirm/homeRestoreConfirm/homeTakedownToast/homeRestoreToast/homeTakenDownTag`；W5 `restoreArtwork/restoreArtworkConfirm/restoredToast`；W1 `adminActions/adminActionsSubtitle/adminActionsFilterLabel/adminActionsFilterDesc/filterActionAll/filterTargetTypeAll/limitN/colTime/colAdminIp/colAction/colTarget/colReason/totalCount/adminActionsEmpty/adminActionsLoadFailed` + 嵌套 `action.{9 种}`、`targetType.{report,artwork,message,artist}`（对齐后端 9 动作白名单与 4 种 target_type）。
- **`artworks`**：W5 `takenDown`。
- **`homeTakedown`（新建顶层区）**：W4 `title/takenDownAt/reasonLabel/reasonNone/guidance`（刻意独立于 `compliance.admin`，分区清晰利于审阅）。
- **`compliance.privacy`**：W6 「一、我们收集哪些数据」items 补三条 + `updated` 移日期。

**明确声明：未碰 `artistHome.hidden` 区（那是 W7＝R2 停等批）**——`git diff` 两文件对 `artistHome|hidden` 零命中，实证未越界。中英两文件键集完全相等（check:i18n 通过）。

## 四、W4/W6 措辞（按三维选最优落地，供用户审阅，如异议另批调整）

**W4 申诉渠道据实核实结论**：全仓检索 `admin_qq`/联系平台文案——`PlatformManage` 的 `admin_qq` 仅管理端配置项、`ArtistManage` 的 `currentAdminQq` 系管理端换管理员用，画师后台**无任何专门公示的联系/申诉入口**。故横幅整改指引采**中性表述、不虚构申诉入口**：`guidance`＝「您仍可登录后台整改相关内容；整改完成后如有疑问，请联系平台管理员申请恢复。」（与隐私政策 §五「联系管理员」既有口径一致，不新造渠道）。社会学依据：通知通道未接通下横幅是唯一能送达被下架画师的手段，必须有且给出路。

**W6 隐私三条披露实际文案**（参照现有 items 风格、如实标注可见范围）：
- 画师登录 IP（登录成功时记录，用于账号安全与纠纷取证，仅管理端可见）— 补 v72 既存漏披露
- 举报提交 IP（用于纠纷取证与防滥用，仅管理端可见）— v75
- 留言提交 IP（用于纠纷取证与防滥用，仅管理端可见）— v75，画师/访客界面按 SQL 构造不可见

属对外文书，**标注供事后审阅，如异议另批调整**（法律措辞最终定夺权留用户）。

## 五、W6 诚实测试同步

`privacy.updated` 从 `2026-09-12` 移到 **`2026-09-13`**（跟随正文实改，非只动日期）。`honestyCopy.p1-0912.test.ts:12-17` 中英两处 `toBe('2026-09-12')` 同步改为 `2026-09-13`，`test:web` 绿。`:19-22` 的 `terms.updated(2026-08-23) <= privacy.updated` 仍满足；`:25-88`（notify/setup 段）与 W6 无关，未动。此为「日期跟随正文实改」的**诚实方向**，非绕过。

## 六、门禁数字（主代理亲跑，完整原文，不凭汇报）

`cd web && npm run lint && npm run test:web && npm run check:i18n && npm run build`

- **lint**（含 `typecheck`：`vue-tsc --noEmit && tsc -p tsconfig.scripts.json`）：**零错误**，无告警输出。
- **check:i18n**：`[check-i18n] OK — 存量违规 13 条豁免，无新增硬编码中文，中英词条键集一致`（**13 条豁免无新增**）。
- **test:web**：`Test Files 125 passed (125)` / `Tests 886 passed (886)`（基线 876 → **886**，**+10**：ArtistManage.ban 3、ReportManage 2、ArtistDetailDrawer 2、AdminActions 新页 3；实测数，未照抄）。
- **build**：`✓ built in 13.48s`，产物含 `dist/assets/AdminActions-*.js`（7 语言包/字体/分块正常）。

> 修一处自测缺陷：`AdminActions.test.ts` 首版「加载失败」用例误断言 `.table-stub` 消失（el-table 常驻渲染，`RowColStub` 恒渲 5 列），首轮 test:web 1 failed；已改为断言空态 + `.actions-total` 不存在（有数据/空态互斥），复跑 886 全绿。

## 七、自检关（5 条，全过）

1. `git diff --stat`：18 改 + 2 新建，**全落 `web/src/**`**，无越界 server/desktop/shared/e2e/根 docs/STATUS/baseline。（untracked 的 6 个 `docs/comms/*.md` 为规划会话预存的编排文档，非本会话产物。）
2. 中英 locale 同步：check:i18n key-diff 绿，新增键中英成对。
3. honesty 日期已同步（§五），test:web 绿。
4. 扩 mock 反查：W1 新方法（getAdminActions）/ W3（homeTakedown·homeRestore）/ W5（restoreArtwork）新按钮均有 mock + 断言覆盖，无「加按钮没测」。
5. locale 分区反查：未碰 `artistHome.hidden`（§三实证零命中）。

## 八、遗留 / 交 R4

- 本批 **+10 web 用例**，请 R4 同步 `scripts/accept-baseline.json`（web 876→886）。
- W4/W6 措辞「按三维选最优落地，供用户审阅，如异议另批调整」（§四）。
- 未 commit / 未 push，待 R4 提交令。
