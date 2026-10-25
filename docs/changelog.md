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

## 警报治理批当日续单：#17 三项 patch（2026-10-13）

- #15 合入后通道按新配置立即重算，交出 #17：@fastify/static 10.1.5→10.1.6、vue-i18n 11.4.13→11.4.14、prettier 3.9.9→3.9.10，均为上游当日新发的 patch，无行为面；桌面端未被碰＝`@tauri-apps/*` 屏蔽生效首证。
- 验收：本地十九道全绿 @ `c39d14e6`（593s：1847/982/538/27/14）+ CI 六项绿后合入。终态警报 0、CodeQL 0、开放 PR 0。⚠ 活档已逼近 40KB 线，下批先做滚动分册。

## PR 与警报治理批：#15/#16 落地 + Tauri JS↔Rust 成对升级（2026-10-13，跨端依赖与发版链路）

- 触发：新通道首次交出的两份可审 PR（待办 U30）+ 唯一开放警报 #83 rustls。用户拍板三件：连 Rust 成对升 / 桌面 TS 退回 5.6 / 改 bot 分支→门禁→合并代推。
- #16（rustls 0.23.43→0.23.45）本地 `cargo check` 绿后合入，警报 #83 **自动转 fixed（fixed_at 2026-10-13T06:44Z，全程零 dismiss）**。
- #15 到手是红的：web `vue-tsc --noEmit` 报 `ManualOrderLeft.vue(45,59) TS2339 Property 'value' does not exist on type 'SFCInstallWithContext<Message>'`（本地按 PR 锁 `npm ci` 复现同一条）。真凶不是 element-plus（2.14.3 与 2.14.7 的 `message/index.d.ts` 逐字节相同、`onExceed` 契约未变，且本 PR 未动 vue/typescript），而是 vue-tsc 3.3.12（@vue/language-core）新增 dotValue 双趟模板解包：模板内联闭包内对 import 绑定做属性/元素访问会被裸插 `.value`，而顶层 `__VLS_withDotValue` 断言收窄带不进嵌套函数。上游同型 issue #6237、修复 PR #6238 至本日仍 open、3.3.13 的 codegen 文件与 3.3.12 哈希全同 → 等不到，改写法根治：`:on-exceed="handleRefExceed"` + script 侧 `function`；同通道近失点 `AdminDashboard.vue:52` 一并抽 `artistStatusType()`；补 1 例哨兵（断言 warning 恰好一次且文案 = zh-CN `manualOrder.refExceed`），web 981→982 并同步 `accept-baseline.json`。
- 桌面端成对升级：该 PR 单边把 7 个 `@tauri-apps` JS 包推前，而官方口径要求核心同 minor、插件**精确同号**（https://v2.tauri.app/develop/updating-dependencies/ ），且此比对只在 `tauri build/dev/info` 触发——CI desktop job 只跑 cargo check，**CI 绿 ≠ 发版流水线不红**。6 条 `cargo update --precise` 把 Rust 侧配到同号（tauri 2.12.2 / updater 2.13.2 / sql 2.5.0 / notification 2.5.1 / dialog 2.8.1 / opener 2.7.0），连带 wry 0.57.0 / tao 0.37.1 / muda 0.20.0 / tray-icon 0.25.1 / plugin-fs 2.7.0 / windows 0.62.2；四个无 npm 对子的 Rust-only 插件刻意不动。独立复验定论：Cargo.lock 版本集变动 50 项（29 升级 / 12 新增 / 9 删除）逐项可追溯到 6 条 --precise 及其传递面、无本仓直接依赖被越范围推动（其中 cargo_toml 1.0.1 / urlpattern 0.6.0 / json-patch 4.2.0 / brotli 9.0.0 / webview2-com 0.39.1 属 semver-major 级传递跃迁，本仓无直接依赖）、13 条权限标识在新版全部存在、tauri-utils 2.10.1 对本仓 conf 无解析风险。另登一条已知行为变更：tao 0.37 起 WM_ENDSESSION 直接退出进程，“关闭到托盘”偏好不再被拦。
- 验证（完整输出留 `AGENTS/deps-pr15-pairing-20261013/`）：`cargo check` exit=0；`npx tauri info` 无 mismatch、插件逐条同号；`npm run tauri dev` 起壳成功、零 panic 零 unknown permission；`pwsh scripts/accept.ps1 -TestTamperAck` **十九道全绿 @ 收口 HEAD `d549798b`（593s）、首跑在代码三笔 `5e91cb44`（563s），两次均：server 1847 / web 982 / desktop 538 / shared 27 / E2E 14**；五目录 `npm audit` 全 0；磁盘实装核对 typescript 5.6.3 / vue-tsc 2.2.12；真浏览器冒烟（临时件跑完即删）：真实 Chromium + EP 2.14.7 下选 6 张参考图 → 全部不入队、弹「最多上传5张参考图」、控制台零 error。
- 机制关闸：`.github/dependabot.yml` 拆 `/desktop` 独立条目并 ignore `@tauri-apps/*` 与 `typescript`，Rust 侧不建 version updates 通道（漏洞类走 Security 侧自动 PR，#16 即首例）。转待拍板 U31（桌面工具链与 web/shared 收敛）、U32（capabilities 两处既有缺口 `sql:allow-execute` / `opener:allow-open-path`）。
- 登记行为变更（非阻塞）：tao 0.37 起 `WM_ENDSESSION` 直接退出进程，系统关机时“关闭到托盘”偏好不再拦截；updater 经核 `restart_after_install` 默认 true + `install_mode` 默认 passive → NSIS 参数仍 `/P /R` 与 2.10.1 一致，故未动 `tauri.conf.json`。

