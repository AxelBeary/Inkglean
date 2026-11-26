# 全局状态（一号维护，其他角色只读）

## 2026-11-27 会话交接（发版与安全公告未完成，**接手先读这条**）

- **当前基线（实测）**：master `3e604935`；迁移 v84；open issue 0 / open PR 0；版本 root 1.1.0 / desktop 0.1.0
- **公网实际跑的版本＝`94f40bfd`**（用户 11-27 确认，很新）：GitHub Release 页仍挂 v1.1.0(10-28)，落后 165 提交——**以部署实测为准，Release 页是旧账**
- 🔴 **发版卡在凭据**：`gh secret list` 与 `gh variable list` **均为空**，`desktop-release.yml` 硬性要求 4 项
  - secret `TAURI_SIGNING_PRIVATE_KEY` / `_PASSWORD`；var `DESKTOP_UPDATE_PUBKEY` / `DESKTOP_UPDATE_BASE`
  - 照做清单 `AGENTS/拍板材料-20261123/B8-照做清单.md`；**U33 流水线从未跑过，首跑需现场调**
  - **用户 11-27 定：凭据明早配**（当天不做）；版本 root **1.2.0** / desktop & tauri **0.2.0**（尚未落到文件）
- 🟢 **GHSA-6pf3 署名口径已定（用户 11-27）**：**不挂 Mistwhisker**（已私下确认）。credits 一栏按此收尾
  - 仍未决：advisory 的 `summary` 现写「未修复」且 `patched_versions` 为空，直接发布会是错误公告
  - 转公开前须把 summary / patched_versions 改成 1.2.0 实况；8 节修复本身已全在 master（证据见交接档 §四）
- **建议顺序**：配凭据 → 改版本号 + changelog + 门禁 → 打 tag 首跑 U33 → 真机终验 → 1.2.0 发出后改 advisory → 转公开
- **工作区状态**：11-27 04:0x 复核 `git status` 无遗留改动；Passkey 修复已入库 `3e604935`（见下条）
- **完整交接**：`AGENTS/pr-audit-20261126/HANDOFF.md`（自包含；本机 gitignore，清理后可能不存在）

## 2026-11-27 Passkey 归因修复入库 + 文档整理批

- **代码**：`3e604935` fix(web) Passkey 注册失败归因——SecurityError 不再误报「浏览器不支持」
  - 根因：`isWebAuthnUnsupported` 把 SecurityError（rp.id 与域名不符/非法）与真·能力缺失 NotSupportedError 归为一类
  - 改动 11 文件 +285/−19；新增 `checkRpId` / `isIpHostname` / `isRpIdSuffixOfHost` / `rpIdProblemKey` 单源归因
  - 一号复核（本机实跑）：web lint 0 错、vitest 198 文件 / 1407 例全绿、check:i18n 中英键集一致；无新增依赖、无越界改动
- **文档（本批，纯文档）**：STATUS 由 46,051 B / 318 行切至下条看板口径，原文一字不改
  - 搬出：看板旧文 L83–L107、正文 5 个 📌 块 L219–L283 → `docs/comms/archive-20261127/`
  - 外置：RuoYi 吸纳评估 L109–L121 → `docs/comms/研究-RuoYi吸纳评估-20261127.md`（原文原样 + 标题头）
  - 零丢失校验：搬出/外置三段逐字节 `includes` 比对全部命中；原文 319 行非空行在新 STATUS + 4 份归档中零缺失（脚本 `AGENTS/temp/verify3.cjs`）
- **看板卡（DSH taskboard）现状**：青芽季遇 3 张（R2 停手 / 重设计新卡 / dp 分档待派）+ antigravn 1 张（体验打磨转 in_review）

## 2026-11-27 #97/#98 收口批（v49 测试补齐 + E2E 回归接门禁）

