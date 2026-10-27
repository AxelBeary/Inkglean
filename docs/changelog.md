# 变更日志

> **本文件维护纪律（2026-09-27 拍板，A+B+D 批）**
> - 定位：本文件是**工程台账**；对外发布叙事（安装包用户读的版本说明）= GitHub Releases（正文自顶部条目摘编，防双写漂移以本文件为事实源）。
> - 写入：新条目**顶部插入**（H1/声明块之下、上一版 H2 之上），按日期倒序；不删历史，只标注。
> - 滚动分册：活档体积门 `scripts/check-changelog-size.mjs`（≤40KB / ≤450 行，单段 ≤4KB，accept 第 19 道）；撞线即搬 oldest 段入 `docs/changelog-archive/` 新卷（整段零改动 + 逐行哈希校验，禁调高阈值续命）。
> - v0.x 时代（v0.1~v0.46+）全量台账在 `docs/changelog-archive/changelog-v0-20260927.md`，只读历史。

## wave3：五路 PR 合入 + 七项拍板落地（2026-10-26）

- 接收外部 PR #55/#58（两份「返工七条」逐条对撞代码后接收）：暗色滚动条对比度从 1.00:1 提到 3.11:1 以上、空串 src 隐形请求改 v-if 整颗不渲染、白字覆写补齐、token 硬编码清零、`.status-tag` 摘掉颜色插值、补 `viewport-fit=cover`、换图空一帧改叠放交叉淡入；骨架与内容同形同高（宽屏 6 卡 / 窄屏行式共用同一容器查询条件）、排期中窄屏保底宽、收入环图改吃主题色板、换肤重建不再重放入场动画。
- 接收外部 PR #26：节点待收改走引擎进度原语，展示与锁定推导同源，消除上轮反对的待收口径分叉；负尾款封顶只喂账本、不参与锁定。
- #26 合入后两处跟进：节点快捷收款的按钮与预填金额钳到订单级待收（负尾款「带内」场景下节点差额会大于订单级待收，只看节点差额就会在已收足的订单上递一个超收默认值）；修正 `TrackOrder.vue` 一处已失实注释——客户端自算的「Σ正节点封顶」与服务端 `forwardFill` 行为等价但已非同一份实现，改服务端填充规则时必须回头核对。
- 依赖：Dependabot #59/#60 合入（eslint 10.13.0、ts-eslint 8.72.0、vite 6.4.5、@fastify/static 10.1.7、chart.js 4.6.1、vue-i18n 11.4.16、oxlint 1.89.0）；另校正 web/desktop 两个 lockfile **根镜像**的陈旧 devDependencies 声明（happy-dom 仍写 ^20.14.6，自 PR #40/#44 起漏更——Dependabot 只重写已解析条目）。
- 下单链路诚实性：报价脏 / 在途 / 失败 / 无结果四态一律不得提交；**取消「未计价回退尺寸基础价」**——那个数漏掉全部增项与用途加急，是会被截图当承诺的低价；展示价改整数分单源，下单成功后以服务端回执 `totalPriceCents` 校正复制文案。
- 折扣码：未验证通过的码既不随算价下发（此前逐字输入时每敲一个字符都会让整次算价 400、报价塌空，合法码也要敲完才恢复），也不许提交（否则算价按无折扣报价、服务端却可能真扣，同一分叉换位置复发）。
- 选尺寸：全部尺寸都是展示档时复用空态出口（此前是死锁），可约判定与服务端 style-pricing 同口径（`display_status` 为空或 available）。
- 管理端：step-up 30 分钟窗口过期后子路由切换即重探，不必整页刷新才有恢复出口（http 层广播 + 请求重放的完整档评估后不做：重放非幂等写请求风险高于收益）；`/auth/me` 对 isAdmin 的修正改走 store action `setAdminFlag` 同步持久标记（修订 REQ-043 I6-e，此前被降级者每次刷新都拿旧标记过路由守卫）。
- shared：PriceCard 1094→692 行（拆出 `pricecard/{types,tiers,draw}.ts` 与 `ArtworkPickerModal.vue`，对外签名不变、web/desktop 调用方零跟改）；挑作品弹窗补 aria-modal / Escape / Tab 焦点陷阱 / 关闭归还焦点；档位价格 0 元判非法（min 0.01 + 行内提示）；小票里非赠品 0 元行维持不进导出并给出行内提示。F-44 唯一遗留豁免清偿，`check-file-size` ALLOWLIST 现为空表。
- 视觉射程：用户复确认「拟物收敛只限排期块」；本批实测 ScheduleScroll 之外的五个拟物面（印章墨迹 / 登录纸艺 / 纸卡 / 问候洇墨 / 挂牌 3D）diff 全空。
- 盘面：11 个 agent worktree 注册摘除、33 个已并入本地分支删除（末端 SHA 留恢复表）；7 份席位交回台账归档进安全批 artifacts。
- 门禁：十九道全绿 @ `b4d22c6d`（server 1981 / web 1073 / desktop 616 / shared 44 / E2E 14；三轮复跑计数零漂移，耗时见留痕日志），日志 `AGENTS/artifacts/mistwhisker-wave3-20261026/logs/accept-wave3.log`。