## 依赖警报根治批·第三笔：代推上云 + 推送后新暴露的 CodeQL #32 真修（2026-10-12，安全报警处置）

- 经用户授权代推 `5fbc3e04..cc4a607e`（12 笔）。云端对 `cc4a607e`：CI 四 job、E2E、CodeQL 全 success；本批新增的 `.github/dependabot.yml` 已生效—作业名直接含五目录 `npm_and_yarn in /., /desktop, /server, /shared, /web`（以前只会出单目录 PR）；依赖图已刷新，SBOM 2087 包中 axios = 0。11 条 Dependabot 警报因自动关单作业时延仍标 open，不手动 dismiss，等自动转 fixed 后复核。
- 推送后 CodeQL 新报 #32（`js/incomplete-multi-character-sanitization`，`scripts/U44-scan-unflattened-styles.mjs:91`），落在本批刚补入库的工具铺脚本上。**先判真伪再动手**：实测构造 `'<sty<style>x</style>le>body{}</style>'`，单遍正则处理后仍残留 `'<style>body{}</style>'`，属真实重叠绕过而非误报。
- 修法（`b0072409`）：新增 `stripStyleBlocks()` 循环删除直到结果不再变化（不动点），替代单遍 `replace`；处理后残留检查 = false。行为零变化已量化：对 `web/src` 下 168 个真实 .vue 逐文件比对两种写法，结果不同的文件数 = 0；改后 U44 实跑 exit=0、扫 176 文件照常产出清单。不采借 dismiss 绕过扫描报警。
- 同批前置：本笔顶插前活档已第二次撞 40KB 线（41152 B），按口径再次把最旧三段（2026-08-16~08-18）整搬新分册 `changelog-20260816-20260818-20261012.md`（`e2172d6b`，逐行哈希零丢失，脚本 exit=0）。
- **自动关单已落地（收口实测）**：逐号拉 `GET /dependabot/alerts/{n}`，#72~#82 = **11/11 state=fixed**（fixed_at 2026-10-12T14:58 UTC，推送后约 1 小时），**全程零 dismiss**；CodeQL 亦 open=0。本批 11 条警报全部清零。
- 复扫另暴露与本批无关的一条：#83 **rustls**（medium，`desktop/src-tauri/Cargo.lock`，已修 0.23.45）——属 Rust 侧，本批禁区不碰 src-tauri。同时新通道自行交出两份可审 PR：**#15**（npm 分组 32 个 minor/patch，五目录合一一单）、**#16**（rustls 0.23.43→0.23.45），即“警报→可审 PR”闭环已第一次跑通；两份 PR 的发落转待办 U30，本批不代合。

