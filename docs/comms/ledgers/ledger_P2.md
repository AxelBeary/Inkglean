# ledger · P2 桌面端批（2026-09-13 定时开工）

> **性质**：施工台账，不是 STATUS 条目。**本批未写主 STATUS，也未新增 desktop STATUS 运营条目**（只改了它三处既有错行，见 §2）。
> **领地**：`desktop/**` + 本台账文件（计划书 §七 指定路径）。**未 commit、未 push**。
> **HEAD 起点**：`d4984edf`（开工时工作区已有 P1/P4 会话的在制改动与未跟踪计划书，本批一律未碰）。

## 门禁（主代理亲跑，全绿）

**两段跑**（中间用户口头授权施工波2）：

| 阶段 | lint | test | build | cargo check |
|---|---|---|---|---|
| ① 🟢 文档 + 卷心 inert 收口时 | 0 错 0 警 | **282 全过 / 24 文件**（基线 281 + 1） | exit 0（3.04s） | 未跑（零 Rust 改动） |
| ② 波2 拖拽改期施工后（终态） | 0 错 0 警 | **447 全过 / 30 文件**（+165 条用例） | exit 0（vue-tsc + vite，2.72s） | 未跑（本批**未碰 `src-tauri/**` 一行**） |

- 日志留档：`temp/p2-desktop-lint.log`、`temp/p2-desktop-test.log`、`temp/p2-desktop-build.log`（阶段①）
- 全量十七道门禁属 P5 收口，本批不自称「门禁全绿」

## 1 · F-33a `desktop/docs/CONTEXT.md`（四条硬错 + 缺席能力补指针）

| # | 改前（错） | 改后（代码真值） | 核实证据 |
|---|---|---|---|
| a | 本地库 `我的文档\拾绘\data.db` | `app_data_dir/local.db` | `src-tauri/src/bridge/db.rs:10-13`（`app_data_dir().join("local.db")`）；`data.db` 现全仓 desktop/docs 零命中 |
| b | 文件行写 `tauri-plugin-fs` / `shell` | 改为 dialog + opener（`openPath`）+ 自定义 Rust 文件桥，并明写「**未装 fs/shell 二插件、capabilities 亦无其权限声明**」 | `Cargo.toml:21-40` 直依赖无 fs/shell；`capabilities/default.json` 权限清单只有 dialog/updater/window-state/autostart/notification/sql/opener/core |
| c | 「系统通知（含免打扰）」 | 删「含免打扰」，改为「留言待审 + 截稿提醒，按条目去重」 | 全仓代码零命中"免打扰"（仅 STATUS:13 历史快照与 REQ-014 需求原文保留，属他批领地） |
| d | 「自定义 Rust 仅限 F8」「窗口…无自定义 Rust」 | 改为 bridge **8 个 .rs**、`src/` 全量 **11 个**，并列举实际覆盖面 | `src-tauri/src/bridge/` 实数 8 文件（autostart/db/files/mod/modules/monitor/secure_store/window）+ `src/{lib,main,tray}.rs` = 11；`#[tauri::command]` 标注实测 **30 处**（`bridge/` 29 + `tray.rs` 1，含 monitor.rs 的 windows/非-windows cfg 分支重复定义）|
- 另顺手纠正同源的一处：**数据目录**改为"分两处"（`app_data_dir/`：`local.db`/`img-cache/`/`secrets/`；`我的文档\拾绘\`：`templates/`/`modules/`/`orders\`/备份包），依据 `bridge/files.rs:91`（document_dir）与 `:98-105`（cacheDir）。
- 「关键路径与边界」的 **布局偏好复用 `dashboard_prefs`** → 改「**只存本地**」，键 `shihui-desktop-prefs-v1`，依据 `stores/prefs.ts:1-4` 头注。
- 新增末节「能力已存在但本文原先缺席」**8 条指针**（板块契约4件 / 档②模块机制 / 暗色主题 / 工具箱六条目 / 排期域 / 本地七张表 / 凭证保险箱 / 首启引导）——每条只写"能力存在 + 指向代码与事实源"，不复制细节。
- 逐条反查过的实体：`src/modules/`（6 文件）、`src/styles/paper-ink.css:71` 暗色作用域、`src/views/{OnboardingView,ScheduleView}.vue`、`src/views/tools/`、七张 `local_*` 表（`src/bridge/db.ts` CREATE TABLE 实数 7）、`bridge/secure_store.rs`。

## 2 · F-33b `desktop/docs/STATUS.md`（只改既有错行，零新增条目）

- **看板 `:10` 指针行**：原文写「下方索引表 `:110/:111`」→ 实际行号 **`:122`（首页）/ `:123`（窗口化）**（工单登记值已漂移）。该行现改写为「文档债 F-33 已清（9/13 P2 批）+ 指向本台账 + STATUS 正式条目由 P5 回写」。
- **`:122` 首页行**：`7 板块（排期/待办/订单/收入/挂牌/留言/统计卡）复用拖排显隐` → **4 板块**（今日要办/经营/留言/订单速览）+ 显隐/装裱/模块开关 + **拖排已退役**，出处列标注「⚠ 8/25 插件化拍板 §4.5 推翻 8/24 二轮口径，原文保留可追溯」。
  依据：`desktop/src/panels/contract.ts:7`（`PanelId` 四个）与 `:31-36`（注册表无任何 order/序号字段）。
- **`:123` 窗口化行**：`布局偏好复用 dashboard_prefs` → **只存本地**（不写 `dashboard_prefs`、不传服务端），出处列标注「⚠ 已被 8/25 亲定 γ 推翻」。
  🔴 **按工单警示处置**：`stores/prefs.ts:1` 头注是**唯一正确处**，未改它一字（第一轮曾误判"头注写反话"）。
- 历史快照**未动**：`:13`（9/5 🔑 条目）与 `:15`（9/4 🔑 条目）内的 `:110/:111` 旧行号与旧口径属当时实录，按体例不改写历史。

## 3 · F-33c `desktop/README.md`（孤儿改写）

- 改前：create-tauri-app 脚手架模板英文原文 8 行，全仓 0 处引用。
- 改后（**按计划书建议：改写不删**）：6 行入口——项目一句话 + 开发命令 + 门禁命令 + 四条事实源指针（`docs/STATUS.md` / `docs/CONTEXT.md` / REQ-014 / 发布前待办清单），四个链接目标均已核实存在。
- 命令取自 `desktop/package.json:9-16` 实际 scripts（dev/build/lint/test/tauri），未发明新命令。

## 4 · F-07 `desktop/docs/发布前待办清单-825.md` 补登

- **第 20 项**改为"守卫已修、现在只剩你去后台配"：
  - 9/13 **实测复核**（`gh api repos/AxelBeary/Inkglean/actions/variables` 与 `.../actions/secrets`）：**variables 0 条 / secrets 0 条**（与 9/5 首测一致），三项全缺。
  - 新登记 **F-06 守卫真拦说明**：`desktop-release.yml:68-83` 现为三重闸（空值 / 非 `http(s)://` / `*.invalid` 占位）+ 事后闸（conf 未命中占位串也判红）+ `concurrency`（`:17-19`）；**vars 未配 → 发布流水线按设计红在第 5 步「注入更新端点」**，不再静默产出坏包。明写"这是按设计红不是 bug，别改流水线迁就它"。
  - 指针：`docs/comms/更新通道执行手册-20260825-待后台执行.md` 第 3 步。
