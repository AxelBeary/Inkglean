# 全局状态（一号维护，其他角色只读）

## 看板（2026-09-30 第十五次刷新：harness 修复批同日四笔收口；纯工具与文档，零业务代码）

- **HEAD** `2cb3909d`（本批末笔 + 台账合账笔；ahead 9 待推送，含 9/27 落档遗留 4 笔）；推送前十九道全量已跑绿
- **基线（bdaff173 实测 328s，本批四端用例数零变化）**：server **1847**（159 文件）/ web **967**（142）/ desktop **538**（37）/ shared **27**（4）/ E2E **14**
  - 本批四笔：`bdf1a5bb` 日志轮转接管 / `d5e0fb8e` accept 基线 v4 + test-tamper 扩射 desktop·shared / `f84aeaa6` 证据入库约定 / `2cb3909d` 部署门禁纯文档批降级通道
  - 迁移 **v76**；版本 server·web 1.0.1、桌面 0.1.0；`scripts/accept-baseline.json` 未动
  - 「门禁全绿」口径为**十九道**（含第 18 道 STATUS 单行防阀、第 19 道 changelog 体积防阀）
- **云端（gh 实测）**：CI / E2E / CodeQL 三条流水线对 `fff6a8a7` 均 success；**Dependabot open 警报回升至 18 条**（5 high / 7 medium / 6 low，推送 `c71d408b` 当场报出）
  - 实测定位：18 条全属**单一传递依赖链** `jsdom@30.0.1 → undici ^8.9.0`（server·web 两端 lock 现锁 8.10.0，需 ≥ 8.10.2）；
    jsdom 在 vitest 开发期链路，不在生产运行时（Docker 镜像与桌面壳均不带），但警报仍须清零才能恢复“open 警报 0”口径
  - 旧记录存档：U20 曾对 `d789ff8a` 清零（#20/#23/#25），CodeQL #26~#30 经 `b6b23479` 清零；本批为 9/29 新披露，非旧账复发
- 公网仍冻结中（停在 v74，本地与远端已到 v76）；默认窗 1200×820、最小窗 1200×600 不变（9/5、826 拍板）
- 🔴 **上线前置硬警告仍有效**：管理员判定只认库值，公网部署前**必须先确认 `platform_config.admin_qq` 非空**

**下一步（按优先级）**

1. 🔴 **下次开工第一件事**：把 `docs/comms/待办-用户侧清单-20260914.md` 逐条端给用户（已销 U14/U15/U20/G1/G2/G3/G4/G6/F-31/F-32/F-35/F-36/U18；剩 Y2~Y7 需用户本人 + U16/U17/G5/G7/U21~U24 需拍板）
2. ✅ **本批（harness 修复批同日四笔）已收口并推送 `c71d408b`**：纯工具与文档改动，十九道全绿（618s），四端用例数零变化
3. **等你终审两处对外文案**：W4 下架横幅措辞、W6 隐私三条 IP 披露（另含 U12 主页文案、U13 安装包署名）
4. **U18 STATUS 归档搬动已做（见下方 9/27 文档治理批条目）**：主卷 26 块→5 块（搬 22）、桌面卷 45 块→5 块（搬 40）；正文满 6 块时再开下一轮归档批
5. **剩红灯需拍板**：U16 板块级下架（重建 reports 表）/ U17 数据服务（另立 REQ+PIPL）/ G5 终验证据链复现性 / G7 F-09 二次重构 / U21 变更史深度（F-19）/ U22 改稿上限（F-23）/ U23 记忆库三维决策优先级边界 / U24 视觉判断通道归属
6. 🔴 **新增待拍（本批推送当场实测发现）**：undici 漏洞链修复——`server` 与 `web` 两处 `package.json` 的 overrides 加 `"undici": "^8.10.2"`，重算 lock 后跑十九道，目标清零 18 条 Dependabot 警报

**常驻纪律（事故换来的，不得退色）**

- 改 `desktop/src-tauri/` 必本地跑 `cargo check`：`tauri-build` 用**严格 JSON 解析器**，9/12 那笔 `//` 注释就是只跑 server/web 就交、CI 单红 desktop job 换来的（本地“全绿”是假全绿）
- 门禁缺口已清：`check-file-size.mjs` SCOPES 已覆盖 server/web/desktop/shared 四层（F-44），ALLOWLIST 仅剩 F-44 两项存量冻结豁免；禁止用调高冻结值给长胖文件续命

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

