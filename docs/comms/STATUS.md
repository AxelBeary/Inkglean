# 全局状态（一号维护，其他角色只读）

> 📚 **2026-08-14 拆分说明**：本文件只保留 v95 起的近期状态（接手所需全部信息在内）；v94 及更早历史整体搬至 `docs/comms/STATUS-archive-20260814.md`（原文一字未动）。再往后体积膨胀时按同法滚动归档。

> ✅ **最后更新：2026-08-15 v109：815 深度审计修复全量收口 + 拍板 12 项全部落地 + v1.0.0-beta.2 发版**
> ✅ **审计与修复总账**：815 两轮只读深度审计（P0=0/P1=12/P2P3≈88/拍板项 12，报告见用户桌面《拾绘项目深度审计报告》，一号抽查 8 项核实 7 属实 1 触发条件修正）。四批修复共销账约 40 项：第一批（P1-1 Passkey 重绑死锁/前端杂修 8 项/E8 毒杀凭证/备份前缀收紧 5 处）；第二批（文档 10 处失实修订/e2e 断言加固 6 项/运维配置 4 项/P1-2 待办清单工作流单/P1-4 v50 崩溃残留自愈/P1-9 setup.sh 建目录）；第三批（拍板 #2/#3/#5/#6/#7/#8/#10/#11/#12 + 交付幂等 + 迁移备份 VACUUM INTO 一致性快照）；第四批（拍板 #1 取消 5 秒撤销 + #4 交付文件一次性下载）。
> ✅ **拍板 12 项落地明细（用户亲裁，记录见 docs/comms/815审计拍板12项-转四号-20260815.md）**：#1 取消 5 秒撤销（迁移 v65 窗口表 + 队列延迟结算 + CancelUndoToast）；#2 金额上限统一 100 万；#3 安装口令升 128 位 + /setup?token 直达链接；#4 交付文件一次性下载（迁移 v66 + 画师再许可 + Range 拒绝 + 半途 3 次防护 + 60 秒下载器兜底 + 隐私政策披露 IP 收集）；#5 系统增项模板管理 + 冻结/同步开关；#6 向导完成后物理销毁（后端 410 + 前端 removeRoute，重置系统自动回归）；#7 封禁两步确认 + 解封入口；#8 公告到期日允许选今天；#9 Windows 备份链路进 OPS.md；#10 备份三档 daily7/deploy2/weekly4；#11 账号锁定 DoS 设计豁免落档；#12 生产弱会话密钥 fail-fast（本机 .env 已升强值，存量会话需重登一次）。
> ✅ **终态门禁（master 实测全绿）**：server **1491/1491** · web **545/545** · E2E **11/11** · tsc/vue-tsc/eslint/check-i18n 全过；基线 server 1462→1491（web 540→545）；迁移链 v64→v66；分支/worktree 已清零（仅 master）。
> 🔑 **新会话接手指南**：无在途施工。**下一轮待办**：①v1.0.0-beta.2 部署到生产（post-merge-deploy，迁移回读应见 v66）②用户终验新功能（取消撤销/一次性下载/模板管理/封禁解封）③**审计剩余账（如实）**：P1 剩 5 项（P1-3 乐观锁前端接线/P1-5 向导防爆破/P1-7 Sentry 配置/P1-8 双库分裂/P1-10 e2e 两链补齐）+ P2/P3 剩约 45~50 项（三域消毒/N+1 性能/注释漂移等）④桌面端 HOLD。master HEAD 见 git log。