- **第 3 项**尾句同步刷口径（原「守卫未修前漏配会静默出坏包」→ 已修真拦 + 9/13 实测仍各 0 条）。
- ⚠ **一条超出派工清单的连带纠正（请 P5/用户复核可否）**：**第 19 项**标为 `[x]` 已修——9/13 实测 `Install shared dependencies` 已存在于 `desktop-release.yml:50-52`（提交 `a7d933e9`，9/12），原文仍写"本批未授权施工/漏网至今"已与代码不符。按 AGENTS.md「文档与代码不符以代码为准」就地纠错，正文其余部分保留。
- 未重复 9/5 已做的四项（销 dtolnay 旧账 / v73→v74 / 新增 19·20 项 / 第 5·6 项台账刷至 9/4 波1）。

## 5 · 卷心两面切换 v-show 无障碍补全（唯一代码改动）

- **`desktop/src/views/Home.vue`**：卷心主位两个 pane（改后实测：todo 的 `data-mv` 在 `:438`、cal 在 `:471`）各加
  `:aria-hidden="prefs.prefs.mainView !== '<该面>'"` 与 `:inert="同条件"` —— 隐藏面才 inert，显示面解除。**口径照已修的抽屉**（`components/home/MoreDrawer.vue:56-57` `:aria-hidden="!open"` / `:inert="!open"`），未发明新写法；两处各加一行注释说明"v-show 非 v-if，隐藏面仍在 DOM"。