## 外部反馈吸纳批（2026-10-25）

- 排期块视觉：拟物「纸签卷轴」退役，改案头横格（接收外部 PR #43）；同时修掉落格少算截稿日一格。
- 仪表盘台账写路径补齐乐观锁：待办接口下发订单版本号，台账动词与看板/详情页同口径带 version，冲突走「提示 + 重拉服务端真相」；原地递进时换回新版本号，避免下一动词撞假冲突。
- 管理端留痕「对象类型」筛选改为真正生效（此前须与对象 id 成对，而页面没有 id 输入口，等于摆设）；`?action=` 白名单补画师资料更新留痕。
- 小票计算口径：数量按整数计（不再出现半分、同票不再跳变），折扣行文案数字与实扣金额同源。
- 草稿防丢：手工单与下单表单离开页面时落盘防抖窗口内的最后一笔；无内容时不写也不删既有草稿。取消撤销提示每次取消重置倒计时窗口。
- 接收外部 PR：#45 交付下载带对令牌、稿价计算器按服务端契约渲染；#46 请求超时覆盖响应体读取、订单写路径补 409 分支；#47 前端状态与反馈一批（脏标记双基线、凭据删除收窄为仅 404、时区列、剪贴板降级）。
- 依赖：happy-dom 升至 21.0.4（桌面端走 Dependabot #44；shared 侧同版本手工对齐，清掉最后一条 open 警报）。
- 门禁：十九道全绿 @ `44419700`（server 1974 / web 1043 / desktop 616 / shared 29 / E2E 14），日志留痕 `AGENTS/artifacts/mistwhisker-wave2-20261025/logs/`。

## 接收外部 PR #42：仪表盘首渲门控（2026-10-25）

- 偏好未就绪前不渲染板块（成功/失败都算就绪），消除默认卷轴款抢闪与排期数据二次拉取；占位沿用纸卡圆角族并尊重 `prefers-reduced-motion`。
- 顺带修一个潜在缺陷：`v-for` 内字符串 ref 被 Vue 收成数组，导致留言卡 `load()` 与待审徽标在重连后不更新；改为函数 ref + shallowRef。偏好拉取与 profile/stats 并行。
- 新增 7 条行为测试；十九道全绿 @ `86b160dc`（web 1021）。

## 安全加固批 GHSA-6pf3（2026-10-24）

- 落地一份负责任披露的外部安全审计（私密通告 GHSA-6pf3-g4xq-854w）加固项，覆盖认证、账户、资源配额、桌面端命令授权与本地数据面共 8 项。
- 细节不在公开变更日志展开（见项目 SECURITY.md 口径）；修复已随本批进入主干，**自托管部署请尽快更新**。修复经 GitHub 私密通告确认后另行公开发布说明并致谢报告者。
- 附带：docker-compose 以 `${DOMAIN}` 显式注入 WebAuthn RP_ID/ORIGIN；迁移 v76→v77；十九道门禁全绿。

## E2E 定位器规则 3 落地（2026-10-21，test-only）