- **#97 迁移测试覆盖**：补 `server/tests/migration-v49.test.ts`（5 例）——v49 是 84 条迁移里唯一「noTransaction + 备份 + 种子」却零测试的重型重建
  - 钉住四道真实防线：FK 未真关必须中止（v38 事故根因）/ 崩溃残留续 RENAME / 陈旧 `_new` 丢弃 / 幂等重跑
  - 差分断言（全新库 ≡ v1 逐级升级库）**已由 `audit-batch-f-ddl-consistency` 覆盖**（表/列/外键/关键索引/CHECK 五层），无需新写
- **#98 E2E 健壮性**：issue 点名的两处缺陷**早已修好**（F0050 健康检查超时抛错 / F0051 日志转发；端口预检 SCR-01、进程存活判断亦在位）
  - 本次补的是真缺口：`e2e/scripts/*.regression.ts` 四个定向回归**此前无任何门禁或 CI 消费**——写了永远不跑等于没有防线
  - 新增 `scripts/check-e2e-regressions.mjs` 单一入口（显式清单 + 未登记告警 + 失败输出原样带出），接两处：CI e2e job、`accept.ps1` 第二十道
- **门禁口径变化**：`accept.ps1` 十九道 → **二十道**（新增 `e2e-regressions`，排在 Playwright 前做廉价失败），带 `-SkipE2E` 时十八道
- **基线同步**：`accept-baseline.json` 2105→**2264**（顺带补上 #114/#115 合并后漏更新的 web 1390 / desktop 695 / shared 66）
- **实跑**：server 199 文件 / **2264 例**、web 197 / 1390、eslint 0、oxlint 0、四道防阀全过
- **未做（待发版批）**：#97 第 2 步「按版本号补 v51~v60 等批」属长尾覆盖，不影响该 issue 的验收标准（关键迁移有回归用例）

## 2026-11-26 上游 PR #114/#115 合入收口（master = `354d2143`）

- **合入链**：`9868e467`（#114 → master，解 STATUS 冲突）→ `354d2143`（#115 → master，审计补丁）
- **HEAD**：`354d2143`；迁移 **v84**（#115 新增 `v84-drop-invite-codes-code-index`）；open PR 0
- **CI**：两次合并后 master 均全绿（server / desktop / web / e2e / docker / file-size + 4 项 CodeQL）
- **本机实跑（合并结果上）**：server 195/2236、web 197/1387、shared 9/60；四道防阀全过
- **#114 的 STATUS 冲突**：我此前两次审计台账提交与 #114 看板重写撞同一文件
  - 解法：两侧全部保留；两个审计段与 master 原文逐字一致、看板全文与 `002c7396` 逐字一致（221 行），仅删被取代的旧看板标题行
- **#115 修复确认（合入后逐个复核）**：M-1 v36 判据 ✅ / M-2 查重 ✅ / M-3 useNextDueCents ✅ / M-5 sentry-privacy ✅ / B-1 前端分流 ✅ / v84 迁移 ✅
- **#115 CI 触发处置**：fork 分支改 base 不重跑 CI → 用「merge master 进分支」（快进不改历史）触发，44 业务文件逐字未变
  - 曾尝试 rebase，因会改写他人历史而弃用；合并方式为 no-ff merge，保 SUB 作者归属
- **#107–#113**：早已是 MERGED 状态，无需关闭；当前 open PR 0
- **遗留**：CodeQL `Analyze (rust)` 在最后一次推送时仍在跑（其余 9 项已 success）
- 🔴 **发布前必读**：F0156 弱密钥判定会让低熵密钥的既有部署**升级即拒启**，发布说明必须写明

## 看板（2026-11-27 整理后：master `3e604935`）

