# ledger_P4 · 后端批（定时开工 2026-09-13）

> **本批性质**：🟡 **全批只出施工图，停等确认**。零代码改动、零迁移落盘、零数据库操作、未跑任何端门禁（无代码可跑）。
> **计划书**：`docs/comms/定时开工计划书-P4-后端批-20260912.md`（未修改，按令执行）
> **总纲**：`docs/comms/定时开工总纲-时间表与防冲突-20260912.md`（未修改）
> **开工 HEAD**：`d4984edf`　**收工 HEAD**：`d4984edf`（未 commit、未 push，按令）

---

## 1. 产物（两份施工图 + 本台账）

| 产物 | 路径 | 状态 |
|---|---|---|
| 施工图一 · 管理动作留痕补 IP | `docs/comms/施工图-P4-1-管理动作留痕补IP-20260913.md` | 🟡 C1/C2 **已回收**（§5 已升级为施工点）；待最终放行 |
| 施工图二 · 主页类内容下架能力 | `docs/comms/施工图-P4-2-主页内容下架边界-20260913.md` | 🟡 **§8 已出研究结论与推荐方案**（取代原 Q1~Q4 选项菜单）；待 T1~T3 点头 |
| 研究档 · IP 收集边界与数据服务（第二轮追加） | `docs/comms/研究-P4-IP收集边界与数据服务-20260913.md` | ✅ 结论已被用户全盘采纳；R1~R3 已落地 |
| 落地契约（第三轮施工依据） | `docs/comms/落地契约-P4-v75v76-20260913.md` | ✅ 已按它施工完毕；**施工会话禁改本文件** |
| 本台账 | `docs/comms/ledgers/ledger_P4.md` | 已落盘 |

**前两轮产物：除以上文档外仓库内零改动。第三轮（§9）已实际施工，改动全在 `server/**`。**

---

## 2. 迁移号确认（计划书要求的开工前必核）

- 实测 `server/src/db/migrations/index.ts`：import 与 `MIGRATIONS` 数组末尾均为 **v74**（`v74-deliverables-download-nonce.js`），**v75 未被占用** → 计划书判断成立。
- 施工图一草案占 **v75**（`admin_actions_ip`）；施工图二若需改结构预留 **v76**（选项 A/B 组合则 v76 + v77）。
- **施工放行前须再核一次 index.ts 末尾**（本会话不施工，故不预留死）。

---

## 3. 施工图一（P4-1）结论摘要

- **病灶核实属实**：`admin_actions` 在 `schema.ts:403-411` 与 `v59-compliance.ts:26-34` 两处建表一致，确无 IP 列。
- **写入点数量：全项目唯一 1 条 `INSERT INTO admin_actions`**（`compliance.service.ts:128-131` 的 `writeAdminAction()`），上游 4 个 service 调用点（resolveReport / removeContent×2 分支 / setArtistBanned）+ 2 处测试直调（`audit-m-sanitize.test.ts:184,198`）。HTTP 入口 4 个，全在 `compliance.routes.ts`，改造集中度高。
- 草案：迁移 v75 幂等 `ADD COLUMN admin_ip TEXT`（照 v72 `last_login_ip` 范式）+ `schema.ts` 同步 + 4 handler 传 IP + 11 条测试点（含幂等、老库升级、CF/Caddy 链路、反伪造）。
- **`action`/`target_type` 无 CHECK 约束** → 未来新增下架动作不需再为留痕表加迁移。

### ⚠ 与计划书口径的差异（按"以代码为准"处置，计划书原文不改）

| 计划书原文 | 代码实测 | 本批处置 |
|---|---|---|
| 取 IP 要考虑 `CF-Connecting-For`，"别裸取 `req.ip`" | 真实头名是 **`CF-Connecting-IP`**（`CF-Connecting-For` 在仓库内不存在）；且换算**已在反代层完成**：`Caddyfile:21-23` 用 `header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}` 覆盖 XFF，`docker-compose.yml:43` 的 `TRUST_PROXY` 只信内网三段，`tests/cf-real-ip.test.ts` 已锁死该链路。故 **`request.ip` 就是项目既定口径**（v72 登录留痕 `auth.routes.ts:216/269/378`、`invite.routes.ts:94` 均用它） | **判计划书该句为不实项，不采纳**；施工图 §1.3 出证据链，改按 `request.ip`，**须用户确认**（确认点 C1） |
| 「管理动作留痕补 IP」 | 顺带查出 `getAdminActions()` **全仓零调用者** → `admin_actions` 表**只写不读**，既无查询接口也无后台页面 | 只呈报不擅自扩范围，列 (a)/(b)/(c) 三选项交用户定性（确认点 C2） |
| 未提及 | `reports` 表同样**无 IP 列**（公开举报只把 `request.ip` 用于限流后即丢弃） | 登记为相邻缺口（施工图一 §6）；若要补，并入同一个 v75 最省一次迁移 |

