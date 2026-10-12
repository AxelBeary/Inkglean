# 变更日志

> **本文件维护纪律（2026-09-27 拍板，A+B+D 批）**
> - 定位：本文件是**工程台账**；对外发布叙事（安装包用户读的版本说明）= GitHub Releases（正文自顶部条目摘编，防双写漂移以本文件为事实源）。
> - 写入：新条目**顶部插入**（H1/声明块之下、上一版 H2 之上），按日期倒序；不删历史，只标注。
> - 滚动分册：活档体积门 `scripts/check-changelog-size.mjs`（≤40KB / ≤450 行，单段 ≤4KB，accept 第 19 道）；撞线即搬 oldest 段入 `docs/changelog-archive/` 新卷（整段零改动 + 逐行哈希校验，禁调高阈值续命）。
> - v0.x 时代（v0.1~v0.46+）全量台账在 `docs/changelog-archive/changelog-v0-20260927.md`，只读历史。

## 依赖警报根治批·第三笔：代推上云 + 推送后新暴露的 CodeQL #32 真修（2026-10-12，安全报警处置）

- 经用户授权代推 `5fbc3e04..cc4a607e`（12 笔）。云端对 `cc4a607e`：CI 四 job、E2E、CodeQL 全 success；本批新增的 `.github/dependabot.yml` 已生效—作业名直接含五目录 `npm_and_yarn in /., /desktop, /server, /shared, /web`（以前只会出单目录 PR）；依赖图已刷新，SBOM 2087 包中 axios = 0。11 条 Dependabot 警报因自动关单作业时延仍标 open，不手动 dismiss，等自动转 fixed 后复核。
- 推送后 CodeQL 新报 #32（`js/incomplete-multi-character-sanitization`，`scripts/U44-scan-unflattened-styles.mjs:91`），落在本批刚补入库的工具铺脚本上。**先判真伪再动手**：实测构造 `'<sty<style>x</style>le>body{}</style>'`，单遍正则处理后仍残留 `'<style>body{}</style>'`，属真实重叠绕过而非误报。
- 修法（`b0072409`）：新增 `stripStyleBlocks()` 循环删除直到结果不再变化（不动点），替代单遍 `replace`；处理后残留检查 = false。行为零变化已量化：对 `web/src` 下 168 个真实 .vue 逐文件比对两种写法，结果不同的文件数 = 0；改后 U44 实跑 exit=0、扫 176 文件照常产出清单。不采借 dismiss 绕过扫描报警。
- 同批前置：本笔顶插前活档已第二次撞 40KB 线（41152 B），按口径再次把最旧三段（2026-08-16~08-18）整搬新分册 `changelog-20260816-20260818-20261012.md`（`e2172d6b`，逐行哈希零丢失，脚本 exit=0）。

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

## 近期批次变更史摘要（2026-08-24 ~ 09-12，补登·深度待定）

> F-19 变更史补写：2026-08-24 起约 56 个提交此前在 changelog 零条目。本批按计划书卡点口径**只补「最优先 4 条 + 桌面端在途段 + 2 条被引缺发版记录」**，其余逐批明细的补写深度待用户拍板（见 `docs/comms/定时开工总纲` 第 8 节），拍板前下方为发版级摘要占位。口径提醒：9/3 的「设备清单页」是**管理端抽屉的 tab**，与 830 批 H-3 的**画师自助账号安全页**不是一条，勿混。

### ① 2FA 绑定完整性加固（2026-08-24，缘起公网画师「面包」报障）

- 用户拍板五项：重置即踢会话 + 未绑定统一拦截 + 首绑找回 + 空壳覆盖 + 防刷提示。同日与之合入的还有「四步入驻流程批」（邀请码入驻）。门禁：830/830、check:i18n、build、防阀全绿。

### ② 830 外部审计修复批：旧交付链接一律 403（2026-08-30，H-4）

- 一次性下载访问层真落地：客户直链下架统一走 `download-start`（签名载荷带换新 nonce + 锁定对账，画师预览仅 deliverableId），追踪页同步改链，签名 TTL 15→5 分钟（迁移 v74）。**副作用**：升级后此前已发出的旧交付链接一律失效返回 403——客户**重新点一次「开始下载」**即恢复（重新签发新链接），不是数据丢失。