- **基线**：master `3e604935`；迁移 v84；本机等价门禁读数 server 2264 / web 1390 / desktop 695 / shared 66 / e2e 15（`scripts/accept-baseline.json`）
- **发版**：公网实跑 `94f40bfd`；目标 v1.2.0 / desktop 0.2.0（未落文件）；凭据明早配；U33 首跑待现场调
- **PR/警报**：#107–#113 上游仍 OPEN（推上游顺序 #109 先于 #112）；#96/#97/#98 公开待推；B2/B4/B6/B7 私密 GHSA
- **合并权口径**：`master-merge-gate` bypass 只有 AxelBeary（always）；Mistwhisker 仅 write、不可自合
- 🔴 **上线前置硬警告**：公网部署前必须先确认 `platform_config.admin_qq` 非空
- **在途卡（DSH taskboard，不在本仓）**：青芽季遇 `t-mwxzkrkv-cc3d9y` 手机主菜单承托重设计（todo，本批新立）
  - 同项目 `t-mwqr8tt8-k06nik` R2 已停手（视觉未过 3.808:1，不续第三轮）；`t-mwqrfz64-voz83q` dp 分档被重设计卡挡
  - antigravn `t-mwtj3u5x-lmzvxq` 体验打磨已转 in_review（制作人已试玩；铁颚 12 处侧线纯文字场景待定）
  - 本仓 backlog：主页（根域名）体验优化 `t-mwxzlyb8-cnnoyy`、管理员面板事件流水幕布 `t-mwxzm4m3-d8hz7f`

**下一步（按优先级）**

1. **明早配发版凭据**（用户 11-27 定）：4 项 secret/var → 版本号 1.2.0/0.2.0 + changelog → 门禁 → 打 tag 首跑 U33
2. **两张 backlog 卡待拍**：主页优化、管理员面板事件流水幕布
   - 幕布缺的不是前端是**事件来源**：访问类事件未入库、登录只有 `last_login_at/ip` 覆盖写、隐私口径（IP 脱敏 / 访客是否记录 / 保留期）须先拍
3. **推上游（待用户确认）**：fork 集成含 7 PR + 施工/修复批；顺序 #109 先于 #112
4. **施工批覆盖**：B1 6 条 + B3 11 条 + B4 12 条 + B8 方案 A+C 与 U33；施工图 `AGENTS/handoff-20261124/PLAN-REMAINING.md`
5. **R-1/R-2/R-3**（RuoYi 评估产出，全文已外置）：未立项；R-1 是「防新代码漏挂」的防腐，不是防越权

**常驻纪律（事故换来的，不得退色）**

- 改 `desktop/src-tauri/` 必本地跑 `cargo test`（含真 IPC/ACL）：`tauri-build` 用**严格 JSON 解析器**，9/12 那笔 `//` 注释就是只跑 server/web 就交、CI 单红 desktop job 换来的（本地“全绿”是假全绿）
- **动桌面端 `@tauri-apps/*` JS SDK 必同批把 `Cargo.lock` 配到同号**（核心同 minor、插件精确同号），并跑 `npx tauri info` 留证：该比对只在 `tauri build/dev/info` 触发，**CI 四 job 全绿不等于发版流水线不红**（10-13 靠 dependabot 单边跳版换来的）
- **模板区禁写「内联箭头函数/闭包内访问 import 绑定的属性或元素」**：vue-tsc 3.3.12/3.3.13 有 dotValue 误插 `.value` 的回归（上游 #6238 未合并），须抽成 `<script setup>` 具名 `function`；复发点见 10-13 批条
- **禁整读整写「单行 >2000 字符」的文件**：read 会把超长行截断并写入 `(line truncated to 2000 chars)` 标记——`scripts/accept-baseline.json` 曾因此变成非法 JSON（accept.ps1 崩在 ConvertFrom-Json）。改这类文件用 node 脚本 parse→stringify，改完必须 `JSON.parse` 复核。
- 门禁缺口已清：`check-file-size.mjs` SCOPES 已覆盖 server/web/desktop/shared 四层（F-44），**ALLOWLIST 现为空表**（Home.vue 10-21 清偿、PriceCard.vue 10-26 拆至 692 行清偿）；禁止用调高冻结值给长胖文件续命
- **悬浮投影窗 SQL 最小权限**：只有截稿窗可授 `sql:default`，永不给 execute；改悬浮窗数据面必跑 `cargo test`（`desktop/src-tauri/tests/acl.rs` 真 ACL）。

**已拍板规则**

