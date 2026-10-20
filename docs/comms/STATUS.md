# 全局状态（一号维护，其他角色只读）

## 看板（2026-10-21 刷新：U45/U46 修复批 + Dependabot #19/#20 同批合入；一号自主批）

- **HEAD 与推送**：十九道全绿 @ `f8258703`（381s；U45/U46 @ `4d6bf0b6` / 406s；依赖 @ `04ddfbd1` / 433s）；三期已合入并 push
- **基线（accept.ps1 十九道全绿 @ `f8258703`）**：server **1852**（160 文件）/ web **990**（144）/ desktop **570**（40）/ shared **27**（4）/ E2E **14**
  - 迁移 **v76**；版本 server·web 1.0.1、桌面 0.1.0；「门禁全绿」口径仍为**十九道**
  - U45/U46：desktop 551→570（+19）；依赖批五端计数不变；N×M 批 server +5 / web +8
- **U45/U46 已闭合**：悬浮截稿窗只读开库 + 说真话；`floating-deadline.json` 单独授 `sql:default`（无 execute），timer/todo 零 SQL；U46 真 IPC/ACL 测试进 CI desktop job（`cargo test`）
- **F-44 清偿**：`Home.vue` 807→800，`check-file-size` ALLOWLIST 只剩 PriceCard
- **依赖双 PR**：#19（root/server/shared/web 11 项）+ #20（desktop 6 项）同批合；vue-tsc 3.3.13 三端对齐；未碰 `@tauri-apps/*`/`typescript`，成对现状不变
- **N×M 覆盖批**：新增 `GET /api/artist/art-styles/overrides`（单条 JOIN、按画师过滤），画风页预载从 N×M 次 GET 收成 1 次；server +5、web +8 例
- **门禁工具**：`accept.ps1` 大输出改流式落盘；server vitest 12MB 级输出偶发管道死锁已消
- **警报/PR**：Dependabot open 0、Code scanning open 0、开放 PR 0（#19/#20 已 MERGED）
- 公网仍冻结中（停在 v74，本地与远端已到 v76）；默认窗 1200×820、最小窗 1200×600 不变（9/5、826 拍板）
- 🔴 **上线前置硬警告仍有效**：管理员判定只认库值，公网部署前**必须先确认 `platform_config.admin_qq` 非空**

**下一步（按优先级）**

1. ✅ **本批收口 @ `f8258703`（已 push）**：U45/U46 + Dependabot #19/#20 + N×M 覆盖批 + 门禁流式落盘；十九道全绿 381s；docs 提交随后
2. **待你拍板的技术债（剩余）**：U26 server 以 tsx 作生产依赖；U33 桌面发版流水线从未跑过（缺 vars/secrets，首版必红）
3. **待你终验 / 终审**：桌面真机 UI 清单（标题栏/托盘/通知/文件选择器/本地记账；opener 需真人点）；对外文案 W4/W6/U12/U13
4. **剩红灯需拍板**：U16 板块级下架 / U17 数据服务 / G5 终验证据链复现性 / G7 F-09 二次重构 / U21 变更史深度 / U22 改稿上限 / U23 记忆库优先级边界 / U24 视觉判断通道归属
5. **不需用户、可另批**：E2E `check-locators` 规则 3（动态 getByRole 未 scope）

**常驻纪律（事故换来的，不得退色）**

- 改 `desktop/src-tauri/` 必本地跑 `cargo test`（含真 IPC/ACL）：`tauri-build` 用**严格 JSON 解析器**，9/12 那笔 `//` 注释就是只跑 server/web 就交、CI 单红 desktop job 换来的（本地“全绿”是假全绿）
- **动桌面端 `@tauri-apps/*` JS SDK 必同批把 `Cargo.lock` 配到同号**（核心同 minor、插件精确同号），并跑 `npx tauri info` 留证：该比对只在 `tauri build/dev/info` 触发，**CI 四 job 全绿不等于发版流水线不红**（10-13 靠 dependabot 单边跳版换来的）
- **模板区禁写「内联箭头函数/闭包内访问 import 绑定的属性或元素」**：vue-tsc 3.3.12/3.3.13 有 dotValue 误插 `.value` 的回归（上游 #6238 未合并），须抽成 `<script setup>` 具名 `function`；复发点见 10-13 批条
- 门禁缺口已清：`check-file-size.mjs` SCOPES 已覆盖 server/web/desktop/shared 四层（F-44），ALLOWLIST 仅剩 PriceCard 一项（Home.vue 已于 10-21 清偿）；禁止用调高冻结值给长胖文件续命
- **悬浮投影窗 SQL 最小权限**：只有截稿窗可授 `sql:default`，永不给 execute；改悬浮窗数据面必跑 `cargo test`（`desktop/src-tauri/tests/acl.rs` 真 ACL）。

**已拍板规则**