> ✅ **最后更新：2026-08-15 v108：一键安装脚本全家桶交付 + better-sqlite3 升 v12 + v1.0.0-beta.1 发版上 GitHub + 贡献/安全规则体系落地，B 测就绪**
> ✅ **一键安装全家桶（用户亲测验收）**：install.mjs（Win/Linux/macOS 通用，原生/Docker 双模式，Node 22~26 检测，超限查编译工具并自动开下载页）+ install.bat（双击安装）+ 启动网站.bat（日常启动，--start 模式）+ setup.sh 重写为裸 Linux Docker 兜底 + 安装口令 SETUP_TOKEN 自动生成打印（REQ-038 回归修复）。**小白角色扮演全流程实测**（Win10 干净虚机）抓修七坑：bat 中文须 GBK（UTF-8 致 CMD 解析截断）/ nodejs.org 改版默认 Docker 误导（改自动开下载页指明按钮）/ Node 24 无预编译撞 node-gyp（v12 根治+版本墙）/ 防火墙弹窗致体检超时误判（120s+预告+超时提示）/ Docker bind mount root 属主（compose up 前自建目录）/ bat 被单独拷出（完整性检查）/ spawn cwd 小写盘符致 vite html-proxy 失配（盘符大写化）。Ubuntu 裸机 Docker 分支实测全绿。
> ✅ **better-sqlite3 11→12.11.1**：预编译覆盖 Node 22~26，普通电脑免编译工具安装；worktree 隔离验证+主仓复跑双绿（116 文件/1462 测试）；accept 全绿（1462+540+11）；post-merge-deploy 生产重建全绿（备份 VERIFY/迁移回读 v64/冒烟 5 PASS）。
> ✅ **v1.0.0-beta.1 发版**：tag + gh release（预发布标记，人话版发版说明）+ 附件 inkglean-installer-v1.0.0-b1.zip（622 文件完整安装包，中文名用 .NET 打包避 tar 乱码）。发布前 L3 安全扫描开关未启用，按规程静默放行。
> ✅ **贡献与安全规则体系**：CONTRIBUTING.md（报 bug/贡献流程/门禁/AGPL 声明）+ Issue 表单模板（问题反馈/功能建议）+ PR 模板 + 标签（待确认/待讨论）；SECURITY.md（私密漏洞报告通道/漏洞范围/坦白版无时限承诺）；用户已在 GitHub 启用 Private Vulnerability Reporting；README 互链。
> ✅ **CodeQL 处置**：查实仓库早有 CodeQL 默认配置（无文件模式，已跑 240 轮）——误加的文件配置版已删（00123d4d），保留默认配置周扫；其余 76+ 工作流模板全部裁决不开（账号类/语言不符/功能重复）；Dependabot alerts 建议开启（待用户确认）。
> ⚠️ **编码事故实录（已恢复，教训在案）**：误判 changelog.md 为 GBK 实为 UTF-8，读写往返损坏全文；未推送前从 git 对象（blob 9cba9e69）按字节还原重做，远端零污染。教训：改中文文档前必须用证据确认编码（U+FFFD 计数），目测乱码必误判。
> 🔑 **新会话接手指南**：无在途施工。**下一轮待办**：①用户海外服务器安装实测（node install.mjs 或 bash setup.sh，装完记安装口令）→ B 测开启②Dependabot alerts 开启待用户确认（Settings → Security）③v107 遗留三小尾巴（E2 月度额度轴/E1 摘要浮层画风字段/E5 深夜档文案验收）④E15 举报证据抽屉（1.0 后排期）⑤桌面端 HOLD（v1.0 稳定后再评估）。master HEAD 00123d4d。

> ✅ **最后更新：2026-08-14 v107：E 清单 8 项全部完工——波 2/3/4 三路并行派工合入，迁移 v64 进生产，1.0 开发侧清零**
> ✅ **三路派工实录（worktree 隔离+领地互斥，逐路门禁复验非 self-report）**：波2（E2/E10/E13）挂牌满态不开第三面牌（名额满时开稿面显「满」藤黄点缀，isFull 口径）+ 订单时间线纸墨化（shared OrderTimeline，TrackOrder 同步受益）+ 下单摘要卡补档位描述/工期/示意图；波3（E1/E3）卷轴纸签点击弹订单摘要浮层（Esc/点外关闭、键盘可达、画风字段接口缺失不硬凑）+ 账本待办动词接真实节点（todo 接口只增 stageName，缺字段降级回「完成」）；波4（E5）迁移 v64：greeting_special_days 表 + greeting_templates 重建补 latenight CHECK/special_day_id 级联；抽取链=特别日→深夜池(23~05)→时段池→any；管理端特别日 CRUD + 前端管理区块。新增测试 34（server）+ 30（web）。
> ✅ **合入验收（一号合并态全量复跑）**：三波 merge 零冲突；server **1462/1462** · web **540/540** · E2E **11/11** · lint/tsc/check-i18n/build 全过；基线 1428→1462 / 510→540。
> ✅ **部署+冒烟**：容器重建 Healthy，**迁移回读 v64**（生产库已升级，部署前备份 VERIFY_OK）；冒烟实证（截图 workspace/temp/wave-234-smoke/）：账本动词「推进·定稿」真容、订单详情竖向流程追踪 1/7、客户端主页/下单页/登录页正常。
> ⚠️ **三个已知小尾巴（不阻塞，后续按需立小项）**：①E2 满态只覆盖席位满口径，月度额度耗尽轴仪表盘无数据源（需后端 profile 补字段）；②E1 摘要浮层无画风/档位（schedule 接口缺字段，只增模式可补）；③E5 latenight 档标签文案「午夜/Midnight」待用户验收偏好。另：E5 特别日命中依赖 TZ=Asia/Shanghai 铁律（容器已设）。
> 🔑 **新会话接手指南**：无在途施工。**1.0 开发侧全部清零**，剩余纯人工项：①用户终验 https://localhost（含本轮新功能：筛选记忆/管理搜索/卷轴浮层/待办动词/满态牌/时间线/摘要图/特别日管理）②部署搬家（海外服务器+域名，代码侧全就绪）③E15 举报证据抽屉（1.0 后排期）。