- `e2e/scripts/check-locators.ts` 新增规则 3：裸 `page.getByRole(role, { name: 动态 })` 未 scope → ERROR；沿用 `// locator-ok` 豁免机制。
- e1 提交按钮 scope 到 `.step-nav`，e3 推进按钮 scope 到 `.action-bar`；两处均未用豁免。
- 自证：临时探针（裸动态 getByRole）被脚本捕获 1 ERROR；移除探针后 `npm run check:e2e` 11 spec / ERROR=0 / WARN=2；`npm run test:e2e` 14 passed（36.7s）。

## 画风管理 N×M 尺寸覆盖批：一次取全、消除请求风暴（2026-10-21，一号自主批）

- **后端**：新增 `GET /api/artist/art-styles/overrides`（`requireAuth` 按 `request.artist.id` 过滤，单条 JOIN `style_sizes` / `art_styles`，返回带 `style_id` 的 `SizeAddonOverrideBatchItem[]`）；+5 测试（跨画师零泄漏 / 401 / 空表 / 同尺寸多增项不串 / 与逐对端点逐字段并轨）。
- **前端**：`preloadOverrides` 改为一次 `getAllSizeOverrides()` + `groupSizeOverrides` 分组回填；保留 `loadSeq`（M-12）守卫；批量失败时所有尺寸空覆盖、不弹错；+8 测试（6 纯函数 + 2 组件级一次请求/失败降级）。
- 删除 `ArtStyleManager` 的 N×M 循环与 `TODO(audit-260830)`；`getSizeOverrides` 逐对端点保留兼容，前端已零调用。
- **验证**：server 1847→1852（160 文件）、web 982→990（144 文件）；`accept.ps1` 十九道全绿 @ `f8258703`（381s）；五端计数 server 1852 / web 990 / desktop 570 / shared 27 / E2E 14。
- **留痕**：`AGENTS/artifacts/N×M批量覆盖批-20261021/`（后端/前端 ledger + 原始门禁日志）。

## U45/U46 修复批：悬浮截稿窗只读开库 + 真 IPC/ACL 防线（2026-10-21，一号自主批）

- **U45（真缺陷）**：截稿悬浮窗在本地模式走读写开库（含 7 条建表 execute），而 `floating.json` 从创建起就没有任何 sql 权限；失败又被 `localLedger` 的 catch 吞成 `unavailable`，组件 catch 打不着 → 渲染「近期无截稿，从容落笔」假空态。修复：新增 `openLocalDbReadOnly()`（不建表、独立单例），截稿窗改走该通道；`FloatDeadline.vue` 消费 `ledger.unavailable`，取不到就说「暂时取不到截稿」。
- **权限最小化**：`floating.json` 恢复 core+拖动；新建 `floating-deadline.json` 仅授予截稿窗 `sql:default`（close/load/select，无 execute）；timer/today-todo 不授 SQL。
- **竞态与自愈**：本地模式 `Home.vue` 先等主窗 `loadAll()` 建表再恢复悬浮窗；`localLedger.loadAll` 成功即复位 `unavailable`，一次瞬时失败不会把浮窗永久钉死。
- **U46 防线**：`desktop/src-tauri/tests/acl.rs` 用 tauri::test mock runtime + `get_ipc_response` 走真 ACL：主窗 execute 通、截稿窗 select 通/execute 拒、计时窗 load 拒。`build.rs` 用 embed-resource 把 tauri-build 生成的 Windows 资源/manifest 也链进测试 exe（否则测试 exe 加载期 STATUS_ENTRYPOINT_NOT_FOUND）；CI desktop job 由 cargo check 改 cargo test。
- **F-44 顺手清偿**：`Home.vue` 的内联截稿提醒映射抽到 `localGlance.buildLocalDeadlineAlerts`（行为不变，+1 单测），807→800 行；`check-file-size` ALLOWLIST 移除 Home.vue，其余源码按 800 行硬线。
- **验证**：desktop lint 0 错；test 551→570（40 文件，+19：db-readonly 9 / float-deadline 6 / local-ledger 2 / 失败复位 1 / localGlance 1）；build 绿；cargo test 1 例；`accept.ps1` 十九道全绿 @ `4d6bf0b6`（406s），五端计数 server 1847 / web 982 / desktop 570 / shared 27 / E2E 14。
- **留痕**：施工 ledger 与门禁完整输出在 `AGENTS/artifacts/U45-U46修复批-20261020/`；U46 测试首次把 ACL 缺口变成可在 CI 复现的断言。