---

## 4. 施工图二（P4-2）结论摘要

### `hidden` 态现状核查结论（计划书要求的"先核清"）

**`hidden` = 画师自己的"关店隐身"，不是平台下架**，依据：`artist-account.service.ts:71-76`（方案 A，2026-08-21 拍板：建号默认 hidden，画师备好作品价格后**自行**在「设置 → 主页展示」开业）+ `v38:12`（admin 可代设）+ `schema.ts:22`（写"主页下架"的是 `is_banned`，不是 hidden）。

**复用 hidden 承载下架的硬冲突**（4 条，实证在施工图二 §1.2/§1.3）：
1. 画师**可自助解除**（`PUT /api/artist/profile` 的 status enum 含 open，无闸门；前端 `SettingsShowcaseTab.vue` 的 `<ShopVisibilitySwitch>`）→ 刚下架就被自己点开；
2. 现行客户侧文案是给画师看的语气：「该画师暂未开放主页。如你是店主，请到「设置 → 主页展示」开启「小店展示」。」（`zh-CN.ts:844`）；
3. `status` 单值无法区分"自助隐身"与"平台下架"叠加态；
4. hidden **不踢登录、不失效 token**（封禁才 `bumpTokenVersion`）。

**顺带查出的口径不一致**（只登记，不擅动）：`/api/artists/:subdomain` 对 hidden **返回 200 最小信息**（UI-8），而 workflow/pricing/styles/gallery/guestbook/public artworks 一律 **404**；`calendar-feed.service.ts:86` **只过 is_banned 不过 hidden**。

**另查出**：管理员设 hidden（`PUT /api/admin/artists/:id/status`）与移除画师（`DELETE /api/admin/artists/:id`）**均不写 `admin_actions` 留痕** → 现留痕只覆盖 4 类动作。

### 呈给用户的边界选项（🔴 未拍板，禁止新会话照抄施工）

- **Q1 粒度**：A 整户主页下架（新增平台独占的下架独立态）/ B 单作品软下架（顺手修掉"下架=物理删数据"，`artist-artwork.service.ts:105-107`）/ C 板块级（举报侧 `reports` 无板块级 target_type，需重建表迁移，高风险）/ D 只接举报链路不加粒度。
- **Q2 客户侧表现**：P-404（与不存在同响应，`is_banned` 现行）/ P-TAKEDOWN（专门"已下架"提示页 + 申诉指引）/ P-PARTIAL（板块占位，仅 B/C 适用）。⚠ 文案在 `web/**` = P3 领地，须协调。
- **Q3 是否带期限**：永久（手动恢复）/ 到期自动回（需 `takedown_until` 列 + 到期判定）。
- **Q4 留痕覆盖面**：那 2 条无留痕的管理动作要不要一并补。

---

## 5. 领地与禁区执行记录

- **实际写入**：仅 `docs/comms/` 3 个新建文档 —— 这是用户开工令与计划书 §5 明确指定的产物区（ ledger 与施工图），不属于 `web/desktop/shared/STATUS.md` 任何禁区。
- **`server/**`（本批领地）：零改动**（只读核查）。资金域、`web/**`、`desktop/**`、`shared/**`、`worktrees/**`、`scripts/accept-baseline.json` 一律未碰。
- **`docs/comms/STATUS.md` 未碰**（施工进度由 P5 收口统一回写；本批新增迁移号/基线数待施工完成后由 P5 同步 `accept-baseline.json`）。
- **计划书与总纲未修改**（共同事实源）。
- **未 commit、未 push**。

### 工作区在途状态（并行会话所有，本会话未碰，P5 收口时注意归属）

**开工快照**（`git status --porcelain -uall` 实测 10 行）：
- 已修改：`.github/workflows/ci.yml`、`docs/CONTEXT.md`、`docs/OPS.md`、`docs/开发→生产切换指南.md` → **属 P1 文档批领地**
- 未跟踪：6 份 `docs/comms/定时开工*` 编排文档（总纲 + P1~P5 计划书）

**本会话进行期间新增**（收工复查时观察到，非本会话所为）：`desktop/src/views/Home.vue`（→ P2 桌面批在途）、`docs/changelog.md`、`docs/维护说明书.md`（→ P1 在途）—— 说明并行批此刻正在写盘。