- **`desktop/src/__tests__/home-mainview.test.ts`**：新增用例「两面切换无障碍（防绑反硬证据）」——默认 todo 态断言 `todo` 不带 inert/aria-hidden、`cal` 带；点页签切到 cal 后断言**两边互换**。文件头注释同步登记该覆盖点。
  - 辅助函数 `isInert()` 刻意同时读 DOM property 与 attribute：Vue 在真实浏览器走 property（`HTMLElement.inert` 反射），happy-dom 若未实现该 property 会退化成 `setAttribute('inert','false')`——只读一边会测出假绿，故两种都认（注释写明理由）。
- 🔴 **防绑反证据（不是只跑绿）**：把 todo pane 的绑定**故意改反**（`!==` → `===`）后单跑该文件 → **1 failed | 15 passed**（`AssertionError: expected true to be false`），随即改回。断言确有牙。
- 未碰同类：全 `desktop/src` 的 `v-show` 切换点只有这两处 pane 属"隐藏但可交互"，其余 `v-show` 无交互件。

## 6 · 🟡→✅ 波2 拖拽改期：先出施工图，随后按用户口头授权施工

### 6.1 授权与越权边界（请复核）

- 计划书 §四把波2 定为「🟡 只出施工图、停等确认」。本批**先**产出施工图（含六条待拍点），随后用户下达「全部按照工程学和社会学的最优抉择方法去做」。
- 主代理据此判定该指示**优先于落档计划书**（口头指示 > 落档文件），故把六条待拍点**由代理定案并施工**，未再追问。
- 保护措施：全程**不 commit、不 push**；改动 100% 落在 `desktop/**` 领地；后端零改动；施工图 §〇 每条定案都写了判据，用户可按条推翻。
- ⚠ 若用户其实只想让拍文档/小修那部分，波2 代码可整批退回（`git checkout -- desktop/src` + 删四个新文件），文档改动不受影响。

### 6.2 产物路径

- 施工图与施工记录（**已改名**，去掉「-待用户确认」后缀）：`desktop/docs/施工图-桌面端主页重设计波2-拖拽改期-20260913.md`
  - 内含：六条定案 + 契约表 + 四步落地状态 + 跨链路互踩处置 + 明确不做 + **12 条活体终验清单** + 六条已知手感风险
  - 落点说明：波1 施工图在 `docs/comms/`（P1 领地），故本图落在桌面领地内；P5 若认为该同目录，纯文本搬迁建议单独一步

### 6.3 文件清单（波2 施工，全部 `desktop/**`）

| 类型 | 文件 | 要点 |
|---|---|---|
| 新 | `src/api/errors.ts` | `ApiError{status,code,detail}` + `isSessionExpired`/`isOrderConflict`/`apiErrorMessage`（原先 `throw new Error(文案)` 吞掉 status/code，409 根本判不了） |
| 改 | `src/api/types.ts` | 加 `VersionedOptions`、`OrderWriteResult`、`ReorderQueueResult`（并注明桌面**不消费** reorder 响应） |
| 改 | `src/api/artist.ts` | `getJson`/`putJson` 改抛 `ApiError`；新增 `updateDeadline`/`updateStartDate`/`reorderQueue` |
| 新 | `src/schedule/drag.ts` | 纯函数：`pxToDays`/`shiftDate`/`planDragRange`（两条钳制 + `clampedDays`）/`planWrites`（两步顺序）/`reorderIds`/`canDragBar`/`canReorderRow` |
| 改 | `src/stores/schedule.ts` | `writeSeq` 单一在途序号域（`load()` 首行也递增）+ `reorderFormal`/`moveScheduleRange`/`undoScheduleRange` + `writing`/`canWriteList`/`canWriteTimeline`/`formalIds`；写结果只回语义、不装文案 |
| 改 | `src/components/schedule/ScheduleList.vue` | 整行 HTML5 dnd + 键盘 `Alt+↑/↓` 共用同一 emit 路径；`⠿` 走伪元素压在既有 14px 列（**未加列、未改行高**）；不可拖态零可供性 |
| 改 | `src/components/schedule/ScheduleTimeline.vue` | 横条 Pointer 拖拽（拖中本地位移、松手吸附整天）+ 左右端柄 + 键盘一次一天；分母只认 `.tl-track` 实宽（不走轴坐标系） |
| 新 | `src/components/schedule/UndoToast.vue` | 一次性撤销条（`undoing` 锁防连点、`role=status`、Teleport + Transition、几何对齐工具箱既有 `.toast`） |
| 改 | `src/views/ScheduleView.vue` | 接线 + 人话映射（冲突/会话失效/结果不确定/钳到最早 四类分开说）+ 普通 toast 与撤销条 v-if 互斥 |
| 改 | `src/schedule/band.ts` | **顺带修时区地雷**：`parseDate` 对 `YYYY-MM-DD` 改按本地零点建（原先走 UTC 零点，负偏移时区下日级比较整体漂一天；UTC+8 与 CI 都测不出来） |
| 新测试 | `__tests__/{schedule-drag,api-errors,schedule-store-write,schedule-list-reorder,schedule-timeline-drag,undo-toast}.test.ts` | 165 条；红线口径逐条有主（见施工图 §二与下条） |
| 改测试 | `__tests__/schedule-view.test.ts` | 只读哨兵翻面：由「innerHTML 不含 draggable」改为「`reorderable=true` 才有拖拽属性、false 一个都不给」 |

