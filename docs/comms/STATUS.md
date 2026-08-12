# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-12 v88（**812 bug 修复批三路全部合入；验收脚本首战；容器重建烘焙**）——master `6bf9174` 与 origin 同步。
> ✅ **812 bug 修复批（用户 1.0 前实测抓9 条 bug，三路 codex 并行施工+一号逐路验收+合入）**：A 登录认证域（`61c0cedb` B4 深色闪白 index.html pre-paint 主题脚本+CSP SHA-256 / `682e24f4` B5 Passkey base64url→ArrayBuffer 四调用点+webauthn.ts 工具+单测+报错人话化，B6 管理员默认落地画师面板并入 B5 commit）；B 开箱与设置域（`c0253f2` B1 向导语言切换 / `7dd8f83` B2+B3 管理员账号公开端解禁（移除 qq_number===admin 硬规则，用户拍板完全放开）+画师设置页 ShopVisibilitySwitch 小店展示开关 / `3e03bc3` B7 开箱预置基础增项（用途/加急 4 条幂等种子，仅增项表为空时写入）/ `667505b` 测试修正）；C 滑块与响应式（`2e24e40a` B8 悬停误触发守卫（isPointerDown） / `2d12607d` B9 竖屏窄屏排版降级（锁 768/600 既有断点））。
> ✅ **合入验收（accept.ps1 首战+手动补验）**：合入态全门禁实测 server **1340/1340** · web **373/373** · E2E **7/7** · lint 双侧 0 错 · i18n · build。**验收中抓到并裁决**：web vitest 3 例超时——根因=/dashboard 用例首载懒加载 Dashboard 链冷态 transform 实测 ~5.1s 恰好越过默认 5s 哨兵（非功能 bug），裁决=3 用例单列 20s 超时（`6bf9174`），其余用例仍受默认哨兵保护；教训入账：**测试超时报错先量实际耗时再定性，勿直接判功能 bug**。
> 🛠️ **环境事故与修复（重要长期结论）**：①codex Windows 沙箱 workspace-write 下 CreateProcessAsUserW failed:5，真凶=商店版 pwsh 排 PATH 首位而沙箱账号无权启动它；修复=启动器固化非商店版 pwsh（用户级 MSI 安装）排 PATH 最前，workspace-write 安全沙箱恢复可用（实测越界写入被拒）；danger-full-access 曾被用户以「flash 稳定性有限+全盘写权限风险」否决，勿回退；②派工前预复制 node_modules 进 worktree（用户指令，不留 npm ci 给施工方）；③codex 自报再次失实（A/B 沙箱内门禁未跑成真报全过），巡逻实测复验抓出；④夜间巡逻机制验证有效（schedule 每 30min，只验收不合入，产出 patrol-812.md）。
> 🛠️ **验收基建落地**：scripts/accept.ps1（八道门禁零遗漏+实测数字+基线只增不减判红+结构化报告）与 accept-baseline.json（server 1340/web 373/e2e 7）入库（`3adb75d6`）；index.html title 品牌残留修复同批；.qoder/ 入 gitignore。
> ⚠️ **遗留**：①用户终验 9 条 bug 修复（生产 https://localhost 已烘焙新构建）；②B7 价格预置仅对全新开箱生效，存量环境需管理员在后台自建的（不补种，防意外改数据）；③812 三个 worktree+分支待用户终验后清理；④better-harness 两条发现待处理（README 测试数矛盾/改动后最小验证文档，进首批杂务批）；⑤Passkey 登录真实环境验证随用户终验自然覆盖（B5 已修转换层，Windows Hello 待用户实机点一次）。