- **`server/**` 开工与收工两次实测均为零改动**（`git diff --stat -- server/` 空）→ 本批与并行会话**零撞车面**。

---

## 6. 门禁

本批未动代码，**按计划不跑端门禁**（计划书 §四）。未跑 = 不声称绿：本台账不出现任何「门禁全绿」表述。

施工放行后须跑：`cd server && npm run typecheck && npm run lint && npm test`，基线 server 取**实测数**（计划书载 1715/150 文件，不可照抄）。

---

## 7. 新会话接手须知（交接块）

1. **第一件事**：问用户 **P4-2 §8.7 的 T1~T3** 与 **研究档 §7 的 R1~R3** 是否已拍；**未拍禁止施工**，尤其禁止照抄本台账里的候选方案（选项 A/B/C/D、P-404/P-TAKEDOWN/P-PARTIAL 均**仅供参考、不构成施工依据**，且已被 P4-2 §8 修正）。
2. **本批未做的事**：没建迁移文件、没改 `schema.ts`、没改 service/routes、没写测试、没动数据库（`data/commission.db` 全程未打开）。
3. **已固化产物**：上述 4 个文档，均为纯人工核查所得，**可复算**（证据全是文件:行号，重读即可核对）。
4. **若用户放行 P4-1**：按施工图一 §8 的 8 个文件清单施工；施工前重核 `migrations/index.ts` 末尾；测试点照 §7 十一条落，别漏 §7-9/10 那两条 CF 链路断言（那是计划书原口径担心的病，实测靠 `request.ip` + trustProxy 才成立）。
5. **若用户放行 P4-2**：先补一轮细化施工图（现图只到"选项 + 改动面"层级，未到可施工精度），再谈施工。
6. **其他会话的结论**：本会话不知晓 P1/P2/P3/P5 的进展；P5 收口时若发现与本台账 §5 在途清单冲突，以各批 ledger 为准。

---

## 8. 第二轮（2026-09-13 用户回复后）

### 8.1 用户已回收的决定

- **C1 取 IP 口径 → “可以”**：按代码现行口径 `request.ip`，计划书原句（CF-Connecting-For / 别裸取 req.ip）**正式判为不实项、不采纳**，已记入本台账 §3 差异表。
- **C2 后台查看入口 → “要做”**：施工图一 §5 已从“三选项”**升级为具体施工点**（`GET /api/admin/admin-actions`，含参数/返回/守卫/测试 11~13）；页面属 `web/**` = **P3 领地，另批**。⚠ 图中已标陷阱：新路由必须核 `registerAdminStepUpHooks` 的前缀覆盖（d2 猎杀修过的同类病）。
- **Q1 粒度 → “研究下怎么做最好”**：已补研究，结论落在施工图二 **§8**。

### 8.2 研究的决定性发现（P4-2）

**粒度不是新决策——REQ-042 原文（用户 2026-08-11 亲拍、已实施）早把边界定死了**：`docs/requirements/archive/REQ-042-合规与内容安全.md` §三 C「内容级下架：管理员对具体内容下架（**作品/留言/主页**）」与 §三 B「违规阶梯：警告 → 内容下架 → 封禁」→ 实施时**只做了作品+留言，“主页”那一格与阶梯中间那格都缺**。故本项性质从“产品边界决策”降为“**需求回归**”，推荐按原文补齐（A+B 同批、v76 一次建齐、不做 C 板块级）。

### 8.3 用户追问的 IP 新问题→ 新开研究档

产物：`docs/comms/研究-P4-IP收集边界与数据服务-20260913.md`。结论：**举报建议收 / 留言建议收但仅管理端 / 访问埋点建议不收**。

- 关键证据一：项目**已在收两处 IP**，口径可直接沿用——`deliverables.download_ip`（v66，815 拍板 #4，**隐私政策已披露**）与 `artists.last_login_ip`（v72，仅管理端可见）。
- 关键证据二：**访问不能收 IP** 的红线是用户自己拍的——REQ-033 §六「不采集 PII」+ §2.2「匿名凭证**不得升级为追踪访客的标识**」；`events`/`anon_tokens`（v44）实测无 IP 列、180 天 TTL（`app.ts:94`）。
- 关键证据三（卖数据）：**卖聚合结论不需 IP**；现有底子已够（events 漏斗指标 REQ-033 §3.3 已定义 / orders / client_profiles / like_count）。建议另立 REQ，走“聚合统计导出”而非“原始数据交付”（后者在 PIPL 下属向第三方提供个人信息）。
- ⚠ **顺带查出现存合规缺口**：`artists.last_login_ip`（v72）**在隐私政策数据清单里没披露**，而项目有盯着“告知与实际一致”的诚实测试（`honestyCopy.p1-0912.test.ts`）。建议与本次文书修订一并处理（属 P3 领地）。
- ⚠ **实测纠正了自己研究档初稿的一处错判**：`reports` 全仓**无非管理端读取路径**（`compliance.service.ts:50/57/60/65/74` 只服务管端），不存在泄露面；真正会泄的是 `guestbook.service.ts:23/48/68` 三处 `SELECT *`，**一加列就会把留言 IP 顺带返给画师端与公开端**。