## Dependabot #19/#20 双 PR 同批合入 + 门禁/E2E 工具修（2026-10-21，一号自主批）

- #19（root/server/shared/web，11 项 minor/patch）：`@playwright/test` 1.64.1、`fastify` 5.12.7、`oxlint` 1.88、`vitest` 4.1.12、`@typescript-eslint/*` 8.71.2、`vue` 3.5.44、`vue-tsc` 3.3.13、`dompurify` 3.4.17、`simple-icons` 16.35、`jsdom` 30.1.3。
- #20（desktop，6 项）：`pinia` 4.1.0（minor）、`vue` 3.5.44、`vue-tsc` 3.3.13、`vitest` 4.1.12、`@typescript-eslint/*` 8.71.2。
- 两条都含 `vue-tsc` ^3.3.12→^3.3.13，按既定口径同批合，三端口径不分叉；未碰 `@tauri-apps/*` 与 `typescript`，成对规矩不触发。GitHub 已识别为 MERGED（#19 `44efe9b4` / #20 `6838fb14`）。
- 安装后 `npm install` 顺带补齐 desktop/web 两份 lock 的根 specifier（Dependabot 只改了 package.json 与解析版本）；五目录 `npm audit` 0。
- 同批顺手：E2E `global-setup` 改为每次重建 `web/dist`（防手工跑测到旧包）；OnboardingCard 三条过期埋点注释订正；`accept.ps1` 大输出改流式落盘，消除 server vitest 12MB 输出偶发管道死锁。
- **验证**：`accept.ps1` 十九道全绿 @ `04ddfbd1`（433s；server 1847 / web 982 / desktop 570 / shared 27 / E2E 14）；`cargo test` 1 例；五目录 audit 0。

## 技术债四合一批：changelog 分册 + U25 dompurify 4 + U31 桌面工具链收敛 + U32 权限（2026-10-19，用户拍板全做）

> 三路 worktree 并行（A docs / B server / C desktop，领地零交叉）+ 一号串行收口；`pwsh scripts/accept.ps1` **十九道全绿 @ `01b3fcae`（678s）**，五端计数全不变。

- **changelog 滚动分册**：活档 40524 B 撞 40KB 体积阀，按拍板纪律只搬 oldest 段（禁调高阈值续命）。最旧 12 段（2026-08-19 ~ 09-12，173 行 / 16372 B）整搬 `docs/changelog-archive/changelog-1.0-early-20261019.md`，搬后活档 24492 B / 111 行。
  - 零丢失证据：一号**独立反证**（不复用施工方脚本口径）——新活档去新指针 + 归档正文拼回整份，与基线 `adc9cce5` 全文件 SHA-256 逐字节相等。
  - 边界订正：施工书原写 L107–L283 会吞掉活档尾部三条既有 📦 归档指针（L280–L282），实际边界 L107–L279。
- **U25 isomorphic-dompurify ^3.22.0 → ^4.6.0**（server 唯一使用点 `src/shared/sanitize.ts`，本批零改动）。
  - 事实订正：3.22.0 与 4.6.0 的 `engines` 完全相同（`^22.22.2 || ^24.15.0 || >=26.0.0`），现装 3.22.0 早已带 jsdom 30；
    「4.x 才正式声明 Node 要求」不成立，Dockerfile / engines / Node 版本未动，生产 `node:22-slim` 无新增风险。
  - lock 变动面仅 dompurify/jsdom 子树 4 款、零包增删（`@asamuzakjp/dom-selector` 9.2.4→10.0.4 系 jsdom 30.1.3 上游自身要求）；`npm audit` 前后均 0；`overrides` 四项原样保留。
  - `RETURN_DOM` 路径已由 `tests/audit-batch-f-sanitize.test.ts` TC-F5-01~03 直接断言覆盖，本批不补测试（1847 例不变）。
- **U31 桌面工具链收敛**：`typescript` ~5.6.2 → ~5.9.0（实装 5.9.3）、`vue-tsc` ^2.1.10 → ^3.3.12（实装 3.3.12），与 web/shared 做到声明 + lock + 实装三层逐字对齐（npm 会把 `^3.3.12` 写成 `^3.3.13`，已钉回精确版）。
  - **desktop 未受 vue-tsc 3.3.x dotValue 回归影响**：模板区内联箭头仅 2 处、触碰 import 绑定 0 处，build 零诊断，`src/**` 一行未改。
  - 「零爆错」经必错探针自证，探针未入库；tsconfig 口径对齐按禁区未做（另批）；`cargo check` exit=0，`npx tauri info` 已留证。