## 依赖警报清零批·第二笔：拆掉 axios，web HTTP 层改原生 fetch 根治（2026-10-12，关键路径，含测试迁移）

- 为什么根治而不升版：axios 一周内 12 个 GHSA 披露、独占 11 条警报里的 8 条，而本项目只用到 `params / headers / timeout / FormData` 四项能力；桌面端（`desktop/src/api`）与网页两处 blob 下载早已走 fetch，两端 HTTP 口径就此统一。web `npm audit` 由 6 项归零，锁内 axios 及其传递依赖共 25 个包移除。
- 改动面：`web/src/api/modules/http.ts`（axios 实例 + 响应拦截器 → fetch 请求核 + `fail` 错误归一化；503 SETUP_REQUIRED 逃逸、i18n 错误码翻译、401 登出与白名单码与绑定失效旗标、`ApiError` 的 status/code/detail 逐字搬移）；`artist.ts`/`order.ts` 三处 `AxiosRequestConfig` → 本地 `RequestConfig`；`web/package.json` 删 axios；注释同步 7 处（upload.ts、webauthn.ts、ToolsExport.vue×2、HealthCheck.vue、两个测试头、desktop/src/api/errors.ts）；`THIRD-PARTY-NOTICES.md` 删 axios 行。
- 行为对齐（对外契约逐字不变，251 处 helper 调用点与全部 view/store 不动）：URL 仍挂 `/api` 前缀；params 跳过 null/undefined 且键值各自 `encodeURIComponent`（空格编成 %20，与 axios 同形）；`credentials: 'include'` 等价原 `withCredentials`；FormData/Blob 体不手设 Content-Type（WEB-11，两者手设都会丢 boundary / 自带类型）；对象体 `JSON.stringify` + `application/json`（fastify 按 content-type 选解析器，缺头会被判成无 body）；超时默认 15s、上传 120s，用 AbortController + finally 清计时器（不用 `AbortSignal.timeout`，避开 happy-dom 环境依赖）；**204 与空体解包为 `undefined`**（施工图口径；axios 旧行为是 `''`，实测服务端全仓无 `code(204)` 端点，对现有调用点零影响）、非 JSON 错误体不炸。
- 测试：`bindRequired401.test.ts` 驱动方式从 axios adapter reject 改为 stub 全局 fetch 返 401（四条断言不放松）；新增 `http.test.ts` 14 例防再发锁（URL 前缀/params 编码与跳空/credentials/JSON 体带 Content-Type/FormData 与 Blob 体不带/无体不写 body/header 透传与覆盖/JSON · 空体与 204 · 非 JSON 三种解包形态/错误对象形状/非 JSON 错误体/超时与网络失败兜底）。web 用例 967→981（142→143 文件），`scripts/accept-baseline.json` 已同步。
- 工具链踩坑：`RequestConfig.params` 先写成 `Record<string, ...>` 会让两个无索引签名的 interface（AdminMessageFilters / AdminInviteCodeQuery）编译不过，收宽为 `object` 并在请求核单点转型；测试里同一个 `Response` 实例被两次请求复用会报 “Body has already been used”，必须每次给新实例。
- 验证与收尾：提交后工作区干净，`pwsh scripts/accept.ps1 -TestTamperAck …` **十九道全绿**（server 1847 / web 981 / desktop 538 / shared 27 / E2E 14），报告与每道完整日志在 `AGENTS/workspace/temp/accept-master-*.md` 与 `accept-logs/`；五处 `npm audit`（root+四端）终态归零。
- 浏览器实机冒烟共四轮（本机 5210 独立端口 + 独立测试库，用完已停服务并删库），施工图要求的五条链路全部验通：①登录（画师与管理员，含 401 错码与中文文案）；②客户建单四步流程 → 小票 → 提交成功 → 拿到的 token 查单链接可直接打开并显示完整详情；③FormData 参考图上传 200 并渲染持久化；④CSV blob 真下载（已开始下载）；⑤管理后台——入口二次验证（step-up）通过、举报/画师管理/系统自检/处置留痕/埋点看板等 11 页正常，`?status=` `?limit=` `?days=` 三种筛选均 200 且数据刷新，敏感操作（更换管理员）正确拦住要求二次验证。全程控制台零 error，URL 层零 `undefined`/`null` 拼接（已扫 `=undefined`/`=null`/`%5Bobject`）。
- 冒烟轮发现的两处既存小坑不是本批引入，已登记待办 U29（i18n key 拼接传入 undefined 共 3 条 warning；二次验证弹窗关闭后隐藏输入框留着已消费码）；原生文件选择器那一下点击仍待你本人确认（子代理受 CDP 限制用页内注入替代），连同 `/admin` 越权是否补中文提示一并记在 U28。
- 云端：关闭 Dependabot PR #13（axios bump，与拆包路线冲突）与 #14（busboy bump，已被批A 等价覆盖）并各写理由，开放 PR 归零；11 条警报待推送后复扫自动转 fixed（不手动 dismiss）。结论级证据摘要入库 `docs/comms/evidence/证据-依赖警报根治批-20261012.md`。