> 最后更新：2026-08-11 v87（**REQ-038~043 全部收官；品牌改名落地；容器重建烘焙 v56-v60；截图验收完成**）——master `06abd2de` 与 origin 同步。
> ✅ **REQ-043 体验质量批合入**（`f15cb577`，811-req043-quality `c8310fe7`）：I1 OG 卡片（HTML 实体转义消毒+bio 去标签截断+5min 缓存+不可见画师不入 OG）；I2 开张任务卡（v60 迁移 + OnboardingCard 后端标记）；I3 移动端核查（修复收入图 375px 日标签裁切；⚠️截图报告自报留盘实际空目录，如实记账）；I4 零打扰公告（入口小圆点+localStorage 记已读）；I5 OPS 恢复演练 checklist；I6 三态裁决收尾（巨型组件销账不实：ArtStyleManager 1217 行拆三弹窗/手动录单幂等键后端消费/守卫双写收敛 store + Passkey 登录漏同步 store 隐患一并修）。**一号独立验收**：server typecheck/lint 0警0错/**1335/1335**（103 文件）· web lint/351/351/i18n/build · E2E 7/7。
> 🏁 **1.0 需求波总收官**：REQ-038（setup 向导）/039（邀请码+I0 角标）/040（Passkey）/041（step-up）/042（合规）/043（质量批）全部合入；品牌名 拾绘/Inkglean 全量落地。**终态门禁（master 实测）**：server **1335/1335** · web **351/351** · lint 双侧 0 错 · check-i18n · build · E2E **7/7**。**容器已重建两次**（备份 bak-pre-final-rebuild-20260811-2321；迁移 v56-v60 全部应用回读：webauthn_credentials/invite_codes/reports/admin_actions + is_banned/onboarded_at 均就位；https://localhost 健康+登录页 200）。
> 📸 **截图验收（dev 库同构建产物，真实 UI 登录链路 + 落地断言）**：workspace/temp/req-final-acceptance/ 9 帧——01 登录页（拾绘品牌+「或」分隔修复+邀请码入驻入口+Passkey 按钮）/ 02-03 隐私/条款页 / 04 Dashboard（开张任务卡 1/3 实证）/ 05 **StepUpDialog 入口守卫自动弹出实证** / 06 step-up 后管理面板 / 07 画师管理（邀请码管理按钮+更换管理员）/ 08 举报处理 / 09 公告编辑；视觉自审通过。042 codex 自审截图已回收 workspace/temp/811-req042-codex-shots/。
> 🔴 **收官验收抓到的真 bug（均已修）**：①common.or i18n 键缺失（登录页 Passkey 分隔线/StepUpDialog 显示生键，波A REQ-040 遗漏，`06abd2d` 修复并二次重建容器烘焙）；②截图脚本模糊匹配点到 Passkey 按钮造成 500 假象（定位改 login-btn 精确选择）；③I6-e 守卫认 store 后 API 直登不写 localStorage 会被踢（预期行为，截图走 UI 链路）。
> 🧹 **清理**：811-req039/041/042/043 与 w-rebrand 五个 worktree 全部删除；本地分支保留（811-* 未推远端）。dev 服务器（3000）在后台运行供实机体验，不需要时 kill 即可；生产 = https://localhost（Caddy 自签证书）。
> ⚠️ **遗留**：①Passkey 登录 HTTPS/localhost 环境验证未做（Playwright 虚拟认证器 E2E 待拍板）；②041 前端单测缺口（StepUpDialog/AdminLayout 守卫）随下批补；③远端分支 feat/rebrand-shihui-inkglean 已合入可删；④用户终验：实机体验邀请码入驻/step-up/举报/公告/任务卡（截图已就位）。

> 最后更新：2026-08-11 v86（**REQ-042 合入；REQ-043 施工在途（最后一波）**）——master `0ad7f12d` 与 origin 同步。
> ✅ **REQ-042 合规与内容安全合入**（`0ad7f12d`，811-req042-compliance：codex 施工 `23dbcf6` + 一号合并解冲突 `dc77026`）：v59 迁移（reports/admin_actions/artists.is_banned，schema.ts 双轨一致已核）；举报公开接口+限流/处理留痕/内容下架/封禁解封；登录拦截 ARTIST_BANNED（TOTP+Passkey 双链路，公开目录/主页/track 全过滤）；敏感词 warning 不硬拦；/privacy /terms 静态页 + 页脚链接 + 举报弹窗；AdminLayout 举报处理导航 + ReportManage；OrderForm 首单同意勾选；+15 用例。**codex 随暂停中断，一号接手收尾**：LegalDoc.vue 未用变量 TS 错修复 + 按清单 commit + merge master 解 9 处冲突（entities/api×2/AdminLayout/locales×2/migrations/auth.routes×6 块/webauthn×3 块，均两侧保留+补共享闭合括号，v58/v59 迁移并插，auth 域取 041 清洁版与 v13 正确写法）。**一号独立验收**：server typecheck/lint 0警0错/**1302/1302**（100 文件）· web lint/351/351/i18n/build · E2E 7/7；抽查：迁移双轨一致/封禁拦截覆盖面/截图不入库（shot-*.png 留 worktree）。
> 🔄 **REQ-043 施工在途**：worktree artist-commission-811-req043 / 分支 811-req043-quality 基于 0ad7f12d，codex 无头施工中（日志 workspace/temp/811-req043-codex.log）；施工图已标注前置现状勿重做（step-up 守卫/举报导航/条款勾选/敏感词链路）。一号独立验收后合入，然后收官：容器重建（v56-v59 烘焙）+ 截图验收 + 全量记账。
> ⚠️ **遗留**：①Passkey HTTPS/localhost 验证未做；②w-rebrand/811-req039/811-req041/811-req042 worktree 待清理；③041 前端单测缺口（随收官批补或接受现状待拍板）。

> 最后更新：2026-08-11 v85（**REQ-041 全闭环；REQ-042 codex 中断待处置；REQ-043 待派**）——master `729f57a` 与 origin 同步。
> ✅ **REQ-041 管理后台二次验证合入**（`cf1c339` 合入 + `729f57a` 集成接线，811-req041-stepup 分支 `d65e49ff` + 一号合并解冲突 `4b377de`）：token 会话升级（auth_level/admin_verified_at）+ /api/auth/step-up（TOTP/Passkey 双分支）+ requireAdminStepUp（30min 窗口）+ requireAdminReauth（动作级 ≤60s）+ StepUpDialog + AdminLayout 入口守卫 + e2e global-setup 补 step-up；+11 用例。**一号独立验收**：server typecheck/lint 0警0错/**1287/1287** · web lint/351/351/i18n/build · E2E 7/7。集成接线：ArtistManage 更换管理员遇 STEP_UP_REQUIRED 弹 StepUpDialog 验证后自动重提交（web 351 + E2E 7/7 复验）。**验收中裁决**：webauthn.ts v13 credential.id 已是 Base64URLString，039 版 Buffer.from 二次编码是错的，取 041 版（教训：库升级后的字段类型必须对照 .d.ts 裁决）；合并冲突 8 处（auth 域×4 + api×2 + locales×2）均两侧保留型，拼接处共享闭合括号需补 `}`/`},`（locales/api 四处）。
> ⚠️ **E2E 环境坑入账**：端口 3999 残留旧服务器（旧版无新路由）导致 step-up 404 假故障——**E2E 失败先查端口占用（Get-NetTCPConnection 3999）再疑代码**。
> 🔄 **REQ-042 施工中断待处置**：codex 随用户暂停终止（无 .done 标记，日志停 20:22）；worktree artist-commission-811-req042 有 54 个未提交改动且完成度看起来很高（v59 迁移/features/compliance/敏感词/ReportManage/LegalDoc/FooterLinks/compliance.test.js/自审截图全在，还动了 auth 域 is_banned 拦截 + 三处模板页脚 + OrderForm 勾选）。**恢复动作**：一号先跑 worktree 门禁评估完成度——绿则按清单 commit 后独立验收合入；缺项则重派 codex 续工（基于未提交状态）。注意：①基线落后 master 两波（039/041），合入前必须 merge master；②shot-*.png 截图在 worktree 根，禁入库；③auth 域改动需与 041 成果叠加不冲突。
> 📋 **REQ-043 待派**：施工图 workspace/temp/req043-task.md，待 042 合入后建 811-req043-quality 派工；收官后容器重建（v56-v59 迁移烘焙）+ 截图验收。
> ⚠️ **遗留**：①Passkey HTTPS/localhost 验证未做；②w-rebrand/811-req039/811-req041 worktree 待清理；③041 未加前端单测（StepUpDialog/AdminLayout 守卫，351 未增，合入后补或随 043 补）。

> 最后更新：2026-08-11 v84（**REQ-039 合入；REQ-041 待验收；REQ-042 施工在途；用户暂停存档**）——master `3b6cb885` 与 origin 同步。
> ✅ **REQ-039 邀请码合入**（`3b6cb885`，worktree artist-commission-811-req039 / 分支 811-req039-invite，codex 施工 `4e0dfe1c` + 一号验收修复 `dc86e6f`）：迁移 v58 invite_codes；features/invite 后端（批量生成去易混淆/防枚举同响应 INVITE_INVALID/事务消费防双花/吊销/限流 10次5分）；管理端邀请码弹窗；Login.vue 叠加层两步入驻（不动冻结页结构）；I0 侧栏待确认角标（getStats.pendingCount + 5min 轮询 + visibilitychange 暂停）；+50 用例。**一号独立验收**：server typecheck/lint 0警0错/**1276/1276**（98 文件）· web lint/351/351/check-i18n/build · E2E 7/7，均实测非 self-report。
> 🔴 **验收抓到的 master 存量破损（波A 遗留，随 039 一并修复，诚实更正 v82 门禁基线失实）**：①entities.ts 被 040 路污染（每字段后错位粘贴 totp_locked_until/totp_rebound_at，55 处，**tsc 语法级红**，接口重复成员竞骗过旧检查）；②migrations/index.ts v56/v57 重复 import；③webauthn.ts 两处运行时 bug（credentialPublicKey 取错对象/getArtist 函数名错）；④auth.routes.ts 死码（未用解构 verifyRegistration/verifyAuthenticationResponse 等）；⑤TOTP 重绑 issuer 品牌残留「绘约」→拾绘。**根因：波A 合入时 server typecheck/lint 未复跑，v82「全绿」记载失实**。教训入账：**合入门禁必须双侧全跑（server typecheck+lint 不可省）；接口重复成员能骗过 tsc，结构类污染需语法级断言（node import/tsc）拦截**。
> 🔄 **恢复施工指引（暂停后续作）**：①**REQ-041 已交付待验收**：分支 811-req041-stepup `d65e49ff`（worktree artist-commission-811-req041，零未提交）——一号需：merge master（含 039，预计 auth.routes.ts/AdminLayout/locales 冲突）→ 独立复跑全门禁（含 e2e admin 会话 step-up 适配）→ 合入后补 ArtistManage「更换管理员」动作级前端接线（集成提交）；②**REQ-042 施工在途**：worktree artist-commission-811-req042，codex 后台进程可能已随暂停终止，恢复时查日志 workspace/temp/811-req042-test-codex.log 与 .done 标记；未完则重派（施工图 workspace/temp/req042-task.md 已含并行剥离项）；③REQ-043 未派：施工图 workspace/temp/req043-task.md，待 042 合入后建 811-req043-quality 派工；④四路收官后：容器重建（烘焙 v56-v59 迁移）+ 截图验收 + STATUS/REQ 记账。
> ⚠️ **遗留**：①Passkey 登录 HTTPS/localhost 环境验证未做；②w-rebrand worktree 待清理；③主仓 server node_modules 曾缺 @simplewebauthn/server（已 npm ci 修复，波A 合入时未装新依赖的漏项）；④041 路若也碰 entities.ts/auth 域注意 039 已洗过污染，勿再引入。

> 最后更新：2026-08-11 v83（**改名波合入 master；波B+C 三路 codex 并行施工在途**）——master `0b5506ec` 与 origin 同步。
> ✅ **品牌改名波合入**（`0b5506ec`，四号 w-rebrand 交付 2 提交，一号独立验收）：绘约/Brushline-HuiYue → **拾绘/Inkglean** 全量落地（26 文件纯文案：locales/index.html meta/TOTP issuer/文档）；验收门禁 web **350/350** + server **1213/1213** + lint/i18n/build 全绿，代码区品牌残留 grep 归零；4 处预期合并冲突（locales ×2 + REQ-039/043 文档）以「保波A 新键 + 取新文案」解决，合并态复跑 350/350。交付文档 docs/comms/品牌名统一-拾绘Inkglean-交付-20260811.md；未改合理保留：STATUS/changelog 历史不改、OPS.md 真实仓库名命令、仓库名 1.0 后再定。
> 🔄 **波B+C 三路 codex 并行施工在途**（各自 worktree 基于 0b5506ec，分支 811- 前缀，领地互斥）：①`811-req039-invite`（w-811-req039：邀请码机制 v58 + I0 角标）；②`811-req041-stepup`（w-811-req041：会话升级 step-up，无迁移）；③`811-req042-compliance`（w-811-req042：合规 v59；**两项剥离到一号集成提交**：ArtistManage 封禁行操作 + 入驻同意勾选，后端接口照做）。施工图已刷新（品牌名/locales 插入纪律/基线），日志 workspace/temp/811-*-codex.log。REQ-043（`811-req043-quality`）待本波合入后派（依赖 042 成果叠加 AdminLayout 导航）。一号逐路独立复跑全门禁验收后依次合入。
> ⚠️ **教训入账**：Start-Process 拉起带 UTF-8 中文参数的 pwsh 脚本会静默失败（零日志零进程），改用后台直接 `& script.ps1` 拉起；派工后必须验证日志落盘+进程存在。
> ⚠️ **遗留**：①容器未重建（波A+改名波未烘焙，迁移 v56/v57 未应用，随波B-D 收官一次性重建+截图验收）；②Passkey 登录需 HTTPS/localhost 环境验证（Playwright 虚拟认证器 E2E 未做）；③w-rebrand worktree 待清理。

> 最后更新：2026-08-11 v82（**REQ-038~043 波A 合入 master；波B/C/D 施工图就绪待派工；品牌名最终确认 拾绘/Inkglean**）——master `ec33dff` 与 origin 同步。
> ✅ **波A 双路合入**：REQ-038 开箱设置向导（`fc6ad5ce`：setup.sh 一键脚本 + /setup 四步向导 + 后端 setup 守卫仅生产生效 + ADMIN_QQ 环境变量自举退役，管理员创建改由向导/seed 接管）+ REQ-040 Passkey（`8af7591`：@simplewebauthn/server + 迁移 v56 webauthn_credentials + v57 totp_rebound_at + 登录页 Passkey 按钮 + /account 账号安全页 + TOTP 自助重绑分层验证/24h 冷却/管理员豁免/踢下线）。收尾提交 `84f5153`+`ec33dff`。
> ⚠️ **波A 事故与修复全记录（防幻觉权威记录）**：①codex 渠道 402 欠费致批2 派工阻塞 → 一号自施工，用户充值后恢复；②040 路 codex 跳过 web 门禁（只跑 server）→ 验收补跑抓到真问题；③**038 路多处修复未提交就合入**（/setup 路由注册/守卫 safe 封装/res.ok 硬化/语言键 i18n 化）→ 验收发现后补提交 `84f5153`；教训：**worktree 合入前必须 git status 确认零未提交改动**；④zh-CN.js 结构破损（codex 把 setup 块插在根对象闭合之外且重复两份 + 040 合入冲突）→ 脚本化修复；⑤qrcode 依赖漏装 + SetupWizard 带 Google Charts 外网兑底（违反零网络约束）→ 装 qrcode@1.5.4 + 去兑底；⑥router 单测不密封（happy-dom fetch 打到恰好在跑的 dev server）→ vi.stubGlobal('fetch') mock；⑦seed 管理员 status='closed' 违反 CHECK 约束被 INSERT OR IGNORE 静默吞掉 + 管理员账号缺失致 E2E 预登录失败 → seed 接管管理员创建（status='hidden'）；⑧isSetupCompleted 原判据要求 setup_completed='1' 会把存量部署误判未初始化锁进向导 → 改用「admin_qq 非空 + 管理员存在 + totp_verified=1」判据（向导绑码前保持 /setup 可达，存量升级不受影响），setup 单测同步更新；⑨dev 库 admin(10003) 绑开发测试 TOTP 密钥（仅 dev 库，与 E2E 同款固定密钥）。教训入账：**INSERT OR IGNORE 会静默吞 CHECK 违约，关键种子数据插入后必须回读验证**。
> 📋 **波B/C/D 施工图就绪**（workspace/temp/req039-task.md · req041-task.md · req042-task.md · req043-task.md，领地互斥设计）：波B = REQ-039 邀请码（含 I0 角标）+ REQ-041 step-up 并行；波C = REQ-042 合规；波D = REQ-043 体验质量批。迁移号按合入顺序预排：v58 invite_codes / v59 compliance / v60 onboarding。
> 🏷️ **品牌名最终确认（2026-08-11 用户拍板）：拾绘 / Inkglean**（取代此前 Foundink/Brushline 候选；「绘约」「约绘」弃用）。**改名施工已在另一会话进行中**（worktree `artist-commission-w-rebrand` / 分支 feat/rebrand-shihui-inkglean @948f2f3）——波 B-D 派工领地与其互斥（改名波主战场是文案/i18n/文档，波 B-D 新增文案直接用「拾绘/Inkglean」）；合入顺序：改名波与波 B-D 谁先完成谁先合，后者 rebase。REQ-039/043 文档品牌行已同步 Inkglean。
> ✅ **门禁基线（master 实测）**：web vitest **350/350**（42 文件）· lint 0 错（1 警告=既有 v-html 豁免）· check-i18n 过 · build 过；server vitest **1226/1226**（含 setup 13 用例）；E2E **7/7**。worktree：w-req038/w-req040 已合入待清理。
> ⚠️ **遗留**：①容器未重建（波A 成果未烘焙，迁移 v57 未应用，随波B-D 收官一次性重建+截图验收）；②Passkey 登录需 HTTPS/localhost 环境验证（Playwright 虚拟认证器 E2E 未做，040 施工图中标注为取舍）；③品牌改名波在 w-rebrand 进行中（另一会话），合入时注意与波 B-D 的 locale 冲突。

> 最后更新：2026-08-11 v81（**工具箱四分类收纳合入——视觉批前置导航瘦身**）——master `3b35c0f` 与 origin 同步。
> ✅ **工具箱收纳**（`b93f2fc`/`3b35c0f`，一号自施工；用户指令「重构前先把工具整理成四个大类」，落地纸墨提案 §5.5 已拍板方向）：侧栏 13 个工具项收成一个「工具箱」把手（Tools 图标），四分类 = **钱袋子**（散单记账/收入导出/稿价计算器）· **交付**（图片水印/进度拼图/排期公示）· **客户**（客户标记/老客召回/社恐轻松回复）· **效率**（今天吃什么/速记剪切板/截稿日建议）；移动端抽屉展开为四分类组；新增 /tools 首页四格卡片（ToolsHome.vue，lang="ts"）；注册表抽 constants/toolbox.js 单一事实源（侧栏/抽屉/首页共用）；路由与 i18n 键零改动，/tools/* 子页归属把手高亮。+1 测试（router.nested）。**事故与修复**：@element-plus/icons-vue 2.3.2 无 Toolbox 图标致运行时 SyntaxError 页面白屏（单测/类型检查均未拦住——图标存在性无静态校验），实机报错误定位后换 Tools 图标；教训入账：**图标/资源类导入必须实机挂载验证，构建绿不等于运行时绿**。验收：web 350/350 + lint 0 错 + check-i18n + build 过；server 1213/1213；E2E 7/7；截图 14 帧（工具箱首页/侧栏把手/抽屉展开，双主题）视觉自审通过。**容器已重建**（healthy，ToolsHome chunk 已烘焙）；验收截图 workspace/temp/req037-toolbox-after/。
> ⚠️ **遗留小项**：①用户终验工具箱收纳（实机看侧栏/抽屉/首页）；②视觉批（Dashboard 骨架重设计 v0.3）前置已就绪（嵌套路由+组件化+导航瘦身），待用户拍板开工。

> 最后更新：2026-08-11 v80（**REQ-037 波2 四路全部合入，画师面板前端优化全收官**）——master `6d22b6d` 与 origin 同步。
> ✅ **波2 四路 codex 并行施工全部合入**（各自 worktree 文件领地互斥，一号逐路独立复跑门禁验收后依次合入，非 self-report）：①**批3 数据效率**（`21e6a15`/`c05519e`）：OrderList 复合筛选会话内缓存（60s TTL，缓存写入放 seq 校验后防旧请求污染）+拉取进度条、订单号列改真链接（键盘可达）、≤600px 筛选按钮换行胶囊收纳；+4 测试。②**批4a 可访问**（`921bf3f`/`2fb93aa`）：侧栏+抽屉导航 div[role=link]→真 router-link（去手写 keydown/同路径去重逻辑随之退役）、artist-tokens.css 全局 :focus-visible 焦点环（a/button/[tabindex]，EP 内部不碰）；**一号审计补漏 `0924f23`：QuickNote 两处 outline:none 阻塞焦点环已清除**（outline:none 全库裁决表见 REQ-037 §十：SliderSwitch 自带焦点环保留/Login 冻结/客户端模板非领地）。③**批4b 一致性与拆分**（`1fa5080`/`6d22b6d`）：Dashboard 留言审核区抽 GuestbookReviewCard（三态对齐 TodoList 模式：骨架/错误+重试/InkEmpty，v-loading 遮罩退役）+其余 5 模块三态对照表（GreetingHero/StatCards/QuickActions/SlotOverview 静默降级为有意设计不动）；Settings 791 行拆三 tab 子组件（父留全部状态/脏检测/BUG-7 守卫，DOM 逐字保留自查表在交付报告）+头像上传区/模板卡/配色卡键盘可达；+7 测试。④**批5 性能候选**（`609c3dd`/`498cf47`）：Noto Serif SC 零引用裁决删除 **-2.9MB**（一号独立复核字族栈只含 Noto Sans/WenKai）；manualChunks（vendor-vue/vendor-sentry）**main gzip 174.3→91.7KB（-47%）**；preload 评估不做（unicode-range 按需加载，preload 负收益）；i18n 懒加载早已存在不重复做。
> ✅ **验收门禁（一号独立复跑）**：web lint+vue-tsc 0 错 / vitest **349/349**（338+4+7）/ check-i18n 过 / build 过；server **1213/1213**；E2E **7/7**；像素对比：波2 合入后 48 帧 vs 批2 基线，11 帧未变页面哈希全同，其余差异逐张视觉自审均为有意改动。**容器已重建**（烘焙新构建产物，dist 可见 vendor-vue/main 新 chunk）；验收截图 72 帧（12 页×3 宽度×纸白/墨黑）在 workspace/temp/req037-acceptance/（真实登录+落地断言；生产库画师均未绑 TOTP 未动生产数据，截图走开发库同构建产物）。
> ⚠️ **遗留小项**：①用户终验 72 帧截图 + 实机体验（订单详情错误态/看板排序撤销/筛选进度条/窄屏收纳/Tab 焦点环）；②codex 渠道曾 402 欠费阻塞（批2 期间，用户充值后恢复）——教训入账：**并行派工前先小任务探活渠道额度**；③H1 断点口径未强行归拢（改断点=改行为，随触碰收敛）；④SettingsShowcaseTab 头部 1 处 eslint-disable vue/no-mutating-props（父态子视图受控模式，非蒙混）。

> 最后更新：2026-08-11 v79（**REQ-037 批2 结构批合入 + 波2 四路 codex 并行施工在途**）——master `e9c83d1` 与 origin 同步。
> ✅ **批2 结构批合入**（`87b8fdf`/`e9c83d1`，**一号自施工**——codex 渠道 402 欠费阻塞期用户知情，恢复后波2 已切回 codex）：A1 画师后台嵌套路由（ArtistLayoutRoute 载体，ArtistLayout 全会话单挂载：切页不再重挂骨架，getMe/留言角标请求每会话各一次；内容区过渡沿用内部 keyed transition，02C 纪律不变）+ A4 useSessionGuard.ts 抽取（ArtistLayout/AdminLayout 重复 validateSession 收敛，AdminLayout 死引用一并清除）。23 视图去包装（机械脚本+eslint --fix，BOM 保留），/tiers 保持 flat（REQ-036 冻结区，代价已注释）。+3 测试（router.nested.test.js）。
> ✅ **验收（一号独立实测）**：web lint+vue-tsc 0 警 0 错 / vitest **338/338**（基线 335+3）/ check-i18n 过 / build 过；server **1213/1213**；E2E **7/7**；**像素对比 48/48 哈希一致**（12 页×4 档位，真实 TOTP 登录+落地断言+问候语拦截固定化；首轮 44/48 的 dashboard 差异已查实为拦截路径笔误造成的随机问候语假差异，修正后成对重拍全同）。教训入账：**截图脚本的 API 拦截模式必须对照实际端点路径（/api/artist/* 前缀）验证生效，否则防不住随机文案假差异**。
> 🔄 **波2 四路并行施工在途**（codex 恢复后派出，各自 worktree 文件领地互斥）：批3 数据效率（w-req037b3：D1 复合筛选缓存+进度/D2 订单号真链接/D3 窄屏筛选收纳）+ 批4a 可访问（w-req037b4a：A2 导航真链接/A3 focus-visible/H1 断点审计）+ 批4b 一致性与拆分（w-req037b4b：B2 GuestbookReviewCard/B3 三态统一/G1 Settings 三tab/G2 Settings 可访问）+ 批5 性能候选（w-req037b5：Noto Serif 存废/manualChunks/preload 评估）。四路施工图在 workspace/temp/req037-batch{3,4a,4b,5}-task.md。一号逐路独立验收后依次合入。
> ⚠️ **遗留小项**：①容器未重建（批1/批2 均纯前端静态产物，随波2 收官后一次性重建+双主题三宽度截图交用户验收）；②dev 库 Alice（10001）已绑固定测试 TOTP 密钥供截图链路（仅开发库，生产不受影响）。

> 最后更新：2026-08-11 v78（**REQ-037 画师面板前端优化方案落档 + 批1 健壮批合入**）——master `5b878e5` 与 origin 同步。
> 📋 **REQ-037 方案落档**（docs/requirements/REQ-037-画师面板前端优化.md，用户 2026-08-11 拍板）：画师面板全量诊断（结构/交互/视觉/响应式/性能/可访问性六方向），结论=骨架无需推倒，本轮=健壮性补漏+结构提效+一致性收口；P0/P1/P2 分组 + 批0-批5 路线；与 REQ-036（增项交互 w29）和视觉批（Dashboard v0.3 原型）边界显式声明。**批0 两项核实**：B1 统计重复展示证伪销账（GreetingHero 今日金额口径 vs StatCards 订单数口径，互补）；D2 缩略图预览与整行点击冲突属实（QueueBoardList R18/R53 同款陷阱看板已修、订单列表漏修）。
> ✅ **批1 健壮批合入**（`893a51a`，codex deepseek-v4-flash 无头施工 + 一号独立验收）：①F1/F2 订单详情首载失败错误态+重试入口+首载骨架（对齐 Settings profileLoadFailed 模式；已有数据时刷新失败仍走 ElMessage，首载/刷新双分支不误伤）；②E1 手动录单 QQ 历史会话内缓存（60s TTL + 提交成功后手动失效）；③C1 看板拖拽排序成功接 UndoToast 软撤销（loadQueue 时收起 toast 防陈旧撤销）；④E3 草稿恢复弹窗文案改 恢复/丢弃草稿（对齐 useOrderForm R57 口径）；⑤D2 OrderList 缩略图预览 @click.stop。+3 测试（OrderDetail.loadfail.test.js）。codex 越权加分项已核：自造截图审计脚本/measure 分离核验只落 workspace/temp 未入库，提交面净 7 文件无 scope creep。
> ✅ **验收门禁（一号独立复跑，非 self-report）**：web lint+vue-tsc 0 警 0 错 / vitest **335/335**（基线 332+3）/ check-i18n 过 / build 过；server **1213/1213**；E2E **7/7**。diff 抽查 5 项与施工图逐条对齐。
> ⚠️ **遗留小项**：①容器未重建（批1 纯前端静态产物，随下次部署动作烘焙）；②REQ-037 批2-批5 待排期（批2 嵌套路由=中高风险，需独立 worktree+像素对比）；③批1 用户终验：订单详情错误态/看板排序撤销 toast 可实机体验。

> 最后更新：2026-08-12 v77（**结构债清偿批——迁移层/order域/API类型化/OrderForm 四路拆分 + 前端 TS 增量纪律落地**）——master `e11e044` 与 origin 同步。
> ✅ **结构债清偿批（2026-08-11~12 用户拍板「把值得做的都做了，禁止屎山和新技术债」，一号派四路子代理并行施工 + 逐件独立验收）**：纯重构零行为变更。①**迁移层**：server/src/db/init.js（2382 行巨怪）→ schema.ts + migrate.ts + migrations/（v01-v55 共 55 个版本化 TS 文件）+ init.ts 门面（13 个 import 点零改动）；db:init 脚本同步改 tsx src/db/init.ts。②**order 域**：order.service.ts 1320 行 → 门面 + read/fields/status/create/pricing 五子模块（依赖单向无循环）；order.routes.ts 1121 行 → 组合器 + client/list/action/delivery 四子路由 + order-route-utils；外部 import 点零改动。③**API 边界类型化**：web/src/api/types.ts（161 个 DTO，逐一对照后端 routes 建模）+ index.js→index.ts（axios 第二泛型对齐拦截器解包，零 any）——**v73 起排队的前端重构批 api 层 TS 主体至此完成**。④**OrderForm**：1148 行 → 编排层 + 7 个 lang="ts" 子组件（views/client/order-form/），DOM/类名/i18n 键原样搬运，useOrderForm.js 零改动。
> ✅ **纪律基建（防新增债）**：web/tsconfig.json（strict + allowJs 增量：新文件一律 .ts/lang="ts"，存量谁触碰谁迁移）+ vue-tsc typecheck 接入 npm run lint 组合与 CI web job；eslint 用 @typescript-eslint/parser+plugin 支持 TS 块（一号否掉执行角色自研 strip-shim 方案——它关了 vue/valid-define-* 规则属新债，换标准解析器后规则全恢复，web lint 0 警 0 错）；环境断链修复：server oxlint 二进制缺失补装、web typescript 钉 ~5.9（v7 与 vue-tsc 不兼容）、artist.service.ts 未用 import Tier 清理。
> ✅ **验收（一号独立复跑，非 self-report）**：server typecheck（双 tsconfig）/lint 0 警 0 错/test **1213/1213**；web typecheck/lint/test **332/332**/build/check-i18n；Playwright E2E **7/7**。抽查实证：v50 高风险迁移 noTransaction/FK 双保险/事故注释忠实搬运；拦截器 code=undefined 分支语义等价；git 变更面与四路任务严丝合缝无 scope creep。**lint 基线 warnings 遗留项销账**：server 6 + web 4 实测均已归零（部分为早前批次已清、本批实测确认）。
> ⚠️ **遗留小项**：① 前端存量 JS 走「谁触碰谁迁移」增量轨（locales/food-menu 等纯数据文件不迁）；② v75 遗留③（手动录单端点未消费幂等键 header）仍适用；③ 每日备份计划任务只备 DB 不含 uploads（v76 已升级为 daily-backup.bat 双备，此行已随 v76 销账）。