> ✅ **最后更新：2026-08-14 v106：E 清单拍板定案 + 波 1（E9+E14）合入烘焙——问候动画经抽卡对比后保持现状不动**
> 📋 **E1-E15 终裁（用户亲裁，落档 docs/comms/E清单拍板-20260814.md）**：做 8 项（E1 卷轴浮层/E2 双面牌满态/E3 节点动词/E5 深夜池+特别日池/E9 筛选记忆/E10 墨线时间轴/E13 摘要示意图/E14 管理搜索）；E2 设计改：不做第三面牌，名额满时开稿面直接显「满」；E5 扩为可配置特别日池（日期+范围全平台/指定画师+文案组）；E8 查实已存在销账；E4/E6/E7/E11/E12 不做；E15 延后。**问候动画升级**：三方向原型（墨滴/笔顺/火漆）被否 → 用户持提示词外部大量抽卡 → 结论「现有逐字洇墨最简单最好」，**保持现状关闭**。
> ✅ **波 1 合入（bb9b72b3）**：E9 订单筛选记忆（状态筛选存 localStorage 回来不重置，URL ?status= 优先并回写，白名单校验脏值）+ E14 画师管理搜索+状态筛选（昵称/子域名/QQ/简介模糊+状态下拉，客户端过滤不动后端契约）。测试 +10（web 510/510）；浏览器预验双 PASS（截图 workspace/temp/wave1-smoke/，抓修两处冒烟环境问题：管理会话需 admin_verified 级 token + admin_qq 配置，均非产品 bug）。
> ✅ **门禁+部署**：accept 全绿（server 1428 / web 510 / E2E 11）；基线 web 500→510；容器已重建烘焙（Healthy/v63/冒烟 PASS×5 零 WARN）。
> 🔜 **下一步（波次已在拍板记录）**：波 2=E2+E10+E13（纯前端 M）→ 波 3=E1+E3（E3 含后端 todo 接口补节点字段）→ 波 4=E5（L≈2 天）。新会话读本条+拍板记录即可接手工。

> ✅ **最后更新：2026-08-14 v105：竖屏（手机竖着用）实测完成——结论「现状已可用，无需专项改造」；顺手抓修一个真 bug（客户主页空态与正文同显）**
> ✅ **竖屏实测（375×812 九帧，画师高频路径+客户端全走，截图 workspace/temp/i3-mobile-v104/）**：登录/仪表盘/订单列表/手动录单/排期看板/设置/客户主页/下单页/查单页全部单列自适应无溢出，触控目标够大。「竖屏响应式」挂起项结论：**不需要专项改造，关闭**。
> 🔴 **实测抓修真 bug（提交 98d904b0）**：客户主页「画师不存在或加载失败」空态与正文模板同时渲染——波 M 分块占位的独立 v-if 打断了 v-else-if 链，空态条件只剩 !loading；异步模板组件晚挂载时空态未退场。修复：空态补全「无画师且非隐藏」限定。DOM 快照实证修复后正文完整、空态消失。另一处疑点（手动录单 400）查实为截图脚本旧路由（/orders/manual 已被 REQ-015 改 /orders/new），非 bug。
> ✅ **门禁+部署**：accept 全绿（server 1428 / web 500 / E2E 11）；容器已重建烘焙（Healthy/v63/冒烟 PASS×5 零 WARN）。master 98d904b0 已推。
> 🔜 **下一步**：E1-E15 体验增量清单等用户拍板（清单 docs/comms/1.0体验增量探索清单-待拍板-20260813.md；建议 1.0 携带 P1 六项 E1/E2/E3/E7/E8/E14）。