- 结论级证据摘要入库（2026-09-29，better-harness 修复批）：入库台账引用的拍板/验收证据，若逐条详单只住 gitignore 的 `AGENTS/`，须在 `docs/comms/evidence/` 留读者安全摘要（判定要点+日期+本机指针），细节只写一份不互抄；约定见该目录 README。
  - 首件：`证据-记忆库维护批-20260929.md`（锚待办 U23/U24）；temp 下可执行脚本是否收编仍待拍板（U19=G5/F-40），本条不裁决。
- F-44（2026-09-20）：巨型文件防阀扩射 `desktop/src`、`shared/src`（better-harness 修复批，用户裁决选项①「扩射程+冻结豁免」）。存量超线按冻结值豁免：`desktop/src/views/Home.vue` 807 / `shared/src/components/PriceCard.vue` 1094，只许拆小不许再长。
- F-44 顺手消红（沿 9/12「胖了就拆」口径）：`TplGallery.vue` 被 9/17 审计批顶到 808 行的存量违规已拆。
  - 点赞逻辑拆至 `composables/useGalleryLikes.ts`（逐字搬移零行为变更）
  - 与并行 G 批的 TplAlbumStage 拆分共熔；web 四道门禁绿（含 typecheck，test 140 文件 959 例）
- STATUS 单行长度防阀（2026-09-20，better-harness 修复批，用户裁决选项①）：新增 `scripts/check-status-line.mjs`，只判本次变更新增行 >200 字符，存量长行不报；已挂 accept.ps1 第 18 道，「门禁全绿」口径改十八道（AGENTS.md 已同步）。
- F-35（2026-09-20）：四个岗位书（`.qoder/agents/huiyue-*.md`）入库受版本管理。`.gitignore` 改 `.qoder/*` + `!.qoder/agents/` 例外。AGENTS-v2.md 第 18 行「版本管理留痕」现为事实。
- F-43（2026-09-20）：`docs/soul/skills/` 技能库整体归档至 `docs/comms/archive/skills/`，定位为历史文档。路径引用（.js→.ts）已批量修正到工作树真实目标，multi-agent-collaboration-setup 补 SKILL.md，原位置留指针 `docs/soul/skills-ARCHIVED.md`。
- 收口留痕约定（2026-09-29，better-harness 修复批，用户拍板）：任务内写明校验条款的，收口时须把校验命令完整输出留存进台账/报告文件（落 `AGENTS/` 批次目录或 accept.ps1 既有日志），不许只在对话里交结论；摘要须引用留痕路径。轻量纪律不新增门禁，条款全文落 AGENTS.md「改动后最小验证清单」节。
- changelog 滚动分册（2026-09-27，用户「按推荐走」）：活档 docs/changelog.md 体积门 ≤40KB/450 行 + 新增/改动 H2 段 ≤4KB，
  门脚本 scripts/check-changelog-size.mjs（accept 第 19 道，存量段 HEAD 基线豁免沿 F-44 口径）；
  撞线唯一处置=oldest 段整搬 docs/changelog-archive/ 新卷并逐行哈希校验，禁调高阈值续命。
  职责分工：changelog=工程台账，对外版本叙事=GitHub Releases（正文自活档顶部条目摘编，防双写漂移以台账为事实源）。
- 中间产物归口（2026-09-27）：新建 `AGENTS/`，原根 `temp/`（3428 文件）与 `workspace/`（966 文件）整体迁入，文件数·目录数·字节数前后完全一致（零丢失）。
  - `.gitignore` 加 `AGENTS/*` + `!AGENTS/README.md` 例外；旧 `temp/`、`workspace/` 两行保留作防回退。子目录约定与纪律见 `AGENTS/README.md`（唯一入库件），AGENTS.md「注意事项」已同步一条归口纪律。
  - 硬编码路径同步改 2 处：`accept.ps1:45,47`（门禁报告与日志）、`post-merge-deploy.ps1:111,118`（验收报告查找）；实测新路径生效、根目录无误建、50 份 accept-master 报告仍可被找到。
  - 文档指针改 6 处（本文件）+ README·changelog·待办 U19 各 1 处；原 237 字的超长行按防阀口径拆短，去空白字符差恰为 +44（6×`AGENTS/` + 拆行前缀）零丢失。
  - ⚠️ 根目录 4 个 `proto-desktop-home-*.html` **不是冗余、不得删**：`design/r2/README.md` 明载「功能安放的定稿是仓库根同名三件」，A 为选定方向终验件；design/r2/ 下三件是外部回稿原件（缺墨笔菜单等六件功能安放）。
  - 收拾：`.pytest_cache`（5 文件）、`test-results`（1）、`playwright-report`（1）三处可再生残留搬入 `AGENTS/temp/cleanup-20260927/`，7 文件 566212 字节零丢失；`.pytest_cache/` 补进 .gitignore 作仓库级防御。
  - 不动项：`design/`、`.impeccable/` 是在库设计资产（`.impeccable` 系 `3c5533c3` 有意留档的核查截图；9/27 复核订正：实为 2 处活引用——本文件与审计工单，桌面侧引用已随归档搬动；PRODUCT.md 无路径引用，原「4 份文档引用」说法不实）。
  - 不动项续：playwright 两个输出目录**位置不改**——`.github/workflows/e2e.yml:66-75` 硬依赖其根目录位置上传排障 artifact，改位置须连 CI 一起改，属单独批。
  - 门禁：改动未提交时 accept.ps1 前置拦截 exit 2（038 防再发，属预期）；三道防阀单独跑绿（巨型文件 587 / test-tamper 0 变更 / status-line 7 行）；提交后复跑完整十八道再 push。