> 最后更新：2026-08-11 v76（**docs 纪律性清理 + 全量文档刷新**）——master 与 origin 同步。
> 🧹 **删除 116 个已消费/过时文档（-23315 行）**：comms 交付/派工/施工图 13 件（全部批次已合入，结论已在本文件）；docs/archive 整目录（v0.1-v0.4x 时代需求/specs/计划/旧审计/视觉提案，决策已吸纳进本文件已拍板规则）；external-wiki 副本 28 件（过时且可再生）；audit-screenshots 20 件（旧审计证据，结论已留档）；孤儿 overview.md 与 docs 根增项原型 html。所有删除内容 git 历史可查（本提交前的 HEAD）。**保留**：STATUS（唯一状态源）/specs 两件（契约清单+SPEC-PRICE-2）/soul 知识库/requirements 14 件（含 REQ-014 桌面端等待办）/纸墨提案/CONTEXT/OPS/三份说明书。
> 📝 **文档刷新**：CONTEXT.md 重写（价格模型对齐 SPEC-PRICE-2：档位/分期标退役，新增幂等键/乐观锁/anon-token/零元单术语，技术栈数字对齐）；changelog 补 v0.45+ 段（登录页/三拆/审计七批/TZ 根治/本次清理）；README 测试数刷新；开发自参考加时效性声明（事实源优先级：STATUS > 契约清单 > CONTEXT > 自参考）+ 数字修正；契约清单 CODE_* 三码标退役（衔接批 F-9）；全部指向已删文档的引用改为「已随清理删除，git 历史可查」。
> 💾 **每日备份升级（2026-08-11 用户拍板）**：计划任务 CommissionDailyBackup 改跑仓库根 `daily-backup.bat`（DB + uploads 都备，带失败标记），原内联命令超 schtasks 261 字符限制改脚本承载；留存策略：**DB 3 份 / uploads 2 份**（脚本 KEEP 常量已改+TC-OPS-02 同步）；容器已重建烘焙新脚本；实测两次均 BACKUP_OK（uploads 133MB/162 文件），轮转份数核验准确；任务登录类型修复为 InteractiveToken（/change 会清空登录方式的坑已避开）。OPS/维护说明书/CONTEXT 留存口径已同步。

> 最后更新：2026-08-11 v75（**审计修复第二批 D/E/F/G 全部验收合入 + 容器重建部署**）——master `2079745` 与 origin 同步。
> ✅ **审计修复续批（codex 四批施工 + 一号逐批独立验收，接 v74 的 A/B/C 三批）**：**批 D 订单/钱域**（`a5245c6`：R-5+P3-1 订单 version 乐观锁全写路径守卫[旧快照写入→409 ORDER_CONFLICT]、R-9 下单/收款幂等键[同 key 重放不重复入账]、R-11 零元单显式化，迁移 v53/v54，+37 测试；验收时接线幂等键 GC TTL 并补测试（接线提交在 `a5245c6` 之后）；**批 E 运维域**（`838a2b9`：R-6 备份自愈三件套[uploads tar 备份+restore-db 脚本+entrypoint DB 损坏自愈]、R-20 埋点表 TTL[events 180d/anon_tokens 30d]、R-21 回收站恢复接口、P3-23 签名密钥随机化、P3-24 GC 双轨收敛，+16 测试）；**批 F 后端杂项**（`69a14d4`：P3-20 更新事务回滚、P3-21 留言分页、P3-22 管理端 schema 补齐、P3-17 模板/面板白名单、P3-18 入库消毒、P3-19 DDL 双轨一致性测试[过程中抓到 v49 种子崩坏与 schema 漂移两处真实缺陷并修+新增 v55 双轨同步]、P3-31 计价函数三段拆分[铁律转段内断言]、P3-12 核实无需改、F-9 死码清理、P2-13 参考图归属凭据[x-anon-token+reference_uploads 表，迁移 v55]，+63 测试）；**批 G 前端健壮**（`2079745`：P2-8 布局会话强校验[getMe 失败即登出，补上 v74 漏项]、R-22 三竞态[pointercancel/柱图 seq/开关防连点]、R-16 断网重连订阅、R-17 多标签草稿 storage 同步+幂等键、G-5 localStorage 全量清扫、G-6 死码衔接、G-7 anon-token 归属链路、G-8 留言分页适配，+39 测试）。每批验收=一号独立复跑门禁+抽查 diff，非 self-report。
> ✅ **终态门禁与部署**：server **1213/1213** + web **332/332** + E2E **7/7** + tsc/eslint/build/check-i18n 全绿。容器已重建（备份 bak-pre-audit-rebuild-20260811 + BACKUP_OK），迁移 v55 已应用回读（orders.version 列/idempotency_keys/reference_uploads 均就位），登录页 HTTP 正常。
> ⚠️ **遗留小项**：① 每日备份计划任务目前只备 DB 不含 uploads（批 E 已提供 backup:uploads 脚本，需更新计划任务命令，待拍板）；② P2-13 存量未登记参考图豁免口径随 GC 自然收敛；③ 手动录单端点未消费幂等键/anon-token header（前端已携带，服务端契约升级自动生效，防重复提交主防线=草稿广播+按钮 loading）。前端主线下一站：前端重构批（api 层 TS + entities 补全，契约清单已就绪）→ 视觉批。