> ✅ **最后更新：2026-08-14 v104：CodeQL sanitize 根治轮（方案 B）完工——正则清洗整体换 DOMPurify 真引擎，code-scanning 开放告警清零（含 #21/22/23 重扫自动销账）**
> ✅ **施工实录（新会话接手 v103 后单轮完成）**：①冒烟实证 isomorphic-dompurify 在 server 环境可用（上次转义失败的冒烟补跑成功）②**施工中新发现并处置一个拍板未覆盖的风险**：白名单序列化会把纯文本「价格<100」变成「价格&lt;100」，经 {{ }} 插值双重转义直接显示实体——而 5 个调用方里只有须知 rules 走 v-html 富文本，留言/昵称/bio/公告/节点/话术/作品标题描述全是 {{ }} 插值纯文本。处置（方案 B 内的分档细化，未偏离拍板方向）：拆双通道——`sanitizeStoredHtml`（新）=富文本白名单重建，完全镜像前端 web/src/utils/sanitize.js（ALLOWED_TAGS/ATTR + ALLOW_DATA_ATTR:false + 链接 _blank/noopener 钩子），仅 rules 挂此档；`sanitizeStoredText`=纯文本零标签提取（ALLOWED_TAGS 空集消毒后取 textContent），script/style 连内容整体移除，& < > 零实体化零误伤（实测「R&D」「价格<100」「<3 小明」原样保留）。五号两风险点均实测过关：div/table 不误删（jsdom 规范化补 tbody 属正常）；已入库富文本渲染输出语义不变（渲染层本就 sanitizeHtml 同口径）。③测试重写 audit-batch-f-sanitize 23 例双通道契约（TC-F5-R1~R6 富文本档 + TC-F5-24 纯文本零误伤防再犯）+ TC-ANN-03b 断言适配。提交 3c0e92e7。
> ✅ **终态门禁（accept 流水线全绿）**：server **1428/1428**（115 文件，不减）· web **500/500** · E2E **11/11** · typecheck/lint/check-i18n/build 全过。
> ✅ **容器已重建烘焙**：post-merge-deploy 全绿（Healthy/迁移回读 v63/冒烟 PASS×5 零 WARN），生产已跑 DOMPurify 引擎。
> 🧊 **环境**：master 3c0e92e7 已推；CodeQL 重扫 success，`gh api code-scanning/alerts?state=open` 返回**空**——sanitize 同源 #21/22/23 自动销账；#11（SPA 限流设计豁免）已确认 dismissed/won't fix（驳回理由与我们拟好口径一致）。**至此安全线全清：CodeQL 开放告警 0 + Dependabot 0 + 真漏洞清零**。CI/E2E 本轮全绿。遗留人工项仅剩：P2「转 1.0 后」结构项在报告 + 等用户终验 https://localhost。
> 🔑 **新会话接手指南**：读本文件（v95 起）即可接手，无在途施工；更早历史见 STATUS-archive-20260814.md。下一轮可做：v100 遗留三项人工拍板项（部署搬家/竖屏响应式/E1-E15 体验增量清单）——均在等操作人拍板，无拍板前无在途施工项。

> 🔴 **最后更新：2026-08-14 v103（开工前存档）：CodeQL sanitize 根治轮（方案 B）进行中——isomorphic-dompurify 已装，sanitize.ts 重写未开始**
> 📋 **一号拍板（五号转交件裁决）**：①B 为主方案采纳（服务端换 isomorphic-dompurify，与前端同引擎白名单重建，mutation XSS 从原理消失，CodeQL 不触发）；A（手动扫描替代）不做（warning 不阻断，做 A 等于重写两遍测试零收益）②单一专注轮立即执行③白名单一号定：完全镜像前端 web/src/utils/sanitize.js（ALLOWED_TAGS/ALLOWED_ATTR/ALLOW_DATA_ATTR:false+链接 _blank noopener 钩子），单一事实源两层同口径。
> 📦 **已装依赖**：server/package.json + isomorphic-dompurify@^3.22.0（含 jsdom，37 包）——已提交防断档。**下一步**：重写 sanitizeStoredText 为 DOMPurify → 重写 audit-batch-f-sanitize.test.js 21 例 → server 全门禁 → 推送等 CodeQL 重扫确认 #21/22/23 清零。
> ⚠️ **风险点（五号提醒，施工时验证）**：白名单需实测防误删 div/table；已入库富文本经 DOMPurify 规范化后渲染输出可能变化（需冒烟对比）。
> 🧊 **环境**：master **cdf6a4df** 已推（含 isomorphic-dompurify 依赖 + 本存档）；CodeQL open 4 条（#21/22/23 sanitize 同源误报待 B 根治、#11 SPA 限流设计豁免待驳回）。
> 🔑 **新会话接手指南（断档恢复）**：读本文件 v103 即可接手。当前进度：方案 B 已拍板+依赖已装，**下一步从「重写 server/src/shared/sanitize.ts 的 sanitizeStoredText 为 isomorphic-dompurify」开始**（白名单镜像 web/src/utils/sanitize.js）→ 重写 server/tests/audit-batch-f-sanitize.test.js 21 例 → server 全门禁（目标 1428 不减）→ 推送等 CodeQL 重扫确认 #21/22/23 清零。施工前先 `node -e "import('isomorphic-dompurify').then(...)"` 冒烟验证引擎在 server 环境可用（上次冒烟因 shell 转义失败未跑成，需重跑）。