## 依赖警报清零批·第一笔：四端锁 PATCH 定点刷新 + Dependabot 通道落地（2026-10-12，安全报警处置，零业务代码）

- 在 `^` 范围内定点刷锁（不改 manifest、不加 overrides、不用 `npm audit fix --force`）：server fastify 5.12.1→5.12.5、sharp 0.35.4→0.35.5、@fastify/busboy 3.2.0→3.2.3、dompurify 3.4.13→3.4.16（isomorphic-dompurify 内嵌）；四端 source-map-js 1.2.1→1.2.2；web/desktop/shared vue 3.5.4x→3.5.43（含 @vue/server-renderer）与 postcss-selector-parser→7.1.6；web dompurify→3.4.16。逐包判档：77 个锁条目全为 PATCH，0 major、0 增删包。
- 除 GitHub 已开 11 条中的 busboy/dompurify 三笔，顺手把 GitHub 尚未扫出但本地 `npm audit` 已红的 vue、fastify、sharp、source-map-js、postcss-selector-parser 一起清掉，避开下周再跑一轮全量门禁；axios 留下的 8 条由第二笔拆包根治。
- 数字订正（收口时 gh 实测）：本批开工时误记为「12 条 / axios ×7」，把 #76 一条警报内的两份公告当成两条；真实口径为 **11 条 = axios ×8（#74~#80、#82）+ busboy ×1（#81）+ dompurify ×2（#72/#73）**，本档与 STATUS 同步改正。
- 新增 `.github/dependabot.yml`：五目录（root/server/web/desktop/shared）全覆盖、周一 02:00 出批、同批 minor+patch 合并成一个 PR、major 不出自动 PR（破坏性跳版不得无人评审直接合）。
- 同批前置：活档 41177 B 撞 40 KB 体积门，按「撞线唯一处置=oldest 段整搬」另起一笔分册（`dfaca136`，逐行哈希零丢失）。
- 踩坑留痕：`npm update <包> --package-lock-only` 会连 `node_modules/.package-lock.json` 一起改写，导致后续 `npm install` 误判 “up to date”而磁盘仍是旧版（server/shared 实遇）；须删该清单或不带该开关重刷，并靠读 `node_modules/<包>/package.json` 做磁盘实测收口，不能只看 `npm ls`。
- 验证：四端 13 道 + E2E 2 道 + 4 道防阀直连全绿（server **1847** / web **967** / desktop **538** / shared **27** / E2E **14**，与看板基线一致零回归）；完整输出留痕 `AGENTS/workspace/temp/deps-zerobatch-20261012/gates-batchA.log`。