- 历史交付（2026-11-22，用户拍板）：画师主动隐藏、平台下架或封禁后，已付款客户凭原查单令牌仍可领取已有交付。画师状态变化不影响已签发链接的原有效期及下载规则。
  - 取件判断采用订单净实收大于零和已交付状态。查单链接在主页不可见时只引导取件。管理员二次验证后按订单和文件补发，原有一次性下载有效期为 5 分钟，签发动作计入审计。

- A1 过程稿上传三参数（2026-11-18，用户拍板）：**配额 200MB / TTL 3 天 / 维度 per-artist**。依据：10MB/张≈20 张未挂单；TTL 与 72h 孤儿回收同窗；登录态入口按画师计。env `PREVIEW_UPLOAD_MAX_TOTAL_MB` / `PREVIEW_UPLOAD_TTL_DAYS`，0=关闭配额。
- 桌面端最小窗（2026-11-06，本批）：**1200×600 → 768×600**。理由：1080P@125% 逻辑宽 1536、半屏仅 768，原值使 Windows Snap 贴靠必然失败；768 宽视觉待真机终验。
- 桌面端平台范围（2026-10-27，用户拍板）：**只支持 Windows**。`bundle.targets = ["nsis"]`，macOS/Linux 不构建、不承诺；凭据存储依赖 Windows 接口，不另做跨平台实现。网站服务端仍可跑 Linux（根 README 不变）。
- 交付文件下载失败处置（2026-10-27，用户拍板，修订 issue #21-8）：每 3 次半途 → **5 分钟冷却、冷却后可重试**（不再永久锁）；同时保留**彻底锁死线**——累计失败 9 次永久锁定，需画师再许可（防故意刷）。原实现「3 次即永久锁 + 冷却字段不可达」作废。
- 批次名额硬约束（2026-10-27，用户拍板，修订 issue #21 补充 B）：手动递补与撤销取消**都不得越 `batch_limit`**，超限返回 `BATCH_FULL_ACTION`（409）并提示。旧口径「递补允许超出 N」（TC-BB-12）作废。
- 报价未就绪不得提交（2026-10-26，issue #50-1/#50-2，用户授权「按最优方案处理」）：算价脏 / 在途 / 失败 / 无结果四态一律拦提交，并**取消「未计价回退尺寸基础价」**。
  - 理由：那个回退值漏掉全部增项/用途/加急，是会被截图当承诺的低价。服务端始终是唯一算价引擎，这里拦的是「看到的价 ≠ 成交的价」。
  - 展示价改整数分单源（`styleDisplayCents`），⛔ 再跨层传「元」中转值；下单成功后以回执 `totalPriceCents` 校正复制文案。
  - 连带（#50-6）：折扣码未验证通过**既不随算价下发、也不许提交**。否则算价按无折扣报价、服务端却可能真扣，同一分叉换个位置复发。
- 0 元语义（2026-10-26，issue #51-3/#51-4）：**0 元非法**。价目卡档位 `min` 0 → 0.01 + 行内提示；小票非赠品且单价≤0 的行维持不进导出，编辑区补「不会出现在导出中」。
  - 理由：desktop 均价分母早已把 price=0 排除在外，选「0 元合法」要跨端推翻既有口径；「免费」语义已由赠品勾选表达，不需要第二套。
- `isAdmin` 持久标记（2026-10-26，issue #52-3，**修订 REQ-043 I6-e**）：`/auth/me` 的修正改走 store action `setAdminFlag`，内存与 `artist_is_admin` 同源写。
  - 旧口径「只改内存、不镜像」的后果：被降级的管理员每次刷新都拿旧标记过路由守卫、进管理 UI，直到 `/auth/me` 返回才纠正（服务端边界不破，纯 UI 反复误判）。
  - 「localStorage 写入一律走 store action」纪律不变，只是补上这一个写入口。
- step-up 过期恢复出口（2026-10-26，issue #49-1）：取**最小档**——AdminLayout 子路由切换即重探，复用现成弹框；窗口过期后不必整页刷新。
  - **完整档不做**（http 层广播 + 各视图重放队列）：重放非幂等写请求的风险高于收益，且牵动 http.ts 与多视图接线。