### ③ 画师自助设备管理与踢出（2026-08-30，H-3）

- 新增画师自助设备端点 + 账号安全页的设备清单与「踢出」；桌面切出先注销服务端会话（H-2）。让画师能在自己账号里查看并吊销已登录设备 / Passkey。

### ④ 计价引擎负金额静默损坏根治（2026-08-30，H-1）

- clamp 改绝对位置口径 + 超额部分转「额外应退」 + `checkOrderConservation` 的 R8 守恒断言变回 fail-fast，杜绝负金额静默改坏历史订单价目。

### 桌面端各批（未发布，桌面端在途）

- 2026-08-25~26 桌面端波0 地基 + 壳层商业化（托盘常驻/关闭到托盘/全局快捷键/系统通知/单实例）+ 本地核心环波1~10（SQLite 本地库/F2 本地记账/F1 文件归档/F5 图缓存/F8 工时/F6 本地档案/F1a 工程模板/数据导入导出）+ 正式图标；2026-08-28 用户终验整改首轮；2026-09-03 桌面端回流批（设备清单页 tab / F9 客户端 / F11 排期口径）；2026-09-04 主页重设计波1 落码。**均随桌面端在途，未并入网页端发布版本**——单列于此，不与网页端混排。

> 🟡 **深度待定（占位）**：以上为发版级摘要。若要「逐批补 56 条明细」（约 4 倍工作量）请拍板；未拍板前此段即 changelog 对该窗口的覆盖。


## 标识/身份码规则对齐批：去连字符 + 上限放宽 20 位（2026-08-23）

> 用户拍板（方案 A + 20 位）：主页标识与身份码旧规则互斥——标识许连字符/20 位，身份码（标识大写派生、订单号前缀）只认字母数字/10 位，带连字符或超 10 位的标识注册必报错。新规则两形同构：小写字母+数字 2〜20 位 ⇔ 大写码 2〜20 位。

### 📄 本批内容

- **规则**：主页标识去连字符（前后端共 7 处校验）；身份码上限 10→20（校验 + 3 处接口上限 + 3 处输入框）。
- **存量零影响**：现网画师标识均短于 10 位且无连字符；订单号生成对码长零依赖，旧订单号不变。唯一观感代价：订单号前缀最长可到 20 位。
- 中英词条 8 对同步；画师使用说明书/开发自参考同步。
- 门禁：server 1655/1655（+6：TC-RC 规则回归）· web 804/804 基线不变 · i18n/build 全绿。无数据库迁移。


## 登录留痕批：后台新增画师上次登录时间与来源 IP（2026-08-23）

> 用户拍板：只记最新一条（每次登录覆盖）+ 列表相对时间、抽屉完整时间与 IP 两处都放。含数据库迁移 v72（artists 表新增 last_login_ip 列，随重建/更新自动执行带备份）。

### 📄 本批内容

- **记录**：三个登录口（动态口令 / Passkey / 邀请码首绑）成功后写入时间与来源 IP；v61 预留的 last_login_at 列首次真正启用。
- **展示**：管理后台画师列表新增「上次登录」列（相对时间，悬浮看完整信息）；画师详情抽屉资料页首行只读显示完整时间与 IP；未登录过的画师显示「尚未登录」。
- **隐私**：两字段仅管理后台可见，对外接口（含画师本人资料页）一律不返回。
- 门禁：server 1649/1649（+6）· web 804/804（+6）· i18n/build 全绿。


## v1.0.1 发版记录（2026-08-23）

> 1.0.0 之后的合规补丁版：三份合规文案与平台实际行为全部对齐。本版无新数据库迁移（仍 v71），无需重登，升级无需任何操作（重建容器/update.sh 即生效）。

### 📄 本版内容（详见上方各批条目）

- **隐私政策合规补丁**：新增「故障与错误报告（Sentry）」收集披露 + 「七、第三方服务」（Sentry 境外存储声明 + 图片识别 CDN 下载说明）；更新日期 08-23。
- **服务条款免责声明改准**：「一、平台角色」「七、免责声明」与交付文件托管传递事实对齐（不担保/不介入/不担赔偿写实）；更新日期 08-23。
- **平台职责说明改准**：首页/四套主页模板/下单表警示条六处口径统一（平台不托管资金、交付经一次性传递通道、不仲裁、风险自担）。