> ✅ **最后更新：2026-08-14 v102：CodeQL #21 sanitize 孤立开始标签修复合入——一号独立复跑 server 1428/1428 全绿**
> ✅ **CodeQL #21 修复（五号施工，一号独立复跑验证）**：sanitize 补删孤立开始/结束标签，堵嵌套删除拼出的无闭合 `<script>`（`<scr<script></script>ipt>` 拼出无闭合、`<script>alert(1)` 无闭合残留，比成对标签更危险，浏览器会拿后续内容当脚本直到文档尾）。新增 TC-F5-22/23。分支 fix/codeql21-lone-opentag @ 2314b03b，合入 293e8569。**一号独立复跑：server 1428/1428 全绿 + tsc 0，sanitize 23/23，与五号声明一致**。交付文档 docs/comms/CodeQL21修复-交付-20260814.md。基线 server 1426→1428。
> ✅ **CodeQL 告警处置进度**：#18/#19（结束标签绕过）已修自动销账；#21（孤立开始标签）已修待重扫销账；余 #11（SPA 静态限流设计豁免）待驳回。真漏洞已清零。

> ✅ **最后更新：2026-08-14 v100：1.0 收尾四项全绿——M4 支付文案/I5 恢复演练/I6 技术债/I3 移动端实测，隐患清零**
> ✅ **M4 支付形态文案核对（通过，无需改）**：全量扫描下单/约稿/收据/追踪文案，危险误导词（立即支付/去支付/支付宝/微信支付等）零命中；「确认下单」非支付用语；连接免责「所有后续沟通、支付与交付均在平台外进行」+已收款取消「线下退还」提示齐备。
> ✅ **I5 备份恢复演练（成功，副本演练不动生产库）**：verify-backup VERIFY_OK（integrity=ok/FK 违规=0）→ restore-db RESTORE_OK（旧库安全挪为 .bak-pre-restore）→ 产物核对无误；全链路真跑一遍，生产库零触碰。
> ✅ **I6 技术债收尾核销（五项全在）**：状态机统一断言 9 处/幂等键前端 useOrderForm 发 idempotency-key+后端 v54+readIdempotencyKey/yuanToCents 收口 20 处/会话强校验 verifySession 8 处；811 实施+围剿加固，无回归无缺口。
> ✅ **I3 移动端 375px 实测（REQ-043 I3 补做，截图真落盘 workspace/temp/i3-mobile/ 9 帧）**：画师高频路径（登录/仪表盘/订单/录单/看板/设置）+客户端（主页/下单/追踪）逐页核查；**抓修真 bug 已修**：账本待办标签经 tagKey 映射（后端回中文标签，此前直怼 i18n 键渲染成原始键名 dashboard_tag_新单，d89da1ea）；其余错误态均为冒烟库少数据的正常三态呈现，布局无溢出。
> ✅ **终态门禁**：server **1426/1426** · web **500/500**（vue-tsc/eslint/check-i18n/build 全过）· E2E **11/11**；master d6c18d9f 已推；容器已含 P2 全量。
> ✅ **CodeQL #18/#19 sanitize 结束标签绕过修复（收尾盘点抓回的漏收项）**：w-sanitize-codeql worktree 里有未提交的修复（结束标签放宽为 \b[^>]*>，堵 `</script foo=bar>`/`</script/foo>` 浏览器容错闭合绕过），验证 21/21 已合入推送 d6c18d9f，下次 CodeQL 扫描自动销账。基线 server 1424→1426。
> ⏳ **遗留待办（均为人工拍板/操作项，非代码隐患）**：①code-scanning 剩 5 条设计/开发脚本告警（#9/10/11 限流设计、#12/#20 开发脚本）驳回需 token security_events 授权或 Web UI 逐条 dismiss，理由已拟好；#18/#19 已真修待扫描自动销②P2 各波「转 1.0 后」结构项在报告③等用户终验 https://localhost。