**起手必读**：**⚑ 下次开工第一件事：向用户逐条端出 `docs/comms/待办-用户侧清单-20260914.md`（U1~U24）提醒他做他那边的活**，再读 **⚑ 下方正文第一条（2026-09-29 记忆库系统性维护批）**。

**起手必读续**：→ 交接档 `docs/comms/交接-20260912-会话收口与待拍清单.md` → 本节看板 → `AGENTS.md`（含「STATUS 体例与归档纪律」）→ 碰桌面端再读 `desktop/docs/STATUS.md` 顶部。

**起手必读续二**：改桌面 UI 必跑 `huiyue-layout-audit` 自检循环（**宿主级技能**，住 `%USERPROFILE%\.agents\skills\huiyue-layout-audit\`，不在仓库属正常；VL 评审通道不可用，只能 measure.mjs + 人工逐项清单）。

>  📌 **2026-09-29 记忆库系统性维护批（AI 自决，15 路辩论代理验证；纯记忆平台操作，零代码零业务文档变更）**
>
> - **触发**：用户要求逐条核查项目记忆/知识/经验/审计中混乱、重复、矛盾、过期、不一致、粒度问题，使用海量子代理辩论式验证防错删。
> - **方法**：全量盘点 356 条→机械预筛 6 疑集群(37条)→12 路正反方辩论+3 路裁判→执行维护。每集群正反两路各读证据包+仓库只读取证→裁判交叉比对→主代理终裁执行。
> - **净效果**：删 4 条（三门槛全过+quarantine留档）、改写/修正/压缩/加注 28 条、纯留 5 条（历史裁定锁死/体例保护）。
> - **P0 事实修正**：SSL 规范卡 `trust_pool` 推荐→实测解析失败禁用，改为 `trusted_ca_cert_file` 唯一写法（OPS.md:360 实测）。
> - **两项待拍板交用户**：D12（停等 vs 不停等优先级边界，e8f5872f↔任务书条）、D10（视觉判断走宿主 Read 还是外部 VL）。
> - **真碰撞待治理**：87d53050 与某 common_pitfalls 条逐字同标题（护栏条自身撞碰撞），本轮只扩 keywords 未动——需走四步甄别。
> - **证据归档**：本机详单 `AGENTS/workspace/temp/mem-audit-20260929/`（SUMMARY.md 总入口、6 证据包、12 辩论书、3 终裁、2 删除快照）。
> - **入库证据锚**：结论级摘要 `docs/comms/evidence/证据-记忆库维护批-20260929.md`（待办 U23/U24 的入库指针，9/29 证据摘要入库约定首件）。
> - **STATUS 归档提醒**：正文已达 6 条，第 6 条（9/17 审计缺陷波1+波2）应搬入 archive 子目录——搬动单独一批做，不与本批混。


> 📌 **2026-09-27 changelog 滚动分册批（用户拍板「按推荐走」A+B+D；纯文档+门禁脚本，零业务代码）**
>
> - **缘起**：文档治理批体检暴露唯一巨型活文档——`docs/changelog.md` 134.6KB/1977 行（此前「1383 行」为 Measure-Object 跳空行长行低估，已按 node 口径纠正）。
> - **侦察**：两路 scout 并行——A 路坐实全仓**零机读零用户渲染**消费（唯一语义引用 README:127）；B 路核实 GitHub Releases 已是对外叙事载体（6 条手写人话版）+ 四方案利弊对比。
> - **A 分册**：活档留 1.0 时代 18 段（304 行/31.6KB），v0.x 53 段整搬 `docs/changelog-archive/changelog-v0-20260927.md`（1686 行）；逐行哈希零丢失，字符差 743 = 声明 418 + 指针 134 + 头注 191 精确到字；「深度待定」段（U21 位）留活档。
> - **B 职责声明**：活档顶部写死维护纪律——本文件=工程台账、对外叙事=Releases（正文自顶部条目摘编、以本文件为事实源防双写漂移）、顶插+不删历史只标注+滚动分册触发。
> - **D 防阀**：新门 `scripts/check-changelog-size.mjs`（≤40KB/≤450 行；新增/改动 H2 段 ≤4KB，存量段 HEAD 基线豁免——沿 F-44「存量冻结、禁调高阈值续命」口径）；挂 accept.ps1 第 19 道；AGENTS.md「十八道」→「十九道」。
> - **自测**：红绿双向——旧 134KB 大文件必红、模拟新增 5.5KB 段必红、现活档绿；拆分脚本幂等可复跑（红测误用 git checkout 回滚过一次，复跑恢复且输出逐字节一致——教训：未提交件禁 checkout）。
> - **顺序纪律**：U21 若拍补登，落笔在活档「深度待定」段下；分册先于补登，防补写内容直接落进待归档区间。


> 📌 **2026-09-27 文档专项审计归档批（U18 销账；纯文档零代码；五路侦察交叉判定 + 待复核子代理复检；本地提交不推送）**
>
> - **触发**：用户拍板「专项审计批次：整理失效/有效/待办文档，必须子代理交叉验证，本地提交不推送」——即本批为 U18 的「单独一批」归档搬动 + 全仓文档分区清点。
> - **方法**：5 路 huiyue-scout 并行只读分区审计（定时开工族/审计施工图族/研判调研族/桌面与台账原型/全局引用死链），报告落 `AGENTS/temp/doc-audit-20260927/`；主代理汇总裁决后执行；收口另派独立复核子代理交叉验证。
> - **STATUS 双档归档（U18）**：本文件正文 26 块→5 块（保留 9/27 黄红灯、9/25 食谱、9/17 审计、9/14 二轮 + 本批），第 6 块起（9/13 五批收口→8/24 2FA 批，共 22 块）整段搬 `docs/comms/archive-20260927/STATUS-archive-20260927.md`（195 行）；
>   桌面 `desktop/docs/STATUS.md` 45 块→5 块（搬 40 块），第 6 块起（8/26 波17 四件→8/24 立项准备）搬 `desktop/docs/archive-20260927/`。两卷均逐行哈希零丢失，拆前/拆后字符差恰等于新增头注+指针行（验收中一度因编辑基线覆盖致搬动段在主卷复活，两路复检拓出后已重切并复验）。
> - **文档归档（docs/comms 搬出 28 件，根目录收至 18 件活文档 + 新建索引 README）**：28 件失效文书 + 落选原型目录 `proto-desktop-home-r2/`（4 件）git mv 入 `docs/comms/archive-20260927/`：
>   两轮定时开工计划书/总纲（除一版总纲）、三份结构债深度分析、9/5 交叉审计总报告、止血任务书、审计修复波1/2 契约、P4-1/P4-2/R2-W7 施工图、多端调研、画师生态调研、模块三件拍板、视觉改造调研两件套、820 交付报告。判定依据逐件写在新目录 README。
> - **保留裁决（侦察意见被一号覆盖/维持的两点）**：一版总纲仍活（其 §6 是待办 U19 所引 G5/G7 详单，交接档仅有摘要）；落地契约-P4 本批暂不归档（U11 终审未定稿，沿用侦察谨慎建议）；11 份 ledger 全保留（STATUS 体例是「台账指针不互抄」，细节唯一存处）；修复工单保留（F-16/19/23/38/40/42 六条未销）。
> - **机械订正簇（侦察实测坐实的过时点）**：迁移号 v74→v76 四处（CONTEXT/OPS 前缀/切换指南/维护说明书）；AGENTS-v2.md 十七道→十八道；
>   PRODUCT.md 默认窗 800×600→1200×820 与 workspace/temp 前缀；DashboardPrefsDrawer.vue 注释前缀；切换指南 L4 悬空句补齐。
> - **子代理落盘路径订正**：`.qoder/agents/huiyue-scout.md`·`huiyue-bughunter.md` 的临时脚本例外条款仍写旧根 `temp/`/`workspace/temp/`（两目录已不存在），改指 `AGENTS/temp/`——不改会误导后续子代理往根目录写。
> - **新立待拍板两项**（从 ledger_P1/修复工单收进待办清单）：U21＝changelog 变更史深度（F-19）；U22＝改稿上限口径（F-23）。另 U6 前置已满足（D4 判据 9/5 已修正，可直接排）。
> - **残留死链如实登记**：req037-acceptance、third-party-report-20260806、prototype-login/paper001 三组产物从未入跟踪、全机已失（非本批迁移丢失）；历史卷内旧 `temp/` 指针按 `AGENTS/README.md` 映射规则解析，不改写原文。
> - **门禁**：纯文档批，按体例跑相关防阀：check-status-line（新增行全 ≤200）、check-file-size（零代码变更）、归档零丢失校验脚本；十八道全量待用户推送前补跑。


> 📌 **2026-09-27 黄红灯集中清批（AI 自决，四端+E2E 门禁亲验全绿，已提交 `c90c79bc`）**
>
> - **触发**：用户「尽量全做、能解决的别来找我手动」授权，主代理自决清黄红灯可自决项，只留真需用户账号/审美/对外文书/拍板者。
> - **代码① N1 主页 hidden 态**：`ArtistHome.vue` onMounted 在 `status==='hidden'` 提前 return，不再并行打 4 个分块端点（对 hidden 一律 404），消除「部分内容加载失败」横幅与下架提示同屏矛盾（侦察抓出的既存 wart）；哨兵 `ArtistHome.hiddenSections.test.ts` 3 例。
> - **代码② G1 签名刷新 TTL 适配**：`useSignatureRefresh.ts` 间隔 10→3 分、补刷阈 8→2 分（旧值按已废 15 分 TTL 设计，后端 H-4 已缩至 5 分，长停留必裂图）；export 三常量 + 口径哨兵；artist.ts/order-list.routes.ts 两处过时「15min」注释改准。
> - **代码③ G2/N2 尾项**：`check-i18n.ts` 加 `--migrate --from --to --expect` 路径迁移（拆件搬文件时存量豁免随迁，取代 9/20 手写一次性脚本）；三重安全断言（命中数≠expect / 迁移后重复 / 新路径扫不到对应违规 均拒写），实测拒写与正常两态已验。
> - **N1 裁决（登记为有意例外）**：主页对 hidden 返 200、其余端点 404 的差异**维持不改**——侦察证实改 404 会推翻 P4-2 §8.3（自隐身被误报「画师不存在」、丢店主自助指引、hidden 与真不存在结构上不可区分），判定已收口于 helper，HTTP 码差异是刻意 UX。
> - **文档 F-31/F-36**：`REQ-014` 加「改判决策基线快照（选项 B，三路同荐）」头注；`纸墨设计语言提案-v1.md` 加「事实源分工（提案=原则/artist-tokens.css=取值）+ 泥金已批·未落实现」标注（实测零泥金 token，不撤拍板不擅补色值）。
> - **文档 G4**：补归档 `.qoder/canvases/audit830-completion-report.canvas.tsx`（gitignored 换机即失）为 `docs/comms/归档-830批完工报告-20260830.md`，含 M-5 归处判定（属 31→27 差额中被剔除、未修未备案，原报告缺失无法独立验证）。
> - **核实后销账六项（既有处置已覆盖，本批未改代码）**：
>   - G3 settings.notify*（honestyCopy 哨兵已锁死键退役、通知开关真实用 preferences 非漏建）；G6「已拍板规则」章节（STATUS 已有，选项 a 成立）；F-32 开发自参考（已有 8/19 时效声明）。
>   - F-35 岗位书入库（9/20 已记）；U20 依赖警报（已清零）；U15 门禁工具批（N2 `a6ac12a9` + 本批 --migrate）。
> - **门禁（主代理亲跑，四端+E2E 全绿）**：
>   - web lint(vue-tsc+tsc+eslint) 0 错 / test **142 文件 967** / check:i18n OK / build 2845 模块。
>   - server typecheck 三配置 0 错 / lint(340 文件) 0 错 0 警 / test **159 文件 1847**；E2E **14 passed（21.7s）**；desktop/shared 未改（accept.ps1 提交后覆盖）。baseline 已同步 web 963→967。
> - **测试同改口径**：新增哨兵 4 例（ArtistHome 3 + useSignatureRefresh TTL 1），卸载用例加 mockClear 适配间隔压缩后合法触发；被删断言 0 条。
> - **U18 未做（纪律）**：STATUS 归档搬动属高风险文本迁移，AGENTS.md 明令「不与代码施工混批」，本批已动代码，留单独批。
> - **收口（已提交推送）**：`c90c79bc` 上 origin/master；accept.ps1 十八道全绿（335s：server 1847/web 967/desktop 538/shared 27/E2E 14；test-tamper 带 ack——新增哨兵为防退色钉非改软断言）；GitHub CI 四 job+E2E+CodeQL 对 c90c79bc 均 success。


> 📌 **2026-09-25 「今天吃什么」库扩建批（两波采集 + 终审波）：495 → 3530 条，单文件拆为 `web/src/utils/food-menu/` 13 分片（已本地提交 `d5864356`，9/27 十八道门禁全绿，待推送）**
>
> - **一波做法**：6 路采集子代理（可联网）并行出草稿 1589 条 → 4 路独立交叉验证（V1 低GI / V2 低嘌呤 / V3 三减 / V4 可点性+查重）→ 主会话脚本化合并（裁决全编码在 `AGENTS/temp/food-expand-20260925/merge-rules.mjs`，可复跑审计）。
> - **二波做法**（用户「还能加更多」追加）：缺口定向再派 6 路（地方药膳/特殊人群/控糖甜品/痛风汤食/全国小吃便利店/异国烘焙饮品 共 1807 条）+ 4 路验证（V5~V8，只审新草稿）+ D1 补齐队落地 92 条改 note；合并脚本 `merge2-rules.mjs`+`merge2.mjs` 同目录可复跑。
> - **终审波（用户追加「查重专路+核实专路」）**：8 路独立终审对 3695 条合并终态全量再核（F0 机械查核 + 痛风×2 + 低GI×2 + 三减×2 + 外卖×2，共审 ~5400 判定行）；两队重叠区判定交叉比对 **冲突 0**。
>   - 落地方式：结构性操作由主会话 merge3 脚本应用（删标 48/删菜 2/补标仲裁）；并条净减 ~185 条、改名 26、裸英文主名归一、机械尾清（功效腔/GI 数值腔）交单一施工队串行落地。
> - **两波+终审累计落地**：删标 ~106；删菜 ~17（编造品/非单品/越线药膳）；改 note ~700；并条 ~185 条净减；改名 71；功效断言/治疗腔/GI 数值科普腔全库清零（含 N2 交出的 15 条残留尾清）。
> - **最终池子**：healthy 1481 / diabetes 1331 / gout 1351 / takeout 1281，共 3530 条；菜名全局唯一。
> - **结构**：13 分片（最大 494 行，800 防阀内）+ index.ts 聚合，导入路径不变，FoodMenu.vue 零改动；防退色单测 `src/utils/__tests__/food-menu.test.ts` 4 例。
> - **门禁（主代理亲跑，终审后全量）**：web lint+typecheck 0 错 / test 141 文件 963 例全绿 / check:i18n OK / build 绿（FoodMenu 独立 lazy chunk gzip 92KB）；防阀 587 文件全过。
>   - 医学口径：糖尿病食养指南 2023 + WS/T 652—2019 / 痛风食养指南 2024 嘌呤分级 / 药膳限食源材料（V7 按保健食品可用名录筛）。页面免责提示不变。
> - **待用户**：本批已本地提交 `d5864356`，待推送。
>   - 9/27 复跑 accept.ps1 十八道全绿；test-tamper 门带 ack 裁决：新增测试为防退色不变量钉、非改软断言。
>   - 草稿、十二份验证/终审报告与可复跑脚本（merge/merge2/merge3/fam）在 `AGENTS/temp/food-expand-20260925/`（gitignored）可查逐条裁决；结构操作前快照存该目录 backup-pre-merge3/。
>   - 另：D 盘根曾残留 21 个 `temp_c10_*.txt`（子代理误写），用户已于 9/27 手动删除，实测归零，销账。


> 📌 **2026-09-17 审计缺陷修复 波1+波2 全量收口（P0×3 + P1 四端；契约驱动 13 路文件领地并行 + 主代理收口亲跑门禁；已本地分批提交、未推送）**
>
> - **事实源**：依 `docs/comms/审计缺陷修复施工清单-20260917.md`（两轮审计发现逐条回代码核实版）修 P0×3 + P1（SRV/WEB/DSK/SHR）；P2（~130）/P3（37）未逐条核实，本迭代不动。
>   - 施工契约 `docs/comms/archive-20260927/施工契约-审计修复波1-20260917.md`·`波2-20260917.md`（9/27 归档）；13 路 ledger 在 `AGENTS/temp/ledgers/`（gitignored，本条已合并其结论与后续项）。
> - **方法**：波1 六路（srvA/B/C + webA + dskA + shrA）、波2 七路（web1~4 + dsk1~3）按**文件领地零重叠**并行派工；主代理收口独占横切项（WEB-14/SRV-17/lib.rs 登记）+ 亲跑四端全量门禁 + e2e 冒烟，不凭子代理自检交差。
> - **P0（3 条全修）**：P0-1 邀请空壳接管（空壳判定收紧为 `totp_secret IS NULL` + confirm 校验 invite_code_uses 存在）；P0-2 手动录单手输价被增项重复叠加（提交序列重排＝先写全部增项、updatePrice 最后绝对覆盖，与 WEB-01 三口径统一）；P0-3 桌面模块沙箱帧外带 ledger（前端根本缓解 canAccessView 门禁：第三方模块运行时拿不到 ledger + 记违规）。
> - **server（SRV-01~17 全处置）**：SRV-03/04 requireAdmin 补桌面账本存在性+过期校验（抽 validateDesktopSession 复用）；SRV-05 OG 缓存 500 条 LRU 上限；SRV-06 迁移 BEGIN IMMEDIATE 跨进程互斥；SRV-07 .bak.vN 只留最近 3 份；SRV-08 身份码上限 10→20；SRV-09 换管理员再验窗口 60s→5min；SRV-10 一次性下载 nonce 原子消费；SRV-11 问候语特别日补 t.artist_id 租户过滤（读+写双向）；SRV-12 删画风/尺寸补在途订单守卫 + E.STYLE_IN_USE/SIZE_IN_USE 错误码；SRV-13 幂等 INSERT 改 ON CONFLICT DO UPDATE；SRV-14 WebAuthn counter 乐观锁；SRV-15 TOTP 重绑接账号级锁定；SRV-16 分期节点两路径对齐 basis_points>0；SRV-01 收入口径改 paid_total_cents 实收（仍按 completed_at 归集）；SRV-02 维持 R7 额度池设计不改后端（有意设计非逻辑错）；SRV-17 不统一 floor/round（折扣码计价 vs 小票对账属独立子系统、差≤1 分有意，两处加注释防误统一）。
> - **web（WEB-01~15 全修）**：WEB-02 默认流程节点开关深拷贝修恒真早退；WEB-03 首页粘贴发布加确认弹窗+条件启用；WEB-04 参考图 v-model:file-list + 跨路径上限统一；WEB-05 画风停用 isLocked 豁免（方案B，免 i18n 越界）；WEB-06 增项胶囊拖尺寸三修（画风级 is_enabled 判定 + 早退清 dragPayload + chip dragend）；WEB-07 点赞 likedIds 改响应式 + 按钮 emit 回传；WEB-08 手动录单入口路由改 /orders/new；WEB-09 开箱向导 onMounted 补 checkStatus + 路由守卫回写 store（口令框终可渲染）；WEB-10 收款/撤销拆独立幂等键；WEB-11 删上传手动 Content-Type（axios 自动带 boundary，加固）；WEB-12 artist store 加 sessionSeq 序号守卫（防换账号串数据）；WEB-13 查单令牌加 30 天 TTL + 删除/清空入口 + logout 清理；WEB-14 crypto.randomUUID 收敛为 generateId()（非安全上下文降级，全仓 9 处业务调用点）；WEB-15 GreetingTable watch artistId 重载。
> - **desktop（DSK-01~13 全处置）**：DSK-01 未接线视图回 unavailable 标记（非静默 null）；DSK-02 导出/备份改走 100MB 桥（解 >5MB 失效）；DSK-03 替换前备份名加时分秒；DSK-04 计时器心跳扣关机时长（超阈收笔暂停）；DSK-05 手动计时按本地午夜切日 + 常驻体检；DSK-06 自动识别跨午夜滚日归零；DSK-07 本月已收改本地月份键（修 UTC 前缀错）；DSK-08 导入本地数据判定扩五类；DSK-09 覆写前跨窗广播关连接 + 删 -wal/-shm 边车；DSK-10 记一笔补 busy 上锁防连点重复落账；DSK-11 导入价格过滤 price<=0 草稿；DSK-12 自动计时按真实流逝计票（修每次进首页虚增 30s）；DSK-13a/c/d/e 模块沙箱 source/origin 双校验 + 灰牌态 guard + 存储注释纠偏 + VIOLATION_LIMIT 常量收敛。
> - **shared**：SHR-01 价目卡布局 A 画布高度预算补组间距 24×(g−1)（修 g≥3 落款/朱砂印章被裁出画布）。
> - 🔴→✅ **波2 e2e 冒烟抓出并修复一处波1 真回归（SRV-06）**：SRV-06 把整段迁移包进一个 BEGIN IMMEDIATE 原子事务后，13 个「非 noTransaction 却调 backupDbBeforeMigration」的常规迁移（v11/12/18~24/36/37/39/52）在事务内走 wal_checkpoint(TRUNCATE)+copyFileSync 备份分支，与活动写事务互斥必报 `database table is locked` → **全新装机 / e2e seed 在 v11 即中止**（server vitest 用 :memory: 早退未覆盖，仅文件库暴露）。修法：事务内跳过 per-version 文件备份（原子事务即全有或全无回滚单元），破坏性重建迁移一律 noTransaction 走事务外 VACUUM INTO 快照（既有约定 v38/43/49/50/64/67~71）。修后 server 1847 全绿 + e2e seed 通过 + 14 例全绿。
> - **门禁（主代理亲跑，非凭汇报）**：server typecheck 三配置 0 错 / lint 0 错 0 警（340 文件）/ **test 159 文件 1847 例**；web typecheck(vue-tsc+tsc) 0 错 / eslint 0 / **test:web 139 文件 955 例** / check:i18n OK（13 条豁免无新增、中英键集一致）/ build 2827 模块绿；desktop eslint 0 / **test 37 文件 538 例** / build(vue-tsc+vite) 绿 / **cargo check 0 错 0 警**；shared lint 0 / **test 4 文件 27 例** / typecheck 0 错；**E2E `npm run test:e2e` 14 passed（31.6s，真实 Chromium 全栈：E1 下单/E6 金钱链路/E7 登录/E10 上传交付等）**。
> - **测试同改标红口径（非改软凑绿）**：module-manifest.test.ts 的 mood-weather source 断言 external→official（P0-3 有意行为变更）、useOrderPayments.test.ts 适配 add/revoke 双键、SRV-01 相关 order.service/audit-price-round 断言随实收口径实改、invite.test.ts TC-INV-07b~d 随 P0-1 空壳收紧改真空壳夹具 + 新增攻击场景 07b2；被删断言 0 条。
> - **越界清点（收口核实）**：零恶性越界。唯一良性越界＝WEB-13 在 locales/zh-CN.ts+en.ts 各加 `track.clearAll` 一键（波2 仅 web4 一路改 locales 无撞车，check:i18n 已验中英成对）；DSK-09 新桥命令 desktop_delete_db_sidecar 的 lib.rs invoke_handler 登记（lib.rs 不在 dsk1 领地）由主代理收口补齐、cargo check 已验。
> - **主代理自主拍板（用户「能自己解决的别来找我」授权）**：WEB-05 取方案B（isLocked 豁免，免 i18n 越界，同样消缺陷）；DSK-04 取「收笔暂停」非自动续跑（不替画师猜停机时长＝缺陷本意）；DSK-11 取 price<=0 过滤；SRV-02 维持额度池设计；SRV-17 不统一取整口径只加注释。
> - **诚实登记的后续项（本批未做，均超粒度或需真机/产品拍板）**：① P0-3 Rust 侧 framenavigated 导航拦截（纵深防御，待 Rust 专项 + WebView2 真机）；② DSK-09 悬浮窗文件锁 / 400ms 广播缓冲 / capabilities floating.json sql 权限（需 WebView2 真机验证）；③ DSK-02 头像 base64 撑库根因（改存文件路径牵动 F3/F4 渲染端 + schema 迁移）；④ DSK-05 手动计时「昨天未落账段」需另立按日存储（新功能非缺陷修复）；⑤ DSK-01 orders/messages 真接线（产品迭代）；⑥ TplLightbox 内点赞回传 TplGallery（后续波次）；⑦ DSK-13c 模块存储死代码完全清理（待协调 bridge/index.ts + lib.rs）；⑧ SRV-01「本月实际到账（含历史尾款）」流水聚合口径（待产品确认）。
> - **提交**：按文件归属分 5 批本地提交（server / shared / web / desktop / docs，禁 git add -A、逐路径暂存）；**未推送**（依项目惯例 push 待用户明示「提交令」）。⚠ STATUS 正文已远超体例「只留最新 5 条」，归档搬动属高风险须单独一批 + 字符总量前后差校验，本批未做（沿 G8 红灯口径登记）。



> 📦 **2026-09-13 及更早的历史条目已拆分归档至 docs/comms/archive-20260927/STATUS-archive-20260927.md（2026-09-27 U18 归档批拆分，原文原样搬迁）。**

> 📦 **2026-08-23 及更早的历史条目已拆分归档至 `docs/comms/archive-20260824/STATUS-archive-20260824.md`（824 收整批拆分，原文原样搬迁）。**

