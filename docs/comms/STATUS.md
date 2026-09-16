# 全局状态（一号维护，其他角色只读）

## 看板（2026-09-17 第八次刷新：审计缺陷修复波1+波2 已本地分批提交、未推送；上一次推送态为 2026-09-14 第七次刷新 `797eae10`）

- **HEAD** `797eae10`（✅ 已推送，一次推上三笔：上一轮 `096c0b77`+`de923472` 与本轮 `797eae10`；43 文件 +3420/−684）
- **基线**：server **1847**（159 文件）/ web **955**（139）/ desktop **538**（37）/ shared **27**（4）/ E2E **14**；迁移 **v76**（本轮零 schema 变更）；版本 server·web 1.0.1、桌面 0.1.0　※ 此为 2026-09-17 审计修复波1+波2 后**本地**基线（未推送）；`797eae10` 推送态基线为 server 1801 / web 886 / desktop 447 / shared 23
- **门禁（提交后实跑 accept.ps1，总耗时 604s）**：**实质全绿**——15 道 ✅，test-tamper 与 file-size 两道 ❌ 为已知 npx 假红（输出实为 `npx canceled ... ["node@26.8.2"]`），node 直调补跑**均 exit 0**（防阀 468 文件豁免 0 项）
- **测试同改标红已取到真判据**：`--base de923472` 报业务 17 + 测试 7 同改 → 带 `--ack-reason` 裁决后放行；断言面审计：7 份测试共新增 364 行、删除 10 行，被删 expect 仅 3 条且全为「补 await」与「日期跟随正文实改」，**无任何改软凑绿**
- ✅ **拆件已获用户追认（U3）**：ArtistLayout 775 / ArtistManage 781 行，防阀转绿；新件 `HomeTakedownBanner.vue` + `useHomeTakedown.ts`
- 🔴 **警报未清零（R5 算漏半区）**：6 条 → 推送后自动清 3 条（server 侧 sharp/vitest/mocker）。
- 🔴 **剩 3 条在 web 与根 lock**：#23 vitest 与 #20 @vitest/mocker（`web/package-lock.json`，现 4.1.10、补丁版 4.1.11）+ #25 sharp（根 lock 的**孤立条目**，根 package.json 无此直依赖）→ 待拍板 U20
- 公网仍冻结中（停在 v74，本地与远端已到 v76）；默认窗 1200×820、最小窗 1200×600 不变（9/5、826 拍板）
- 🔴 **上线前置硬警告仍有效**：管理员判定只认库值，公网部署前**必须先确认 `platform_config.admin_qq` 非空**

**下一步（按优先级）**

1. 🔴 **下次开工第一件事**：把 `docs/comms/待办-用户侧清单-20260914.md` 逐条端给用户提醒（U1~U20），不要闷头继续施工
2. **新发现待拍板 U20**：web 与根 lock 的依赖半区（剩 3 条警报）——建议 web 升 vitest ^4.1.11（一行 + web 四道门禁），根 lock 那条孤立 sharp 条目单独一批清
3. **云端已回看全绿**：推送后 CI、E2E、Push on master 三条流水线对最新一笔 `e37e4ad8` 均 **completed/success**（无需再回看）
4. **等你终审两处对外文案**：W4 下架横幅措辞、W6 隐私三条 IP 披露（另含 U12 主页文案、U13 安装包署名）
5. **黄红灯集中清**：Y2~Y7 与 N1~N4（含 G8 归档搬动、N2 门禁工具批：npx 假红 / check:i18n 路径失配 / **test-tamper 提交前结构性空转**）+ 上一轮 G1~G9·F-31/32/35/36 指针

**常驻纪律（事故换来的，不得退色）**

- 改 `desktop/src-tauri/` 必本地跑 `cargo check`：`tauri-build` 用**严格 JSON 解析器**，9/12 那笔 `//` 注释就是只跑 server/web 就交、CI 单红 desktop job 换来的（本地“全绿”是假全绿）
- 门禁缺口已清：`check-file-size.mjs` 的 ALLOWLIST **为 0 项**，禁止用调高冻结值给长胖文件续命

**起手必读**：**⚑ 下次开工第一件事：向用户逐条端出 `docs/comms/待办-用户侧清单-20260914.md`（U1~U19）提醒他做他那边的活**，再读 **⚑ 2026-09-14 第二轮定时开工收口条（本节下方第一条）**。

**起手必读续**：→ 交接档 `docs/comms/交接-20260912-会话收口与待拍清单.md` → 本节看板 → `AGENTS.md`（含「STATUS 体例与归档纪律」）→ 碰桌面端再读 `desktop/docs/STATUS.md` 顶部。