### 8.4 现在挂在用户面前的（6 条，建议分两次拍）

- 第一批（不互相依赖）：**T1** 粒度 A+B / **T2** 客户侧中性提示 / **R1** 举报收 IP / **R2** 留言收 IP
- 第二批（依赖第一批）：**T3** 不设自动到期 + 补 3 处留痕 + 先做判定收口重构 / **R3** 访问不收 IP、数据服务另立 REQ
- 本会话**照旧未施工**：零代码、零迁移、零数据库改动、未 commit、未 push。

---

## 9. 第三轮：用户放行后的并行施工（2026-09-13，**已施工**）

用户拍板「全部按照工程学和社会学的最优方法去做」→ 采纳全部推荐（C1/C2、T1~T3、R1~R3），本批由「只出图」转为实际施工。

### 9.1 派工与领地执行

- 契约先落盘：`docs/comms/落地契约-P4-v75v76-20260913.md`（列名/接口形状/可见性口径/领地划分），施工会话均自读该文件，未修改它。
- **Lane A（主代理）**：`v75-forensic-ip.ts`、`v76-content-takedown.ts`、`migrations/index.ts`、`schema.ts`（5 表各 1 处）、`types/entities.ts`、新增 `artist/artist-visibility.service.ts`，加上四个跨路写函数（`setHomeTakedown`/`clearHomeTakedown`/`takedownArtwork`/`restoreArtwork`）——先把契约函数钉好，两路不必互相等编译。
- **B 路（huiyue-backend，合规域）**：`compliance/**`、`guestbook/**`、`admin/**` + 4 个测试文件，自报 86 例全绿。
- **C 路（huiyue-backend，可见性与作品）**：`artist/**`（除 visibility 文件）、`pricing/**`、`og/**` + 3 个新测试文件，自报 62 例全绿。
- 两路**同批一次派出**，零越界：回报里的 `git status` 各自只碰自己领地；`getArtistArtworks` 契约函数已可用（B 预留的阻塞点自动消解）。
- 本会话未碰 `web/**`、`desktop/**`、`shared/dto.ts`（仅主代理收口时改）、资金域、`STATUS.md`、`accept-baseline.json`、`worktrees/**`；未动 `data/commission.db`（测试走 `:memory:`）。

### 9.2 主代理收口（不凭汇报，亲跑全量）

采两路回报后亲自做的三件裁决（契约文件未改，裁决记此处）：

1. **作品下架幂等（B 路请示 #5）→ 要**。`removeContent('artwork')` 已下架时短路返 `{success:true, already:true}` 且不重复写留痕，与主页下架同口径（误双击不该在账上变成两笔处置）；补 TC-CMP-31。
2. **`home_takedown_reason` 可见性（C 路冲突 #3）→ DTO 层纵深收口**：`shared/dto.ts` 只剔 `home_takedown_reason`（自由文本处置描述不平铺进任意响应体），保留 `home_takedown_at`（状态位）；管理端两点照 `last_login_ip` 范式显式重附；画师本人走 `/api/artist/profile` 显式嵌套字段。补 TC-SEC-09/10 锁住三条边界。
3. **`?action=` 非法值处理（B 请示 #4）→ 保留“脏参数忽略、返回全量”**（全站惯例，不炸管理页，已有测试钉住）。

另：两路都指出派工给的 `npx eslint <目录>` 在本仓对 `.ts` 无效（TS 由 oxlint 负责，`npm run lint` = `eslint . && oxlint src tests`）——**是我的派工命令措辞错**，不是子代理问题；已按真实管道复核。

### 9.3 门禁输出（全量，原文数字）

```
cd server && npm run typecheck   → tsc --noEmit ×3（src/scripts/tests）无输出，绿
cd server && npm run lint        → eslint . && oxlint src tests
  Found 0 warnings and 0 errors. Finished on 337 files with 98 rules
cd server && npm test            → Test Files  156 passed (156)
                                   Tests       1801 passed (1801)
                                   Duration    440.55s
node scripts/check-file-size.mjs → ✓ 巨型文件防阀通过（扫描 465 个源码文件，上限 800 行，豁免 0 项）
```