- 订单列表骨架（2026-10-26，**修订 9/25「骨架=6 张内容卡片」**）：骨架随内容形态切换——宽屏 6 卡、窄屏行式，两副与内容侧共用同一个 `@container (max-width:768px)` 条件（PR #58 落地）。
- GHSA-6pf3 披露处置（2026-10-26）：**维持私密、不公开、不署名**。修复已全部落地，但公网生产环境在线，公开细节等于给未更新的自托管实例留攻击窗口；署名需报告者本人同意，不单方面发布。
- 排期块视觉（2026-10-25，用户拍板）：拟物「纸签卷轴」退役，改**案头横格**（外部 PR #43 落地）。理由口径：原拟物不合现代审美，去卷轴后确实更好看。
  - 射程**只裁排期块**：登录页纸艺山水、挂牌 3D、墨迹动画等其余拟物面未被裁定，⛔ 据本条自行推广。2026-10-26 用户复确认此射程；wave3 合入 #55/#58 后实测零外扩（五个拟物面 diff 全空）。
  - 连带修复：落格少算截稿日一格（闭区间独占线需 +2），随 #43 同批落地。
- 结论级证据摘要入库（2026-09-29，better-harness 修复批）：入库台账引用的拍板/验收证据，若逐条详单只住 gitignore 的 `AGENTS/`，须在 `docs/comms/evidence/` 留读者安全摘要（判定要点+日期+本机指针），细节只写一份不互抄；约定见该目录 README。
  - 首件：`证据-记忆库维护批-20260929.md`（锚待办 U23/U24）；temp 下可执行脚本是否收编仍待拍板（U19=G5/F-40），本条不裁决。
- F-44（2026-09-20）：巨型文件防阀扩射 `desktop/src`、`shared/src`（better-harness 修复批，用户裁决选项①「扩射程+冻结豁免」）。存量超线按冻结值豁免：`desktop/src/views/Home.vue` 807 / `shared/src/components/PriceCard.vue` 1094，只许拆小不许再长。
  - 两项豁免均已清偿（Home.vue 10-21 拆至 800、PriceCard.vue 10-26 拆至 692），ALLOWLIST 现为空表；历史出处注释留在 `check-file-size.mjs` 表头。
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
  - 原型 HTML 已删（2026-11-19 用户拍板「这种东西不应出现在仓库」）：根 4 件＋`design/r2/` 回稿 3 件共 7 个 `proto-desktop-home-*.html` 全部删除，**推翻本条旧拍板「不得删」**；视觉真值改以实装为准（`desktop/src/views/Home.vue`），桌面三处代码注释已同步；历史工单与归档件里的旧路径描述不改史。
  - 收拾：`.pytest_cache`（5 文件）、`test-results`（1）、`playwright-report`（1）三处可再生残留搬入 `AGENTS/temp/cleanup-20260927/`，7 文件 566212 字节零丢失；`.pytest_cache/` 补进 .gitignore 作仓库级防御。
  - 不动项：`design/`、`.impeccable/` 是在库设计资产（`.impeccable` 系 `3c5533c3` 有意留档的核查截图；9/27 复核订正：实为 2 处活引用——本文件与审计工单，桌面侧引用已随归档搬动；PRODUCT.md 无路径引用，原「4 份文档引用」说法不实）。
  - 不动项续：playwright 两个输出目录**位置不改**——`.github/workflows/e2e.yml:66-75` 硬依赖其根目录位置上传排障 artifact，改位置须连 CI 一起改，属单独批。
  - 门禁：改动未提交时 accept.ps1 前置拦截 exit 2（038 防再发，属预期）；三道防阀单独跑绿（巨型文件 587 / test-tamper 0 变更 / status-line 7 行）；提交后复跑完整十八道再 push。