## 平台职责说明文案改准（2026-08-23）

> 用户拍板「按新稿改」：下单表单/首页/四套主页模板共 6 处共享的黄底「平台职责说明」警示条与刚改准的服务条款口径矛盾（原写「交付均在外进行、平台不托管」，事实是交付经平台一次性传递通道；且「仅协助验证身份」与平台实际功能不符）。

### 📄 新稿（zh/en 双语同步）

- 中文：本平台为约稿工具，仅协助核实双方身份、建立联系；沟通与支付均在站外进行，平台不托管资金。交付文件由平台提供一次性传递通道，不干预交付结果；平台不提供仲裁服务，交易风险请自行承担。
- 门禁：web lint（含 typecheck）0 错 / 798/798 基线不变 / check:i18n OK（13 条存量豁免，无新增）/ build 全绿。

## 服务条款免责声明改准（2026-08-23）

> 用户拍板「改准现有声明」：免责声明不另立专篇——服务条款本有「七、免责声明」节（页底小灰字属防投诉提示，角色不同）。真缺口 = 条款声称平台「不参与交付」，与实际「交付完稿经平台托管一次性下载」对不上，会削弱免责可信度。

### 📄 服务条款修订（zh/en 双语同步）

- 「一、平台角色」：平台不参与交易磋商与收款；交付文件（完稿）由平台提供传递通道，平台不干预交付行为与结果、不介入纠纷。
- 「七、免责声明」：平台仅为工具，仅提供交付文件的传递通道，不担保交付质量、不介入交易纠纷、不担赔偿责任。
- 更新日期 2026-08-11 → 2026-08-23。
- 门禁：web lint（含 typecheck）0 错 / 798/798 基线不变 / check:i18n OK（13 条存量豁免，无新增）/ build 全绿。

## 隐私政策合规补丁（2026-08-23）

> 用户拍板「两项都补」：核口径 = 不必随发版更新，网站实际行为变化才需更新。查补两处披露缺口：①生产已启用的 Sentry 错误监控（错误报告含 IP/浏览器信息/出错页面，自动发境外第三方）此前隐私政策零披露；②8-20 上线的「识别图片」首次使用会从公共 CDN 下载引擎与语言数据（图片本身本地识别不出本机）。服务条款 8-11 后无规则变化，不动。

### 📄 隐私政策更新（zh/en 双语同步）

- 「一、我们收集哪些数据」新增一条：故障与错误报告（Sentry）。
- 新增「七、第三方服务」一节：Sentry 故障监控（含境外存储声明）+ 图片识别 CDN 下载说明（识别在浏览器本地完成、图片不上传）。
- 更新日期 2026-08-15 → 2026-08-23。
- 门禁：web lint（含 typecheck）0 错 / 798/798 基线不变 / check:i18n OK（13 条存量豁免，无新增）/ build 全绿。

## v1.0.0 发版记录（2026-08-23）

> 首个正式版：整合 v1.0.0-beta.4 全量（自定义首页 / 收入图表化 / 粘贴录单 + 本地图片识别 / 全仓 TS 收尾与深度审计修复）与 v151 历史小尾巴清扫批。数据库迁移至 v71（beta.4 已达 v70；本版新增邀请码多次使用）。下方 v151、beta.4 及其前序各批均为本版组成内容，正文见各批条目。

## v151：历史小尾巴清扫批（2026-08-21，已随 v1.0.0 发版）

> 用户拍板「小尾巴全处理掉」：三条待办核实后两条为死代码/已销账，纯删除批零行为变化。验收口径：同日用户确认 v144〜v150 自定义首页与导览等验收清单通过。

### 🗑️ 清除范围

- **StatusSwitch 销账**：组件早已随死文件批删除（d7783084），本批仅销账——changelog 旧「待拍板」条目事实已被 817 拍板（移除「状态切换」）与 F3 循环按钮（后同样移除）接替；开发自参考目录树残留行删去。
- **QuickActions 状态滑块死代码全链路清除**：817 拍板后候选池已无 'status' 键，滑块渲染分支/02B 逻辑（statusOptions/onStatusChange）/窄屏样式永不可达；状态切换实际由挂牌（PlaqueStatus）承担。报障的「语言切换后滑块文字不跟随」正是这段死代码（普通数组构造非响应式），随死代码一并消失，不修只删。
- **闲置 SliderSwitch.vue 与其测试整体删除**：全仓唯一消费者即上述死路径；`dashboard.status*` 词条仍被 PlaqueStatus/SlotManage 活引用，不动。