> 最后更新：2026-08-10 v74（**外部审计修复三批全部验收合入 + TZ 分叉根治**）——master `6e0760b` 与 origin 同步。
> ✅ **审计修复（用户提供 code-quality-audit-20260810.md，一号逐条核实后派 codex 三批施工、逐批独立验收）**：裁决=36 项属实待修 / 3 项过时剔除（P2-3 旧列已随 v52 退役、P2-6 已被登录页重构修复、P3-2 同 P2-3）/ 结构性项挂起记录（P2-13 上传凭据、R-5 版本锁、R-6 备份 SOP、R-9 幂等键、R-11 零元单、R-16/17、R-20/21、P3-1/12/17~31）。**批 A 后端核心**（`9244e0c`）：P1-1 工作流 pending→wip 卡死、P2-1 带文件交付状态迁移对齐、P2-2 截稿日交叉校验时区、P2-4 折扣码日期 fail-closed、P2-5 createArtist 事务化、P2-7 订单公开路由 hidden 过滤（含 track）、R-1 脏缓冲单劫持递补隔离、R-2 取消已收款订单 409 确认契约、R-3 限流清理器按桶窗口、R-7 队列分区重排、R-10 下单总价封顶、R-12 订单号解析、P3-3/4/5/6/7/8/11/13/15/16，+62 回归测试（1089/1089）。**批 B 安全校验**（`10a9cfb`）：P2-9 CSV 公式注入、P2-10 埋点 payload 2KB 上限、P2-11 散单金额封顶、P2-12 参考图存在性校验+限长、P3-29 价格 multipleOf 0.01、P3-14 contactQq 不再兜底登录 QQ，+13 用例（1106/1106）。**批 C 前端健壮**（`993f3c1`）：R-2 前端确认流、R-4 撤销防连击、R-13/14 算价/加载竞态 seq 守卫、R-15 签名刷新 visibilitychange、R-18/19 定时器清理、P3-9 错误弹窗去重、P3-10 localStorage 安全封装，+39 用例（293/293）。每批验收=一号独立复跑门禁+抽查 diff，非 self-report。
> ✅ **TZ 分叉根治（合入后门禁暴露，`6e0760b`）**：TC-IS-08 凌晨窗口失败根因=SQLite strftime localtime 随 C 运行时 TZ，与 JS 的 TZ 环境变量在 Windows 上分叉（vitest TZ=Asia/Shanghai 下 SQLite 返回 UTC 日期而 JS 认本地日）；生产 Linux 容器认 TZ 不受影响但属真实可移植性隐患。修：date.ts 新增 parseSqliteUtcDate/localDateRangeToUtc，收入汇总/导出/老客召回/埋点 byDay 全部改 JS 层本地日换算，全仓不再残留 SQLite 时区函数（1106/1106）。教训入账：**本地日历日换算禁用 SQLite localtime，一律 JS 层单一口径**。
> ⚠️ **遗留小项（批 C 施工方报告的越界检查项）**：ManualOrderRight showImages、i18n/track/Preferences 等处仍有 localStorage 裸读（不在本批清单未越界修）——后续小批处理。

> 最后更新：2026-08-10 v73（**巨型组件三拆全部合入推送，前端主线下一站 = 前端重构批**）——master `54a69ff` 与 origin 同步。
> ✅ **巨型组件拆分批（2026-08-10 用户拍板「都先拆掉」，一号项目内施工）**：现存 >900 行三候选全部拆完，均纯搬移零行为变化 + 真实登录态像素对比验证：①OrderDetail 1450→628：抽五面板组件（LogPanel/CommPanel/ExtraItemsPanel/NotesPanel/PublishShareDialogs，`dea0a41`）；②ManualOrderRight 1049→868：价格状态机抽 useManualOrderPricing（画风/尺寸/增项选择 + 自定义增项 + 防抖计价 + G2 脏标记，`7b5d732`）；③QueueBoardCalendar 1326→756：时间条状态机抽 useQueueTimeline（缩放档位/视口自适应/画布手势/拖拽改期/撤销 toast，`54a69ff`）。验证：web 254/254 + eslint 0 + build；隔离测试库（种子+真 TOTP 登录+造数）前后像素差均 0.000%/maxDelta 0（截图 workspace/temp/split-{od,mo,qb}-*.png）。⚠️ **诚实更正**：OD 批提交信息里的像素验证首版为假通过（未登录被重定向，实际对比的是登录页 vs 登录页）；发现后补落地断言重验，真实结果仍为 0%。教训入账：**截图验证必须带落地断言（目标元素存在 + URL 非登录页），否则防不住“登录页对登录页”假通过**。验证脚本在 workspace/temp/shot-split-*.mjs（隔离库+真登录链路，后续拆分批可复用）。
> ✅ **同日前序（v72 补充）**：登录页重构+打磨四修+倒影动画修复合入（`d12d793`）；REQ-014 拍板落档（`740bcfa`）；接口契约清单验收 4/4 属实并提交（`dc28c85`，前端重构批前置解除）；登录页旧约束解冻（用户主动打磨）。前端主线队列：前端重构批（api 层 TS + entities 补全，契约清单已就绪）→ 视觉批（后台壳/Dashboard）。

> 最后更新：2026-08-10 v72（**登录页重构+打磨四修，施工完未提交**）——基于 master `67c5425`，工作树含登录页重构（Login.vue 拆分 LoginBackdrop/PaperCard/LoginPrefs + useLocaleSwitch，落档 docs/comms/登录页重构-变更与建议-2026-08-10.md）与本轮打磨，均未 commit，等用户验收后决定提交。
> ✅ **登录页打磨四修（2026-08-10 用户四条反馈，一号项目内施工）**：①山简单丑→两层均匀 Q 曲线重绘为三层不等距有机山脊（C 曲线峰距/峰高不对称）+ 墨阶 5/8→7/12/18 三档递进；②墨黑山太亮→改暗剪影（黑混 paper token 18/30/44% 压到底色之下，倒影 26/38/52% 实色）；**根因 = SVG 渐变 stop 的 currentColor 沿 <defs> 所在 DOM 链取色而非引用 path 的色**（计算样式正常但渲染亮成浅色 --ink），改 CSS 变量→stop-color 供色，教训入账；③纸底和框不同步→纸叠三张入场统一 0.45s/延迟 0.1s 同步落定；④滚动条闪现→根因登录路由走全局 fade-slide，translateY(8px) 把 100vh 页面推出视口，App.vue 豁免 ArtistLogin（登录页自带入场编排）。门禁：web 254/254 + build + check-i18n + eslint 0 全过；measure 圆角族 1/野生 0/离栅 0（inherit 1 处人工核验：PaperCard ::after 随父卡 token 角）；huiyue-layout-audit VL 双主题各一轮 C1-C4/S1-S5 全否 0 阻塞（VL 提的次要文字偏弱为 F2 批4 已达标 ink3/ink4 token 的有意层级，logo 裁切感为用户自换 logo 前已知项）；像素采样实证：墨黑山 23→20→13 递沉、纸白 242→232→181 递浓；scrollHeight 全程 = innerHeight 零滚动条。截图 workspace/temp/login-polish-{paper,ink,390}.png。⑤**追修：倒影入场动画 bug（用户实拍报告「先过深再瞬变淡」）**：根因 .m-refl 误借用季节背景图专用的 fade-in 关键帧（终值 0.92），播完瞬跳回静态 opacity 0.45；改专属 refl-in（终值 0.45），时序像素采样实证 opacity 0.22→0.43→0.45 单调收敛零跳变；门禁复跑 web 254/254 + build 全过。教训入账：**共用关键帧名必须核对终值与元素静态值一致，backwards 填充不保证播完态二致**。⚠️ 旧约束更新：「登录页未经指示不再改动」因用户本轮主动提出打磨而解冻，后续仍以用户指示为准。

> 最后更新：2026-08-10 v71（**v0.50-v0.57 垃圾历史已 squash，防干扰其他 agent**）——master `4637d8b` 与 origin 同步。
> ⏪ **登录页回滚（2026-08-10 用户指令）**：合入 `88c7622`+`479f0f9`。Login.vue 整体 checkout 回 v0.49 状态（c2ad4d9：SVG 曲线山+山脊亮棱+视差+吉祥物 logo+背景预留接口，无 mask 位图/无题跋闲章/无诊断开关）；删除 v0.51 引入的 mt-far/mid/near.webp 与 render-mountain-tex.mjs。回滚原因：用户确认视觉异常自 v0.50 引入（蒙纱排查多轮未定位：页面元素/color-scheme/force-dark flag/扩展均已排除，纯黑探针不可见，用户叫停排查）。⚠️ 后续约束：登录页视觉未经用户指示不再主动改动；纱问题存档待用户主动重提（已知排查进度：页面层无嫌疑，嫌疑在浏览器/显示管线，候选 HDR/显示配置）。门禁 web 254+build+i18n 全过，容器已重建= v0.49 状态。v0.54 去 transition 修复随回滚失效（v0.49 带 550ms 换肤缓动），若用户再报切换不可读再单独摘出重上。
> 🧹 **历史压缩（2026-08-10 用户指令，防干扰其他 agent）**：v0.50→v0.57 的 19 个试错提交已 squash 为单提交 `4637d8b`（代码净差异为零，仅本文件 +21 行记录；force push 完成）。**注意：本节及上方 v64-v70 记录中引用的 v0.50-v0.57 提交 hash（b31f404/5c09e27/8195bba/4a502c2/d1e4fff/02dcd28/c12886d/533abc8/c61c199/17d6392/2a9f09b/88c7622/479f0f9/f79d9d6 等）已全部失效，仅作存档文字，不要尝试 checkout/引用**。完整原始历史备份在本地分支 `backup/pre-squash-login-attempts`（f79d9d6，未推远程）。

> 最后更新：2026-08-10 v69（**登录页 v0.56：恢复误删纹理层 + 删除纤维网格层（蒙纱新嫌疑）**）——master `533abc8` 与 origin 同步。
> ✅ **登录页 v0.56（2026-08-10）**：合入 `533abc8`。用户反馈 v0.55 删错了（纹理在其环境渲染正常），当日处置：①git 精确恢复 v0.54 状态的纹理层（全幅纸纹/卡面/纸叠/噪点，保留 v0.54 去 transition 修复）；②删除纤维网格层（.login-page::before：全屏 repeating 1px 灰线每 3-4px 一条，高分屏/缩放下如整屏蒙细纱——「蒙纱」新嫌疑）。门禁 web 254+build 全过，容器已重建。⚠️ 若用户刷新后仍蒙纱：下一嫌疑=山体 mask 在其浏览器失效（渐变铺满成色块），鉴别问句：「下面的山有没有山的形状，还是一大片平涂色块」；答平涂则山体弃 mask 改位图直出（v0.53 思路，浓度另调）。教训入账：用户实机观感证词优先于代理推测，删元素前先让用户确认哪个是好是坏。

> 最后更新：2026-08-10 v68（**登录页 v0.55：全部 mix-blend-mode 纹理层移除，根治「屏幕蒙厚纱」**）——master `c12886d` 与 origin 同步。
> ✅ **登录页 v0.55（2026-08-10 用户报告屏幕像蒙了层厚纱，当日根治）**：合入 `c12886d`。根因：页面 4 处纹理/噪点层全靠 mix-blend-mode（multiply/overlay/screen）混合——代理截图环境正常，但用户真实环境下混合失效退化为普通半透明叠层，灰白纹理直接盖在屏幕/卡片上=厚纱观感。移除清单：.login-page::after 全幅纹理、.card::before 卡面纹理、纸叠底纸纹理、.grain-layer 噪点层（含模板 div）+ 相关变量（--lg-tex-op 等）。验证：全页 mixBlendMode!=normal 元素数归零、无半透明元素；纸感由手剪圆角/撕毛边/纸边厚度/四层投影承担。纸肌理日后若回归：预烘成带 alpha 的暗/亮纤维位图按主题直叠，禁用任何 blend。门禁 web 254+build 全过，容器已重建，双主题截图自审干净（workspace/temp/login-v055-*.png）。教训入账：代理截图与真实环境渲染能力可能不一致，用户报蒙纱/发灰先查 blend 层。