- 纯文档批降级通道（2026-09-29，better-harness 修复批，用户直接授权）：`post-merge-deploy.ps1` STEP0 验收联动新增降级口——报告 verdict=green 仅 HEAD 不一致时，
  若报告 SHA..HEAD 全部提交只触及 `docs/**`、`desktop/docs/**`、任意 `.md`（`$ACCEPT_DOC_PATH`），记 WARN 放行而非 Stop-Fail。
  - 不扩大：verdict=red、报告陈旧(>24h)、SHA 不可解析（离线/历史改写）仍阻断；降级分支已显式守 `$staleH -le 24` 防短路陈旧门；改路径清单须先在本节拍板；$ACCEPT_EXEMPT 仍空表不动。
  - 既有绕过留痕不变：-Force / -SkipAccept 仍记 WARN（本批顺手补上 -SkipAccept 实际未写的 WARN 行），阻断仍走 Stop-Fail 写告警文件。
  - 验证：沙盒 git 仓八景（纯文档领先→WARN 放行；含代码/离线 SHA/红报告/25h 陈旧→阻断；-Force/-SkipAccept/dirty 景行为不变），取证件 `AGENTS/temp/docdowngrade-20260929/results.md`。详见 changelog 同批条。
- 审计风暴拍板落地（2026-11-23，用户「全部按建议执行」，材料 `AGENTS/拍板材料-20261123/DECISIONS.md`）：
  - F0192 孤儿行口径＝服务端跳过模板级写入并告警，不 422 整批拒（孤儿行是存量脏数据，拒绝会卡死画师保存）；
  - F0200 清理端点边界＝requireAuth + 仅 `images/{artistId}/` 前缀 + 拒 `..` + maxItems 10 + 限流 30/10min + 幂等 + 不递归，前端只传本弹窗 staged 未提交路径；
  - F0134 令牌幂等缓存＝押后 B4 支付批做架构级重设（TC-D2-02 重放一致契约与明文令牌缓存冲突，小改必返工，F0137 已回退至同口径）；
- B4 支付批 F0134 架构级重设落地（2026-11-24，fork 分支 fix/b4-money-20261124）：
  - 方案＝幂等响应信封加密：response_json 写 AES-256-GCM `enc:v1:` 信封（SESSION_SECRET 域分离派生 + AAD 绑定 scope/key），零 migration；读侧解封后与首响逐字节一致，TC-D2-02/TC-CT-01 保绿。
  - 纪律＝enc:v1 解密失败返回独立码 IDEMPOTENCY_ENVELOPE_INVALID 409（该提交可能已受理，保留原幂等键、禁止自动重提；如未确认联系客服），不删行不重执行；无前缀存量明文行才沿用旧 JSON.parse 失败删行分支。
  - Accepted residual＝持 client UUID v4 幂等键 + 知 artist.id/QQ 者仍可 API 重放取回令牌（幂等契约本身要求，UUID 122bit 熵 + scope 绑定）；DB/备份静态明文已消除。
  - 密钥运维＝不新增 env；SESSION_SECRET 轮换使 24h 内在途缓存不可解→同一独立 409（该提交可能已受理），保留原 key、禁止自动重提，联系客服核对订单/收款状态；无需迁移。
  - ab263dd1 空壳 QQ 归属＝方案 A（邀请码签发绑定目标 QQ，注册校验「码绑定==申领」）+ C（未完成首绑空壳行禁新码覆盖，走管理员找回）过渡；B 带外凭据不采；
  - 账号口径按实测：本机登录 Mistwhisker（AxelBeary 主仓 write / fork admin），旧「仅 AxelBeary 账号」表述作废；fork 残留分支已全清（2026-11-23）。
  - PR 合并口径订正：七 PR #99–105 由**本会话代理（登录 AxelBeary）**以 `gh pr merge --admin --rebase` 逐条合入，非网页人工点击；
  - 根因：`master-merge-gate` 的 bypass 名单**只有 AxelBeary**（`always`）；**Mistwhisker 仅 write、无 bypass**
    - 故「ruleset 无 bypass 名单」只在 Mistwhisker 账号下成立，非仓库事实
  - 同源订正：`7118b53c`（vitest maxWorkers）与 `5c1c0aab`（看板/基线收口）亦由同一账号直推
    - 十九道 356s 为同一 Windows 主机实跑；合并后 CI 四 job + E2E + CodeQL 全绿 @ `3ce3ad9a`
    - 报告 `AGENTS/workspace/temp/accept-master-20261123-185506.md`