- 纯文档批降级通道（2026-09-29，better-harness 修复批，用户直接授权）：`post-merge-deploy.ps1` STEP0 验收联动新增降级口——报告 verdict=green 仅 HEAD 不一致时，
  若报告 SHA..HEAD 全部提交只触及 `docs/**`、`desktop/docs/**`、任意 `.md`（`$ACCEPT_DOC_PATH`），记 WARN 放行而非 Stop-Fail。
  - 不扩大：verdict=red、报告陈旧(>24h)、SHA 不可解析（离线/历史改写）仍阻断；降级分支已显式守 `$staleH -le 24` 防短路陈旧门；改路径清单须先在本节拍板；$ACCEPT_EXEMPT 仍空表不动。
  - 既有绕过留痕不变：-Force / -SkipAccept 仍记 WARN（本批顺手补上 -SkipAccept 实际未写的 WARN 行），阻断仍走 Stop-Fail 写告警文件。
  - 验证：沙盒 git 仓八景（纯文档领先→WARN 放行；含代码/离线 SHA/红报告/25h 陈旧→阻断；-Force/-SkipAccept/dirty 景行为不变），取证件 `AGENTS/temp/docdowngrade-20260929/results.md`。详见 changelog 同批条。

**起手必读**：**⚑ 下次开工第一件事**：读顶部看板（HEAD `04ddfbd1`，U45/U46 + Dependabot #19/#20 已收口并 push）→ 再读 **⚑ 下方正文第一条（2026-10-21 两批收口）**；余下待用户项看板第 2~4 条。

**起手必读续**：→ 交接档 `docs/comms/交接-20260912-会话收口与待拍清单.md` → 本节看板 → `AGENTS.md`（含「STATUS 体例与归档纪律」）→ 碰桌面端再读 `desktop/docs/STATUS.md` 顶部。