### 📉 基线变化

- web 测试 796→787（-9，全部为随组件删除的 slider-switch.test.ts），存量零篡改；server/E2E 不涉及。

## v1.0.0-beta.4 发版记录（2026-08-21）

> beta.3 之后 v126〜v150 共 25 个批次再加术语改名批随本版发出。主线四件：「自定义我的首页」全套落地、收入图表化、粘贴录单+本地图片识别、全仓 TypeScript 收尾与深度审计修复。门禁基线 server 1626 / web 796 / E2E 13，数据库迁移至 v70（v69 日历订阅源 + v70 首页偏好，均自动升级自带备份）。

### ✨ 新功能（详见下方各批条目）

- **自定义我的首页**（v144〜v146）：首页板块拖拽排序/显隐/宽度档位，板块库可添加收入趋势图/本月收入概览/截稿倒计时；排期块四款式（时间条/台账/纸签/运单）；问候卡四款式；页宽三档+最大宽度滑杆。
- **收入图表化**（820 批）：引入 Chart.js 4，统计导出页新增收入趋势柱图、画风收入分布环图、客户消费排名榜。
- **粘贴录单 + 本地图片识别**（v141）：QQ 聊天记录粘贴自动解析成订单（金额/截稿日/昵称规则补全+描述清洗）；截图 Ctrl+V 本地 OCR 识别文字（图片不出本机）。
- **订单详情升级**（v129〜v131）：修改记录卡、宽屏双列排布、「需要修改」反复计次；留言批量批准/婉拒、订单搜索补 QQ、列表点列头排序。
- **新手导览 12 步定稿重排**（v150）；问候卡默认半行（v148）；2FAS 引导与闪屏修复等杂项（v126〜v128）。

### 🔧 工程与质量

- **全仓 TypeScript 收尾**（v132，2026-08-19）：约 470 个单元一次性迁完，行为零变更。
- **深度审计与结构修复**（v140〜v143）：只读取证四张清单 + 四项修复（巨型文件二轮拆分/再生长防阀/.js 导入清理/i18n 审计复活）。
- **Passkey UV 口径修复**（v134）；E2E 端口迁 5099（v147）。
- **术语改名**（2026-08-21）：用户可见文案「子域名」→「主页标识」（英文 Home ID），技术字段名不变。

### ⚠️ 升级注意

- 从 beta.3 升级无需重新登录；数据库自动升级（v69/v70 两条迁移，自带迁移前备份），`update.sh` 升级额外多做一份更新前备份。
- 使用 Passkey（指纹/刷脸登录）的用户升级后可能需要重新注册一次 Passkey。
- 仍用 ZIP 包部署的老服务器建议切 git 部署（维护说明书有教程），以后升级一条命令。

## 术语改名批：用户可见文案「子域名」→「主页标识」（2026-08-21，随 v1.0.0-beta.4 发出）

> 用户拍板：C48 早已定路径访问（`/artist/:subdomain`），界面仍叫“子域名”名不副实，统一改名；因与既有“身份码”（artist_code 订单前缀）撞车，不采用“专属身份码”提法，定名「主页标识」（英文 Home ID）。纯文案批零行为变化，门禁全绿（server 1626 / web 796 / E2E 13）。

### ✨ 改名范围（仅用户可见文案）

- **前端词条**：zh/en 两 locale 全量改名——管理端表头/添加画师表单标签/占位符/必填提示、画师搜索框与筛选说明、初始化向导「工作室主页标识」、邀请注册页标签与校验、SUBDOMAIN_FORMAT/TAKEN 两条错误文案、快捷操作「未设置主页标识」提示。
- **顺手修遗留误导**：管理端原显示拼接 `alice.主域名`（暗示子域名地址）改为真实地址样式 `/artist/alice`：domainSuffix 语义转路径前缀，ArtistManage 表列与表单 append→prepend（中英同口径）。
- **后端文案**：errors.ts SUBDOMAIN_TAKEN/FORMAT 两条消息 + 建号/邀请注册/初始化向导/管理路由四处保留词 hint 同步改名。
- **文档**：维护说明书、开发→生产切换指南两处字段说法同步（Phase 2 泛子域名规划描述属真实 DNS 概念保留不动）。