- 施工批契约与待办登记（2026-11-24，六批 PR #107–#112 落地时拍板）：
  - F0192 新端点契约形状＝PUT /api/artist/art-styles/:id/addon-settings，**身份键 styleAddonId**（style_addons 行 id）非模板 id——孤儿行 addon_template_id:null 无法靠模板 id 定位、模板 id 由服务端从行内读不信前端回传（F0190/F0191 根治口径）；
  - F0179 二阶段待办：线上 track/delivery 404 曲线稳定后移除 query.token 回退，**须同步把 e10 e2e 裸 API 调用改走 header**（否则该用例全 404）；
  - F0314 二阶段待办：服务端 nextDueCents 字段稳定后删除前端 legacyNextDueCents 回退；
  - F0081/F0077 存量结论：旧增项表已随 v43/v50 拍板 DROP，已过该版本存量库不可恢复（修复仅防重蹈）；v24 首跑无真实资金丢失（派生值可从流水重算）；
  - 行为变更知悉项：F0103 冻结模式改计价模式 400 拒绝（sync 放行）；F0110 回收站排序改路径字典序；F0283 留言仪表盘 limit=200；F0189 后 B6 弹窗打开需显式点生成（旧截图文案过时）。
- R3-① v32 CHECK 收敛裁定（2026-11-24，③DB 席 review 修复批）：三条新增 CHECK 仅新装库/首次建表升级库具备，存量库不重建、不新增迁移号。
  - 约束内容：discount_value>0 / max_uses>=0 / used_count>=0，属本轮新增 DDL 防御层；保留 REAL 双语义（percent/fixed 元，禁用 cents）。
  - 存量口径：version=32 已被 migrate.ts 跳过、CREATE TABLE IF NOT EXISTS 不重建 → 存量库保持无 CHECK（预期，非缺陷）。
  - 理由：discount.service.ts 已校验兜底；重建表（关 FK + 12 步搬运）对存量库风险高于收益。
  - 口径固化：`audit-batch-f-ddl-consistency.test.ts` 加 CHECK 断言——新装/迁移链两路径均带三 CHECK、存量旧形无 CHECK 属预期；不新增迁移版本号。
- R3-②/③ v83 索引守卫与留言排序（2026-11-24，③DB 席 review 修复批）：v83 幂等守卫改列+索引双判据（半态崩溃补建索引，保持 noTransaction 与备份顺序）；getAdminMessages 的 LIMIT 查询排序补 id DESC 作 tiebreaker（created_at 秒精度同秒并列稳定）。