**起手必读续二**：改桌面 UI 必跑 `huiyue-layout-audit` 自检循环（**宿主级技能**，住 `%USERPROFILE%\.agents\skills\huiyue-layout-audit\`，不在仓库属正常；VL 评审通道不可用，只能 measure.mjs + 人工逐项清单）。

>  📌 **2026-10-21 三批收口：U45/U46 修复批 + Dependabot #19/#20 + N×M 尺寸覆盖（一号自主批）**
>
> - **U45 已闭合**：截稿悬浮窗本地模式原会因缺少 `sql:execute` 静默失败，再把失败渲染成「近期无截稿」；现改走 `openLocalDbReadOnly()`（不建表）并消费 `ledger.unavailable`，失败一律说「暂时取不到截稿」。
> - **权限收窄**：`floating.json` 只保留 core+拖动；新建 `floating-deadline.json` 仅给截稿窗 `sql:default`（close/load/select，无 execute）；timer/today-todo 零 SQL 权限。
> - **启动竞态**：本地模式先由主窗 `ledger.loadAll()` 建表，再恢复撕出的悬浮窗；`loadAll` 成功即复位 `unavailable`，瞬时失败可自愈。
> - **U46 防线**：`tests/acl.rs` 用 tauri::test 走真 IPC/ACL：主窗 execute 通、截稿窗 select 通/execute 拒、计时窗 load 拒；CI desktop job 改跑 `cargo test`（manifest 链测试 exe 见 changelog）。
> - **F-44 清偿**：`Home.vue` 的内联截稿提醒映射抽到 `localGlance.buildLocalDeadlineAlerts`（行为不变，+1 单测），807→800 行；`check-file-size` ALLOWLIST 移除 Home.vue。
> - **门禁工具**：`accept.ps1` 的 12MB 级测试输出改流式落盘，server vitest 偶发管道死锁已消；门禁数量与口径不变。
> - **依赖双 PR**：#19 + #20 同批合；`vue-tsc` 3.3.13 三端对齐；`@tauri-apps/*` 与 `typescript` 未动，成对规矩不触发；五目录 `npm audit` 0。
> - **N×M 覆盖批**：新增 `GET /api/artist/art-styles/overrides`（requireAuth 按画师过滤、单条 JOIN），画风页预载从 N×M 次 GET 收成 1 次；`groupSizeOverrides` 纯函数 + `loadSeq` 守卫保留；server +5 / web +8 例。
> - **验证**：十九道全绿 @ `f8258703`（381s；前两轮 @ `4d6bf0b6` / 406s、`04ddfbd1` / 433s）；server 1852 / web 990 / desktop 570 / shared 27 / E2E 14；`cargo test` 1 例（真 IPC/ACL）。
> - **留痕**：`AGENTS/artifacts/` 下 `U45-U46修复批-20261020/` 与 `N×M批量覆盖批-20261021/`；归档 `docs/comms/archive-20261021/`。

>  📌 **2026-10-19 技术债四合一批收口（用户拍板全做：changelog 分册 + U25 dompurify 4 + U31 桌面工具链收敛 + U32 权限补齐）**
>
> - **拓扑**：三路 worktree 并行（A docs / B server / C desktop，领地零交叉），一号串行收口；施工书、三份派工单与三份 ledger 在 `AGENTS/artifacts/施工书-技术债四合一批-20261019/`。
> - **A 路 changelog 滚动分册**：活档 40524 B 撞 40KB 阀，最旧 12 段（基线 L107–L279，173 行 / 16372 B）整搬
>   `docs/changelog-archive/changelog-1.0-early-20261019.md`；搬后活档 24492 B / 111 行（余量约 15.5KB）。
>   - 零丢失证据（一号独立反证，未复用施工方脚本口径）：新活档去掉本次新指针 + 归档正文 173 行拼回整份，与基线**全文件 SHA-256 全等**（`cb57d265…`，283 行 / 40524 B）。
>   - **边界订正**：施工书原写 L107–L283，会把活档尾部三条既有 📦 归档指针（L280–L282）一起吞掉；实际边界 L107–L279。
>   - 新指针行文案按实测范围写 2026-08-19 ~ 09-12（施工书原写「08-23 及更早」不准）。
> - **B 路 U25**：`isomorphic-dompurify` ^3.22.0 → ^4.6.0（分支 1 commit，`server/src/shared/sanitize.ts` 零改动）。
>   - **事实订正**：3.22.0 与 4.6.0 的 `engines` **完全相同**（`^22.22.2 || ^24.15.0 || >=26.0.0`），且现装 3.22.0 早已带 jsdom 30；
>     施工书「4.x 才正式声明 Node 要求」不成立，Dockerfile / engines / Node 版本一律未动，生产 `node:22-slim` 无新增风险。
>   - lock 变动面仅 dompurify/jsdom 子树 4 款、零包增删；`@asamuzakjp/dom-selector` 9.2.4→10.0.4 系 jsdom 30.1.3 上游自己提的要求；`npm audit` 前后均 0。
>   - RETURN_DOM 路径经 TC-F5-01~03 直接断言覆盖，本批不补测试，1847 例前后一致。
> - **C 路 U31**：desktop `typescript` ~5.6.2 → ~5.9.0（实装 5.9.3）、`vue-tsc` ^2.1.10 → ^3.3.12（实装 3.3.12），与 web/shared **声明 + lock + 实装三层逐字对齐**。
>   - C-1 先 commit 作安全锚；npm 会把 `^3.3.12` 自动写成 `^3.3.13`，C 路钉回精确版才谈得上「对齐」。
>   - **正面结论（免得后续会话误欠一笔返工）**：desktop 未受 vue-tsc 3.3.x dotValue 回归影响——模板内联箭头仅 2 处、触碰 import 绑定 0 处，`npm run build` 零诊断，`src/**` 一行未改。
>   - 「零爆错」经探针自证：临时插必错 .vue（模板 TS2339 + script TS2322）确证会报错；探针未进任何 commit，磁盘无残留。
>   - tsconfig 口径对齐**本批未做**（已列禁区，另批）；`cargo check` exit=0（复用主仓 target）；`npx tauri info` 已留证。
> - **C-附 U32**：`capabilities/default.json` 补 `sql:allow-execute` + `opener:allow-open-path`（缺口经插件 `default.toml` 源码坐实，非推测）。
>   - sql 2.5.0 default = close/load/select（无 execute）；opener 2.7.0 default = open-url/reveal-item/default-urls（无 open-path）。
>   - 调用点 `desktop/src/bridge/db.ts:102` 建表 execute、`bridge/index.ts:45-46` openPath；`floating.json` 权限面不含二者，未动。
>   - ⚠ 证据原止于静态与构建期——**10-19 已补运行时冒烟（见下「四项已裁」第②项），`sql:allow-execute` 已确证；`opener:allow-open-path` 仍待人点**（它失败无痕，只能真人在本地记账展开文件行点「打开」）。
> - **收口**：三路 --no-ff 合并 `71d09eef`/`1ddcd733`/`01b3fcae` 零冲突；`pwsh scripts/accept.ps1` **十九道全绿 @ `01b3fcae`（678s）**；
>   完整输出留 `AGENTS/artifacts/施工书-技术债四合一批-20261019/accept-19gates-20261019.log`；计数与基线吻合，`accept-baseline.json` 未动。
>   - 合并后主仓须在 `server/`、`desktop/` 各跑一次 `npm install` 才能让 node_modules 跟上合并后的 lock（worktree 双副本既有约定），本批已跑。
> - **本批四项待拍板已裁（用户 10-19 口头拍定，均已执行）**：
>   - ① **undici 已提版**：`server/package.json` 的 `overrides.undici` `^8.10.2` → `^8.12.1`（实装 8.12.2），让 jsdom 30.1.3 吃到自己声明的下界。该 override 系 `596c4445` 为清零 18 条警报而设，同 major 内取新不违背钉版意图。
>     lock 只动 1 款、零包增删；`npm ls undici` 唯一消费者就是 `isomorphic-dompurify → jsdom → undici`；audit 0；server 三道重跑全绿（159/1847）。
>   - ② **U32 运行时冒烟已跑（用户放行弹真窗）**：起 `npm run tauri dev`，cargo 21.48s 完成后拉起 `desktop.exe`；
>     客观证据不用读屏：**启动前本机 `%APPDATA%\com.shihui.desktop\local.db` 实测 0 张表，拉起后首次探针即 7 张表齐全**
>     （`local_orders/files/profile/templates/img_cache/time_log/order_time`）→ `sql:allow-execute` 运行时确认生效；测完已关进程零残留。
>   - ③ **归档卷头注路径**：用户裁「照旧留着」（仓内已有多处指 `AGENTS/` 的台账引用，不为孤例）。
>   - ④ **溢文归档已单独一批做完**：正文第 6 块「9/27 changelog 滚动分册批」（L190–L198，9 行 / 1800 B）整搬
>     `docs/comms/archive-20261019/STATUS溢文…`→ 正文回到 5 块；零丢失用**整份重建法**证：新主档去指针行 + 归档正文放回原位，与基线 `f7dbb44e` 全文件 SHA-256 逐字节相等（`a5d74da8…`，218 行）。
> - **冒烟顺手捣出两笔（新增待办 U45 / U46，本批未动）**：
>   - **U45 不是理论风险，是已经坏过的事实**：Rust 侧 `tauri_plugin_sql::Builder::default().build()` **不带 migrations**（`lib.rs:46` 注释自述建表全靠前端），
>     而本机 `local.db` 创建后（mtime 8/27）一直是空库——即修复前桌面本地记账在本机从未真正建过表，失败被 `localLedger.ts` 的 catch 吞成 `unavailable`。
>   - **U45 已静态定性为真缺陷（条件触发；一号 10-20 直读代码复核，未只信侦察报告）**：
>     `floating.json` 的 `windows` 三串与 Rust `window.rs:57-65` 拼出的 label 逐字匹配（无回落坑），且 `git log -S sql` 对该文件**零命中** → 从创建起就没 sql 权限；
>     `FloatDeadline.vue:29-40` 本地分支无条件 `await ledger.loadAll()`，而 `localLedger.ts:105-109` 的 catch **吞异常不外抛**只置 `unavailable`，
>     所以组件 L38 那个 catch 永远打不着 → `failed` 恒为 false → 模板 L47 交出漂亮的假空态「近期无截稿，从容落笔」（比报错更误导人）。
>   - **一号发现的集成缺口（侦察报里没有）**：`unavailable` 在主窗是有消费的（`schedule.ts:116`、`LedgerPanel.vue:164`、三个工具页），**唯 `FloatDeadline.vue` 没读它**
>     → 所以修复面不是“加两行权限”那么简单：只补权限会把下一次同类静默仍然藏住；两件事得一起做。细则见施工书-U45U46修复批。
>   - **U46 测试盲区**：全仓桌面端 **零条真 IPC 测试**——vitest 全部 `vi.mock` bridge 或走 happy-dom 逃生门降级，Rust 侧无 test，无 WebDriver 层；
>     ACL 缺口在这套门禁下天生测不到（十九道全绿期间本地记账其实一直是坏的）。本批两条新权限只靠静态+本次冒烟兼容。
> - **收口追加**：拍板项落地后重跑 `pwsh scripts/accept.ps1` **第二轮十九道全绿 @ `aaa5164e`（659s）**，
>   输出留 `AGENTS/artifacts/施工书-技术债四合一批-20261019/accept-19gates-round2.log`（首轮 `01b3fcae`/678s 同期保留）。

>  📌 **2026-10-19 可做批收口（用户授权全做：web 前端三小坑 + STATUS 溢文归档 + accept 看板监测修复）**
>
> - **触发**：用户问「还有什么能做」，一号筛出无需拍板、领地不冲突的两批 + 一处门禁监测 bug。
> - **A 批 web 前端小坑**（分支 `web-frontend-fixes-1018`，5 文件零测试改动）：
>   - U29b 二次验证弹窗关闭清空已消费动态码（StepUpDialog watch 关闭分支）
>   - U29a 举报页 typeLabel 空值兜底防生键（对齐 AdminActions 范式）
>   - U28b 非管理员进 /admin 补「权限不足」提示 + zh/en 双 locale 键
> - **B 批 STATUS 溢文归档**（分支 `status-archive-1018`）：9/17 审计、9/25 今天吃什么、9/27 黄红灯三块整搬 `archive-20261019/`；收口以 git 同源逐行程序化核实 47 行零丢失、STATUS 只余 3 指针。
> - **附带修 bug**：accept.ps1 看板 HEAD 比对正则自 10-13 起恒不匹配真实看板格式（`**HEAD 与推送**`），监测静默失效只报「无法比对」；放宽为「`**HEAD` 开头 + 行内首个反引号短哈希」，功能恢复。
> - **两 worktree 并行隔离**：均基于干净 master，收口 --ff-only 快进到 `9c2e8d65`（桌面热力图批已提交）后 --no-ff 合并回 master，零越界。
> - **门禁**：accept.ps1 十九道全绿 @ `7d9d0f03`（692s；server 1847/web 982/desktop 551/shared 27/E2E 14）
>   - test-tamper 首轮红=桌面热力图批 `9c2e8d65` 新增 heatmap.test.ts（新功能配套新测试，additive），非本批引起，诚实 ack 放行
> - **留痕**：`AGENTS/artifacts/施工书-可做批-20261018/`（施工书 A/B + ledger-A/B + ledger-closeout + 门禁日志）。


>  📌 **2026-10-13 PR 与警报治理批（用户拍板：连 Rust 成对升级 / 桌面 TS 退回 5.6 / 改 bot 分支→门禁→合并代推）**
>
> - **触发**：新通道首次交出的两份可审 PR（待办 U30）+ 唯一开放警报 #83 rustls（medium）。
> - **#16 先合**：本地 `cargo check` exit=0（19.4s 增量）→ `gh pr merge 16 --merge`（master `7e6435f5`）；
>   警报 #83 随即 `state=fixed`（fixed_at 2026-10-13T06:44Z），**零 dismiss**。
> - **#15 到手是红的**：CI web job 报一条 TS2339，本地按 PR 锁 `npm ci` 复现出同一条。
> - **归因（三路侦察 + 一路推翻式复验，结论冲突时以复验为准）**：真凶是 vue-tsc 3.3.12 的 dotValue 双趟模板解包，不是 element-plus——
>   2.14.3 与 2.14.7 的 `message/index.d.ts` 逐字节相同、`onExceed` 契约未变，且该 PR 未动 vue/typescript。
>   上游 vuejs/language-tools 同型 issue #6237、修复 PR #6238 本日仍 open，3.3.13 的 codegen 文件与 3.3.12 哈希全同，等不到。
> - **修法（改写法根治，零 any 零 @ts-ignore）**：`ManualOrderLeft.vue:45` 的 `:on-exceed` 抽成具名 `function handleRefExceed`；
>   同通道近失点 `AdminDashboard.vue:52` 抽 `artistStatusType()`；补 1 例哨兵，web 981→982 并同步 `accept-baseline.json`。
> - **桌面端成对升级（本批最大面）**：官方要求核心同 minor、插件精确同号，而 dependabot 只跑 npm 生态、天然无法成对；
>   该比对只在 `tauri build/dev/info` 触发，CI desktop job 只跑 cargo check → **不配 Rust 就把雷埋进下次发版**。
>   6 条 `cargo update --precise` 配号：tauri 2.12.2 / updater 2.13.2 / sql 2.5.0 / notification 2.5.1 / dialog 2.8.1 / opener 2.7.0；
>   连带 wry 0.57.0、tao 0.37.1、muda 0.20.0、tray-icon 0.25.1、plugin-fs 2.7.0、windows 0.62.2；四个无 npm 对子的 Rust-only 插件不动。
> - **独立复验定论**：Cargo.lock 版本集变动 50 项（29 升级 / 12 新增 / 9 删除）逐项可追溯到 6 条 --precise 及其传递面，**无本仓直接依赖被越范围推动**；
>   其中 cargo_toml 0.22→1.0.1、urlpattern 0.3→0.6、json-patch 3→4.2、brotli 8→9、ctor 0.8→1.0.13、window-vibrancy 0.6→0.8、webview2-com 0.38→0.39
>   属 semver-major 级传递跃迁（构建期链 = tauri-build 2.7.2 + cargo_toml 1.0.1），本仓无直接依赖；13 条权限标识在新版全部存在；tauri-utils 2.10.1 对本仓 conf 无解析风险。
> - **行为保持核实**：updater 2.13.2 `restart_after_install` 默认 true + `install_mode` 默认 passive → NSIS 仍 `/P /R`，与 2.10.1 一致，故不动 conf。
> - **登记已知行为变更**：tao 0.37 起 `WM_ENDSESSION` 直接退出进程，系统关机时「关闭到托盘」偏好不再拦截（非阻塞）。
> - **机制关闸**：`.github/dependabot.yml` 拆 `/desktop` 独立条目并 ignore `@tauri-apps/*` + `typescript`；Rust 侧不建 version updates 通道。
>   并把桌面端 6 个 `@tauri-apps` JS 改为**精确版本**（与 Cargo.lock 同号）——成对不变量从“只靠 lockfile”抬到声明层，防人手 `npm install` 把 JS 单推（锁仅变 6 行 specifier，解析版本零变动）。
> - **子代理交叉核验后补的两笔回写**：分组 PR 夹带的 **44 处传递依赖跳 major** 逐条清点并登记为已评审可接受（进生产包的只 @vueuse/core 与 content-disposition，两项均已核无害）；
>   `THIRD-PARTY-NOTICES.md` 实测回写 @simplewebauthn/server 13.3.2→13.3.3；`accept-baseline.json` 的 note/updatedAt 跟到 10-13；`AGENTS.md` 验证清单补上 tauri info 那一口；`docs/CONTEXT.md` 去掉写死的 E2E 条数。
> - **验证**：`cargo check` exit=0；`npx tauri info` 无 mismatch；`npm run tauri dev` 起壳成功、`desktop.exe` 存活、日志零 panic 零 unknown permission；
>   **accept.ps1 十九道全绿 @ `d549798b`（再跑一遍也绿：server 1847 / web 982 / desktop 538 / shared 27 / E2E 14；首跑在代码三笔 `5e91cb44`，563s）**；五目录 `npm audit` 全 0；
>   磁盘实装核对 typescript 5.6.3 / vue-tsc 2.2.12 / @tauri-apps 逐条同号（声明=磁盘=crate 三方全等）；
>   真浏览器冒烟三轮（临时件跑完即删）：6 张参考图全不入队 + 弹「最多上传5张参考图」；收入导出真下 CSV（落盘含播种金额）；参考图上传成功路径且头为带 boundary 的 multipart；
>   截图两张存 `AGENTS/deps-pr15-pairing-20261013/smoke-*.png` 并已目视核对。登录/Passkey/管理员 step-up 由 E2E 14 例在真实 Chromium 下覆盖。
> - **待你终验（只有真窗能判）**：标题栏拖拽/最小/最大/还原/关闭、托盘左键与菜单、通知是否重复弹、原生文件选择器 open/save、
>   本地记账读写与跨窗广播、撕悬浮三窗。代理侧只证到「能起壳、无 Rust 报错、无权限报错」。
> - **遗留转待拍板**：U31 桌面工具链与 web/shared 收敛；U32 capabilities 两处既有缺口 `sql:allow-execute` / `opener:allow-open-path`；
>   U25 isomorphic-dompurify major；U26 server tsx 生产依赖；U27 STATUS 溢文归档（本批后正文 8 块）。
> - **发版路径实跑（收口后补）**：本机 `npx tauri build --bundles nsis` 已验到两件事——release 编译通过（1m07s）与 **CLI 版本比对闸不报错**（日志进到 `Info Patching ... nsis` / `Verifying NSIS package`）；
>   卡在从 GitHub 下 NSIS 工具链（本机网络两次失败：TLS 意外断连 / global timeout），属环境不是代码。另 `cargo tree -i rustls` 实测 rustls 0.23.45 单副本且确实经 updater←reqwest 可达。
> - **顺手探明的发版前置缺口（新立 U33）**：`desktop-release.yml` 运行记录为零、仓库 vars/secrets 各 0 条、无 `desktop-v*` tag；
>   且 conf 无 `bundle.createUpdaterArtifacts` 而流水线硬找 `*.nsis.zip`（官方口径只有 `"v1Compatible"` 才出该命名）——首版发布前须先配好，代理代不了。
> - **体积提示**：changelog 活档本批收口后实测 **40524 B / 283 行**（阀值 40KB / 450 行），只剩不到 450 字节的余量；下批顶插前**先按口径把最旧段整搬分册**（逐行哈希零丢失），不要等撞线再做。
> - **入库证据锚**：`docs/comms/evidence/证据-PR与警报治理批-20261013.md`；本机详单 `AGENTS/deps-pr15-pairing-20261013/`。
> - **当日续单**：#15 合入后新通道按新配置立即重算，交出 #17（server @fastify/static 10.1.5→10.1.6、web vue-i18n 11.4.13→11.4.14、prettier 3.9.9→3.9.10，均为上游刚发的 patch）；
>   本地十九道全绿 @ `c39d14e6`（593s）+ CI 六项绿后合入。终态：开放警报 0、CodeQL 0、开放 PR 0；桌面 `@tauri-apps/*` 屏蔽后 #17 果然不再碰 JS SDK，关闸生效首证。


>  📌 **2026-10-12 依赖警报根治批（用户拍板三项：拆 axios / 四端 audit 全清零 / 加 dependabot.yml；含 web HTTP 层重写）**
>
> - **触发**：11 条 Dependabot 开放警报（axios ×8、busboy ×1、dompurify ×2）+ 两个开放 PR；CodeQL 开放 0。
> - **逐条研判**：axios 单周 12 个 GHSA、独占 8 条警报→判定整包删除而非升版；busboy/dompurify 属范围内可取已修版；
>   dompurify 公告只影响 IN_PLACE + 移除节点的 afterSanitize 钩子，本项目用 afterSanitizeAttributes 且非 IN_PLACE，实际不可利用但仍升级。
> - **批A `8c80537a`**：四端锁 PATCH 定点刷新（fastify 5.12.5 / sharp 0.35.5 / busboy 3.2.3 / dompurify 3.4.16 / vue 3.5.43 / source-map-js 1.2.2 / postcss-selector-parser 7.1.6）；77 条目全 PATCH、0 major 0 增删。
> - **批B `c2b3a18e`**：`web/src/api/modules/http.ts` 由 axios 实例+拦截器改为浏览器原生 fetch，对外契约逐字不变（251 处 helper 调用点与全部 view/store 不动）；锁内 axios 及传递依赖共 25 包移除。
> - **测试**：新增 `http.test.ts` 14 例防再发锁；`bindRequired401` 只换驱动管道不改断言；web 967→981，`accept-baseline.json` 已同步。
> - **验证**：accept.ps1 十九道全绿（685s；server 1847 / web 981 / desktop 538 / shared 27 / E2E 14）；五处 npm audit 归零；五条链路真机验通（登录 / 客户建单含查单链接 / 图片上传 / CSV 导出 / 管理后台含二次验证与筛选），控制台零 error、零脏查询串。
> - **机制**：新增 `.github/dependabot.yml`（五目录 / 周一 02:00 / minor+patch 合并单 PR / major 不自动出）；PR #13/#14 已关并写明理由，开放 PR 归零。
> - **同批前置两笔**：`0fb3cf82` 工具铺认领批补入库（侦察兵定性：已拍板、已逐件实跑、已三方合并，唯独从未 git add）；`dfaca136` changelog 撞 40KB 线，最旧两段整搬新分册（逐行哈希零丢失）。
> - **踩坑两条**：`npm update --package-lock-only` 会连 `node_modules/.package-lock.json` 一起改，导致后续 `npm install` 误判 up-to-date 而磁盘仍旧版；`params` 收窄成 `Record` 会让无索引签名的 interface 编译不过。
> - **数字订正**：本批开工时误记为「12 条 / axios ×7」（把 #76 一条警报里的两份公告当成两条），收口时 gh 实测为 **11 条 / axios ×8**，看板与 changelog 已同步改正。
> - **入库证据锚**：`docs/comms/evidence/证据-依赖警报根治批-20261012.md`；本机详单 `AGENTS/workspace/temp/deps-zerobatch-20261012/`。
> - **遗留待拍板**：isomorphic-dompurify 3.22.0→4.5.0（major）；server 以 tsx 作生产依赖使 source-map-js 进生产链路。

> 📦 **9/29 记忆库维护批（D12/D10 待拍板锚）已归档 → `docs/comms/archive-20261021/STATUS-溢文-2026-09-29-记忆库维护批.md`（2026-10-21 原文原样搬迁）。**


> 📦 **[9/27 changelog 滚动分册批] 已归档 → `docs/comms/archive-20261019/STATUS-溢文-2026-09-27-changelog滚动分册批.md`（2026-10-19 溢文归档批搬出，原文原样搬迁）。**


> 📦 **[9/27 文档专项审计归档批（U18）] 已归档 → `docs/comms/archive-20261019/STATUS-溢文-2026-09-27-文档专项审计归档批.md`（2026-10-19 拆归档批搬出，原文原样搬迁）。**


> 📦 **[9/27 黄红灯] 已归档 → `docs/comms/archive-20261019/STATUS-溢文-2026-09-27-黄红灯.md`（2026-10-19 溢文归档批搬出，原文原样搬迁）。**


> 📦 **[9/25 今天吃什么] 已归档 → `docs/comms/archive-20261019/STATUS-溢文-2026-09-25-今天吃什么.md`（2026-10-19 溢文归档批搬出，原文原样搬迁）。**


> 📦 **[9/17 审计缺陷波1+波2] 已归档 → `docs/comms/archive-20261019/STATUS-溢文-2026-09-17-审计缺陷波1+波2.md`（2026-10-19 溢文归档批搬出，原文原样搬迁）。**



> 📦 **2026-09-13 及更早的历史条目已拆分归档至 docs/comms/archive-20260927/STATUS-archive-20260927.md（2026-09-27 U18 归档批拆分，原文原样搬迁）。**

> 📦 **2026-08-23 及更早的历史条目已拆分归档至 `docs/comms/archive-20260824/STATUS-archive-20260824.md`（824 收整批拆分，原文原样搬迁）。**