## 工具铺认领批补入库：U01/U02/U25/U33/U44 自检扫描工具落 scripts/（2026-10-12，漏提交收口，零业务代码）

- 现场核实：16 个脚本 + `.gitignore`/`daily-backup.bat` 两笔改动在位（mtime 2026-09-29~09-30），台账 `AGENTS/workspace/temp/toolshop-claim-20260930/` 已有逐件实跑 exit 码与三方合并留痕，但从未 `git add`——属漏提交，按“已拍板已交付”单独一笔入库，不裹挟任何依赖改动。
- 工具职责：U01 备份新鲜度看门狗（`daily-backup.bat` 五条中止分支 + 成功路径接入，复用 `verify-backup.mjs` 退出码，不改原备份链结果）；U02 并行车道只读扫描与现场清单（判据集中在 `U02-verdict.ps1`，只报不删）；U25 发版数字三源自检（A+B 双闸）；U33 待拍板队列台（产物防越界写 + 敏感串打码）；U44 web 样式平铺清单扫描。
- 本笔顺手补齐：`.gitignore` 原先漏了 U02 的运行产物（`scripts/U02-现场清单-*.md/html`、`scripts/reports/U02-lane-report-*`、`scripts/scan-latest.txt`），一跑即污染 `git status`，已补 4 行忽略。
- 有意不入门禁：这批是自取型人工/双击工具，`scripts/accept.ps1` 的 `$gates` 不挂（沿用 09-30 取货批口径）；`docs/**` 与 README 零引用，不存在悬空指针。
- 遗留（不阻塞）：`U25_root.txt` 与 `U02-verdict.ps1` 已知根名单绑本机工作区路径（换机可用参数覆盖）；U02 系列 .ps1 为 UTF-8 BOM，与仓库既有 .ps1（NO-BOM）风格不一致，PS5.1 认中文无害。

## 依赖收敛批：brace-expansion/fast-uri 警报清零（2026-09-30，安全报警处置，零业务代码）

- 四端 `package-lock.json` 定点刷新 `npm update brace-expansion fast-uri --package-lock-only`（不改 package.json、不加 overrides、不引新依赖）：brace-expansion 5.0.9→5.0.12 / 2.1.4→2.1.7，fast-uri 3.1.7→3.1.8 / 4.1.4→4.2.1（`^4.0.0` 兼容）。逐锁 diff 13 处全为 be/fast-uri，0 增删包、0 dev 变更，minimatch/eslint/ajv/fast-json-stringify/@playwright/test/tsx/typescript/vitest 未跳版；plain `--package-lock-only` 因锁定版仍满足范围不自愈（server audit 仍报 2），故走定点 update。
- 清零 12 条 Dependabot（brace-expansion ×9：2 high/7 medium；fast-uri ×3：medium，逐条 fixed）+ CodeQL #31（js/regex-injection，归档区一次性开发脚本、正则入参仅来自本机 argv 无攻击者汇点，false positive 驳回）；关闭单锁范围不全的 PR #11(shared)/#12(server)。
- 验证：四端 `npm audit` 全 0；13 端门禁 + E2E 2 道全绿（1847/967/538/27/14，零回归）。accept.ps1 因并行会话脏工作区（`daily-backup.bat`/`.gitignore` 非本批改动）受阻，按纪律改用等价直接命令组，留痕 `AGENTS/workspace/temp/deps-zerobatch-20260930/`。

## 依赖收敛批：undici 警报清零（2026-09-30，安全报警处置，零业务代码）