**起手必读**：开工第一件事＝读顶部看板 → 正文最新一块（📌）→ 拍板查「已拍板规则」→ `AGENTS.md`（事实源链与门禁口径）；碰桌面端再读 `desktop/docs/STATUS.md` 顶部，改桌面 UI 必跑 `huiyue-layout-audit` 自检循环（宿主级技能，VL 不可用时 measure.mjs + 人工清单）。
> 📦 **看板旧文-至2026-11-23 已归档 → `docs/comms/archive-20261123/STATUS-看板旧文-至2026-11-23.md`（2026-11-23 归档批搬出，原文原样搬迁）。**
> 📦 **下一步旧文-至2026-11-22 已归档 → `docs/comms/archive-20261123/STATUS-下一步旧文-至2026-11-22.md`（2026-11-23 归档批搬出，原文原样搬迁）。**
> 📦 **起手必读旧文-至2026-11-17 已归档 → `docs/comms/archive-20261123/STATUS-起手必读旧文-至2026-11-17.md`（2026-11-23 归档批搬出，原文原样搬迁）。**
> 📦 **溢文-2026-10-26-wave3收口 已归档 → `docs/comms/archive-20261123/STATUS-溢文-2026-10-26-wave3收口.md`（2026-11-23 归档批搬出，原文原样搬迁）。**
> 📦 **溢文-2026-10-21-四批收口 已归档 → `docs/comms/archive-20261123/STATUS-溢文-2026-10-21-四批收口.md`（2026-11-23 归档批搬出，原文原样搬迁）。**
> 📦 **溢文-2026-10-19-技术债四合一批 已归档 → `docs/comms/archive-20261123/STATUS-溢文-2026-10-19-技术债四合一批.md`（2026-11-23 归档批搬出，原文原样搬迁）。**
> 📦 **溢文-2026-10-19-可做批收口 已归档 → `docs/comms/archive-20261123/STATUS-溢文-2026-10-19-可做批收口.md`（2026-11-23 归档批搬出，原文原样搬迁）。**
> 📦 **2026-10-13 PR 与警报治理批（含当日续单）已归档 → `docs/comms/archive-20261027/STATUS-溢文-2026-10-13-PR与警报治理批.md`（2026-10-27 溢文归档批搬出，原文原样搬迁）。**

> 📦 **2026-10-12 依赖警报根治批已归档 → `docs/comms/archive-20261027/STATUS-溢文-2026-10-12-依赖警报根治批.md`（2026-10-27 溢文归档批搬出，原文原样搬迁）。**

> 📦 **9/29 记忆库维护批（D12/D10 待拍板锚）已归档 → `docs/comms/archive-20261021/STATUS-溢文-2026-09-29-记忆库维护批.md`（2026-10-21 原文原样搬迁）。**

> 📦 **[9/27 changelog 滚动分册批] 已归档 → `docs/comms/archive-20261019/STATUS-溢文-2026-09-27-changelog滚动分册批.md`（2026-10-19 溢文归档批搬出，原文原样搬迁）。**

> 📦 **[9/27 文档专项审计归档批（U18）] 已归档 → `docs/comms/archive-20261019/STATUS-溢文-2026-09-27-文档专项审计归档批.md`（2026-10-19 拆归档批搬出，原文原样搬迁）。**

> 📦 **[9/27 黄红灯] 已归档 → `docs/comms/archive-20261019/STATUS-溢文-2026-09-27-黄红灯.md`（2026-10-19 溢文归档批搬出，原文原样搬迁）。**

> 📦 **[9/25 今天吃什么] 已归档 → `docs/comms/archive-20261019/STATUS-溢文-2026-09-25-今天吃什么.md`（2026-10-19 溢文归档批搬出，原文原样搬迁）。**

> 📦 **[9/17 审计缺陷波1+波2] 已归档 → `docs/comms/archive-20261019/STATUS-溢文-2026-09-17-审计缺陷波1+波2.md`（2026-10-19 溢文归档批搬出，原文原样搬迁）。**

> 📦 **2026-09-13 及更早的历史条目已拆分归档至 docs/comms/archive-20260927/STATUS-archive-20260927.md（2026-09-27 U18 归档批拆分，原文原样搬迁）。**

> 📦 **2026-08-23 及更早的历史条目已拆分归档至 `docs/comms/archive-20260824/STATUS-archive-20260824.md`（824 收整批拆分，原文原样搬迁）。**

> 📦 **看板旧文-至2026-11-24 已归档 → `docs/comms/archive-20261127/STATUS-看板旧文-至2026-11-24.md`（2026-11-27 整理批搬出，原文原样搬迁）。
> 📦 **正文块-2026-10-27至2026-11-23 已归档 → `docs/comms/archive-20261127/STATUS-正文块-2026-10-27至2026-11-23.md`（2026-11-27 整理批搬出，原文原样搬迁）。
> 📄 **RuoYi 吸纳评估已外置 → `docs/comms/研究-RuoYi吸纳评估-20261127.md`**（2026-11-27 整理批搬出，原文原样搬迁）。