### 6.4 派工与领地（三路并行，一次全派）

- 主代理钉契约：api 层 + `drag.ts` + store 写动作 + `ScheduleView` 接线 + 全部定案
- 路A（`huiyue-frontend`）：`ScheduleList.vue` + `schedule-list-reorder.test.ts` + `schedule-view.test.ts` 哨兵
- 路B（`huiyue-frontend`）：`ScheduleTimeline.vue` + `UndoToast.vue` + 该路测试
- 路C（`huiyue-frontend`）：纯函数/错误/store 写语义的三份测试（**禁改实现**）
- 三份派工提示词均带「领地/禁区/契约/只跑自己那份测试（防并发抢 vite 缓存）/不许 any·@ts-ignore/不 commit」
- 并行期各会话零互踩：领地按文件划死，无一人越界（路C 明确报告「没读没跑没改别人的文件」）

### 6.5 子代理上报与主代理裁决（外部/下级报告约 1/3 不实，逐条核过）

| 上报 | 核实 | 处置 |
|---|---|---|
| 缺1 `drag.ts:108-110` 有句「开工日在过去时也不许截稿拖到过去」永不命中 | ✅ 属实（前一行已先把截稿抬到 ≥ startDate） | 与网页端口径对齐：**只钳开工日**，删死代码 + 改掉做不到的承诺注释（画师本就可以把追不回的单标成逾期） |
| 缺2 store 调 `planDragRange` 不注入 today → 跨零点/跨时区不可复现 | ✅ 属实 | `moveScheduleRange` 加可选 `opts.today` 透传（生产默认本机今天，测试可钉死） |
| 缺3 `band.ts:parseDate` 按 UTC 解析纯日期串 → 负偏移时区漂一天 | ✅ 属实（且是波1 遗留地雷） | 已修（见 §6.3）；本机 UTC+8 测不出，属预防性修复 |
| 缺4 版本号拿不到时返回 `{ok:false, serverMessage:''}`，语义含糊且绕过 seq 守卫 | ✅ 属实 | 新增语义位 `refreshed:true`（写已发出但结果不确定，页面须说「没确认，已刷新」），并同步改路C 两条断言 |
| 观察5 `TERMINAL_STATUSES` 含 `done` 与后端「活跃单含 done」命名易误读 | ✅ 已核实两边集合等势（delivered/cancelled 后端本就排除），行为有用例钉死 | 不改行为，登记为改名候选 `BAR_DRAG_EXCLUDED`（施工图 §八.6） |
| 路A 自加「正式区任一行无 version 就整段禁拖」的闸 | 合理（后端只认整段，混一行就交不出合法序列） | 保留 |
| 路B 未按施工图新建 `useScheduleDrag.ts`（拖拽编排内联在组件） | 属实（施工图与该路派工清单不一致，按派工领地执行） | 接受，登记为偏差；如需下沉 composable 由 P5/用户裁 |
| 路B 上报的「首版被自己测试咬出一个真 bug（拖右柄被条身二次接管成 `edge:'move'`）」 | ✅ 与代码现状一致（`stopPropagation` + `if (drag.value) return`） | 保留修复，并把这条写进终验清单第 8 条 |
| 路A 上报「收口时 vue-tsc 有 6 个错在他人领地」 | 部分过时（路B/路C 随后自查自修） | 收口实跑 `vue-tsc` **0 错**，不采信该中间态 |

## 7 · 文档自检三关（计划书 §六）