- 基线变化：server **1715 → 1801**（+86 例），测试文件 **150 → 156**（+6）。**此数字由 P5 收口统一同步 `scripts/accept-baseline.json` 与 STATUS，本批不碰。**
- 迁移号：**v75 `forensic_ip`、v76 `content_takedown`**（同批占用，开工前核过的 index.ts 末尾 v74 已推两格）。全量测试日志里两行「已应用」可见。
- 未跑 E2E（本批未改 `web/**`/前端链路；compliance 链路在 E2E 仍是零覆盖，见 §9.5）。

### 9.4 行为变更清单（给用户验收用，人话）

1. 管理员每一次处理举报/下架/封禁/恢复，账本上多一栏来源 IP；**并且后台现在有接口能查出这本账**（此前只写不读）。
2. 举报与留言现在会记提交人 IP（**留言 IP 只到管理端为止**，画师与访客界面按 SQL 构造看不见）。
3. 新增「主页下架」中间档：不踢登录、不封号，只把主页从目录/展示/价格/画廊/留言/订阅/分享卡片上藏起来；**画师自己改状态也恢复不了**（有专项回归测试）。
4. 作品下架不再是删数据：行、标题、描述、点赞数、档位标注全在，可一键恢复；管理端「删作品」按钮现在语义是下架（**画师自己删仍是真删**）。
5. 顺带修一个既存漏判：隐身画师的**日历订阅**此前仍能拉到数据（只挡了封禁），现已堵。该文件另有 6 个端点的判定不一致（主页返回 200 其余 404）**本批未改**，只在契约里登记。
6. 新增四个管理端点：`GET /api/admin/admin-actions`、`POST /api/admin/artists/:id/home-takedown|home-restore`、`POST /api/admin/content/artwork/:id/restore`，全部自动继承 step-up 入口闸（已核 `step-up.ts:86` 前缀匹配，非猜测）。

### 9.5 交回用户派 P3 的 web 侧清单（本批因领地边界未做）

后端能力已全部就绪，**不做这些则新能力对用户不可见**（“记了但看不到”就是这个）：

| # | 要做的 | 接哪个接口 | 优先级 |
|---|---|---|---|
| W1 | 管理后台「处置留痕」页（时间/IP/动作/对象/原因） | `GET /api/admin/admin-actions`（?limit&action&targetType&targetId） | 高（无它则 v75 白做） |
| W2 | 举报列表多一列来源 IP | `GET /api/admin/reports` 行内已带 `report_ip` | 中 |
| W3 | 画师管理页「下架主页/恢复」按钮；`artist_home` 举报行同时给「封禁」与「下架主页」两键 | home-takedown / home-restore | 高 |
| W4 | 画师后台下架横幅（显示原因与整改指引）——通知通道未接通下**唯一能送达画师**的手段 | `GET /api/artist/profile` 的 `home_takedown: {at, reason}\|null` | 高 |
| W5 | 作品列表「已下架」态与恢复按钮；下架原因悬浮 | 画师端列表行已带 `takedown_at`；`POST .../restore` | 中 |
| W6 | 隐私政策清单补三条披露（管理员动作 IP / 举报与留言 IP / **既存漏披露的登录 IP**），并同改 `privacy.updated`（有诚实测试 `honestyCopy.p1-0912.test.ts` 会红） | 无接口，文案 | 高（**不补就是对外不诚实**） |
| W7 | 主页不可访问提示页文案是否需从“暂未开放”改为中性“暂时无法访问”（现 API 对隐身/下架同载荷，不改文案也不会报错，但画师自助文案会遮着下架事实） | 无接口 | 中（产品口径，建议与 W4 同批） |
| W8 | E2E 补 compliance 链路（举报→处理→下架→客户侧不可见），现在 `e2e/` 对该域零覆盖 | — | 中 |

### 9.6 未做与遗留

- 未 commit、未 push（开工令明确，且 P5 收口统一提交待令）。
- `data/commission.db` 未动：新列将在下次服务启动时自动迁移；**公网仍冻结中**，升级时机由用户定。
- 主页判定口径不一致（主页 200 vs 其余 404，UI-8 旧拍板）本批**只接新态不改旧分支**，零行为变更；要统一得单独拍。
- 板块级下架（选项 C）按拍板未做；「数据服务」需另立 REQ（研究档 §5）。
- 未跑 `pwsh scripts/accept.ps1` 全量十七道（需 web/desktop/shared 同跑，越本批领地），**所以本报告不称「门禁全绿」**，只称「server 端三项全绿 + 巨型文件阀通过」。