> ✅ **最后更新：2026-08-14 v99：P2 围剿五波全部合入收官——P0/P1/P2 隐患逐路核销完毕，终态门禁 server 1424 / web 500 / E2E 11**
> ✅ **P2 五波合入（逐波一号独立复跑门禁，非 self-report）**：P2-E 部署链路（683b7181）· P2-C 后端（a490e92f，server 1424）· P2-A 画师域+共享层（1203753f，Watermark 微任务时序回归一号抓修：三元短路）· P2-D i18n（f2760e84，check-i18n 加固+baseline 核减审计通过）· P2-B 客户端+管理后台+共享（cbcb6bd7，web 500）。逐条裁决制（修/不修+理由，清单是 813 快照严禁硬修）+连环风险自检在各位交付报告。
> ✅ **一号验收抓修三处（用户红线「不引发连环 bug」落地）**：①P2-C F-10 上传用例适配真实 PNG 魔数（上传魔数校验是真加固，旧测试传假内容被拦属预期）②P2-A Watermark 微任务时序回归（loadLogoForRender 的 await 破坏竞态测试同步假设，改三元短路，文本路径时序对齐 master）③P2-B DOMPurify×happy-dom 兼容缺口实证（isSupported=true 但 onerror 拦不住，FORBID_ATTR/ALLOWED_ATTR 均无效，真实浏览器无此问题）→安全契约测试切 jsdom 环境真实验证（新增 devDep jsdom）。
> ✅ **jsdom junction 坑（教训在案）**：worktree 的 node_modules junction 会被 npm install 替换成真实目录——jsdom 只落在 p2b worktree，主仓补装后 master 500/500；后续派工若需装新包，一律在主仓装。
> ✅ **终态门禁（master 合入态实测）**：server **1424/1424**（115 文件）· web **500/500**（73 文件，vue-tsc/eslint/check-i18n/build 全过）· E2E **11/11**；基线已同步（server 1403→1424 / web 496→500）。
> ⏳ **遗留待办**：①code-scanning 5 条设计告警驳回需 token security_events 授权（gh auth refresh -s security_events 完成浏览器确认，或 Web UI 逐条 dismiss，驳回理由已拟好在案）②P2 各波裁决为「转 1.0 后」的结构项（b2 模板大拆分/b3 长文件拆分等）已在各位报告列明。
> 🧊 **环境**：master 7be8786e 已推（含 P2 全量）；容器已重建 Healthy（v63 回读+冒烟 PASS×5 零 WARN；首次构建挂在 better-sqlite3 预编译下载超时，重试成功，网络抖动实锤）；accept 报告 accept-master-20260814-112159.md 全绿；worktree/历史分支已清（仅留 master+backup）。

> 🔴 **最后更新：2026-08-14 v98.1（会话刷新快照）：P2 五波收割 4/5 已合入，仅剩 P2-B 待验收**
> ✅ **已合入（均一号独立复跑门禁全绿）**：P2-E 部署链路加固（683b7181，CI docker build 门禁/accept 联动/失败告警/日志轮转/uploads 恢复）· P2-C 后端清扫（a490e92f，上传魔数校验等，server 1424/1424，含一号适配 F-10 测试真实 PNG）· P2-A 画师域+共享层（1203753f，web 496/496，含一号抓修 Watermark 微任务时序回归：loadLogoForRender 的 await 破坏竞态测试同步假设，改三元短路修复）· P2-D i18n（f2760e84，check-i18n 加固+baseline 核减审计通过，web 496/496）。以上均已推 origin（AxelBeary/Inkglean）。
> ⏳ **在途：P2-B（worktree 813-hunt-p2b，未提交）**：门禁 vue-tsc/eslint 已过，73 文件中 1 例失败：SanitizedRichText.contract.test.js 断言 sanitizeHtml 拦 script 失败——**疑似 DOMPurify 在 happy-dom 下不工作（isSupported 探针文件已删，待重验）**；若实证为环境限制，裁决方向：测试内 vi.mock('dompurify') 换真实行为的最小忠实 fake 或改断言策略，不得削弱契约语义。合入前还欠：master locales 补 p2b 所需三键（admin.platform.empty/admin.greetingEmpty/admin.greetingDeleteConfirm，代码已引用）→ 合入 → 全门禁+E2E → 容器重建 → 冒烟。
> ⏳ **其他待办**：①code-scanning 5 条设计告警驳回仍需 token security_events 授权（用户称 cmd 已验证但实测 scope 未变，需重跑 gh auth refresh -s security_events 完成浏览器确认，或 Web UI 逐条 dismiss，理由已拟好）②P2 全绿后给用户的收官汇报（含 P2 裁决明细）。
> 🧊 **环境**：master=f2760e84 已推；worktree 存 813-hunt-p2b（在途）+813-hunt-p2a/c/d/e（已合入待清）；容器未含 P2 波（合完后重建）。