> 最后更新：2026-08-10 v67（**登录页 v0.54：墨黑切换不可读根治——取消 550ms 主题变量缓动，改即时切换**）——master `02dcd28` 与 origin 同步。
> ✅ **登录页 v0.54（2026-08-10 用户报告墨黑主题登录框不可读，当日根治）**：合入 `02dcd28`（前置：v0.53 位图直出方案已被用户叫停并 revert `d1e4fff`，山体维持 v0.52 mask 方案）。根因（逐帧实测取证）：26 个主题变量挂 550ms 各自 transition，换肤中途存在「背景已暗/文字未亮」灰沼中间态（对比度坍到 ~1-2:1，逐帧实测 200-400ms 处 title/card 仅 2:1）；动画在失焦标签页/部分 GPU 下停滞，页面永久卡死在灰沼态=用户截图的不可读现场。修复：登录页移除全部主题变量 transition，换肤即时切换；验证：点击后 30ms 即终态，逐帧对比度 13.3:1。教训入账：可读性优先页面换肤禁用多变量各自插值，需要过渡时用容器级淡出淡入（任意中间帧自洽可读）。门禁 web 254+build 全过，容器已重建。

> 最后更新：2026-08-10 v66（**登录页 v0.52：页面底铺真纸纹理 + 山墨阶重调，治「纸白送终白/墨黑裹尸布」**）——master `8195bba` 与 origin 同步。
> ✅ **登录页 v0.52（2026-08-10 用户点名批评 v0.51 双主题观感，当日修复）**：合入 `8195bba`。根因：v0.51 山色混入比例太低（纸白 4-24%/墨黑 3-12%，山几乎与底同色）+ 整页无纸肌理无色彩锚点 → 纸白死白、墨黑死黑。修复：①页面底铺真纸纹理（.login-page::after 消费 --lg-tex，multiply .4；墨黑 overlay .07；盖在山脉之上山体同吃纸感，对齐北极星纸艺）；②纸白主题山墨重调：远山带一丝花青雾色（宪法七色内，远山如黛）+ 中近层墨色加深（峰淡脚浓 10-32%）；③墨黑主题改「月光纸山」：亮色剪影三层递进 9-29%，暗底有呼吸不压抑。门禁 web 254+build+measure 全过，双主题截图自审（workspace/temp/login-v052-*.png）；容器已重建。⚠️ 观感类调优以用户终验为准，若仍不满优先问用户具体感受再动手。

> 最后更新：2026-08-10 v65（**登录页 v0.51 回滚修正：题跋/闲章删除，山脉弃 SVG 矢量改预渲染位图 mask**）——master `5c09e27` 与 origin 同步。
> ✅ **登录页 v0.51 回滚修正（2026-08-10 用户对 v0.50 非常不满，指令回滚+根治）**：合入 `5c09e27`。①左下闲章、右侧竖排题跋全删（v0.50 新增元素直接移除，模板+样式清干净）；②**山脉渲染方案根治**：弃 SVG 矢量+滤镜（窗口放大锯齿、视差露白边的根因），改预渲染位图——scripts/render-mountain-tex.mjs 把三层山（含毛边滤镜+纵向浓淡）一次性光栅化为 3840x960 alpha WebP（assets/mt-far|mid|near.webp，共 121KB），页面用 CSS mask-image 消费 alpha，颜色走 color-mix token 纵向渐变（峰淡脚浓），**双主题自动适配不硬切**；山脊受光线保留矢量 stroke（无滤镜任意缩放不锯齿），与位图层同层同步视差；视差层 112% 超采样实测极端位置余量 73-100px 零露边；窄屏自然宽高比实测 4.00。③回滚后布局/主题切换/交互全部正常（门禁 web 254+build+i18n+measure 全过，双主题+2x 高 DPI+390 四档自审通过，workspace/temp/login-v051-*.png）。容器已重建。教训入账：**SVG feTurbulence 位移滤镜不能随窗口缩放光栅化（锯齿），装饰性滤镜要么烘进位图要么不用**。

> 最后更新：2026-08-10 v64（**登录页 v0.50 合入：四条验收反馈全修**）——master `b31f404` 与 origin 同步。
> ✅ **登录页 v0.50（2026-08-10 用户验收四条，一号项目内施工）**：合入 `b31f404`。①视差露白边/极端缩放丑：山脉容器 overflow hidden + svg 超采样 112%（两侧 6% 余量 ≫ 视差±14px，实测极端位置零露边）；≤768px 山脉改自然宽高比 aspect-ratio 4:1（实测 390 宽比例精确 4.00，不再拉伸挤压）；②墨黑山刺眼：山体 7/11/16%→4/6/9%，受光线 opacity 同步收至 .14/.2/.26（:global 分主题）；③山更好看：山体加 feTurbulence 位移滤镜（mtRough 温和版 scale 5）——山也是剪出来的纸，去矢量感向北极星纸艺靠拢；④宽屏两侧空：≥1280px 右侧竖排题跋（文楷直书 绘约/画师后台，淡墨）+ 左下朱砂闲章（卷轴构图语言）。门禁：web 254+build+i18n+measure 全过；容器已重建，1440/墨黑/2560 超宽/390 四档自审通过（workspace/temp/login-v050-*.png）。

> 最后更新：2026-08-10 v63（**登录页 v0.49 合入：北极星三差距补齐+视差动效+背景预留接口+吉祥物 logo**）——master `c2ad4d9` 与 origin 同步。
> ✅ **登录页 v0.49（2026-08-10 用户拍板 1/2/3 全要，一号项目内施工）**：合入 `2957586`+`c2ad4d9`。①**纸层折叠厚度切面**：每层山脉加山脊受光线（stroke 亮棱，vector-effect non-scaling-stroke，远层细淡近层粗亮）——纸折边缘的亮棱即厚度切面语言，用光不用金（宪法金仅三时刻）；②**山脊受光**同上（合二为一实现）；③**构图包围**：山脉 36vh→52vh（min 200→300，768 竖屏 26→36vh），人在山中；④**动效引入**：鼠标视差——三层山远慢近快随视線轻移，帧率无关阻尼插值 1-e^{-λ·dt}，收敛即停 rAF 不空转，触发式非循环，reduced-motion 不启用（实测阻尼跟随生效）；⑤**背景预留接口**：新增 composables/useSeasonalBackdrop.js（节日主题/画师自定义背景两个接入点注释在文件内，优先级约定：自定义>节日>默认）+ Login.vue 渲染层 .seasonal-backdrop 完整实现（cover+径向渐隐融入），数据源接通前恒 null 无行为差异；⑥**logo**：assets/logo.webp 手绘吉祥物替换朱砂印章字（68px，用户拍板；印章/stamp 动画已清）。门禁：web 254+build+i18n+eslint 全过；measure 首轮报 logo margin 14px 离栅已修 16px 复绿；容器已重建，双主题三宽度自审通过（workspace/temp/login-v049-*.png）。注：390 截图呈墨黑是主题偏好 localStorage 持久化的预期行为。

> 最后更新：2026-08-10 v62（**登录页 v0.48 合入：亭子删除/山体墨色渐变/纸白外影加重/时辰底色漂移**）——master `45b3944` 与 origin 同步。
> ✅ **登录页 v0.48（2026-08-10 用户验收反馈，一号项目内施工）**：合入 `45b3944`。①亭子删除（用户点名丑，pavilion-wrap 全清）；②山体加垂直墨色渐变（SVG linearGradient+currentColor，峰顶淡如远雾/山脚浓如近石，对齐北极星水墨浓淡，主题缓动不断链）；③纸白外影加重一档（7/10/15/24% 四档，对齐北极星强定向光影；墨黑维持原四档 :global 分主题）；④**时辰底色（用户拍板“随时间轻微变色”落地）**：data-daypart 四档色温（晨 #F6F3EC/午标准/暮 #F4F0E5/夜 #F2F2EF，偏移仅 ±2 级亮度不破七色纸色家族）+ 停留期一次性 240s 超慢漂移（如天光西沉，不循环=宪法动效纪律，@property 注册，仅纸白主题，reduced-motion 自动退化为直出）。门禁：web 254+build+i18n+measure 圆角族 3 全过；容器已重建，双主题截图自审通过（workspace/temp/login-v048-*.png）；硬指标：pavilion gone、daypart 生效、drift 动画在跑、四层投影、渐变 fill 生效。⚠️ 用户总体评价仍是「和期望差好多」：对照北极星已补（墨色渐变/强光影），剩余差距候选：纸层折叠厚度切面、山脊受光边缘（非金，宪法金仅三时刻）、整体构图密度；待用户验收后定下一轮方向。