- server·web 两处 `package.json` overrides 新增 `"undici": "^8.10.2"`（单一传递链 jsdom@30 → undici，实测解析 8.11.2），重算两个 `package-lock.json`；清零 GitHub 18 条 Dependabot 开放警报（5 high / 7 medium / 6 low，GitHub 自动关闭，未手动 dismiss）。
- 选用 overrides 而非 `npm audit fix`：避免连带升级其他传递依赖跳版。undici 随 dev 链路（jsdom）存在，生产镜像与桌面壳不携带。
- 验证：十九道全绿 653s（server 1847 / web 967 / desktop 538 / shared 27 / E2E 14，与看板基线一致）；CI / E2E / CodeQL 对 `596c4445` 均 success。留痕 `AGENTS/temp/dependabot-undici-20260930/`。
- 首跑全量 1 道偏红：并行会话同 HEAD 门禁 E2E 互踩（`.server-pid` / 端口 5099 共享），环境静默后复跑全绿；本批代码无责。

## 部署门禁纯文档批降级通道批（2026-09-29，harness 发现项，小批次零业务代码）

- `scripts/post-merge-deploy.ps1` STEP0 验收联动新增**纯文档批降级通道**：报告 `verdict=green` 仅 HEAD 不一致时，若报告 SHA..HEAD 全部提交只触及 `docs/**`、`desktop/docs/**`、任意 `.md`（新常量 `$ACCEPT_DOC_PATH`），记 WARN 降级放行而非 Stop-Fail。
  - 前置安全钩：仅当报告 branch 仍为 master、SHA 可解析且为 HEAD 祖先时才走降级；`merge-base --is-ancestor` 不通过（离线、历史被改写）回到原阻断口径。`$ACCEPT_EXEMPT` 仍为空表，未新增任何门禁豁免。
  - 写完首版自检时发现并堵上一个自己引入的洞：降级分支坐在原 elseif 链上会短路 24h 陈旧门（三天前的报告 + 纯文档提交也能放行），已把 `$staleH -le 24` 显式写进降级条件并加 s8 景断住。
  - 顺手补一缺陷：`-SkipAccept` 分支此前**静默跳过不写日志**，与脚本顶部注释「会记录 WARN」不符；现补 WARN 一行，审计痕迹只增不减。
- 验证（沙盒 git 仓八景，取证件 `AGENTS/temp/docdowngrade-20260929/results.md`）：全绿同 SHA 基准→ACCEPT OK；纯文档领先 2 提交→WARN 降级放行并进 STEP1；含代码领先提交→仍阻断（exit 1 + 告警文件）；报告 SHA 离线→阻断；`verdict=red` 无豁免→阻断（降级通道不覆盖红报告）；纯文档但报告已 25h 旧→阻断；`-SkipAccept`→WARN；脏工作区 `-Force`→发布门禁 WARN 绕过、不带 `-Force`→GATE FAIL（既有绕过留痕与告警文件行为未削弱）。脚本另过 `Parser::ParseInput` 零语法错 + 三道防阀（status-line / changelog-size / file-size）全绿。
- 口径已登记 `docs/comms/STATUS.md`「已拍板规则」；改路径清单须先拍板，不擅自扩大豁免范围。

## 服务端日志轮转接入批（2026-09-29，harness 发现项 server-log-ownership，小批次零业务代码）

- `scripts/rotate-log.ps1` 新增接管清单（MANAGED）：`-Path` 改可选，无参调用扫描清单并按同一 5MB×3 口径逐档 best-effort 轮转；现有三处 `-Path` 接线（deploy.log ×2 / daily-backup.log）实测不受影响。
- `daily-backup.bat` 步骤 0 增无参调用接上接管清单（保持 ASCII-only）。
- `docs/OPS.md` 新增 §14：两种拓扑（本地非 Docker `data/server.log` vs Docker json-file 10m×3）的日志位置、轮转口径与排障入口，与报障模板「贴 server.log 内容为首选定位手段」对账；并写明公开页失败响应体不得回显内部标识/日志线索的防泄露口径不变。
- 验证：沙箱 6MB 级 server.log 无参调用实转成 `.1`；链式迁移 `.1→.2`、超 Keep 淘汰实测；文件缺失/低于阈值 no-op；pwsh 与 powershell.exe 5.1 双入口 exit 0。