> 🔴 **最后更新：2026-08-14 v98：P2 约 240 条五波并行清扫在途（用户拍板：P2 也派掉，红线=不引发连环 bug/不新增连环屎山）**
> 📦 **五波分工（worktree 隔离，领地互斥）**：P2-A 画师域前端+共享逻辑层（813-hunt-p2a，a1/a3/b1/b5 P2+v3 web 注释）· P2-B 客户端+管理后台+共享组件+c1 纵深（813-hunt-p2b）· P2-C 后端域+v3 server 注释（813-hunt-p2c）· P2-D i18n 死键/文案/check-i18n 加固（813-hunt-p2d，与 T2 已清 37 键去重纪律在单）· P2-E 部署链路遗留（813-hunt-p2e）。任务源清单 workspace/temp/p2-src-*.md（自动抽取）+任务书 hunt-p2{a..e}-task.md。
> 📋 **施工纪律（入任务书）**：逐条裁决（修/不修+理由，清单是 813 快照严禁硬修）；防连环 bug（改前 grep 全调用方/不改契约/每条跑相关测试）；防连环屎山（禁 any/ts-ignore/新 disable/>300 行/第三份复制）；locales 由 D 波统一管闸（A/B 波新键需求走「待 D 波键清单」）；一号合入时全门禁复跑+连环风险抽查。
> ⏳ **待办**：五波收割验收合入 → 全门禁终验 → E2E → 容器重建 → 冒烟。另：code-scanning 5 条设计告警驳回仍需 token 补 security_events 授权（gh auth refresh -s security_events，上次刷新未生效，scope 仍缺）。

> 最后更新：2026-08-14 v97：**CI 报错修复+仓库改名 Inkglean+仓库整理收官**
> ✅ **CI 报错根治（d2-3 加固连带适配）**：compliance/invite 测试会话升级 admin_verified（新 step-up 姿态下旧 basic 会话必 401，测试适配非回退安全）；本地此前门禁提取脚本吞了失败行导致漏检，CI 抓住——教训：门禁提取必须显式报 failed 行，已改用去 ANSI 全行提取。v-html 告警清零（SettingsShowcaseTab 改走 SanitizedRichText）。CI/E2E/CodeQL 三 job 全绿。
> ✅ **CodeQL 加固**：sanitizeStoredText 全链路不动点循环（堵 javajavascript: 嵌套还原单次替换绕过）+TC-F5-13/14/15；server 1406/1406。code-scanning 剩余告警处置：dismiss 需 token 补 security_events 授权（gh auth refresh -s security_events 后重试，或 Web UI 逐条驳回，驳回理由已逐条拟好存对话记录）。
> ✅ **仓库改名+整理（用户拍板）**：GitHub 仓库 Brushline-HuiYue → **AxelBeary/Inkglean**（旧地址自动重定向，本地 remote 已同步）；仓库描述改品牌名；入库垃圾核查：859 跟踪文件零二进制垃圾、零敏感信息（.env 从未入库，密钥扫描净），.workbuddy 通道日志移出跟踪，workspace/（施工台）入 ignore，dockerignore 补 workspace/.workbuddy/.qoder。备注：docs/soul（201 文件内部知识库）在库属有意保留，若不想公开可后续拍板移出。

> 最后更新：2026-08-14 v96：**围剿漏网清零——复盘审计又抓 7 条 P1 全修（a2×3/d2×3/t1×1）+v49 迁移欠账补上；终态门禁 server 1403 / web 496 / E2E 11**
> ✅ **漏网复盘（收官后自审，不信「已全清」自报）**：对照 17 路猎杀报告逐路核销，抓出未进任何波次的 7 条 P1，逐条核实后亲修：
> ① a2-1 query 预选命中后刷新草稿增项全丢→增项/用途/加急恢复独立于尺寸块；② a2-2 草稿只防 JSON.parse 不防字段形状（非字符串致 .trim() 崩）→类型守卫；③ a2-3 QQ 协议跳转 _self 劫持当前页成死页→改新窗口+兜底提示键；④ d2-1 问候语全局 PUT 缺 artist_id IS NULL 归属校验（可越权改写画师专属模板）→对齐 DELETE 补校验；⑤ d2-2 埋点 token:IP 双因子配额可被跨分钟囤积 token 绕过→叠加纯 IP 总量闸 300/分钟；⑥ d2-3 compliance/invite 两插件漏挂 registerAdminStepUpHooks（运行时实证 basic 会话直取 200）→补挂，复验 401 STEP_UP_REQUIRED；⑦ t1 收入概览只统散单而 CSV 合并两源对不上账→改消费 income-summary 三格（订单/散单/总）。另补 v49 迁移 DROP-RENAME 崩溃恢复（v50 同款；v38 因单事务包裹无窗口，裁决在案）。防再犯：TC-D2-STEPUP/TC-D2-GREET。
> ✅ **终态门禁**：server **1403/1403** · web **496/496**（vue-tsc/eslint/check-i18n/build 全过）· E2E **11/11**；基线已同步；至此 P0/P1 隐患逐路核销完毕（P2 ~180 条按纪律只报不修，清单在各 hunt 报告尾部）。