### 🔒 刻意不动（拍板口径）

- 数据库列名、API 路径参数、URL 路由参数、代码变量、i18n 键名、错误码名、changelog/归档历史记录一律保留 `subdomain`；格式规则不变（小写字母/数字/连字符、2-20 位、保留词黑名单）。

## TypeScript 全仓收尾迁移 + 隐性 bug 修复 + 文档大修（2026-08-19，随 v1.0.0-beta.4 发出）

> 用户拍板推翻原「谁触碰谁迁移」增量策略，一次性完成全仓 TS 收尾；行为零变更，门禁全绿（server 1589 / web 651 / E2E 13）。详见 STATUS v132。

### 🔧 TypeScript 收尾（约 470 个单元）

- **server**：tests 134 个 .test.js→.test.ts + 运维脚本 3 个（check-db/gc-uploads/backfill）；新增 tsconfig.tests.json 把测试纳入 strict 类型门禁；entrypoint.sh 改 npx tsx 直跑 check-db.ts。
- **web**：src 153 个 .js→.ts + 136 个 vue script 块 lang="ts"；allowJs 关闭；vite/vitest/eslint 配置与 check-i18n/compress-paper-tex 转 TS（新增 tsconfig.scripts.json）。
- **e2e**：16 个 .js→.ts + playwright.config.ts；新增 e2e/tsconfig.json 与 npm run typecheck:e2e / check:e2e。
- **纪律**：断言/测试名/用例数/注释/路由表/SQL/部署流程零变更；全仓零 any/@ts-ignore；测试数与基线逐一吻合。保留未迁：install.mjs、根 scripts/*.mjs/.ps1/.sh（裸 node/系统脚本直跑入口）。

### 🐛 修复（迁移暴露 + 用户拍板）

- **GreetingNote「今日统计」滚动数字空白**：旧 JS 的 .value 访问在 reactive 解包后运行时实为 undefined；去掉 .value 直读 display，数字恢复显示。
- **web eslint 180 条警告清零**：查实为 v129 双列排布批遗留缩进债（全部在 OrderDetail.vue），eslint --fix 纯格式修复；lint 首次 0 errors 0 warnings。
- **GH E2E 工作流修复**：e2e.yml 定位器扫描改走 npm run check:e2e（tsx）——迁移改名后工作流引用漏同步致 MODULE_NOT_FOUND。

### 📚 文档大修（2026-08-19）

- 全部 docs/README 刷新至全仓 TS 现状（README/CONTEXT/开发自参考/维护说明书/开发→生产切换指南/CONTRIBUTING）。
- OPS.md 新增 §0 版本更新章节：用户须及时 `bash scripts/update.sh`（首选，自动备份+拉码+重建+体检+回滚预案）；手工流程降为底线方案。
- comms 旧批次交付件归档；STATUS 过期待办消账。

> 📦 **v1.0.0-beta.3 发版记录（2026-08-18） ／ 0817 用户反馈批 + 系统更新面板 + 文档大扫除（2026-08-17 ~ 08-18，已随 v1.0.0-beta.3 发出） ／ beta.2 后待办清扫批（2026-08-16，已随 v1.0.0-beta.4 发版）（共 3 段 / 64 行）已滚动分册至 `docs/changelog-archive/changelog-20260816-20260818-20261012.md`（2026-10-12 批，原文原样搬迁，逐行哈希零丢失）。**
> 📦 **v1.0.0-beta.2 审计修复收口版（2026-08-15） ／ v1.0.0-beta.1 公测发布（2026-08-15）（共 2 段 / 52 行）已滚动分册至 `docs/changelog-archive/changelog-v1.0.0-beta1-beta2-20261012.md`（2026-10-12 批，原文原样搬迁，逐行哈希零丢失）。**
> 📦 **v1.0.0-beta.1 之前（v0.1 ~ v0.46+，共 53 段）已滚动分册至 `docs/changelog-archive/changelog-v0-20260927.md`（2026-09-27 批，原文原样搬迁，逐行哈希零丢失）。**