## 文档治理专项批 ×2（2026-09-27，纯文档零业务代码）

- **U18 文档专项审计归档批**（`f7b65f5a`）：五路侦察交叉判定 + 三路推翻式复检；主 STATUS 26→5 块、桌面 STATUS 45→5 块（逐行哈希零丢失）；
  docs/comms 搬出 28 件失效文书 + 落选原型目录入 `archive-20260927/`；新立 `docs/comms/README.md` 活文档索引（含编号族谱）；
  机械订正簇（v74→v76、十七→十八道、窗口口径、子代理落盘路径等）；新立待拍 U21/U22；桌面 STATUS 看板刷新（滞后 22 天补正）。
- **changelog 滚动分册批 A+B+D**（`44651c17`）：本文件 134.6KB/1977 行 → 活档 31.6KB/304 行，v0.x 53 段整搬 `docs/changelog-archive/changelog-v0-20260927.md`（逐行全等零丢失）；
  维护纪律声明（=本块，工程台账定位 / Releases 对外叙事 / 顶插 / 不删历史 / 滚动分册）；新门 `scripts/check-changelog-size.mjs` 挂 accept 第 19 道（≤40KB/450 行、新增段≤4KB、存量冻结）。
- 两批均本地提交未推送；推送前补跑十九道全量门禁。


## 「今天吃什么」库扩建批（两波，2026-09-25）

- 菜谱库 495 → **3530 条**（healthy 1481 / diabetes 1331 / gout 1351 / takeout 1281，菜名全局唯一）：两波各 6 路采集子代理（联网，共 3396 条草稿）+ 8 路逐条交叉验证（V1~V8）+ 终审波 8 路独立再核（F0 机械 + 四维度×2 重叠交叉，判定冲突 0）。累计删标 ~106、删菜 ~17（含越线药膳与编造品类）、改 note ~700、并条净减 ~185 条、改名 71；功效断言/治疗腔/GI 数值科普腔全库清零。
- 结构：单文件拆为 `web/src/utils/food-menu/` 13 分片 + index 聚合（避开 800 行巨型文件防阀），导入路径与 FoodMenu.vue 零改动；新增数据完整性单测 4 例防退色；全部裁决脚本化可复跑（AGENTS/temp/food-expand-20260925/merge*.mjs）。详见 STATUS 2026-09-25 条。

> 📦 **近期批次变更史摘要（2026-08-24 ~ 09-12） ／ 标识/身份码对齐批 → TypeScript 全仓收尾迁移（2026-08-19 ~ 08-23，共 12 段 / 173 行）已滚动分册至 `docs/changelog-archive/changelog-1.0-early-20261019.md`（2026-10-19 技术债四合一批 A 路，原文原样搬迁，逐行哈希零丢失）。**
> 📦 **v1.0.0-beta.3 发版记录（2026-08-18） ／ 0817 用户反馈批 + 系统更新面板 + 文档大扫除（2026-08-17 ~ 08-18，已随 v1.0.0-beta.3 发出） ／ beta.2 后待办清扫批（2026-08-16，已随 v1.0.0-beta.4 发版）（共 3 段 / 64 行）已滚动分册至 `docs/changelog-archive/changelog-20260816-20260818-20261012.md`（2026-10-12 批，原文原样搬迁，逐行哈希零丢失）。**
> 📦 **v1.0.0-beta.2 审计修复收口版（2026-08-15） ／ v1.0.0-beta.1 公测发布（2026-08-15）（共 2 段 / 52 行）已滚动分册至 `docs/changelog-archive/changelog-v1.0.0-beta1-beta2-20261012.md`（2026-10-12 批，原文原样搬迁，逐行哈希零丢失）。**
> 📦 **v1.0.0-beta.1 之前（v0.1 ~ v0.46+，共 53 段）已滚动分册至 `docs/changelog-archive/changelog-v0-20260927.md`（2026-09-27 批，原文原样搬迁，逐行哈希零丢失）。**