- **U32 capabilities 缺口补齐**：`desktop/src-tauri/capabilities/default.json` 加 `sql:allow-execute` + `opener:allow-open-path`。缺口经插件 `default.toml` 源码坐实（sql default 无 execute、opener default 无 open-path），
  调用点在 `bridge/db.ts:102` 建表与 `bridge/index.ts:45-46` openPath；`floating.json` 权限面不含二者，未动。
- **登记**：`THIRD-PARTY-NOTICES.md` 同步 isomorphic-dompurify 实测 4.6.0、内嵌 dompurify 3.4.17（许可未变）。
- **台账与留痕**：施工书、三份派工单、三份 ledger、两轮十九道完整输出均在 `AGENTS/artifacts/施工书-技术债四合一批-20261019/`。
- **拍板后续（用户 10-19 拍定四项，已执行）**：`overrides.undici` ^8.10.2 → ^8.12.1（实装 8.12.2，lock 只动 1 款、audit 0、server 159/1847 重跑全绿）；
  U32 运行时冒烟已跑——本机 `local.db` 启动前 0 张表、`tauri dev` 拉起后即 7 张表齐全，`sql:allow-execute` 真生效
  （Rust 侧 sql 插件不带 migrations，可见修复前本地记账在本机从未建过表，失败被 store 的 catch 吞成 unavailable）；归档卷头注路径照旧留着；STATUS 正文溢文已单独一批搬完。
- **新销待办 U45 / U46**：U45 悬浮窗能力面无任何 sql 权限而 `FloatDeadline.vue` 在用账目 store（待运行时核实）；
  U46 桌面端零真 IPC 测试（vitest 全 mock bridge），ACL 缺口在现有十九道下天生测不到。另 `opener:allow-open-path` 无自动可观测量，仍待真人点「打开」。
- **收口追加**：拍板项落地后重跑，**第二轮十九道全绿 @ `aaa5164e`（659s）**。本批细节只写一份，全文见 `docs/comms/STATUS.md` 正文首条。

## 归档索引（滚动分册指针）

> 📦 **2026-09-25 ~ 10-13 的 12 个批次段已整搬 → `docs/changelog-archive/changelog-20260925-20261013-20261027.md`（2026-10-27 滚动分册，原文原样搬迁，逐行哈希零丢失）。**
> 📦 **近期批次变更史摘要（2026-08-24 ~ 09-12） ／ 标识/身份码对齐批 → TypeScript 全仓收尾迁移（2026-08-19 ~ 08-23，共 12 段 / 173 行）已滚动分册至 `docs/changelog-archive/changelog-1.0-early-20261019.md`（2026-10-19 技术债四合一批 A 路，原文原样搬迁，逐行哈希零丢失）。**
> 📦 **v1.0.0-beta.3 发版记录（2026-08-18） ／ 0817 用户反馈批 + 系统更新面板 + 文档大扫除（2026-08-17 ~ 08-18，已随 v1.0.0-beta.3 发出） ／ beta.2 后待办清扫批（2026-08-16，已随 v1.0.0-beta.4 发版）（共 3 段 / 64 行）已滚动分册至 `docs/changelog-archive/changelog-20260816-20260818-20261012.md`（2026-10-12 批，原文原样搬迁，逐行哈希零丢失）。**
> 📦 **v1.0.0-beta.2 审计修复收口版（2026-08-15） ／ v1.0.0-beta.1 公测发布（2026-08-15）（共 2 段 / 52 行）已滚动分册至 `docs/changelog-archive/changelog-v1.0.0-beta1-beta2-20261012.md`（2026-10-12 批，原文原样搬迁，逐行哈希零丢失）。**
> 📦 **v1.0.0-beta.1 之前（v0.1 ~ v0.46+，共 53 段）已滚动分册至 `docs/changelog-archive/changelog-v0-20260927.md`（2026-09-27 批，原文原样搬迁，逐行哈希零丢失）。**