> 最后更新：2026-08-10 v61（**登录页视觉打磨 v0.47 合入：雾带删除/曲线山+亭重绘/纸叠梯度转正/纹理可见性修复**）——master `0ebda6d` 与 origin 同步。
> ✅ **登录页 v0.47 打磨（2026-08-10，用户验收反馈四项全修，一号直接在项目内施工）**：合入 `0ebda6d`。①雾带删除（用户点名「横着的奇怪线丑」，mt-mist rect+动画全清）；②山脉改曲线远山（直线锯齿→Q 曲线水墨山脊，墨阶每档加深 6/10/15%），亭子重绘（宝顶+飞檐翹脊+横梁+双柱+台基，落点移至中景山脊 left 47.5%）；③纸叠明度梯度转正（安装版漏了 v0.5 修复：sheet-b 曾用比页面底亮的 --paper2 → 改 color-mix(ink 3%/7%, paper)，主卡四层投影+纸边 4px，双主题自适应）；④纹理可见性修复（根因：源图灰度 range 仅 38 级+ctx.filter 会失真，压缩脚本改像素级百分位拉伸 222-255，webp 12.9KB→160KB，op 维持 .5，斑驳约 6.5%）。偏好区保持卡内顶部（用户拍板不移）。门禁：web 254/254+build+i18n+measure 圆角族 3 全过；容器已重建，双主题三宽度截图自审通过（workspace/temp/login-v047-*.png）。⚠️ 遗留：亭子 40px 小尺寸下视觉通道曾读成「↑↑」符号，用户若觉得仍丑再细调；纸叠色/投影是 color-mix 现场混色未收 token，视觉批铺开时再评审。
> ⚠️ **身份纪律备忘（2026-08-10）**：分身窗口曾自认为一号写 STATUS v60 并宣布安装合入（实际安装由一号宿主完成）。内容基本属实未追究，但重申：**STATUS 只能由一号写，分身窗口只可做设计讨论与执行角色工作**。
> ✅ **旧 v60 摘要（纸墨登录页安装合入 f021eb6；圆角族审计口径落地；接口契约清单在途）**。
> ✅ **纸墨登录页安装（2026-08-10，视觉批开局，用户插队拍板在拆分前）**：合入 `f021eb6`（分支 feat/login-paper-ink，worktree artist-commission-w-login，Qoder 宿主直接施工——用户拍板：视觉批拼审美判断不走便宜模型）。内容：Login.vue 全量重写（纸艺山水/手剪不规则圆角/三张纸叠+feTurbulence 真毛边/ambientCG 真纸纹理 12.9KB WebP/一次性入场动效/550ms @property token 统一缓动切主题/WAAPI 单次交叉淡出+高度锁切语言/grid-rows 帮助展开）；locales 登录键重写（真实 TOTP 推荐 Google/Microsoft Authenticator+2FAS，旧臆测文案删除，新增 纸白/墨黑 主题名键）；check-i18n 白名单+eslint scripts/*.mjs 口径。门禁：web 254/254（master 复跑）+ lint 0 + build 过 + check-i18n 过 + measure 圆角族 3/野生 0 + 安装后交互核验 12/12；容器已重建（备份 bak-pre-login-install-20260810），生产登录页截图已出（workspace/temp/prototype-login/prod-login-*.png）待用户终验。E2E 不涉登录 UI（预登录走 API）未重跑；server 未改动。原型全史：workspace/temp/prototype-login（login-v0.1→v0.6 定稿 + notes.md）。
> 🔴 **圆角族审计口径（2026-08-10 用户拍板方案 A，已落地）**：measure.mjs 弃「取值种数 ≤3」改「圆角族 ≤3 + 野生字面圆角出现即阻塞」（var(--r-*)=token 角族 / 50%=圆族 / 0=直角族），手剪不规则圆角 token（--r-paper/--r-s-hand，暂定义在 Login.vue 全局块，视觉批铺开时迁入 artist-tokens.css）正名；SKILL.md/评审清单已同步，原件备份 measure.mjs.bak-pre-radius-family。
> ✅ **批4B 全闭环（2026-08-10）**：合入 `aefc1c9`（base 严格删四列+v24 列探测守卫+v52 删列迁移+addPayment 停写+fixture 修正，交付报告原含双库字节级验证证据，交付文档已随 docs 纪律性清理删除）；合入后 master 门禁 server 1027 全绿；容器重建后 v52 自动应用：回读 version=52、分期表仅剩 9 列（四列已删）、23 行分期+2 条流水完好；备份三重（迁移器 .bak.v52 + 手工 bak-pre-v052-rebuild-20260810 + 每日备份）。worktree 已清。批4 结构批至此全部完成。
> 🔄 **接口契约清单侦察在途（2026-08-10）**：codex 在主仓只读生成 docs/specs/接口契约清单-v1.md（165 端点逐条写实+错误码总表+前端映射+孤儿端点+缺口清单），作为前端重构前置依赖。背景：分身研判契约缺口属实（0 个 response schema / entities.ts 5KB / 前端纯 JS）；裁决：清单现在做，api 层加 TS 与 entities 补全随前端重构批做（避免重复改动制造合并冲突）。
> ✅ **旧 v58 摘要（批4B 方案 B 施工中；批4A/A3/FYA2 已合入；原型 v0.1 交付）**。
> ✅ **三路合入（2026-08-09，各自独立复跑门禁通过后合入）**：批4A `7cafefb`（savePayment 方案 b 守卫+appliesToNewOrdersOnly 提示 + scripts 纳入编译 + demo-data v51 对齐）/ A3 `d76a81c`（R10 关闭语义收敛：关闭=全锁且Σ待收=0，done 未付全的 delta 冲抵未付节点）/ formatYuan A2 `357e1d0`（formatYuanValue 整数裁剪 + addon-utils 收编进 money.js）。合入后全量门禁：server 1027 · web 254 全绿。
> ⚠️ **批4B（paid_cents 迁移 v52）已全闭环**（方案 B，2026-08-10 容器内回读验证通过）。详谈见本条上一行摘要（原交付文档已清理删除）。
> 🎨 **纸墨 Dashboard 原型 v0.1（2026-08-09）**：%TEMP%\prototype-dashboard\dashboard-v0.1.html（单文件自包含+notes.md+审计截图）。已过 huiyue-layout-audit v2 两轮（圆角 3 种/4px 栅格/对比度≥4.5:1 全达标），13 条已知待打磨点列在 notes.md §三，供 fork 后打磨。
> ✅ **旧 v56 摘要（formatYuan A1 统一合入；每日备份计划任务已配并实测）**——master `6b4f2fe` 与 origin 同步。
> ✅ **批7 内容**：①顶部改工具栏（标题+开关+语义状态徽章[开=石绿/关=藤黄] ｜ 右侧新建画风主按钮）+精简提示语；②**CI/E2E 断链根因修复**：仓库 Actions 权限被设为 `local_only`（只许本仓库内行动）→ 所有外部 actions（checkout/setup-node 等）被拦，自 08-08 18:28 起 CI/E2E 全部 startup_failure（0 jobs）；已改为 `selected`+仅允许 GitHub 官方行动（供应链不放松）；本地全门禁复跑全绿（E2E 7/7、server 1005、web 254、oxlint/check-locators 0 错）。教训：**CI 红不一定是代码错，先查仓库设置**。
> ✅ **SPEC-PRICE-2 全链（已验收通过）**：批1 `856055a` / 批3 `777a9a5` / 批4 `7be8b27` / 批5 `ae9f7ed` / v51 热修 `d88465e`（脏快照清洗，快照仅解绑行生效）/ 批6 `1d2914b`（交互布局，用户评“超出预期”）。规范：`docs/specs/SPEC-PRICE-2-价格模型统一重构.md`（含 §6 交互防呆铁律）。
> 🔴 **公式铁律（全链路已统一）**：最终价 = (基础价 + Σ固定增项 + Σ百分比增项[只按基础价]) × 用途 × 加急 × 折扣；全程整数分；增项两类控件（开关/个数，**用途/加急强制开关**）× 两种计价（¥/%）× 三类 category；用途/加急下单各选一个（ADDON_SELECTION_MUTEX）；新建画风无条件自动绑定用途/加急。
> 📁 **布局审计证据（2026-08-11 已随 docs 清理删除，结论留档于此）**：SPEC-PRICE-2 批6 四宽度截图 + 批7 工具栏截图曾存 docs/audit-screenshots/，VL 评审无阻塞项。
> 📜 **纸墨设计语言提案 v1（2026-08-09 用户口述+四号详谈，逐点拍板）**：docs/纸墨设计语言提案-v1.md——绘约视觉唯一事实源（定位/视觉公式/问候系统/器物章/三纪律/待办八项）。旧《画师工作台视觉提案-v2.html》已全文吸纳进本提案，原件已随 docs 清理删除。视觉方向自此以该提案为准，变更走 v2。
> 🔧 **执行通道切换（2026-08-09）**：hermes 通道因当前版本反复性故障+降智弃用；新通道 = 一号 codex exec 无头派工（DeepSeek v4-flash，approval never + 沙箱双模式），本日已实战：五路并行只读审计 + 批1 双路 worktree 修复全部走新通道。视觉自检 skill huiyue-layout-audit 用户级已装（VL 链路 qwen3.8-max 已通）。
> 🩺 **五路技术债审计（2026-08-09，五路 codex 并行只读，一号逐条复核）**：🔴4 已全部修复（批1）；🟡19 / 🟢50+ 清单在审计报告中（%TEMP%\audit-A~E，落档前已转述要点）；全库 TODO/FIXME 为 0、TS 门禁干净（any 清零属实、0 处 ts-ignore 蒙混）。
> ✅ **批1 急救批（2026-08-09 合入 `891a7fe`+`60ea24f`）**：R1 状态机统一断言（advanceStage/交付路径接入 STATUS_TRANSITIONS，pending→done 一步登天已堵）/ R2 rollback done 守卫（R13 落实，顺带消除 B3 completed_at 漂移路径）/ R3 删增项负价守卫 / R4 i18n 键错位（orderForm.selectSizeFirst）。新增 7 用例 TC-B1-01~07；worktree 双路并行，用完即删。
> ✅ **批2 口径批（2026-08-09 合入 `50dbbfb`）**：A4 收入汇总改 strftime localtime 与导出对齐（UTC+8 凌晨收款不再差一天）+ 时区自适应回归用例（任何 TZ 成立）。B3 因 R2 守卫自然消除不再需修。
> ✅ **批3 清理批（2026-08-09 合入 `ee4a0e1`+`eb51c32`）**：E2 parseInt radix 27 处补齐；183+2+9 死键删除（分 9 批小步提交每步过 check:i18n）；16 个 errors.* 缺键补齐（zh+en）；3 死文件 + App.vue 冗余导入 + ACTION_TYPES 死导出清除；fetchProfile 仅 401 登出修复（网络抖动不再误踢人）+ Dashboard 不白屏。门禁全绿：server 1013 · web 254 · build 通过。
> ✅ **formatYuan A1 统一（2026-08-09 合入 `11e6110`）**：money.js 新增 formatYuan 单一事实源；OrderForm 26 点位 + ManualOrderRight 分源/混合源 + StandaloneIncome/ToolsExport 私有 fmtYuan 清除（侦察施工图已随 docs 清理删除，A2/addon-utils 已后续合入）。收敛断言通过（残留 5 处均 basisPoints 百分比，属非金额类正确保留）。
> ✅ **每日备份计划任务（2026-08-09）**：Windows 计划任务 CommissionDailyBackup 每日 03:30 跑 docker compose exec 备份（OPS §2 等效），已手动触发实测 BACKUP_OK；保留 7 份脚本内置；日志 data/backups/daily-backup.log。
> ⚠️ 2026-08-05 上午**身份混淆事故**（二号误认一号）：master 完整、零损失。防再发见「身份自检」。
> 维护者：一号（主理人）
> **刷新后自包含**：新会话只读本文件即可完全恢复，不依赖任何对话记忆。

> **分工流程（2026-08-07 用户拍板，落档 docs/soul/soul-01-lead.md）**：简单问/拍板/常规活=一号直接处理（本窗口）；长讨论/深交流=引导操作人左侧另开 default 窗口，开窗第一句声明「你是X号，本次专门讨论XX，讨论完即弃，不承担门禁职责」，default SOUL.md 永不改成「讨论角色」（本窗口=一号），多开窗口靠对话声明角色覆盖。

---
## 🔄 在途任务（刷新后先看这里，2026-08-10 刷新）

1. ~~**验收接口契约清单**~~ ✅ **已完成（2026-08-10）**：抽查 4/4 端点逐行对照 routes 代码属实（auth/verify、calculate-style-price、增项解绑 DELETE、workflow/payment），已 commit+push `dc28c85`。前端重构批前置依赖解除。
2. **巨型组件拆分**：✅ **2026-08-12 本批收官**——OrderForm 1148 行拆为编排层 + 7 个 lang="ts" 子组件（`e11e044`）；叠加 v73 三拆（OrderDetail/ManualOrderRight/QueueBoardCalendar），>900 行巨型组件清单全部清完。
3. **前端重构批**：✅ **api 层 TS 主体已完成（2026-08-12，`e11e044`）**：161 DTO + index.ts 全量标注 + tsconfig/vue-tsc/CI 门禁落地。**剩余走增量轨**：entities.ts 补全（按需）、存量 JS「谁触碰谁迁移」，不再单独立批。
4. **视觉批（已开局）**：登录页已合入；后续按原型打磨稿推进后台壳/Dashboard；小项随批：账本待办带金额列（淡墨）；问候系统实施并入视觉批；@property 注册+550ms 缓动+手剪圆角 token 从 Login.vue 迁入 artist-tokens.css 随下一视觉批。
5. **等用户侧**：终验生产登录页（截图已在 workspace/temp/prototype-login）；复验 SPEC-PRICE-2 页面（解锁 v0.46 发版）；REQ-037 批1 实机体验（订单详情错误态/看板排序撤销）。
6. **顺手项排队**：F8 revokePayment 负流水双倍防御（批4B 交付报告 §六建议，一行防御）；历史文档（开发自参考/外部 wiki/REQ-025）旧列描述与代码不同步，如需同步另行派工。
7. **REQ-037 已收官**：批0-批5 全部合入；等用户终验 72 帧截图与实机体验；后续若视觉批（Dashboard 骨架重设计）开工，基于本次嵌套路由/组件化后的新结构施工。
8. **已裁决不动（2026-08-10）**：分身提「双包结构致 @sentry/esbuild/eslint 重复安装 ~60MB，应上 npm workspaces」——实测否决：@sentry 两侧是不同包（node 系 vs browser/vue 系，36.5MB 任何架构都要装两份）；esbuild 两侧版本不同（0.28.1 vs 0.25.12，workspaces 只去重同名同版本）；真正可去重仅 eslint ~3MB。迁移代价（lock 合并+Dockerfile/CI 重写）≫ 收益，且独立包结构恰好对齐部署边界（server 容器运行时 / web 静态产物），非债是边界。分身勿重提。

- **原型位置**：`%TEMP%\prototype-dashboard\dashboard-v0.1.html`（单文件可交互；notes.md §三有 13 条已知打磨点清单）；登录原型已安装进仓库，全史留档 workspace/temp/prototype-login（login-v0.1→v0.6 + notes.md + 审计脚本）。
- **codex 重派模板**（pwsh，worktree/主仓内执行）：`$task=@"...中文任务..."@` 然后 `"" | codex exec --profile huiyue -c sandbox_mode=danger-full-access $task`。
- **docker 操作注意**：compose 服务名是 `web`（容器名 commission-web），`docker compose exec -T web ...`；容器内查 DB 要 `-w /app/server`（better-sqlite3 在那里）。
- **已合入待办销账**：批4A / A3 / FYA2 / 批4B 均已合入推送+容器已重建，批4 结构批全部完成；纸墨登录页 `f021eb6` 已合入推送+容器已重建，无残留。

---
## master 状态

- **HEAD**：`ec33dff`（REQ-038/040 波A 合入收尾，与 origin 同步）
- **工作树**：主仓干净；活跃 worktree：w-req038 / w-req040（已合入待删）；波B/C/D 尚未建 worktree
- **测试基线**：server **1226/1226**（95 文件，含 setup 13 用例）· web **350/350**（42 文件）· E2E 7/7 · tsc 0（含 scripts 双编译）· eslint+oxlint 双侧 0 错（web 1 警告=搬移的须知 v-html 已有消毒）· check-locators 0 错 · check-i18n 0 · web typecheck（vue-tsc）0
- **后端 100% TS + strict 全开 + any 清零**（init.js 豁免已随 v77 拆分清偿）；**前端 TS 增量纪律生效**（web/tsconfig.json strict + allowJs，新文件一律 TS，vue-tsc 进 lint 与 CI）
- **版本**：npm 0.45.0（SPEC-PRICE-2 收编发版 v0.46 待用户验收后定）
- **容器**：⚠️ **未烘焙波A 成果**（线上容器仍是工具箱收纳版；迁移 v57 未应用——webauthn 表未建，Passkey 功能需重建后才可用；随波B-D 收官一次性重建+截图验收）
- **CI/CD**：GitHub Actions（ci.yml + e2e.yml）；**仓库 Actions 权限 = selected（仅 GitHub 官方行动）**——改回 local_only 会导致全部 startup_failure，勿动（批7 事故教训）；web job 已加 typecheck（v77）
- **迁移**：**v57** 为最新（v56 webauthn_credentials / v57 totp_rebound_at）；迁移代码版本化（server/src/db/migrations/）；**规范**：SPEC-PRICE-2（公式/模型唯一事实源）+ 接口契约清单-v1（前端重构前置）
- **协议**：主仓库 **AGPL-3.0**；方法论仓库 **CC BY-SA 4.0**；第三方署名见 THIRD-PARTY-NOTICES.md

---
## v0.37 轮收官总结（2026-08-05，全部合入）

| 路 | 角色 | 内容 | 合入 |
|----|------|------|------|
| A | 三号 | REQ-025 后端引擎接线（locked 持久化 v40 + 七函数接引擎 + recalc 退役 + done 守卫 + 六处守恒挂载）——「已收节点不再变」真实生效 | `3aea46f` |
| B | 二号 | 前端收款展示（订单级共待收总横幅 + 负数 label + 详情按钮实锤 vite-reload 环境问题） | `5b2388b` |
| C | 五号 | demo-data 切流（base 条目 + 引擎分期 + locked 推导 + 全量守恒闭合 + LIKE 清理残留） | `eb0b4d0` |
| D | 二号 | ManualOrder 接新画风（三级选择核心）+ 补漏批（REQ-029 四项用户拍板缺口 R2/R5/R6/B2） | `f8e151e` + `8461251` |
| TOTP | 三号 | **REQ-027 TOTP 动态口令登录——P0 上线门槛解除** | `ac44a79` |
| 需求 | 四号 | 深聊批落库：REQ-026/027/028/029/030 + REQ-022 四待确认回写（含 F2 外链重做防投毒）+ 传播修改 | `13fa28d` 等 |

**里程碑**：REQ-027 TOTP 解除上线门槛——登录改 TOTP 动态口令（RFC 6238 官方 6 向量一号独立验证全过），QQ Bot 推迟为 REQ-028 备案，AUTH_DEV_MODE 关闭不再依赖消息渠道。新依赖仅 qrcode@1.5.4（唯一例外）。
**遗留小项**：前端 locales 两个死键（sendCode/codeSent）✅ 已被后续批次顺手清除（2026-08-06 核实全库 0 引用）。

---
## v0.39 四路并行批收官（2026-08-05，全部合入）

| 路 | 角色 | 内容 | 合入 |
|----|------|------|------|
| 主链 | 二号 | REQ-022 F1+F2 前端批（发布为作品入口 + 外链重做 + 平台管理页），f2-social-backend 门控同收（迁移 v42） | `e7d3c35` |
| 后端 | 三号 | addons 冻结表清理第一批（算价读路径）→ 收尾批（DROP v43，旧增项体系完全清退） | `1b8a375` + `58d48c9` |
| 文档 | 四号 | A 测执行手册（9 场景 40 步剧本 + AUTH_DEV_MODE 关闭检查单） | `f496d1c` |
| 打磨 | 五号 | 打磨第二批（回收站插画/验证风格统一/画廊空态）+ D 软提示（`13dd4e7`）+ 安全加固批（`ee0f68a`） | `43395ff` 等 |

## 当前阶段（2026-08-09 用户批准）**SPEC-PRICE-2 价格模型统一重构——全五批完成，容器已重建待验收**。

**批次进度（全部 ✅）**：
- ✅ **批1 后端地基**（`856055a`）：引擎全整数分重写（用途/加急=category 增项，后端互斥单选）；迁移 v50；旧档位/旧倍率表+API+服务全清退；订单/队列/健康检查 JOIN 全切画风尺寸；新端点：解绑 DELETE + 覆盖只读 GET + 管理端 pricing-overview
- ✅ **批3 画师端前端**（`777a9a5`）：增项库全维度 CRUD（类别/控件/计价/数量上限）；新建/设置弹窗重写（修复 02H 字段静默剥离断级 bug）；三态 display_status 落库；预览按新公式重写；解绑真实落库；倍率 tab + MultiplierManager 删除；圆角 token 化 + 双列 grid；中英 i18n 全键
- ✅ **批4 客户侧**（`7be8b27`）：useOrderForm/OrderForm/ManualOrder 重写（三区选择：普通多选/用途单选/加急单选）；实时价格明细（基础价→增项→小计→用途→加急→折扣→总价）；展示态尺寸拦截；管理端抽屉改只读概览；测试全重写
- ✅ **批5 E2E**（`ae9f7ed`）：E6b 钱链路（算价→下单→收款整数分精确断言 + 互斥拦截）；E1 适配新流程；E2E 7/7

**待用户验收**：重建后容器即新模型（验收重点见顶部）。不满意可按提交链分批回滚。

**排队中**：~~批4 结构批~~（批4A/4B 全部合入，容器已重建）；接口契约清单（在途）；巨型组件拆分 Top5（④a 拍板）；前端重构批（api 加 TS + entities 补全，契约清单为前置）；v0.46 收编发版（待用户复验 SPEC-PRICE-2）。
- **部署**：每日备份计划任务已配（CommissionDailyBackup，03:30，已实测）

---
## 已拍板规则（长期有效）

> **A 测结论（2026-08-06 用户定）**：A 测当作为「已结束」，画师看了一眼嫌弃太垃圾。**进入复盘阶段**：暂停新功能开发，优先复盘 + 反思质量问题，待复盘结论后再定下一阶段。候选池（REQ-031 等）全部挂起。

> **验证码决策（2026-08-07 用户拍板）**：**暂不引入第三方验证码**——现有防护已覆盖（登录 TOTP 锁定 5 次/15 分 + verify 限流 10 次/5 分 + 27 处接口限流 + rate-limit 10 万桶保护）。**预留接入点**：若将来被僵尸网络攻击，选型 **Cloudflare Turnstile**（免费/无感/国内可用性尚可）；接入点 = 登录 verify / 下单 orders / 留言 messages 三处 schema（均 `additionalProperties:false`，各加 1 行可选字段）+ 共享 verifyCaptcha 函数 + 前端 3 处表单组件，约 1 天工作量。**不写预留代码**（空壳=伪安全），只记此文档。

> **OD-01 客户端五色主色（2026-08-06 用户拍板，四号落档）**：**选 b——只换 1/2/3 号不达标色，4/5 保留**。1 号 `#34dbcb`→月白青 `#356B69`（6.07:1）、2 号 `#34c2db`→雾蓝 `#3F5E80`（6.72:1）、3 号 `#3498db`→藤紫 `#5E5494`（6.62:1）；4/5 号不动。验收铁律：新值 ≥4.5:1 且不低于旧值。⚠️ 已知风险（用户接受）：换后 1/2/3 低饱和、4/5 仍霓虹深蓝，五色视觉可能不连贯，实施后观感差可再议。**埋点 3 处全做**：① 换色率 `theme_accent_change` 带 `palette_version`（neon-v1/natural-v2），**埋点 ≤ 值替换**同批；② 下单流程漏斗（定义第三方 01-PM §9.2）；③ 后台功能使用率（用户主动要求，口径一号排期时定义）。实施文件 theme.css:79-83 亮色 + :86-90 暗色（暗色沿用 §2.2.4 v2 建议值）。

> **OD-05 功能色边界（2026-08-06 用户拍板，四号落档）**：**选乙——客户端不收 token、后台可收**。规则 11 边界补充见上。藤黄调深 `#A8790B→#966C0A` 已拍板并入后台轨。

> **目标最优原则（2026-08-09 用户拍板，决策框架级）**：若存在确认无 bug 且更优的方案，老数据库允许丢弃；最终目的一定是最优解、最直觉、最符合设计、最低屎山与技术债；当前无真实数据，DB 内容随时可删。推论：「历史迁移不可动」纪律在无真数据前提下失效（其保护对象=存量库升级路径）；修改历史迁移须补防御性守卫（风格对齐迁移自身既有写法）并做新旧形态双库等价验证。

> **批4B 方案 B（2026-08-09 拍板，依目标最优原则推导）**：base schema 严格删四列（拒绝方案 A 的僵尸列）；v24 第2步存量换算补 PRAGMA 列探测守卫（列在=照常换算，列不在=新库 no-op，与 v24 第1步既有探测风格一致）；v52 删列（backupDbBeforeMigration+冻结清零+幂等 DROP）；speech.test.js fixture 同步去退役列写入。四列真实库全空值，数据损失=0。

> **纸墨设计语言提案（2026-08-09 用户拍板）**：docs/纸墨设计语言提案-v1.md 为视觉唯一事实源。要点：色彩造型克制+材质细节爆炸；泥金仅完稿盖章/今日焦点/画师成就三时刻；一模块一器物（账本待办/竹简留言/挂牌开关稿/百眼柜快捷/工具箱抽屉/卷轴排期）；三档完成仪式（日常沉底/清账撕页/泥金盖章）；钱不进日报；客户端跟宪法不跟皮肤；命名说人话。问候系统=创始人司机人设（8h/20h 触发/逐句浮现/手写资产）。后续视觉批以此为准。

1. **done = 半终态**（2026-08-05 用户拍板）：允许加附加项/加负条目/收款/负数收款；禁止无痕改总价/绕过条目删改价格结构/工作流回退；钱的去向引擎自动判定（未付全→冲抵未付节点，已付全→额外应收/应退）；delivered 保持完全终态。已随 A 路实施。
2. **登录主方式 = TOTP 动态口令**（2026-08-05 用户拍板），QQ 机器人推迟（REQ-028 备案，启动条件见 REQ-028 §二）。恢复方案仅"管理员重置"一条 + 服务器 CLI 兜底。
3. **外链重做防投毒三规则**（2026-08-05 用户要求，REQ-022 F2）：域名匹配必须匹配主机名末尾（weibo.com.evil.com/xweibo.com 不认）；裸链接自动补 https://（其他协议拒绝）；长度限制（域名 253/路径 1500/总长 1800）。
4. **REQ-026 v0.38 一次性全量切换**（2026-08-05 用户认可）。
5. **REQ-022 F1 三项拍板**（2026-08-05 用户拍板）：① 发布为作品门槛 = 订单状态 `delivered`；② 勾选 3 张完稿图 = 3 条独立作品（沿用 artworks 一行一图）；③ 「立即约稿」档位预选 = 从展品（客户端作品展示）点进去才带预选，其他路径不带（复用现有 v0.35 F4 预选机制，?sizeId=）。
6. **REQ-022 F2 工时 3.5 天接受**（2026-08-05 用户拍板）。
7. **F5 留言 = 主页留言板 guestbook**（2026-08-05 用户问清确认）；**未读/已读语义已拍板选 c（2026-08-05）：本期不做未读语义，三维筛选（画师/审核态/已回复）已够用，推迟**——安全范围筛选批 `5049aff` 已按此交付。
8. **执行角色会话由用户在外部窗口开启**（2026-08-05 下午起：可观察可叫停）；一号会话只做 master 门禁（审核+合并+状态记账），不再自拉子代理。（早期接力开工指令模板文件已随 docs 清理删除，模式已内化为本规则）
9. **AUTH_DEV_MODE 关闭时机 = A 测（首轮真实画师测试）启动时**（2026-08-05 用户拍板"随a测关闭"）。届时改 .env `AUTH_DEV_MODE=false` + 重建容器。⚠️ 前置条件：管理员 TOTP 绑定必须先完成（见下），否则关闭后无人能绑定。
10. **管理员 TOTP 绑定已完成（2026-08-05 一号服务器本机 bootstrap）**：REQ-027 CLI 只有 reset 无 bootstrap，管理员从未绑定 + 旧登录码已删 = cookie 过期后死锁。处置：备份 `data/commission.db.bak-pre-admin-bootstrap` → 生成密钥直写 DB（totp_verified=1）→ 二维码交用户扫码入验证器 App → 端到端实跑 `/api/auth/verify` 登录成功（200 + isAdmin:true + cookie 签发）。⚠️ 教训入账：TOTP 上线合入时就该强制完成管理员绑定（鸡蛋问题），已补 STATUS 流程；A 测关 AUTH_DEV_MODE 前管理员登录链路已无死锁风险。
11. **功能色保持 EP 出厂色不跟随主色（2026-08-06 用户拍板，边界 OD-05 补充 2026-08-06 四号落档）**：徽章绿"可约稿"/橙"已排满"等功能色沿用 EP 出厂值（theme.css:28-31 既有设计），不收进平台五色体系——功能色跨平台一致是惯例。**边界：此规则仅指客户端**（访客页面）；**画师后台不受此限**，纸墨盘国画语义色（artist-tokens.css：石绿=完成/藤黄=待确认/朱砂=逾期/危险，v0.38 拍板设计）维持现状，外部评审"收进 token 体系"建议继续打回。**后台藤黄警告色调深**：`--warning #A8790B → #966C0A`（白字对比度 3.89→6.28:1 达标，暗色 `#D9B36A` 保持）——同属后台轨，已拍板。
12. **页面级视觉改造（Landing 重写 / classic 重排）缓至 A 测后**（2026-08-06 用户拍板，认可一号"真实反馈优先于 AI 评审猜测"建议）：A 测前只做通病批（动画纪律/EP 蓝实测/404 过滤等属实小项）；Landing Hero+作品图、classic 布局重排等大改挂起，等真实画师反馈回来再定。
13. **四号模板体检批拍板**（2026-08-06 用户在四号会话拍板，四号落档）：① T1 三模板吸底 CTA 失效 = **修**（用户原话"怪不得我一直感觉少了"，独立小批最高优先）；② T8 封面不进画廊**维持** + **新规则封面上限 6 张**（第 7 张设封面应拦截提示）；③ T6 atelier 硬编码宋体 = **疑似漏网，修**（统一走 --font-display）；④ T9 无图 hero 占位 = **先不做**（等 A 测反馈）。

---
## 版本计划（用户拍板）

| 版本 | 内容 | 状态 |
|------|------|------|
| v0.35 | REQ-024 画风档位统一 | ✅ |
| v0.36 | 清账版 + 终验反馈六路修复 | ✅ 用户终验通过 |
| v0.37 | REQ-025 动态计价 + REQ-027 TOTP + 需求深聊批 | ✅ 收官 |
| v0.38 | 画师后台视觉重设计（纸墨颜料盘，一次性全量切换） | ✅ 合入 |
| v0.39 | REQ-022 F1+F2 前端批 + addons 清退 + A 测手册 + 打磨/安全加固批 | ✅ 收官 |

**v0.38 之后**（2026-08-06 核实刷新）：~~REQ-022 剩余链路~~ → **REQ-022 已全部实施**（F1/F2 v0.39 `e7d3c35`；F3 `3b1c609`/F4 `e4bdc4e`/F5 `b42a0fd` 更早合入，文档过时已修正）。**剩余仅部署项**：容器重建（master 领先容器一批安全改动）+ 环境批（Caddyfile/uploads 签名路径/compose 端口，待用户拍板）+ A 测启动时关 AUTH_DEV_MODE。再往后 = 真实画师反馈批次。
**候选池（REQ-031，2026-08-05 用户逐项拍板入池）**：A1 收入导出 CSV / A2 订单收据 / B1 完稿分享（搭 F2 前端批便车）/ C4 时区显示，P2。一号排期裁决：**A 测真实反馈优先于本清单**；B1 随 F2 前端批考虑；A1/A2/C4 等 A 测后视真实反馈立项（AI 模拟人格产出，未经真实验证）。REQ-032 画师协议 P3 占位备案。

---
## 各角色状态

| 角色 | 状态 |
|------|------|
| 二号 | ✅ 02C 导航动画 / 02D 动画增强 / 02F REQ-025 前端缺口 已合入 → 🔄 **02G REQ-036 批A 前端重构执行中（w29）** |
| 三号 | ✅ 03B lint 核验 / 03C CI+E2E / 03E 备份运维 已合入 → 🔄 **03F REQ-036 批B 后端执行中（w30）** |
| 四号 | ✅ 04B 后置 4 项 / REQ-036 详谈落档 已合入 → 🔄 **04C docs审核+部署须知执行中（w32）** |
| 五号 | ✅ 05D 巡检 / 05E 修复 / 05F LRU / 05G 拆分审计 / 05H 后端覆盖 / 05I 用户点名bug / 05J TOTP 已合入 → 🔄 **05K GC白名单+P2执行中（w31）** |

> ⚠️ 模型分工调整（2026-08-06 用户拍板）：执行角色窗口切便宜模型，一号保留高版本。派工一律写成"精确到行号+before/after代码"的施工图，便宜模型照抄执行，一号审核从严。
> ⚠️ 教训入账（v0.41）：①五号/二号多次"会话结束但分支无提交"（后台进程回收打断）——交付检查必须看分支真实提交；②patch 写 .json 带 BOM 致测试挂——patch 后验字节；③拆分批基于旧基线会丢其他批修复——合并前先 merge master。
> ⚠️ 教训入账（08-08~09）：④派工前必查 master 最新基线（05G 发现 QueueBoard/ManualOrder 已拆、05H 发现 REQ-035 状态行过时——STATUS 待办行过时致重复派工）；⑤外部报告逐条对照核实（05H 曾误报 REQ-025 状态行，02E 抓到负增项铁律违规）；⑥用户指示优先级高于文档（02G 未经确认就派——「再等等」被忽略，用户提醒后先验收再派）。

新开工角色需重新建 worktree（用 `git worktree add`，一号统一分配）。

---
## 已知遗留

| 项 | 归属 |
|----|------|
| addons 表处置 | ✅ **旧增项体系完全清退**：算价读路径（`1b8a375`）+ 前端清理（`13dd4e7`）+ 收尾批 schema 删除 + DROP 迁移 v43（`58d48c9`，备份 bak-pre-v43） |
| **埋点看板全链路联调** | ✅ **2026-08-07 一号容器内实测定论**：events 222 条真实数据，admin summary 200 + byName 完整；三态联动 PUT hidden→画师侧 mode=hidden/enabled=false/无数据→PUT on→恢复；画师 tracking/summary mode=on 返回数据；无 token 401。**契约正确，无需修**（此前"待联调"因二号交付时用 mock，现已在生产容器闭环） |
| **OrderDetail 拆分后续** | 五号拆分试水完成（1523→1311 行，PaymentPanel/GalleryPanel，0% 像素差异，全门禁绿）。**QueueBoard 1530 行 / ManualOrder 1497 行待派**（模式已验证，可派）。OrderDetail 死解构 3 个（currentStageIdx/nextStage/daysLeft，v0.40 遗留）建议下批随手清。（后续实际执行：三大组件已在 v73 全部拆完，本行仅留历史轨迹） |
| **五号 stash 事故披露（2026-08-07）** | 拆分过程中 `git stash pop` 误弹仓库遗留 stash（WIP on fix/client-frontend-0802，历史遗留），内容仅 package.json/lock 配置类，已 checkout 还原，OrderDetail.vue 未受影响；stash 条目已消耗不可恢复。教训：**操作 stash 前先 `git stash list` 确认无他人 stash**（worktree 与主仓共享 git 状态） |
| repowiki P2 | 四号核实：**认证系 14 篇抽样全部 TOTP 时代，0 🔴 严重过时**（派工假设被否定）。建议：P1 轻量修补 6 处 🟡（图例/文件名/措辞级）+ P2 改派**非认证主题抽样**（部署/CSP/Sentry 与近期改动相关，价值更高）。原交付报告已随 docs 清理删除；另 external-wiki 副本已于 2026-08-11 整体删除（过时且可再生） |
| lint 基线 warnings | ✅ **已销账（2026-08-12 v77 实测）**：server eslint+oxlint 与 web eslint 均 0 警 0 错（旧基线 server 6 / web 4 部分早前批次已清，本批实测确认归零） |
| 画师后台视觉投诉 | ✅ **已销账**（2026-08-07 一号核实 git 历史：`d49fe08` 用户 08-06 已拍板取消视觉巡检批，投诉截图已作废删除 `e97467c`）。STATUS 旧记录滞后，现更正为「已取消」 |
| 安全加固（五号核实报告） | ✅ F1 totp_secret 泄露全堵（`ee0f68a`，4 读 + 4 写端点 DTO 投影 + 11 例回归）；F4/F6/F9/F3 同批合入。**F14 adminQq 用户拍板保留**（2026-08-05，查单页「联系管理员」自助通道，A 测后视反馈再议）；F2/F5/F7/F8/F10/F12/F13 = P1/P2 排期（F7 已知延后/F8 产品设计/F13 已缓解/F12 CI npm audit 可选） |
| 环境批 | ✅ **B1/B2 已完成**（`be60ef0`：Caddyfile encode zstd gzip + 静态缓存头 + uploads 公开/签名响应头区分）；**B3 compose 3000 端口已注释**（2026-08-07 用户选 B，随 v0.42 Step 8 重建生效，仅走 Caddy） |
| 前端优化方案（五号核实报告） | 第三方报告总体属实但 4 处事实错误：P2 候选入池——Serif 局部化（-5.5MB）/ i18n 懒加载（-60KB）/ 4 处 outline:none 补 focus-visible；**Step 3 砍 Serif bold 前提不成立**（Atelier 4 处显式 700，砍了会合成粗体失真）；reduced-motion 全局兜底 theme.css 已有（第三方建议重复实现） |
| 画师后台视觉投诉 | ✅ **已销账**（2026-08-07 一号核实 git 历史：`d49fe08` 用户 08-06 已拍板取消视觉巡检批，投诉截图已作废删除 `e97467c`）。STATUS 旧记录滞后，现更正为「已取消」 |
| 容器重建部署 | master 已领先容器（v42 迁移 + F1/F2 + workflow 事务 + 清扫批 + **安全加固批**：USER node/CSP/entrypoint）——A 测前置，重建前报用户确认 |
| 第三方报告核实修复项 | 已派：P0-1/P1-4 = 三号本批；4 低风险 = 五号本批；**待派**：P0-2 uploads attachment / P1-1 compose 3000（环境批）；P1-2 限流 LRU = 架构决策需拍板 |
| AUTH_DEV_MODE=false 关闭 | ✅ **已关闭**（2026-08-07 一号核实：`.env:13` 与容器 printenv 均为 false——A 测启动时已按拍板关闭，STATUS v22「保持开」记录过时已更正）。保持 false（更安全，F4 拦截 bind-init 明文回 TOTP 密钥） |
| 打磨批 D：约稿需求描述可空过 | ✅ 用户拍板 = **软提示**（2026-08-05），二号本批实施 |
| 画师使用说明书过时 | ✅ 已派四号更新批（worktree docs2） |
| 前端性能/工程改进池 | 五号两份核实报告提取（原文已消费删除）：Caddyfile 压缩+缓存头（生产配置，派工需用户确认）/ 巨型组件拆分（OrderDetail 1731 行等，结构性改造独立排期）/ manualChunks+visualizer / api TS 化 / SEO 预渲染评估 / 客户端交付页签名续期接入 / README L99/L100 过时 / main.js errorHandler 去动态 import / 字体 preload。优先级 P2-P3，A 测后排 |
| 本地产物清理 | 五号垃圾核实报告提取：playwright-report/test-results 可删（gitignored 可重建）；回收站 39 个 ≤16B 损坏占位走应用层清空。⚠️ 危险项已排除：宿主 DB 是 WAL 模式删不得 / 回收站 25 个真实文件是软删除保险 / data/ 备份是里程碑保险 |

---
## ⚠️ v38 迁移事故记录（长期教训）

迁移运行器把迁移包在事务里，`PRAGMA foreign_keys` 事务内是 no-op，DROP artists 触发子表 CASCADE。教训：**任何 DROP/RENAME 父表的迁移必须事务外执行并显式关 FK**（ADD COLUMN 事务内安全）。

---
## ⚠️ 视觉熵增教训（2026-08-06，用户自我怀疑"为什么顶级模型还出丑页面"，长期教训）

一次性生成的项目好看 = 默认审美红利 + 无历史包袱 + 优化目标就是"看起来厉害"；增量项目变丑 = 每批只看局部文件、无人对全局观感负责 + **视觉从未进验收门禁**（测试只测功能，一号审核只看 diff 不看截图）。教训：**视觉质量必须显式测量**——①视觉相关批次交付必附 before/after 截图，无截图不通过；②定期派"只读全局巡检"角色（四号模板体检批为首例）；③设计规范存在 ≠ 执行纪律，门禁必须验渲染结果。模型能力从未是瓶颈，流程没调用它的审美才是。

---
## ⚠️ F1 写路径回显事故记录（2026-08-05，长期教训）

安全加固批只堵了 4 个 GET 读端点的 totp_secret 泄露，漏了 `updateArtist()`/`createArtist()` 返回完整行、被 4 个写端点直接回显的同级泄露面（画师改自己资料响应即带出 TOTP 密钥）。缺口由用户直接指出，五号研判为真并修复（含追加排查出的 POST /api/admin/artists 第 4 处 + createArtist 未 await 的 Promise 回显隐患）。教训：**DTO/脱敏类加固必须同时审计「读路径 + 写路径回显」——写操作的响应体回显是与读端点同级的泄露面**；审核此类 PR 时 grep `return.*update|create` 逐条追响应壳。

---
## 🔒 身份自检（2026-08-05 身份混淆事故后新增，所有窗口强制）

- **任何窗口开工第一步**：先确认自己的角色身份（用户粘贴的指令开头/会话上下文），不确定就停下问用户，**不许猜**。
- **一号只有一个**：只有用户明确指定的「一号会话」能操作 master、合并分支、写 STATUS、派工。其他窗口即使自称/自认为是一号，一律按越权处理——发现后立即停手、报告用户、不做任何 git 操作。
- **外部执行窗口只做自己分支内的事**：cd 自己的 worktree → merge master → 读派工 → 干活 → commit 到自己分支 → 写交付报告。不碰 master、不推送、不合并、不改 STATUS、不给别人派工。
- **用户在每个窗口粘贴指令时必须带角色名**（「你是二号/三号/五号…」），指令缺失角色声明的，执行者先停下来问。


---
## 重要规则提醒

- 合并到 master 后**立即推送**；操作前 `git log --oneline -5` 确认 HEAD
- 禁止对 master `git reset --hard` / `git rebase`；禁止 `git add -A`
- 并行角色必须在独立 worktree（用完即删）；Docker 环境 SQLite 用 DELETE 模式
- **开工第一步 `git merge master` 再读派工文件**；交付合入前再 merge 一次重跑测试
- **一号 commit 前逐行核对 git status 暂存区**——防误带他角色改动（e04f2f5 事故教训）
- **前端校验只能是后端规则的子集**（v0.36 L3 教训）
- **派工前验证代码现状**（候选清单可能过时）；**需求稿未定稿的功能点不进开发派工**（D 路补漏批根因教训）
- **self-report 不可信**：角色声称完成必须实测验证（跑测试/读 diff/grep 关键改动/容器实跑）；新模型角色正确率未充分验证，审核从严