1. 领地核查（波2 施工后的终态）：`git diff --stat -- desktop` 与 `git status --porcelain -uall -- desktop` 逐条列在 §6.3，**全部在 `desktop/**` 内**；根 `docs/**`、`.github/`、`web/**`、`server/**`、`shared/**`、`worktrees/**` 零触碰（全仓 status 里那些 M 项＝P1/P4 会话在制，非本批）。
2. CONTEXT 四条反查：`git grep "tauri-plugin-fs" -- desktop` 只剩 CONTEXT.md:13 的「未装」陈述 + `Cargo.lock` 传递依赖 + STATUS 历史快照；`免打扰` 在 desktop/docs 只剩 STATUS:13 历史快照；`data.db` 在 `desktop/docs` **零命中**。
3. STATUS 指针与表内实际行号一致：`:122`/`:123` 两行内容已核（本批未增删行，行号不漂移）。
4. 反阀适用面核实：`scripts/check-file-size.mjs:48` `SCOPES = ['server/src', 'web/src']` —— **desktop/src 不在巨型文件防阀射程内**；本批 `Home.vue` **792 → 807 行**（净 +15，`git diff --numstat` 实为 +19/−4）不会碰第十七道，仅登记供用户/后续批知情。
5. EOL：`desktop/README.md`、新建施工图、本台账已按 `.gitattributes`（`*.md text eol=lf`）落 LF；波2 新改的四个 `.vue` 与六份 `.ts` 测试也统一成 LF。
   ⚠ 顺带发现（**未处理，交 P5 定夺**）：`desktop/docs/STATUS.md` 工作副本是 mixed EOL、`desktop/docs/发布前待办清单-825.md` 是纯 CRLF，均与 attr 不符（`git ls-files --eol` 实测），属历史批次写入遗留；本批不做全文件 EOL 重排以免给并行会话制造整份 diff 噪音。
6. **浏览器冒烟（真 Chromium 跑整条链，零产品代码改动）**：脚本与证据在 `workspace/temp/wave2-drag-913/`（`smoke.mjs` + `smoke-report.json` + 7 张截图），沿用 9/4 波1 的 Tauri 桩与夹具，另自建**可变内存服务端**（PUT 真改状态、GET 真回新值）。**五项全过、零 JS 报错**：
   - ① 列表拖排：4/6 行可拖（只正式区）、`PUT reorder orderedIds=[102,103,101,104]`、行高 53px 未变、横向溢出 0、撤销后首行回到拖之前
   - ② 横条改期：5 条 / 10 端柄、拖中 `translateX(120px)` 无 `NaN`、两步 PUT **version 接力（v4→v5）**、钳到今天的提示生效、端柄键盘另发一次
   - ③ 409 冲突：红色真话提示，**横条留在原位**（本地不留半改假象）
   - ④ 本地模式：时间条页签整块缺席、可拖属性 0、账本读不到时说真话
   - ⑤ 字号 1.25 + 600 高：横向溢出 0，不破版

## 八、遗留与交接口

- **不写 STATUS**：本批成果（F-33 / F-07 / inert 小修 / 波2 拖拽改期全量）由 **P5 收口**统一回写主 `docs/comms/STATUS.md` 与 `desktop/docs/STATUS.md`。
- 交 P5 的五个待核点：① 第 19 项连带纠错是否认可（§4 ⚠）；② `desktop/docs/STATUS.md` 看板日期标签仍是「（2026-09-05）」且 `:10` 行已被本批改写（未擅自改日期，属看板回写权限）；③ 波2 施工图是否要与波1 同目录（§6.2）；④ **基线 281 → 282 → 447**，刷 `scripts/accept-baseline.json` 以实测为准；⑤ §6.1 的「口头授权推翻停等」是否认可。
- 🔴 **波2 欠一笔真机债（属用户，不可自动化）**：施工图 §五.1 的「0 步冒烟」（`tauri dev` 点一次挂牌写接口，验 CSP + 生产 CORS_ORIGIN）仍未跑；§七 的 12 条活体终验清单待用户真机走。
- ⚠ **布局审计未达技能收工标准**（知情偏离，与 9/4 波1 同口径）：`measure.mjs` 已跑且本批**零新增离栅值、零野生字面圆角**；VL 评审未跑（通道 403/404 不可用）；**桌面壳内实拍未跑**（需 `tauri dev` + 真登录态，属用户）。浏览器态实拍 7 张已逐张目测（见上条 6）。
- 本批**未 commit、未 push**，未创建 tag、未跑 `accept.ps1`；启动过 `vite dev`（14200）做浏览器冒烟，跑完已关。
  ⚠ **环境动作登记**：停服时用了 `Stop-Process -Name node`（按名杀），**可能连带中断了并行会话正在跑的 node 任务**（当时无其他已知在跑项，但无法保证）。P5 收口一律**自己重跑全量十七道**为准，不采信任何转述数字。
- 黄灯（波1 活体终验 12 条 / 发布硬依赖）与红灯（F-31 REQ-014 定位）**一律未碰**；终验清单 D4 判据改属 P1 领地，本批未动。
