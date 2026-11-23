# STATUS 溢文归档 — 2026-10-26 wave3 收口

> 本文件是 docs/comms/STATUS.md 的溢文归档（2026-11-23 归档批搬出；原正文块 L196–L228，搬迁前基线 `5c1c0aab`）。当前状态请看 STATUS.md。
> 归档原则：原文一字不改，整体搬迁。

>  📌 **2026-10-26 wave3 收口：PR #55/#58/#26/#59/#60 五路全数合入 + 上批 7 项待拍板全部落地**
>
> - **授权口径**：用户裁定「拟物收敛只限卷轴排期块」「其余按最优方案处理」「老 worktree 可清理」。
> - **拓扑**：两路只读评审席（W1 判 #55/#58 返工七条、W2 判 #26 与 Dependabot）+ 一路前端施工席（C 批 shared），一号做 web 两批与集成收口。
>   报告全在 `AGENTS/artifacts/mistwhisker-wave3-20261026/`。
> - **#55/#58 接收**：两份「返工七条」逐条对撞代码全部真修实。要点：暗色滚动条改吃 `--text-primary` 56%/68%（复算最弱 3.11:1 过线）、
>   空串 src 改 v-if 整颗不渲染、`.status-tag` 摘 color 插值、token 硬编码清零、overflow 简写撤销病灶修复、
>   骨架断点 960→768 与内容对齐、环图改吃 `readChartPalette()`。
> - **拟物零外扩实测**：ScheduleScroll / SealStamp / LoginBackdrop / PaperCard / GreetingNote 五个面 diff 全空，射程限定成立。
> - **#26 接收**：节点待收改走 `deriveInstallmentProgress`，与 `computeLockedState` 同吃 `forwardFill`；
>   上轮反对的展示/引擎分叉结构性消除，复算证实无负尾款订单展示零变化。
> - **#26 合入后的两处跟进（一号自施）**：节点快捷收款的按钮与预填金额钳到订单级待收——负尾款「带内」场景
>   （Σ含负 < paid < Σ正）节点差额会大于订单级待收，只看节点差额就会在已收足的订单上递一个超收默认值；
>   另修正 `TrackOrder.vue` 一处已失实注释（客户端自算的「Σ正节点封顶」与服务端 forwardFill 行为等价、但已非同一份实现）。
>   登记不动项：`checkOrderConservation` 内还有第三份内联顺序填充实现（Σ 与 forwardFill 恒等、守恒断言只查 Σ，无行为分叉），属可收编技术债。
> - **#59/#60 接收**：eslint 10.13.0 / ts-eslint 8.72.0 / vite 6.4.5 / @fastify/static 10.1.7 / chart.js 4.6.1 / vue-i18n 11.4.16 / oxlint 1.89.0。
>   happy-dom 三端仍 21.0.4，未触 `@tauri-apps/*`（成对规矩不触发）。
> - **顺手校正**：`npm install` 实测 web/desktop 两个 lockfile 的根镜像 devDependencies 陈旧（happy-dom 仍写 ^20.14.6，自 PR #40/#44 起漏更，
>   Dependabot 只重写已解析条目、不动根镜像），单独一笔对齐。
> - **本批代码（一号，web）**：报价未就绪不得提交 + 取消基础价回落 + 展示价改整数分单源（#50-1/#50-2）；
>   未验证折扣码既不入算价也不许提交（#50-6）；尺寸全展示档给出口（#50-4）；step-up 切页重探（#49-1 最小档）；
>   `setAdminFlag` 回写持久标记（#52-3，修订 REQ-043 I6-e）。
> - **本批代码（C 席，shared）**：PriceCard.vue 1094→692（拆出 `pricecard/{types,tiers,draw}.ts` + `ArtworkPickerModal.vue`，对外签名不变、两端调用方零跟改）；
>   弹窗补 aria-modal/Escape/焦点陷阱/焦点归还；档位 `min` 0→0.01 + 行内提示；小票排除行补提示（`receipt/totals.ts` 一行未动）。
>   **F-44 唯一遗留豁免就此清偿，ALLOWLIST 现为空表。**
> - **验证**：十九道全绿 @ `b4d22c6d`；server 1981 / web 1073（159 文件）/ desktop 616（44）/ shared 44 / E2E 14；基线已同步。
>   业务+测试同改走 `-TestTamperAck`（三处有意的行为标准变更：基础价回落取消、I6-e 修订、0 元非法）。
> - **盘面清理**：11 个 `.qoder/worktrees/agent-huiyue-*` 注册全部摘除、33 个已并入本地分支删除（末端 SHA 存 `deleted-branches.txt` 可恢复）；
>   7 份席位交回台账归档进 `AGENTS/artifacts/inkglean-sec-audit-20261024/seat-ledgers/`；三个残目录只剩 node_modules，删除被本机设置规则拦，候用户手动。
> - **待办新增**：STATUS 正文达 6 条，按体例第 6 条起须整段归档；归档属高风险文本迁移，按 AGENTS.md「不与代码施工混批」留作单独一批。
> - **changelog 余量告警**：活档 40198 B（阈值 40 KB = 40960 B，**余仅 762 B**）/ 208 行（阈值 450）。下一批必然撞线，
>   撞线唯一处置＝oldest 段整搬 `docs/changelog-archive/` 新卷 + 逐行哈希校验，禁调高阈值续命。建议与 STATUS 正文归档并成同一批纯文档迁移。