> 最后更新：2026-08-14 v95：**1.0 围剿收官——隐患全清（P0/P1 全修+GitHub 安全告警清零）；终态门禁 server 1401 / web 496 / E2E 11；master 已推**
> ✅ **围剿七波全部合入（逐波一号独立复跑门禁，非 self-report）**：①d1-P2 后端加固（TOTP 计数原子/重绑限流+重放/退款原子/终态收款守卫/交付文件存在性/备注事务，含一号补两处旧用例漏账）②a1 竞态+b5 键盘可达性（15 处 seq 守卫+P0/P1 a11y，新增 11 防再犯测试，其中 4 件返工后归零）③P1-A 前端汇总（b1×22+b4×14，todayStr/passkeyCreateFlow/slideConfirm/pageCard 单源化+魔数常量+CSS token 化+i18n 键化，check-i18n 豁免 9→4；一号验收补 6 处测试侧）④P1-B（b2×3 四模板重复收敛 TplPricingSection/TplShowcase/TplGuestbook theme+b3×7 管理后台三态/确认/390px，返工单修 16 例 i18n mock）⑤d1-F5/F7（orders 全写路径 version 链连通+发布作品幂等 v62 部分唯一索引）⑥V1 部署链路 P0 加固（备份 VERIFY/迁移回读 fail-fast/冒烟清单制/prev tag+rollback.ps1/setup.sh 超时不假成功/发布前置门禁；沙箱拒写两文件一号补落）⑦V3 注释×3+文案 P1×16。
> ✅ **d1-F1 客户侧弱双因子根治（用户拍板：最安全+客户最方便，无存量包袱）**：客户访问令牌化——下单发高熵令牌（哈希入库，明文仅一次下发）、track/delivery/lookup 凭令牌常量时间校验（错误同形 404）、my 端点退役 410、画师端重新生成令牌补发、迁移 v63；客户端成功页链接+复制+二维码、TrackOrder 链接直达+本地清单、画师订单详情补发按钮；E2E 适配（订单号 CODE-xxx 保留人类友好，安全由令牌承担——裁决在案）。
> ✅ **GitHub 安全清零**：Dependabot 3 PR 合入（dompurify 3.4.13 富文本消毒防线/fast-uri 3.1.5 GHSA-7p8r-x3mc-p8w7/brace-expansion 5.0.9）+ nanoid 3.3.18 overrides（GHSA-2v37-7h3g-55p8，vite→postcss 传递依赖）；open alerts 4→0，PR 自动关闭。**遗留备忘：仓库名仍为 Brushline-HuiYue（旧品牌），是否改名待用户拍板**。
> ✅ **终态门禁（master 实测）**：server **1401/1401**（114 文件）· web **496/496**（72 文件）· E2E **11/11**（18.8s，两处 strict 适配：e2 锚 my-order-no/e5 限 el-button）· lint 0 错 · check-i18n（豁免 4）· build 0；accept-baseline.json 已同步（1369→1401 / 436→496）。
> 📋 **P2 汇总（~180 条，按纪律不修只报）**：原始清单在 workspace/temp/hunt-{a1,a2,a3,b1,b2,b3,b4,b5,c1,d1,d2,d3,t1,t2,v1,v2,v3}-codex.log 各报告尾部，1.0 后按需排期。
> ✅ **容器重建（V1 新脚本首实战，抓修两处后全绿）**：post-merge-deploy exit=0——前置门禁（master/干净/SHA 落 deploy.log）+备份 VERIFY_OK+构建 Healthy+迁移回读 **v63=预期**（F1 令牌化进生产）+冒烟清单 PASS×4/WARN×1（公开画师主页探测口径小瑕，不阻断，待后续打磨）。**首实战抓修两处（均入 commit）**：①daily-backup.bat 头注释 UTF-8 中文在 GBK 码页碎行致备份链中断→改 ASCII；②if 块内 echo 文本含 `(>=22.6)` 括号被 cmd 当块结束符→改文案。教训：Windows bat 必须 ASCII-only+块内 echo 禁括号。
> 🧊 **环境**：master 干净已推；worktree 待清（813-hunt-* 五路+813-fq-* 四路历史）；容器 Healthy（v63/含 F1 令牌化+依赖安全升级）。