**起手必读续二**：改桌面 UI 必跑 `huiyue-layout-audit` 自检循环（**宿主级技能**，住 `%USERPROFILE%\.agents\skills\huiyue-layout-audit\`，不在仓库属正常；VL 评审通道不可用，只能 measure.mjs + 人工逐项清单）。


> 📌 **2026-09-17 审计缺陷修复 波1+波2 全量收口（P0×3 + P1 四端；契约驱动 13 路文件领地并行 + 主代理收口亲跑门禁；已本地分批提交、未推送）**
>
> - **事实源**：依 `docs/comms/审计缺陷修复施工清单-20260917.md`（两轮审计发现逐条回代码核实版）修 P0×3 + P1（SRV/WEB/DSK/SHR）；P2（~130）/P3（37）未逐条核实，本迭代不动。施工契约 `docs/comms/施工契约-审计修复波1-20260917.md`·`波2-20260917.md`；13 路 ledger 在 `temp/ledgers/`（gitignored，本条已合并其结论与后续项）。
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


> 📌 **2026-09-14 第二轮定时开工收口（R1~R5 + W7，goal 链式调度首跑）**
>
> - **范围**：把上一轮 P4 后端的 v75/v76 能力补齐 web 前端（W1~W6），加 E2E 合规链路（W8）、W7 主页文案、依赖与 CI 健康批；共 6 批，编排事实源 `docs/comms/定时开工总纲-第二轮-时间表与防冲突-20260913.md`。
> - **台账指针**（同批细节只写一份、不互抄）：`docs/comms/ledgers/ledger_R1.md`·`R2`·`R3`·`R5`·`W7`，本批 `ledger_R4.md`；编排文档共 7 份（总纲 + 六份计划书）在同一目录。
> - **R1（web 配套 W1~W6）**：新建 `AdminActions.vue` 处置留痕页 + 路由/导航；举报页来源 IP 列；画师管理页「下架/恢复主页」双键（含 step-up）；画师后台下架横幅；作品已下架徽标 + 管理端恢复键；隐私政策补三条 IP 披露。locale 全程单写者、中英成对。
> - **web 基线 876→886**（125 文件，+10：AdminActions 3 / ArtistManage.ban 3 / ReportManage 2 / ArtistDetailDrawer 2）；lint、check:i18n（13 条豁免无新增）、build 绿。
> - **W7**：用户拍板**方案 A** 并由链式起点批落地 `zh-CN.ts:844`·`en.ts:845`（中性提示 + 双指引），与 R1 的 W4 后台横幅闭环；纯文案改值不增删用例。
> - **R3（E2E W8）**：新建 `e11-compliance.spec.ts` 单条 test 走 API 主链（举报→下架→幂等→客户侧最小载荷→恢复→留痕可查→不重复记账反证）；**E2E 13→14 passed**；断言与 W7 文案解耦。
> - **R5（依赖与 CI 健康，G9 解锁）**：flaky docker CI 重跑一次转绿（四 job 全 success）；sharp 0.35.4 + vitest 4.1.11 本地升级，**未走降级路径**、零 breaking 撞上。
> - **R5 续**：修 `publish-artwork.test.ts` TC-PA-07 漏 await 假绿（只补 await、未删断言）；关 dependabot PR #7/#8、dismiss glib #10；**server 1801/156 不变**。
> - **警报收尾链（推送后实测纠正）**：开工 7 条 open → 收工 6 条（glib 已消）→ **push 后只自动清 3 条（server 侧）**；另 3 条属 web 与根 lock 半区，R5 未升级故仍 open（已登 U20 待拍板，详见看板与 `ledger_R4.md` §十）。
> - 🔴→✅ **本批曾撞出一道真红（已消）**：巨型文件防阀——R1 把 `ArtistLayout.vue` 767→807（W4 横幅）、`ArtistManage.vue` 748→848（W3 双键）顶过 800 上限，先按禁区纪律只上报未自行返工。
> - **消红方式**：用户回「按照工程学最优去做好」口头放行 → R4 破例进 `web/src/**` 拆件（待追认项 U3）；横幅拆为 `components/layout/HomeTakedownBanner.vue`（57 行，标记与样式逐字搬）。
> - **消红方式续**：主页下架/恢复的两步确认 + step-up 链拆为 `composables/useHomeTakedown.ts`（93 行，两条链收敛为同一 run），另把共用的原因输入框 `askOptionalReason` 一并收进同一件。
> - **拆后状态**：ArtistLayout **775** / ArtistManage **781** 行，防阀 exit 0；行为零变更证据：web 886 例全过（含 ArtistManage.ban 里 3 条主页下架·恢复·step-up 用例）、E2E 14 全过、lint+vue-tsc 零错。
> - **门禁（主代理亲跑，不凭子代理汇报）**：`accept.ps1` 本体在 `:57` 前置检查（未提交跟踪件即中止，上一轮 P5 §1.1 同款死锁）被拦、零道执行（日志 `temp/r4-accept-attempt.out.txt`）。
> - **门禁续**：改逐道等价命令复跑（日志 `temp/r4-gates/`）：server **1801/156**、web **886/125**、desktop **447/30**、shared **23/4** 四项全绿。
> - **门禁再续**：各端 lint（含 vue-tsc）与 build 零错，check:i18n 13 条豁免无新增，E2E **14 passed** + check-locators exit 0；test-tamper 用 node 直调绿（绕 npx bug）。
> - **判读口径**：拆件后逐道等价命令 **17 道全绿**；但 accept.ps1 本体因 accept 前置（工作区脏）未跑成，**仍不得称「accept 十七道全绿」**，待本地提交令后补跑取硬结果。
> - **流程矛盾登记（与上一轮 P5 §1.1 同一处）**：计划书 §三「先跑全量门禁」与 §六「绿后提交待令」互斥（accept.ps1 要工作区干净）；计划书原文未动（共同事实源）。
> - 🔴 **未做归档搬动**（G8 红灯）：正文现 **8 条**、已超体例「只留最新 5 条」，本批一个字未搬，待单独一批 + 字符总量前后差校验。
> - **未 commit / 未 push** → ✅ **已提交并推送**：用户回「同意 提交 推」后，逐领地暂存 43 文件提交为 `797eae10`（+3420/−684），`git push origin master` 成功（`d4984edf..797eae10`，含上一轮两笔），详录见 `ledger_R4.md` §十。
> - ⚑ **用户侧待办已单独立档**：`docs/comms/待办-用户侧清单-20260914.md`（U1~U19，全免代码口径）；已挂进起手必读与下一步第 1 条——下次开工先逐条端给用户，不要闷头继续施工。


> 📌 **2026-09-13 定时开工五批收口（P1~P5，schedule 编排首跑）**
>
> - **范围**：P1 文档收口（工单 F-13~F-40 第 3/4 批）/ P2 桌面批（F-33 纠错 + F-07 登记 + 卷心 inert + 波2 拖拽改期施工）/ P3 前端三小修 + 管理后台设备 tab 补测 + F12 引导卡原型 / P4 后端两项 / P5 合并回写与 shared 色值。
> - **台账指针**（同一批细节只写一份，不互抄）：P1~P5 各自 `docs/comms/ledgers/ledger_P*.md`；桌面端专属事实源 `desktop/docs/STATUS.md` 与 `desktop/docs/施工图-桌面端主页重设计波2-拖拽改期-20260913.md`。
> - **P4 性质纠正**：主页下架**不是新边界决策**——REQ-042 §三 C 早写明内容级下架要覆盖「作品/留言/主页」、§三 B 拍了「警告→内容下架→封禁」阶梯，实施时漏了中间格，本轮是需求回归。详情 `docs/comms/定时开工计划书-P4-后端批-20260912.md` 与三份 P4 施工图/研究档/落地契约。
> - **P4 新能力**：`v75` 取证 IP（管理动作/举报/留言三表，取 IP 按代码现行 `request.ip`，计划书原句 CF-Connecting-For 判不实项）；`v76` 内容级下架（主页下架不踢登录且**画师自助不可解**、作品下架由物理删改可恢复）；留痕查询接口 `GET /api/admin/admin-actions`（此前该表只写不读）。
> - **门禁（主代理亲跑，不凭子代理汇报）**：server typecheck/lint 0 错 + **156 文件 1801 例**；web lint/i18n 绿 + **124 文件 876 例** + build 14.62s；desktop lint + **30 文件 447 例** + build 2.82s；shared 三道 **23 例**；巨型文件防阀 465 文件豁免 0 项。
> - **十七道已跑（提交 `096c0b77` 后，372s）**：15 道绿；test-tamper/file-size 因 accept.ps1 的 `npm exec --no -- node` bug 未跑起，node 直接补跑均绿（放行 / 465 文件豁免 0 项）→ **实质全绿**，不称「accept 十七道全绿」。用户已定：脚本 bug 先不修、归单独门禁工具批（同 G2）。
> - ⚠ **STATUS 正文已超体例「只留最新 5 条」**（现 7 条），按 G8 红灯口径**本批未做归档搬动**（文本迁移属高风险，须单独一批 + 字符总量前后差校验），仅在此标注待处理。


> 📌 **2026-09-12 同日第三批：F-09 巨型文件拆分战役 + 两条法律拍板落地（同批 7 路并行）**
>
> 用户三条拍板：① **AGPL 取 `-only`**（不受未来版本约束）；② **著作权署名＝本人 GitHub 个人身份**；③ **大文件只要长胖了就拆掉，拆了就移除豁免，老的幽灵豁免也必须清理好**。
>
> F-09 拆分（范围比看板原记的“10 项”更大：另有 3 个「藏在豁免线内但仍 >800」与 1 个幽灵豁免，共 **14 个文件**）：
> - server：`admin.routes.ts` 1103→**44**（拆 8 个子路由模块）、`artist.service.ts` 816→**18**（5 个职责子模块 + barrel）、`pricing/style.service.ts` 1041→**479**
> - web：`api/types.ts` 1904→**37**（拆 27 个域文件 + barrel，**156 处下游 import 零改动**）、`api/index.ts` 865→**17**（拆 9 个模块，227 个端点方法）
> - vue：`ArtistManage` 1254→**748**、`ArtStyleManager` 967→**629**、`ArtistLayout` 997→**767**、`TplGallery` 902→**758**、`ManualOrderRight` 924→**705**、`QueueBoardList` 880→**775**、`ArtworkManage` 870→**750**、`OrderDetail` 837→**747**
> - 共新建 **45 个文件**，全部达标 ≤800（入口降至 780 以下留缓冲）
>
> 🔒 **防回归的硬证据（不信口头“没改逻辑”）**：`style.service.ts` 做到 **49/49 顶层声明逐字节相等** + 导出面静态与运行时双检相等 + 资金域 21 个测试文件全点名通过（含 TC-R8-A/B 全 13 例）；`admin.routes` 用真 Fastify 实例 `onRoute` 抓运行时路由表，**58/58 路由与守卫链逐字一致**；`api` 两文件用 esbuild 分别打拆前/拆后包并 `import()` 比 `Object.keys`，**运行时导出面完全相等**；`OrderDetail` 逐个点名 `applyOrder` 14 个调用点仍全部收敛（子组件零直接写状态）。
> - 既有防线拆后全部在位并逐条点名：M-12 序号守卫 / L-11 findIndex / L-13 在途锁 / a1-12与a1-13 / M-8 双检 / L-5 定时器清理 / R17 两步写 / 管理员账号保护 / REQ-043 I4 公告轮询与页宽下发。
> - 样式零漂移：三路各跑 measure.mjs 改前/改后对照，**野生圆角与离栅值的取值种类均零新增**（仅因 scoped 不跳组件边界产生少量必要复制，已逐条申明）。
>
> ALLOWLIST 清算（scripts/check-file-size.mjs，由主代理收口统一改，施工员按令未碰）：
> - 13 项豁免**全部删除**，现 ALLOWLIST 为空对象；防阀输出「✅ 通过（豁免 0 项）」
> - 幽灵豁免 PriceCard.vue（冻结值写 1022、实际只剩 **156 行**）一并清除——文件早拆小却忘了撤豁免，属台账欠账而非技术债
> - 规则同时收紧并写进脚本注释：今后只允许登记「确实暂时拆不动」且须一号裁决注出处；**禁止用调高冻结值给长胖文件续命**
>
> 许可与署名（15 处标识 + 1 处署名位）：
> - AGPL-3.0 → **AGPL-3.0-only**：4 个 package.json + 6 处 lock 自身包条目 + Cargo.toml + README 两处 + THIRD-PARTY-NOTICES + CONTRIBUTING（工单原计 5 处，实测 11 处机器可读——工单漏算了 shared/package-lock.json）
> - 取 -only 的依据已查 **SPDX 官方 license-list-data**：AGPL-3.0 是 isDeprecatedLicenseId=true，AGPL-3.0-only 才是未废弃标准 ID；且不含空格，npm 与 Cargo 两侧写法字面统一（cargo verify-project + cargo metadata 实测通过）
> - 著作权主体统一为 **AxelBeary**（GitHub 个人，与 git 20/20 作者一致）：Cargo.toml 的 authors 原写产品名「拾绘」属署名位错标，已改；**产品名「拾绘 / Inkglean」一律保留**（区分口径：它在回答「权利属于谁」还是「这东西叫什么」）
> - 主代理三处裁决：① LICENSE 首行多一个井号——**不改**（9/5 审计已警告官方文本一个字都别动）；② 根 package-lock.json 仍写 ISC——**不处理**（根 package.json 已标 private 且无 license 字段，根包永不发布，ISC 只是 npm 默认噪声无法律意义）；③ 安装包 bundle.copyright 未设——**待用户定措辞**（属对外法律文案，不代拟）
> - 补做了施工员因领地限制未做的：4 个 package.json 补齐 author 字段（工单 F-39 要求的 author 全 null）
>
> 🔴 **本批踩到的新坑（后人拆分必遇）：check:i18n 的 baseline 按「文件路径 + 违规串原文」记账**
> - 现象：ArtistManage.vue 里原样存在一个 alt 硬编码文案已被存量豁免（13 条之一），拆分把该弹窗搬到 TotpBindDialog.vue 后**文案一字未改但路径变了** → 豁免失配、被报成新增硬编码，门禁 exit=1
> - 处置：用一次性脚本做**路径迁移**（命中数不为 1 或条目总数变化就拒绝写入），条目总数仍 13，未新增任何豁免、也未为此发明新文案键
> - 教训：拆文件时凡涉及带 baseline 记账的文件，要先把旧路径的存量豁免同步搬过去；长期解法可给 check-i18n 加「按违规串跳路径匹配」或把自带的 --prune 流程化（未擅改工具，登记待拍）
>
> 主代理派工词的两处错误前提（施工员指出，记下防再犯）：
> - ① 叫 ArtistLayout 自查 --app-h 下发链——那是**桌面端**机制，web 全仓零命中；该文件真实机制是 pageWidthStyle 下发 --page-max-w + 容器查询
> - ② 说 824 的 InviteOverlay 在 ArtistLayout——它在 Login.vue 旁，本页对应出口实为 TourOverlay
> - 教训：**派工词里的事实也要先核**，不要把记忆当证据写进派工提示词
>
> 基线与门禁（**主代理亲跑**）：server typecheck 0 / lint 0 错 0 警 / **150 文件 1715 例**（拆分零行为变更 → 用例数完全不变）；web lint 0 / **869 例**（+8）/ check:i18n OK 13 条无新增 / build 绿；防阀 通过（豁免 0 项）
>
> ⚠ 未做/待办：① **拆完未做浏览器活体冒烟**（订单详情与后台布局是关键路径，单测不代替真实渲染；已补跑仓库根 npm run test:e2e 全量 13 例作端到端门禁，但 E2E 不覆盖这些页面细节）；② 真后端对开箱向导新步的联调；③ git push 未做，本批与前两批均未过 CI；④ api/types 里有几个名字看着属别的域（SimpleSuccessResult / OkResult / DeletedResult）但按「宁可少拆也别赌」未重排；⑤ StyleCard 与 ArtworkManage 弹窗外的主体未再下钻，已达标但仍有空间。


> 📌 **2026-09-12 同日第二批：P1 余批收口（路 3 报的两条 🔴 全部修完，已本地提交 9db4a653）**
>
> 后端（`onboarding_mode` 有读无写 → 功能不可达）：
> - 新端点 `POST /api/setup/onboarding-mode`（`{mode:'invite'|'manual'}` → `{ok:true,mode}`），**复用同文件既有 `guardSetupGone`**（初始化完成后 410 SETUP_GONE），未另造鉴权
> - 写入用 UPDATE（migrate 的 `INSERT OR IGNORE` 保证行恒在），已补运维脚本 `server/scripts/set-onboarding-mode.ts`（照 totp-rebind 先例，无交互默认值）——因开箱向导只走一次，部署后变更需此口子
> - 新增 5 例含「已初始化态被拒 410」（防把部署期口子变成常态后台口子）；`invite.test.ts` TC-INV-12 本体不改，只加一行「写入通道另有其人」指引注释
> - 关键甄别：该步进的是**部署期开箱向导**（SetupWizard），**不是** 824 已拍板的四步画师入驻流程（InviteOverlay）——两者不同页面，未推翻任何既有拍板
>
> 前端（对外文书诚实度收尾 + 向导插步）：
> - 开箱向导 4 步 → **5 步**（新步插在「管理员」后、「扫码」前），步号改 `STEP` 常量表统一引用，杜绝“进度 5 格代码写 4”；失败不静默前进（M-11 口径）
> - 隐私政策 `updated` 跟到 2026-09-12（中英）；服务条款日期**故意不动**（本批未改其正文，改了反而成新不实陈述，并已用断言锁住）
> - `preferences.notifyDesc` 不再承诺「提醒你」；不复用 `common.notifyDevHint` 整段的理由：那段描述的是客户侧「灰着、默认不勾」，画师侧开关没灰置，复读即成新假话
>
> 🔴 **本轮抓到的新事实：三个死键**`settings.notifyLabel / notifyText / notifyPanelTitle` 全仓零渲染（desktop/server/e2e 亦无引用）：
> - 危害不是死代码本身，而是**它误导了本次台账对账**——侦察兵按文案检索把它当活文案报成「对外虚假承诺」，施工员据此改了 3 处谁也看不见的字
> - 处置：三键删除（zh+en）+ 新测试用 `in` 断言锁住「不得无渲染器加回」，并同时断真在渲染的 `preferences.notifyLabel`/`orderForm.notifyLabel` 仍活着（防反向误删）
> - 遗留：`settings.notify*` 属「漏建 UI」还是「已被 preferences 取代」未定（本批按后者处理），如需画师主页设置页真有该开关要另立 REQ
>
> REQ-042 台账串位（归档件）：按体例**不改写历史原文**，只在 `docs/requirements/archive/REQ-042-合规与内容安全.md` 顶部加一条「⚠ 2026-09-12 对账更正」指针，说明「本 REQ 正式化 REQ-032」不成立（REQ-032 功能一件都没有，自身仍为占位备案）。
>
> ⚠ **主代理自查失误两条（如实报，不默算）**：
> - 上一笔提交 `a7d933e9` 时**漏同步 `accept-baseline.json`**（实跑已 1710/841，文件仍写 1702/833）——后果是下一次跑 accept.ps1 会**假红**；本笔已补齐并在 history 里写明该链
> - 我删死键后写的断言用了属性访问（`locale.settings.notifyText`）→ typecheck 直接红；已改用 `in` 语义（断言「键不存在」本该用 `in`，而非拿 `any` 蒙门禁）
>
> 基线与门禁（**主代理亲跑**）：server typecheck 0 / lint **0 错 0 警** / **150 文件 1715 例**（415.54s）；web lint 0 / **861 例** / check:i18n OK 无新增 / build 绿；desktop 281 / shared 23 未动
>
> 未做：真后端对向导新步的联调（只有 mock 验过）、E2E 未覆盖开箱向导。本批共 **16 个文件**（12 改 + 4 新建，未 commit、未 push）。
> 防阀复跑：仍为既有 **10 项**超线，**本批零新增**（改动的 16 个文件无一上榜）；ALLOWLIST 里 `PriceCard.vue`（实 156 行）幽灵豁免再被确认一次，归 F-09 待拍。


> 📌 **2026-09-12 「三路并行 + 止血」开工批收口（用户拍板：三路一起开 / 话术当场拍 / P1 修 3 条）——已本地提交 `a7d933e9`**
>
> 缘起与方法：
> - 用户拍三项：① 本机测试环境备份事项整块剔除、不再呈报（已入长期记忆为硬禁令）；② 三路一起并行开；③ A 项话术当场逐句拍
> - 同批一次派出 **5 路子代理**（3 路只读对账 + 路 1 问卷 + 审计批施工 + P1 批两路，共 7 路），不串行；主代理收口亲跑全量门禁与亲验关键事实，不凭汇报交差
>
> 路 3 台账对账（只读三片，产出均为口头报回未落盘）：
> - 总账：**真缺 5 条** / 部分实现 10 条 / 已实现但文档过时 12 条（均带 文件:行 证据）；重点下钻 REQ-028/030/032/038~043
> - 830 审计批 31 条：**23 条确认在位且测试非假绿**（三个核心测试均走真 service + 真 DB + 真验签）
> - 9/3 四项 + 波1 六件 + 啄虫员 9 项修复：**全部真落地**，无一项空头支票
> - 归档 `archive/` 下 REQ-022、25、26、27、29、31、34、35、36、37 共 10 篇「✅ 已实施」**未对账**（侦察兵工时用尽，且从命中率看同类问题概率不低）
>
> P1 批已修 3 条（用户选「立刻修 3 条」）：
> - 埋点：`onboarding_view`/`tour_start`/`onboarding_dismiss` 补入白名单（实测原为 **23 项→26**，侦察兵报的 24 不准，已按代码为准）
> - 埋点：`POST /api/events` 由「整批 400」改为**逐条剔除**（合规照常入库 + `rejected` 计数），修「一个非法事件名连坐丢 50 条合法数据」；此项**修订了已归档的 REQ-033 批量接口语义**，契约清单已回写
> - REQ-028：客户下单页 + 画师录单页的「QQ 排队提醒」补齐**灰置 + 默认不勾 + 「开发中」人话提示**（两页共用同一个 i18n 键，不漂两份中文）
> - 隐私政策：删去对用户的不成立承诺「可在偏好中关闭」，改为实话（管理员全站开关、个人端无入口）
> - 🔴 **上线前置硬警告**：`getAdminQq()` 已去掉 `process.env.ADMIN_QQ` 静默回退（库值为空时曾会默认拿 .env 那个号当管理员，而开箱向导不回显 QQ、两边不一致不报错）
>   公网升级前**必须先确认 `platform_config.admin_qq` 非空**；已补启动自检告警作保（库值空而 env 有值时 log.warn 指导落库，只告警不写库不回填）
>   实测本机：库值有值时 env 不参与判定，9 个调用点无需改动；seed.ts 的 env 读保留（dev-only，有生产 `assertSeedAllowed` 门禁）
>
> 审计第 2 批（F-05/06/08/10/11/12 已完，F-09 未动＝待拍）：
> - F-06 端点守卫：旧写法判「拼接结果」故 **vars 缺失时恒不触发**（展开成非空 `/latest.json`），改为判 vars 原值 + 四道闸（空值/非绝对 URL/`.invalid` 占位/替换未命中）
> - **主代理拓到一处假保险**：施工员写的 `dry_run` 经核 `softprops/action-gh-release` 官方 action.yml **17 项 inputs 里根本没有此键** → 会被静默忽略，已改官方真输入 `draft:`
> - `checkout@v6`/`setup-node@v6` 已查两家官方仓库 release 列表确认存在（不是凭空 pin）；补 `concurrency` 排队防并发写 latest.json
> - F-10：accept.ps1 真补 6 道 desktop/shared 门禁（带 `countKey` 断数字，非空键假绿），**11 道→17 道**；基线 JSON 补 desktop 281 / shared 23，server 1666→1702→1710
> - F-11：`git tag` 实测 7 个，与工单一致；F-12：漏登包补入，`isomorphic-dompurify` 内嵌 dompurify 按实测 license 落 `(MPL-2.0 OR Apache-2.0)` 双许可
> - 遗留：F-08③（「已拍板规则」指针治理选型）施工员按令**未替用户选**；F-07（发布清单登记 vars/secrets）属 `desktop/docs/` 领地，未做
>
> REQ-044：
> - A 项三层话术**已拍板定稿**（写回 REQ-044 §二A，含拍板记录防后人重改）：第一层「一个网站」措辞用户维持原样（主代理提的矛盾意见已被推翻）；第三层加「**正在开发的**」限定（桌面端未发布，对外不写现在时）
> - D 项问卷单页已产出：`docs/requirements/REQ-044-附件-问卷.html`（单文件零外链离线可开、手机优先、防误选走「提示式」因替换式会偷改答案）；Playwright 实测 375/1280/320/768 四档 51 断言全过
>
> 门禁全绿（**主代理亲跑，非凭汇报**）：server typecheck EXIT=0 / lint **0 错 0 警** / `npm test` **149 文件 1710 例全过**（410.83s）；web lint（含 typecheck）0 错 / test:web **841 全过** / check:i18n **OK—存量 13 条豁免无新增** / build 绿；desktop **281** / shared **23** 亲验一致
>
> 新登记待办（本轮发现未修，不属已拍板范围）：
> - 🔴 功能不可达：`onboarding_mode` 有读无写（只能进服务器手改 SQLite）；REQ-042 声称「画师协议止式化」但须知结构化/下单自动填充/可存档凭证 **一件都没有**（台账串位）
> - 🟡 隐私同类虚假承诺两处：`settings.notifyLabel/notifyText`、`preferences.notifyDesc` 仍在承诺 QQ 通知能力
> - 🟡 隐私政策 `updated` 日期未跟着正文改（仍写 2026-08-23）——属对外文书拍板权，未擅动
> - 🟡 管理动作留痕无 IP 字段（验收写了时间/IP，表只有时间）；「主页」类内容下架做不了，只能整户封禁
> - 🟡 卷心两面切换 `v-show` 隐藏面无 `inert`/`aria-hidden`（键盘 Tab 会走进看不见的区域，与 E4 抽屉同类病，抽屉已修）
> - 🟡 管理后台「设备」整块前端零测试（265 行测试文件里无一条设备用例，mock 也没登记那两个新方法）；后端有 10 例兜着
> - ⚪ 830 原始审计报告**从未入库** → `M-5` 编号在账本里凭空消失（M-4/M-6 都在）、`L-3`/`L-6` 只有转述无法独立验
> - ⚪ 终验清单 D4 后半句判据仍与代码不符（缓冲区头真值「N 笔候补」，清单当成「在途」）；`SchedStrip.vue:6` 注释讲反话（行为对、注释与 9/4 修后的实现相反）
> - ⚪ 图片链接续期：真值 5min 但前端轮询 10min/补刷 8min，三方不一致共 **12 处**（审计工单 F-02 只登记 5 处，实测漏登 3 处代码注释）；成因＝`FILE_TTL_MS` 未 export，两端只靠注释互指。改法待实测定（压间隔已核实安全：限流 20 次/5min，两实例同开仅约 2.5 次）
> - ⚪ 37 条终验清单里「已被自动化覆盖」所引的 Playwright 脚本在未跟踪的 `workspace/temp/`，新克隆机器复现不出
> - ⚪ F-33 索引表硬错行号已漂移：登记的 `:110/:111` 现为 `:122/:123`，`desktop/docs/STATUS.md:10` 自己的指针也跟着错（第 4 批改时要连指针一起改）
> - ⚪ 路 3 未证实项：HTTPS 真机 Passkey 登录、分享主页到 QQ/微信是否真出卡片、375px 高频路径无阻断（截图未落盘）
>
> 本批共 **25 个文件**（未 commit、未 push），拆法：已跟踪 **19 件 +403/−69**（含 STATUS.md 与契约清单的回写）＋ 本批新建 **5 件**（4 个测试文件：`server/tests/admin-qq-single-source.test.ts`、`web/src/__tests__/complianceCopy.req028-transition.test.ts`、`web/src/components/artist/order/__tests__/ManualOrderLeft.notifyWip.test.ts`、`web/src/views/client/__tests__/ContactStep.notifyWip.test.ts`；加 `docs/requirements/REQ-044-附件-问卷.html`）＋ `REQ-044-产品表达与安利能力.md`（**9/7 未跟踪件、本批回写 A 项定稿**）。
> 工作区另有 1 个与本批无关的 9/7 未跟踪件 `docs/comms/止血与三路并行-开工任务书-20260907-待拍板.md`（本批未动）；故 `git status` 总路径数为 **26**。


> 📌 **2026-09-07 「止血 + 三路并行」开工任务书成文（纯文档；三路已于 9/12 按本任务书开出）**
> - 口径修正：本条原列的「第 0 步止血批」中备份链与 patrol.sh 相关项，已按用户 9/12 明令**整块剔除**（本机测试环境不需要在意备份），不再作待办；该批实际只剩下「提交 9/5 未提交件」一项，已于 9/6 完成（`b0d327d2`）
> - 档：`docs/comms/止血与三路并行-开工任务书-20260907-待拍板.md`（自包含：边界重划依据 / 四路分工 / 领地与收口纪律 / 交付物清单）
> - 三路重划：终验归路 3（不与路 2 抢同一份清单）；路 3 先台账对账后活体验收；验本机 master（公网冻结中，830/9-3 批在线上不存在）
> - 第 0 步止血批（十分钟量级）：提交 9/5 未提交的 P0 备份修复 + 恢复已断链的每日备份 + 挂 patrol.sh 巡检
> - 待拍四条（推荐值已给，见任务书 §六）；路 1 的 B/C 项押在 AGPL only-or-later 与著作权署名主体两条法律拍板之后

> 📌 **2026-09-07 REQ-044 立项登记（纯文档，零代码零迁移）**
> - 新建 `docs/requirements/REQ-044-产品表达与安利能力.md`：产品表达与安利能力（对外输出改造），P2 已立项待排期
> - 来源：画师用户安利实测对话反馈（一句话定位 / 详情页文案 / 强迫选择问卷 / README 第一屏 / 对外表达自查）
> - 工作项：A 三层话术（草案已成稿，待用户拍板口径）／B README 首屏改造／C 应用详情页文案／D 核心功能问卷（10 选 2）／E 对外表达自查制度化
> - 实施顺序：A 拍板 → D 问卷发出 → C 文案 → B 收口；问卷结果反哺详情页功能排序与桌面首页板块主次（详见 REQ 第四节占位）

> 🔑 **2026-09-05 文档系统交叉审计批 + 第 1 批修复**（用户拍板：默认窗高 820、四条真风险立即修）
> - 用户原话：「让大量子代理检查我们的文档系统是否过时或错误，要交叉验证」
> - 方法：**17 路子代理两轮**（第一轮 12 路分区只读审计、第二轮 5 路交叉复核）+ 主代理亲跑取证，不凭子代理汇报交差
> - 交付物（仅报告未施工）：`docs/comms/文档系统交叉审计-总报告-20260905-待拍板.md`（人话分级版）与 `…-修复工单-20260905.md`（逐条可执行，40+ 项分 4 批）
>
> ↓ 以下各行仍为旧体例（单行超长），按新纪律**不在此批逐行重排**，待随归档搬动时统一改写（AGENTS.md「STATUS 体例与归档纪律」）。
> **交叉验证本身抓到的东西（这是本批的核心价值）**：① **推翻 6 条假阳性**——`huiyue-layout-audit` 被判失效指针（实为**宿主级技能**、审计者只查了子代理目录）、图片备份「长期是空的」（实测归档与目录逐项吻合，**自动备份路径是好的**、错的只是文档里那条手工命令）、交付链接「转发给客户晚 5 分钟必 403」（场景不成立，系统不给画师可转发的链接）、前端未同步放行 GIF（六入口用 `image/*`，既有单测就叫「提示仍可上传」）、终验清单 D3 事实错（把「六态」与「图例六项」当一张表）、`LICENSE` 文末「占位未填」（AGPL 官方正文固有段，**去「填」它等于篡改许可文本**）。② **二审挖出第一轮完全漏掉的 4 件硬货**（见下 P0 与 F-02/F-06）。③ 计数纠偏：curl 7→**11** 处、备份命名 3→**2** 套、漏记提交 46→**56** 个、Rust 文件「9」→桥接 8/全量 11、未 await 断言「7」→**1** 处。④ **纪律事件**：一路审计侦察兵**违反绝对只读禁令**在仓库根擅建 4 个临时脚本（它自报了），主代理核对内容确为取证残渣、跟踪文件零改动后清理复原；后续每轮派工均已补该禁令与「不许落盘」替代技法。
> **第 0 级——已经在坏事的（非文档错）**：① **🔴 P0 图片备份恢复不出来（主代理亲自实测坐实并本批已修）**——`server/scripts/backup-uploads.ts` 的 `tarHeader()` **先算校验和、后写 typeflag/magic/version/prefix** 四个必须入算的字段，每个归档头校验和全错；实测旧归档存 `014557`、按代码顺序复算亦得 `014557`（模型吻合）、POSIX 应为 `016056`（差值 703 字节，与施工员独立量到的漏算量**逐字节吻合**），Windows tar 读之报 `Unrecognized archive format` 而日志记 `BACKUP_OK`；**根因是校验工具只验数据库、单测用自写宽容解析器从不校校验和**。② **每日备份链已断 9 天**（最后成功 8/27 03:30；8/28~9/1 连日志都没有＝计划任务根本没跑，比失败标记更隐蔽；9/2~9/4 为 Docker Desktop 未运行）——且**仓库里本就有 `server/scripts/patrol.sh` 第 2 项在做「36 小时新鲜度告警」、四份运维文档 0 次引用它**，故属「有工具没挂上」不是「缺机制」（避免按第一轮结论重复造轮子）。③ 图片链接自动续期定时器仍按 15 分钟配（**定时 10 分钟与补刷 8 分钟都晚于真值 5 分钟过期点**，代码注释与两处技能文档同样未同步）——属行为变更，**待实测再改**。④ 巨型文件防阀**当前红灯 10 项**（主代理亲跑），CI 四 job、`AGENTS.md` 清单、`AGENTS-v2.md:38` 均不含它 → 9/3、9/4 写「门禁全绿」**字面未谎但外延已缩**，需钉死定义；溯源为 4 笔提交分批攒出、8/24 那句「防阀通过」当时为真，不冤枉人。⑤ 发布流水线三处待发版前必修（缺 shared 安装、端点守卫**恒不触发**、无并发保护）——**本批未修，已登记为发布清单第 19/20 项**。⑥ **新增工单 F-41**：`verify-backup.mjs` 不解析 tar（故无同类校验和缺陷）但**覆盖面盲（uploads 归档完全不在射程）+ 新鲜度盲（不判年龄）**，拿 8 天前的旧档照样报绿。
> **第 1 批已修（本批施工范围，三路并行 + 主代理收口）**：①**F-01** 后端路修 `tarHeader` 字段顺序 + 在 `TC-OPS-01` 就地补 POSIX 校验和/落位/**顺序哨兵**三类真断言（并补一条此前完全无覆盖的 prefix 长路径 fixture），**做了红绿双向验证**（把顺序改回缺陷态必红）；主代理另走**真实代码路径**冒烟闭环：新归档被 bsdtar 正常列出 4 条目（含长路径/空文件/回收站）、退出码 0，而同工具读修复前旧归档仍报 `Unrecognized archive format`。②**窗高 780→820**（`tauri.conf.json`，minWidth 1200/minHeight 600 **不动**＝826 亲定）——桌面路跑现成 `winheight.mjs` 实测 820 档**卷面内滚 1px、外层溢出 0**（todo/cal 两态一致），且**纠正了主代理派工词的一处错**（花青实际只覆盖剩 2~3 天，因 `daysLeft===1` 先命中「明天截稿」落朱砂）。③**F-03** 终验清单 D4 判据改为代码真值四档（此条不改会让用户**把正确实现报成 bug**）、D3 只解措辞歧义不动事实、「已知诚实账」窗高条改记 820 并保留笔记本屏风险在册；主代理另补施工员未获授权的 **4 处旧 780**（快照表/环境准备/B1/诚实账第 2 条，其中 B1 会让用户拉错窗口）与 D4 前半句「三色点」→四色（已核 `ScheduleList.dotClass` 确为四分支）。④**F-07** 发布清单销掉旧 ⚠（dtolnay 已由 `983df8c1` 移除）、新增第 **19/20** 项登记两处发布流水线缺陷与 GitHub vars/secrets 实测各 0 条、第 1 项 v73→**v74**（并注明部署范围实为 830 批全量、旧交付链接会 403）、第 5/6 项台账刷至 9/4 波1——施工员主动避开重排编号（代码里有三处注释写死「第 6/8 项」，重排会断交叉引用）。⑤**F-04** `docs/OPS.md` 新增 §2.1「备份链巡检」（引用 patrol.sh + Linux cron 挂法 + Windows 两条已实测的只读自查命令 + 三条判读纪律 + 本机断链实况留档），**纯追加 55 行未重排既有节号**。
> **追加实跑收口（9/5 同日第二批，新口径首次应用）**：用户拍板「子代理可以在 `temp/` 里写脚本做测试」（已写入 `.qoder/agents/huiyue-scout.md` 与 `huiyue-bughunter.md` 约束段与长期记忆；**但 `.qoder/` 不在版本库，改动仅本机生效＝工单 F-35 待拍项**），据此把此前只能“读码推断”的两项挂实项跑成实证：①**官方 `measure.mjs` 实跑四集合**——本批 11 个样式文件野生圆角**三口径均 0**（“已清零”由复刻证据升级为官方证据）、13 种离栅值逐值复现、**基线野生圆角＝8 种（去重）且三集合一致**；两个不可复现数查明真相：“10 处”＝误数「圆角取值明细」段行数（含 5 行合法值）、“11 处”＝把“本批与基线的**重合种数 11**”写成了“旧文件处数”（已回写终验清单与两份 STATUS）。**另发现脚本自身一个更重的口径缺陷**：`wildRadii` 累加时**完全忽略 `x次数`**（`measure.mjs:103` 遍历去重 Map）→ **同一处野生圆角复制 50 次汇总值不变，会低估真实违规密度**（同一输入下去重 8／汇总 15／还原次数 22 三个数互不等价，此前“汇总＝不去重”的说法也不准），已登 **工单 F-42（建议回写宿主 SKILL.md，未改）**；同时记下本批官方汇总「阻塞」仍为 true（离栅未清）与 5 处「需人工核验」未逐项登记（已补齐，不新增偏离）。②**真跑 `parseManifest` 四组输入**——上一轮四条读码判定**全部实跑证实**（唯一致拒因＝示例 `minHost 0.2.0`；`stats` 只被剔除、`source` 被壳覆盖均不致拒；真样例与单测夹具均通过），并确认必填为 **6 件**而规范 §五 写「五件」（少计 `name`）、**`entry` 是第 7 个隐性致拒因**文档未提；采其建议走“改值＋加三处同改脚注＋把「AI 照抄不出错」改成可兑现措辞”。③ 用 `temp/recon-server-test.log` 核掉最后一条挂实项：**未 await 断言确认 1 处**（初报 7 处为 grep 误判）、**`MaxListeners` 告警实为 66 条跨三类监听器**，其中 **`beforeExit` 不是本仓代码注册的**（来自 tsx/vitest 测试链）→ 修产品代码只能消两类，不得归因错对象。④ **交叉验证又转了一圈**：跑量测那路反报“派工前提不成立、STATUS 里没这三个数”，**经主代理 `Select-String` 复核为假阴性**——它自己用了 ripgrep 搜超长行，正撞在本批派工词已明写的坑上（真存在：`docs/comms/STATUS.md:12` 与 `desktop/docs/STATUS.md:5`），其**余下结论经逐条复核仍全部有效**；教训＝“没搜到”类断言在主代理侧也要再验一次，不因它是“纠正我”就直采。

> **门禁全绿（主代理亲跑，非凭汇报）**：server typecheck 三配置 EXIT=0 / lint **0 错 0 警** / `npm test` **148 文件 1702 例全过**（基线不变，新增断言就地扩、未增用例数）；desktop lint 0 错 0 警 / **281 全过**（基线不变）/ build（vue-tsc+vite）绿 / `cargo check` 绿；防阀仍为既有的 10 项超线（本批只删注释未变胖，**未擅自调冻结值，清偿方案待拍 F-09**）。**网页端 0 改动**。本批共 7 文件（+148/−17）。**已提交待令**（本批未 commit、未 push；主代理上一笔已推送的 `2e1e6902` 为波1）。**待拍板项（含法照与治理选型，不代选）**：防阀 10 项清偿方式与是否进 CI、「已拍板规则」章节复活还是改指针（治理机制选型）、`REQ-014` 定位（三路同荐改判「决策基线快照」）、`开发自参考` 处置（同荐数字删为指针+三大清单节归档）、视觉 token 事实源归属与「泥金」去留、沙箱载体回写（**不得改回代码，那等于降低隔离**）、`AGPL-3.0` 选 only 还是 or-later（**实质法律选择**）、著作权署名主体、四个岗位定义是否入版本库。

> 🔑 **最新：2026-09-04 桌面端主页重设计落码波1（定稿原型落 desktop 真实代码；后端 0 改动，门禁全绿待用户终验）**——接上一条原型批，用户开工前拍两条：①**分两波**（波1＝首页改造 + 独立排期页三视图**只读**，拖拽改期留波2）；②**本地模式按本地记账自建、缺的诚实缺席**（时间条本地连页签一起缺席、可接单绿点本地不标）。**主代理钉契约 + 两路并行派工（huiyue-frontend）+ 主代理收口**：契约层（排期纯函数域 `desktop/src/schedule/`、双模式共用 `stores/schedule.ts`、共享件 SegTabs/CalGrid、prefs.mainView、/schedule 路由、队列端点封装）先落并跑绿再派工；路A＝排期页三视图、路B＝首页改造，领地按文件零重叠。**落码六件**：卷心主位可切换（今日要办 ⇄ 排期月历，页签无朱砂点、记住选择）/ 卷心月历 flex 自适应 / 卷尾近 7 天摘要签点开分流 / 独立排期页三视图 / 右侧「卷心-侧景-插件」三列空间自适应 / 「更多板块与插件」抽屉（只列桌面端真有的条目，不造死条目）。**收口实测根治（Playwright 四档窗 56 用例 0 异常）**：栅格行尺寸初稿把行压到小于内容高→侧景卡溢出压住卷尾、更多按钮点不到（改 min-content 口径 + 列上不写 min-height:0）；月历自然高反顶行高（改 `contain:size`）；`--gap` 无基准值→窗高 >700px 时三段紧贴、订单速览 chips 贴死（**既有缺陷**，补 `:root{--gap:16px}`）；时间条今天线非法 calc 被静默丢弃 + 轴/条不同轴；逾期未完成单在时间条会消失（原型是画在最左的）。**顺手修两个既有缺陷**：①`desktop/src/modules/viewData.ts` 的 time 视图把 Vue 响应式代理交给 postMessage → DataCloneError → 模块 5 秒后转灰牌（**官方示例模块「稿情气象台」自波17 起一直踩这坑**，现已真渲染出天气句）；②首页概览句把逾期 2 天说成「今日截稿」且与「1 笔逾期」自相矛盾。**啄虫员（huiyue-bughunter）审查：1 阻塞（排期 store 模式切换不失效→切出后月历继续显云端客户，一页两套真相）+ 5 重要（本地空日误涂藤黄、今天线非法 calc、哨兵测试重抄实现自我循环、本地排期快照不随记账刷新、账本读不到给假空态）逐条核实全部属实并已修**。**门禁全绿**：desktop lint 0 错 0 警 / **281**（基线 185+96）/ build / cargo check；**后端与网页端 0 改动**（队列端点、名额结构化字段、F11 canAccept 口径均为 9/3 回流批已就绪资产）。**诚实备注**：默认窗云端满载时卷面内滚实测四档（600 高 167px / 780 高 31px / 800 高 11px / 820 高 1px，硬底＝非矮窗下侧景两卡 min-content 523.7px），属**本批之前既有行为**；**用户 9/4 据此当场拍板：默认窗高 600 → 780**（`desktop/src-tauri/tauri.conf.json`，**最小窗 1200×600 不动**＝826「不允许放太小」亲定不变），要真零内滚还有两条路（窗高再提 820 / 紧凑档上限 700→800，后者动原型四档口径）待亲测后定，另登记风险：780 高于 1366×768 笔记本可用高（约 728px）；VL 评审通道不可用（模型 403 未购买 / VL 系 404 不存在），布局审计改走 measure.mjs（**野生圆角本批已清零；基线对照值＝8 种·去重口径**——本批原文曾记「优于既有基线 10 处」，9/5 官方脚本复跑查明该 10 是误数脚本「圆角取值明细」段的行数、其中 5 行为合法 token 与 50%，已改写为本句原意对应的正确值）+ 主代理逐项 C1-C4/S1-S5 复核 + Playwright 实测。**【9/5 后续】默认窗高已改定 820、终验清单 D3/D4 与窗高口径已修正，详见本文件顶部 9/5 审计批**。**事实源**：施工图与收口修正记录 `docs/comms/桌面端主页重设计落码-施工图-20260904-波1.md`；细目 `desktop/docs/STATUS.md` 顶部；**终验清单独立成文** `docs/comms/桌面端主页重设计波1-终验清单-20260904-待用户终验.md`（自包含：环境准备与窗口记忆坑 / 9 组 37 条「怎么做→应该看到→不合格长什么样」/ 已知诚实账六条 / 可跳过项 / 派代理只读与可改两种口径——用户哪天愿意验或想派桌面代理去跑，直接拿这份）；冒烟脚本与截图 `workspace/temp/redesign-land-904/`。**波2 待办**：拖拽改期（写接口 + 乐观锁 + 撤销 + 在途守卫）。**已提交**（9/4 用户下令，本地 `master`；**已于 9/5 推送远端，CI 四 job / E2E / CodeQL 全绿**）。

> 🔑 **最新：2026-09-04 桌面端主页逻辑重设计原型批（用户 9/4 拍板「定稿」；纯原型探索未落 desktop 代码，下一步见末尾）**——缘起：9/3 回流批拆出的「原型先行」，用户提长卷首页「塞不下很多东西」（三视图/插件/未来能力）要重设计主页逻辑容纳扩展。**方向（用户逐项认可）**：保留方向A长卷世界观，核心＝台面摘要 + 点开分流 + 收纳 + 空间驱动自适应（渐进增强不做两套）。**三轮原型迭代（用户实测反馈驱动）**：①初版＝长卷台面+排期摘要签分流独立页+更多抽屉+插件卡+大窗底部堆月历；②用户反馈「今日要办与月历应共享卷心主位、用户自定义选显示哪个」+「大窗底部堆月历不好看」→卷心主位改可切换槽（今日要办⇄排期月历，纸签脉页签+记住选择=自定义默认）、删底部堆月历；③用户反馈「高度没算好会出滚动条」+「页签右上角朱砂点像未读通知会误导画师」→月历改 flex 自适应（.scroll grid-template-rows 1fr→minmax(0,1fr) 防撑破 + 卷心月历 cal-grid 6行 repeat(6,minmax(0,1fr)) 格子不固定高，Playwright 实测 600/900 窗高零溢出 558≤558/858≤858）+ 删所有纸签脉页签选中态朱砂点印（选中态靠花青字+纸底+花青内描边）。**定稿方案**：①卷心主位可切「今日要办/排期月历」（月历随窗高 flex 自适应、不底部堆、不强制分流）；②「看全景三视图›」→独立排期页（列表/月历/时间条纸签脉切换 + 拖排改期等重操作）；③右侧 aside 列＝侧景（经营/留言）+ 插件区（新插件往下加摘要卡；大窗空间多就多露、小窗 600 放不下就收进底部「更多板块与插件」抽屉点开看全部）；④空间自适应：大窗（≥800高/≥1400宽）卷心舒展+侧景多列、小窗紧凑+大件分流、窄窗（<1020）塌单列，同一套长卷不做两套。**交付物**：原型 `proto-desktop-home-redesign.html`（仓库根，单文件 html 纸墨风，复用母本 proto-desktop-home-r2-A.html 手法 + 剔除天地杆换 827 顶条一张纸；预览起 `python -m http.server` 服务仓库根）；实测截图 `workspace/temp/redesign-shots/r3-*`（4张，Playwright chromium，零 JS 错误）。**下一步（用户开新会话续）**：A 落 desktop 真实代码（较大工程，先出施工图再动手；要点＝卷心可切换新交互、月历 flex 自适应防滚动条、页签无朱砂点、右侧插件区+更多抽屉收纳）/ B 做 F12 网页端完稿引导卡原型（已拍：网页端先落地 + delivered 交付后弹 + 仅图片交付物触发）。

> 🔑 **最新：2026-09-03 桌面端回流批（web 三项 + desktop 门禁进 CI；用户拍板 5 项 + goal 模式推进，CI #1301 四 job 全绿待终验）**——发布前待办清单第 6/8/9 项纯代码活，后端 0 改动（三项 API 均就绪）。**拍板 5 项**：①范围路线 A（干净活优先，桌面端全新 UI 拆出去走原型先行批）；②设备清单页入口＝画师详情抽屉加「设备」tab；③desktop CI runner＝windows-latest 四道门禁全上；④F11 网页端＝B+C（顶部总量状态牌 + 月历绿点受名额约束）；⑤F12 引导卡＝归原型批。**侦察关键发现（两路 huiyue-scout）**：桌面端当前无订单详情/录单/交付宿主 → F9/F12 桌面侧无处挂载属更大前置；F11「网页端欠账」实测月历按天 free「可接单」批G已实现（REQ-035 归档过时）；用户产品洞察「已满应按总量名额算非按天」→ 升级口径。**施工四项**：①设备清单页（第8项）——ArtistDetailDrawer 第7个「设备」tab，复用账号安全页设备表形态（el-table+popconfirm踢出+三态+在途锁），接 adminApi.getArtistDevices/revokeArtistDevice（管理端全列裸数组，字段 last_login_ip 与画师端 login_ip 不同），新增 AdminDesktopDevice 类型 + admin.devicesTab/devicesHint 词条，独立实现不共用画师端组件；②desktop 门禁进 CI（第9项）——ci.yml 加 desktop job（windows-latest + lint/test185/build/cargo check + 先装 shared）；**连挂三次 startup failure（#1298/#1299/#1300，YAML 经 python 验证合法但 GitHub Actions 解析层拒绝、整个 workflow 起不来 server/web/docker 全没跑）→ 排除法逐轮移除 Swatinem/rust-cache、中文 step name 仍挂 → 真凶＝dtolnay/rust-toolchain@stable（GitHub 从未实际解析过该 ref：desktop-release.yml 写了它但 tag 触发从没跑过）→ 移除后用 windows-latest runner 预装 Rust stable+MSVC 跑 cargo check，#1301 desktop job 9 步全 success**；③F9 客户快查卡（第6项网页端）——OrderDetail 基本信息卡底部内联客户卡，复用录单页 mo-client-card 视觉，order.client_qq 变化查 getToolsClient 失败静默，复用 manualOrder.clientSummary* 词条零新增；未抽 shared（桌面侧缺宿主收益未到，工程判断偏离计划书“建议抽组件”，将来桌面 F9 做 shared 哑组件时统一）；④F11 排期口径（第6项网页端）——QueueBoard 顶部总量状态牌（slotDisplay 名额文案 + 色彩随 canAccept）+ QueueBoardCalendar free 绿点受 canAccept 约束，canAccept 用结构化字段（status/quotaInfo/batch_limit/buffer_limit + 队列计数）复刻后端 computeSlotDisplay（不匹配中文文案防脆；effectiveStatus 只覆盖额度耗尽不覆盖席位满故弃用），数据源 useArtistStore().profile 同 PlaqueStatus，onMounted fetchProfile。**门禁全绿**：web lint（含typecheck）0错 / test:web **833**（基线832+F11-C用例1）/ check:i18n 无新增 / build；server 0改动 CI server job 验；**CI #1301 四 job 全绿（web/docker/server/desktop，desktop job 9步含 cargo check 全 success）+ E2E #1006 success**。测试适配：QueueBoard.reorder.test.ts 补 stores/artist mock（QueueBoard 新增 useArtistStore 触发真实 i18n 实例 createI18n 撞 mock 不全）。**遗留隐患（重要）**：desktop-release.yml 仍用 dtolnay/rust-toolchain@stable，将来发版 tag 触发极可能同样 startup failure，发版前须一并移除改用 runner 预装 Rust（本批未擅改无法验证的发布流水线）。**拆出去（原型先行批，未做）**：桌面端 F11 三视图 / F12 完稿引导卡（含网页端，全新交互需先 html 原型）/ F9·F12 桌面侧（依赖桌面端订单详情·录单·交付宿主，需单独立项）。**待用户终验**：设备tab/客户卡/状态牌三处网页端改动。

> 🔑 **最新：2026-09-03 依赖安全升级批（用户拍板「核实九个漏洞」→「做」；已提交推送触发 CI + Dependabot 重扫）**——背景：push 828 补交时 GitHub 回传默认分支 9 个依赖漏洞（6 高 3 中），另有 Dependabot 自动开的 PR #5（fastify 5.10→5.12.1）/#6（fast-uri）。**核实（主代理亲跑 npm audit 五依赖树 + npm ls 定位 + 生产配置核对，不照单全收）**：9 条与 GitHub 数字逐条对上账——6 高＝fast-uri×4（ajv 带 3.1.5 + fast-json-stringify 带 4.1.2，均后端生产依赖）+ nanoid×1（postcss 下 dev 副本，触发条件 size=0 自定义生成器不发生；生产顶层 nanoid@5.1.16 不受影响，web 早已 override 钉 3.3.18）+ brace-expansion×1（web eslint→minimatch dev，Node 构建工具永不进浏览器包）；3 中＝fastify×2（schema 校验绕过 + X-Forwarded-* 欺骗，后端主框架）+ glib×1（Tauri Linux GTK，826 已备案不做 Linux、代码永不运行、被 tauri 锁版本升不动）。**判定**：真相关仅 fastify + fast-uri（后端公网运行时）；且 XFF 欺骗已被生产配置挡掉大半——docker-compose `TRUST_PROXY` 只信任 Docker 内网段（非全信）+ 830 备案 AOP 已在生产就位（正是 Dependabot 只对这两项开 PR、对其余三项没开的原因，与研判吻合）；nanoid/brace-expansion 属 dev/构建噪声、glib 已备案。**修复（清 9 中 8，glib 留备案）**：①server `fastify ^5.0.0→^5.12.1`（消中危×2）；②server `overrides` 钉 fast-uri（ajv→`^3.1.7` / fast-json-stringify→`^4.1.4`，均落在父包声明范围 `^3.0.1`/`^4.0.0` 内非破坏）+ postcss→nanoid `^3.3.18`（dev，同 web 既有 override 口径，不动生产顶层 nanoid@5）；③web `npm audit fix` 升 brace-expansion 5.0.8→5.0.9（仅 lock 3 行）。附带 transitive：process-warning 5.0.0→5.1.0（fastify 带入）。server 依赖树改动仅上述五包，无意外牵连。**同批根治一处 master 遗留红**：web typecheck 报 `useOrderGallery.ts(27,35) TS6133`——830 批 M-9 applyOrder 收敛后 `order` 变死参数（函数体全程只用 routeId/onRefresh/applyOrder，从不读 order），830 STATUS 声称「web typecheck 0 错」但合并进 master 的实际代码是红的（本批跑门禁才暴露）；正经修法＝删死参数 order + 连带删无用 `import type { Ref }`（EnrichedOrderDetail 仍被 applyOrder 类型引用故保留）+ 同步调用方 OrderDetail.vue（order 变量在组件内仍被 useOrderDeadline 等使用，不受影响），零行为变化。**门禁全绿**：server typecheck 三配置/lint 0 错 0 警/**1702** 全过（基线不变）；web lint（含 typecheck）0 错/**832** 全过/check:i18n OK（无新增违规）/build 6.96s。**验证路线（已全部核实）**：公网站点用户主动冻结、本批不上线；push 后 GitHub CI 在干净环境用 `npm ci` 重跑全套门禁——**CI #1296 Success（4m49s：server 4m45s / web 2m0s / docker 44s 三 job 全绿；docker job 已验证新 lock 下生产镜像可构建，替代本地 Docker 重建）**、**E2E #1001 Success（1m48s，13 用例端到端过，实证 fastify 5.12.1 全链路无碍）**；本地 Docker 重建仍延到用户解冻部署时随 post-merge-deploy 跑。**Dependabot PR #5/#6 均已自动关闭**（push 后 main 依赖已是安全版，Dependabot 检测即销账，仓库现 0 open PR）；glib 中危警报会持续挂着属预期（备案不动）。**遗留/诚实备注**：glib 备案不动。

> 🔑 **最新：2026-08-30 外部审计报告修复批（用户拍板「修完 核验 然后提交GitHub」）**——背景：收到外部只读审计报告（830，共 31 条：5 高/12 中/14 低）。**研判**：四路侦察兵逐条对照代码核实 + 主代理亲自实测——25 条属实、6 条部分属实（方向对、细节修正后采纳）、0 条捏造；H-1 主代理内联脚本实测复现负金额坐实。质量远超外部报告均值。**落地（四路并行派工，主代理钉契约收口）**：①资金域——H-1 计价引擎负 delta 下限豁免改绝对位置口径＋超额转额外应退＋`checkOrderConservation` 新增 R8 断言（静默损坏变回 fail-fast，最关键一修）；H-5 改价/增项累加后上限断言；M-2 撤销取消后补重排队列；M-10 锁价进度按订单 installments 数收口；L-8 删死代码 `applyRefund`（单轨 allocateDelta）；L-10 作废旧撤销窗口立即补结。②账户与版权——H-2 桌面切出先注销服务端会话（断网降级本地清理）；H-3 新增画师自助设备端点（GET/DELETE /api/artist/devices）＋账号安全页设备清单＋踢出；H-4 一次性下载访问层真落地：交付签名携带载荷（下载模式带每次换新的 nonce＋锁定对账；画师预览模式仅 deliverableId），TTL 15→5 分钟，客户直链下架统一走 download-start（追踪页同步改链），新增迁移 v74（download_nonce）。③容器与认证——M-1 TTL 清理拆为独立 `gcDatabaseTtl`（不再被文件类早退吞掉）＋幂等键查询补时效双保险；M-6 TOTP 锁定时间戳统一 `parseLockedUntilMs`；L-7 设备活跃记账进程内缓存（热路径省 SELECT）。④前端竞态——M-8 队列三区加载各加序号守卫；M-9 订单详情抽统一写入口 `applyOrder`（version 单调不回退），14 处写入点全部收敛（含报告漏报的 useOrderGallery 2 处）；M-11 工作流加载失败补错误态＋重试；M-12 画风 load 守卫＋预载序号绑定（N×M 请求合并留 TODO 待后端批量接口）。⑤前端杂项——L-5 六处定时器清理（含报告漏报 3 处）、L-9 提单锁前置、L-11 findIndex -1、L-13 拖排在途锁＋快照、L-14 i18n 门禁补 key-diff。⑥桌面端——M-7 快捷键登记失败降级不崩（弃 expect）；M-3 补 CSP（script-src 'self'，保留 ipc/asset/https 通道；sql 权限收敛风险大未动，备案）。⑦配置——L-1 本地 .env 改回 development 标记（docker-compose 硬编码 NODE_ENV=production，生产不受影响）。**备案未修**：L-12 routeId 隐式契约（keyed-div 实防中，完整修需响应式穿透 6 文件，独立批）；M-4 限流 XFF（OPS §12.2 实测留痕显示 AOP 已在生产就位，待用户在 CF 控制台终确认）；L-2 更新端点（需真实域名）；L-4 TS 版本分裂（需独立评估）；M-3 sql 权限收敛（随桌面 token 注入层设计）；L-3/L-6 无实际危害不动。**门禁全绿**：server typecheck/lint/1702 全过（基线 1666+36 新用例，含组合矩阵 13 例＋一次性下载对账 8 例＋设备端点 6 例）；web lint/832 全过（基线不变）/check:i18n OK（含新 key-diff）/build；desktop lint/185 全过/build/cargo check；E2E 13/13（含 E10 一次性下载链路）。**部署提示**：本批含迁移 v74（幂等）；上线后旧版已签发的交付文件链接将 403，客户重新点「开始下载」取得新链接即恢复（预期行为）。

> 🔑 **最新：2026-08-28 虚拟团队编制 v2 拍板批（用户拍板四项，纯流程+文档零应用代码）**——背景：用户要求工作流程向正规产品团队靠拢（用户拍板、主代理调度、子代理分工执行），目标又省又快又好。**拍板四项**：①建常驻岗位（不做每次临时派）；②派工门槛＝中大活才开团，小活主代理直干；③啄虫员（合并后只读审）只在大改/大批或动了 B 类（大工程/链路设计）需求时上场；④落档＝长期记忆 + `docs/soul/AGENTS-v2.md` 新建 + 各路文档同步。**落地**：新建四个项目级常驻子代理 `.qoder/agents/huiyue-scout`（侦察/只读）/ `huiyue-frontend`（前端施工）/ `huiyue-backend`（后端施工）/ `huiyue-bughunter`（啄虫/只读），岗位说明书即子代理文件本身；流程事实源 `docs/soul/AGENTS-v2.md`（编制/三档门槛/八步流程/红线/三原则）；根 `AGENTS.md` 事实源优先级补第 5 条指向；`soul-01-lead.md` 派工纪律条升级为常驻子代理通道（旧 hermes profile 通道保留备用）；被推翻的旧决策（subagent 只做只读核查手、执行走外部窗口）已在长期记忆中清理。本批零应用代码零迁移无需门禁。**附注（829 拍板）**：调研 DeepSeek Harness（DSH，官方开源代理工作台，内建后台任务队列/子代理并行/断点续跑）——拍板九月初安装试点，定位为异步施工通道（Codex CLI 同步通道不变），已建 9 月 2 日一次性提醒；试点前不动任何安装。**【9/3 更新：暂缓】**用户亲自复核 DSH 现状，官方预告后续将有破坏性更新（升级会打断既有工作流），据此拍板**暂缓试点、暂不安装**；重评时机＝DSH 破坏性更新落地并趋于稳定后。

> 🔑 **最新：2026-08-26 CI 修复批（用户拍板只修两件，已修绿；零应用代码改动）**——背景：824 共享组件搬家后 CI 三连红（8-24/8-25/8-26），GitHub 另有两条安全警报在案。排查与处置三件：①**CI 红根因**：web 自 824 起 typecheck/build 直导 `../shared` 源码，file: 链接只带源码不带依赖，ci.yml 漏装 shared 自身依赖致 vue-tsc 在 shared 文件上报 TS2307/TS7006（本地装有故绿）——修复＝web 任务补 Install shared dependencies 步骤＋缓存路径纳入 shared/package-lock.json；②**code-scanning #25 整改**：desktop-release.yml 补 `permissions: contents: write` 最小权限声明（发布 Release 产物所需），警报已自动销账；③**Dependabot #10（glib 0.18.5 中危，用户拍板暂留观察）**：经依赖树核实仅存于 Linux 平台依赖链（Tauri GTK），Windows 依赖树无此库、桌面端已拍板 Linux 不做，代码实际不会运行；靠升级不可控（被 tauri 锁版本），重评时机＝未来支持 Linux 或 tauri 升级带入 glib≥0.20。**门禁**：push 60772082 后 CI ✅（4m38s，三连红后首绿）/ E2E ✅ / CodeQL ✅；code-scanning 开放警报清零。**遗留**：Dependabot #10 暂留。

> ✅ **上一条：2026-08-24 F3/F4 共享组件搬家批（用户拍板整件搬家，已合入待验收；零行为漂移）**——定契批开放项兑现：F3 约稿条 / F4 小票整件迁入 `shared/`（方案 B：去 element-plus 化，分段控件/遮罩弹窗自绘；哑组件接口定稿落 `shared/README.md`）。web 两页面原地改薄宿主壳（1023→153 / 558→76 行），utils 三件改 re-export shim；老草稿 key 不变兼容；导入/勾选/确认等交互语义逐条保原件（含作品库取数缓存与先查主页标识顺序）。**门禁全绿**：web lint 0 错 / **832/832**（基线 831+1）/ check:i18n 无新增 / build；shared lint 0 / 23/23 / typecheck；desktop lint 0 / 9/9 / build / cargo check。布局审计收敛（离栅已修、VL C1-C4 全过、S1 疑点人工复验达标）。细节与开放项（desktop token 注入层待建、防阀两处既有超限交清扫批）见 `desktop/docs/STATUS.md` 顶部。后端零改动。

> ✅ **上一条：2026-08-24 多端调研批（用户逐项拍板，零代码零迁移）**——背景：桌面端已开工（Windows 首发），用户指令调研手机/平板/macOS/Linux 四端。外部事实逐条核实（Tauri 2 移动端支持、苹果签名公证、国内应用备案合规、PWA 推送能力等）后用户逐项拍板：**四端都不做、全备案**——①手机/平板不做先备案（手机文件系统封闭、本地优先价值不存在，手机仅云端随身看场景；重评＝桌面端稳定运营后看画师真实反馈，届时调研倾向 PWA 路线：零费用零商店合规、主工时为窄屏响应式改造）；②macOS 无限期备案（技术上同代码库可直接扩、更新通道可复用，但签名公证无免费渠道需 $99/年，用户不接受；mac 画师先用网页版；重评＝用户规模变化或免费签名渠道出现）；③Linux 不做备案（免签名零费用但国内画师基数极小，且 F8 窗口自动识别在 Wayland 下做不了；重评＝真实需求拉动）。落档：`docs/comms/多端调研-手机平板MacLinux-20260824-已拍板.md`（含拍板记录与已核实事实清单，重评时直接复用）；索引同步登记 `desktop/docs/STATUS.md` 待研判项。本批纯调研零代码无需门禁。

> 🔑 **上一条：2026-08-24 双端共享组件方案定契批（用户拍板，已推送；零代码搬家）**——跨端架构拍板：web/desktop 双端共享组件（F3 约稿条 / F4 小票 / F12 完稿引导）安家仓库根新建 `shared/` 公共仓（包名 `@inkglean/shared`），两端以 `file:../shared` 链接直导源码、无构建产物；哑组件纪律（不发请求/不读存储，数据进 props 事件出 emit）。分两步纪律：本批只定契+两端接线+接线冒烟保险丝，现有 F3/F4 零搬家；迁入另开搬家批带 web 全量门禁回归。**门禁全绿**：web lint 0 错 / **831/831**（基线 830+1 接线冒烟）/ check:i18n 无新增 / build；desktop lint+**7/7**+build；shared lint/test/typecheck 全绿（首基线 1）；后端零改动。细节落档：`desktop/docs/STATUS.md` 顶部最新条 + `shared/README.md`（契约书）。开放项：F3/F4 搬家批时机（等用户下令）。

> ✅ 2026-08-24 桌面端研判批·二轮（用户逐项拍板，已落档 REQ-014「二轮功能研判拍板」章；纯研判零代码）**——背景：一轮已拍 F8 时间统计+桌面登录方案后，用户发起二轮深度调研「桌面端还需加/整合/优化什么 + 是否威胁服务器安全」。全部拍板（细节见 REQ-014 新章）：①**功能增量五项**——F9 客户快查卡（复用已有客户标记/老客召回 API）/ F10 桌面端完整手动录单（含粘贴解析+截图 OCR，本地模式出离线版）/ F11 排期三视图进桌面首发+网页端欠账「可接单/已满标识」双端清掉 / F12 完稿宣传链（完工→顺手发布引导卡，双端共享组件）/ F13 交付成品归档+再许可入口进桌面端；其中 F9/F11/F12 回流网页端双端同做。②**整合分流**——桌面首页 7 板块（排期/待办/订单/收入+挂牌/留言/统计卡，复用拖排显隐机制）；主页设置/价格体系/名额/作品/偏好/管理后台留网页；工具箱搬 3 留 16（小票/价目卡/水印进）；托盘快照+系统通知+全局快捷键首发，代写系统日历二期，开机自启静默到托盘。③**窗口化选 B 可拆悬浮组件**（拒全自由画布，防整理癖陷阱）——首发仅 3 板块可撕（计时器/今日待办/截稿倒计时），支持拖动/缩放/置顶/贴靠；**专注画画模式首发**；布局偏好复用 dashboard_prefs（云端同步/本地存本机）。④**优化五项**——文件归档可逆/断网保命链（缓存订单快照+本地记账）/交付缩略图缓存/窄窗布局/**F8 数据永不上传承诺**。⑤**安全口径三条（开工前强制基线）**——结论：桌面端不新增服务器攻击面，风险集中在凭证窗口放大与两处防护参数变更；口径一：90 天会话用**方案 A 服务器记账式**（设备表一张账，踢人/顺延/设备清单同账，杜绝旧凭证存活暗坑）+登录凭证强制存 Windows 系统保险箱；口径二：免验证通道**只免登录类接口不整站**，身份标签落档写死「可伪造、非防线」，真正防线=既有应用层限流/锁定/重放防护+AOP；口径三：更新防投毒三件套（私钥永不进服务器/验签失败拒装/旧版保留可回滚），SignPath 与更新签名两回事都要做；⑥仓库形态：同仓加 desktop/ 目录（不单独开仓库、不单独开开发 profile，AI 助手按目录领地派活；共享组件/同套 API 类型/同文档单一事实源，SignPath 无需重申请；拆分重评条件=桌面端成为与平台完全分家的独立产品时）；⑦桌面端子项目自 824 起有专属状态事实源 `desktop/docs/STATUS.md`（含 CONTEXT 与开工清单），桌面端专属拍板/进度不再并入本 STATUS。**工程影响**：后端增量仍限于桌面 token 类型+设备表（记账式会话据此做干净）+登录留痕复用，不动既有骨架；本批零代码零迁移无需门禁。开放项：用户研判验收。

> ✅ **最新：2026-08-24 桌面端研判批（用户拍板两件，已落档 REQ-014；纯研判零代码）**——背景：用户指令审视后端定型——结论**已定型**（v1.0.1 正式版/迁移 v72/823 结构审计真 bug 0/无在途施工，剩余开放仅存量验收）。随后启动桌面端深度研判：七轮开源调研总结论——「接稿管理+排期+出稿条+时间统计」四合一本地优先桌面工具**无直接开源/闭源竞品**（ArtConnect 偏 CRM；玉米排单/时间差不多咯/FL Tracker 各管一段且闭源；出稿条领域只有 PSD 模板无软件；时间统计痛点现靠 CSP 官方统计+手动番茄钟）。**用户拍板两件**：①**F8 画画时间统计立项**——手动计时兜底 + 自动识别 CSP/PS/SAI 正在画哪个文件（前台窗口标题↔委托文件夹匹配）+ 自动识别 AFK（键鼠输入空闲超时自动暂停，默认 5 分钟）+ 摸鱼时间识别（前台窗口分类出日/月对比图）；计时数据仅存本地 SQLite 属可导出范围、不传平台（双模式分离纪律）。②**桌面登录方案**——首发仅 TOTP；桌面设备专用 90 天长效会话+每周活跃自动顺延（根治网页会话写死 7 天过期的病灶）；Cloudflare 规则对桌面接口通道放行 challenge（画师看不到验证页，AOP 原站认证兜底）；后台设备清单可单台踢出；Passkey 备案二期。**连带更新**：用户原话「有了桌面端画师就基本不看网页了」——桌面端由「伴侣应用」升格为画师日常主入口，体验重心（开机自启/托盘常驻/断网可用）权重上调。**工程影响**：F8 需少量自定义 Rust（窗口枚举+输入空闲检测，封装于 desktop-bridge 逃生层）；登录方案需后端小增量（桌面 token 类型+设备表）——均不动既有骨架，「后端已定型」结论不变；本批纯研判+落档零代码改动、无迁移、无需门禁。开放项：用户研判验收。

> 🚧 **最新：2026-08-24 四步入驻流程批（用户拍板，已合入）**——用户提出并拍板：入驻流程改为四步——①两份文书必读：《隐私政策》+《服务条款》全文同一滚动窗口（正文事实源 compliance.privacy/terms 词条只渲染不复制，文书更新只改一处永不漂移），滑到底解锁勾选、勾了才放行；②验证器预告独立步：823 前置提醒升格为强提醒步，推荐口径同源 authApp（微软首选/2FAS·谷歌备选/微信小程序免责），软回应按钮不强制安装；③填写入驻信息（原步骤 1）；④TOTP 首绑（原步骤 2，折叠引导保留）。**顺序依据**：邀请码一次性消耗，2FA 预告前置到填码之前，避免「号建一半去装 App」断档；知情同意先于任何信息收集。原型 temp/invite-onboarding-4step.html 用户已验收（含同窗全文引用追加拍板）。**同批修复**：入驻叠加层纯底色盖住主卡真纸纹理层致入驻态底纹消失（用户发现），::before 同 PaperCard 主纸口径补纹理（随双主题）。**工程**：叠加层整体抽为 web/src/components/artist/login/InviteOverlay.vue（模板/逻辑/样式随迁），Login.vue 1011→661 行，移出 check-file-size ALLOWLIST（规则 3 机械要求，豁免 14→13 项）。后端零改动；E2E e9 走 API、e7 仅断言 .invite-entry 可见，均不受影响。**门禁（worktree 全量）**：typecheck+eslint 0 错 0 警 / test:web 804 全过（基线不变）/ check:i18n 无新增 / build / 防阀通过。**领地隔离**：主树另有并行会话「TOTP 绑定失效提示透传」批在途（同改 Login.vue/locales），本批在独立 worktree（feat/invite-onboarding-4step，提交 d2623803）施工，合入待并行批收口（预计 Login.vue 叠加层样式区与 locales invite 段小冲突，解冲口径：叠加层以本批组件化版本为准，保留并行批新增逻辑）。**合入收口实录（824 同日）**：并行批先独立提交（9ab21f83）；本分支合入后按既定口径解冲：叠加层以组件化版本为准，并行批的防刷新恢复/首绑找回/防刷提示三件功能迁入 InviteOverlay 组件（提交即清防刷新态、绑定成功清态、刷新后自动恢复二维码页）；表单/按钮/帮助折叠双副本抽为 styles/login-shared.css（.login-page 前缀锁作用域）；并行批测试打桩补 tm 适配四步路径；防阀追认 api/index.ts 842→849 与 admin.routes.ts 1068→1072（出处注明脚本内）；基线登记 1666/830/13（e680911e）。**验收与部署（824 同日）**：accept.ps1 十一道全绿 457s（server 1666 / web 830 / E2E 13）；post-merge-deploy 本机容器重建全绿（备份+VERIFY/healthy/迁移回读 v72/冒烟 4 PASS+1 WARN 目录空属预期）；已推送远端（ea6d74f9..e680911e）。**公网已由用户跑 update.sh 同步完毕（824 同日，用户回报），本批全部部署待办销账；剩余开放项仅用户验收（清单见 2FA 批接手指引）。**
> ✅ **最新：2026-08-24 2FA 绑定完整性加固批（用户拍板五项，已提交并随四步入驻批合入）**——背景：公网站点画师「面包」报障「后台显示未绑定却已登录」。排查还原真相：管理员「重新绑定/重置口令」只清绑定状态（bindTotpInit/resetTotp 置 verified=0），**不作废已签发会话**（token_version 不动，旧 cookie 最长活 7 天），且登录态校验从不看绑定状态——重绑窗口期内画师刷新页面即「没填六位码还在后台里」。同批挖出首绑死角：邀请入驻第 2 步（二维码页）状态纯内存，刷新即丢且无找回路（账号已建、邀请码已消耗、未绑定登不进，只能管理员人肉解围）。**用户拍板五项**：①重置/重绑瞬间作废旧会话；②未绑定统一拦截（登录态门禁 + Passkey 登录入口同款拒绝），不删 Passkey 凭据——凭据保留但未绑定期间不可用、绑定完成自动复活（「重置=彻底锁门」的无损实现）；③首绑找回入口（已扫码但刷新了→QQ+六位码直接完成，复用既有 totp-confirm）+ 二维码页防刷新（sessionStorage 恢复）+ 醒目提示；④新激活码覆盖空壳账号（QQ 命中「未验证+未删除+未封禁」空壳时允许新码就地重建，保留原 id，原码不回退；其余维持 QQ_TAKEN）；⑤安全页未绑定提示补辅助说明。**落地**：后端新增错误码 TOTP_BIND_REQUIRED（401）；resetTotp 与管理员 bind-init（路由层）各加 token_version+1（刻意不进 bindTotpInit 本体——邀请注册/开箱向导/自助重绑共用该函数；自助重绑 confirm 保留 bump 踢其他设备 + 重签本人会话防自踢）；requireAuth/requireAdmin 双门禁 + webauthn verifyLogin 均拦截 verified=0；邀请注册空壳覆盖逻辑。**前端**：401 拦截器带文案登出→登录页纸签展示；Passkey/口令登录分流同码；找回入口 + 防刷新存取（新 utils/inviteProgress.ts + constants/auth.ts + storage.ts sessionStorage 三件套）；AccountSecurity 辅助说明；中英词条 6 对。**测试基建口径变更**：seedArtist 默认画师改为已绑定（totp_verified=1 + 占位密钥），需要未绑定初态的用例显式覆盖。**已知语义（用户已接受）**：管理员给自己重置/重绑会形成死锁（确认接口挂管理员门禁会被新门禁拦），兜底走服务器 CLI 重绑脚本。**门禁全绿**：server typecheck 三配置/lint 0 错/**1666/1666**（基线 1655+11：TC-BG 系列 + webauthn 1 + TC-INV-07b〜e 4）；web lint（含 typecheck）0 错/**830/830**（基线 804+26：进度存取 11 + 401 分流 4 + 登录页 11）/check:i18n OK/build 全绿；E2E **13/13**（5099 口，含 E7 登录链路 + E8 Passkey + E9 邀请注册）。布局审计：前端子代理已跑一轮收敛（本批新增离栅 0，存量离栅未越界动）。**无数据库迁移。部署销账（824 同日）：已提交（9ab21f83）+ 随四步批合入；本机容器重建全绿；公网已由用户 update.sh 同步。**
> 🔑 **新会话接手指南**：无在途施工。开放项：①本机验收——给测试画师点「重新绑定」观察其既有会话立即失效、登录页出现绑定失效提示、重绑完成后 Passkey 自动恢复可用；邀请入驻走到二维码页刷新可恢复、「已扫码但刷新了」找回入口可用；②公网同步后同清单复验。

> 📦 **2026-08-23 及更早的历史条目已拆分归档至 `docs/comms/archive-20260824/STATUS-archive-20260824.md`（824 收整批拆分，原文原样搬迁）。**

