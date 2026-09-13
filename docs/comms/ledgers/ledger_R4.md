# ledger_R4 · 第二轮定时开工 · 收口批（链尾）

> **性质**：R4 收口台账（本批是第二轮**唯一**回写 `docs/comms/STATUS.md` 与 `scripts/accept-baseline.json` 的批）。各施工批原始 ledger 只读合并，一字未改。
> **触发**：2026-09-14 独立会话（goal 模式自持推进），链条 W7→R3→R5 之后的链尾。
> **依据**：`定时开工计划书-R4-收口批-20260913.md` + 总纲第 1/5/6 节。
> **HEAD 起点**：`de923472`（未 push）。**不 commit、不 push**（等你下令）。
> **一句话结论**：四份 ledger 齐全、前序端门禁复核为真；本批先撞出🔴 巨型文件防阀真红（R1 顶爆 800 行）并只上报不返工，用户回「按照工程学最优去做好」后拆件消红 → 逐道等价命令 **17 道全绿**；`accept.ps1` 十七道本体仍因脏工作区物理跑不了（与上一轮 P5 同一处死锁），等你本地提交令后补跑。

---

## 一、前置校验结果（计划书写「不满足就停下报你，不硬收口」）

| 检查项 | 结果 | 证据（本会话实测，非引用） |
|---|---|---|
| `ledger_R1.md` 在 | ✅ | 99 行，web 886 例门禁数字完整（§六） |
| `ledger_R2.md` 在 | ✅ | 64 行，含 §八 用户拍板方案 A |
| `ledger_R3.md` 在 | ✅ | 64 行，E2E 14 passed；§七 自报「链断、R5 未创建」 |
| `ledger_R5.md` 在 | ✅ | 144 行，server 三项门禁 1801/156 |
| （附）`ledger_W7.md` 在 | ✅ | 链式起点批，方案 A 已落地中英两条 |
| R1 端门禁绿 | ✅ **复核为真** | 本会话重跑 web 四项：lint 0 / **886 passed（125 文件）** / check:i18n OK 13 条豁免无新增 / build 21.95s |
| R3 E2E 绿 | ✅ **复核为真** | 本会话重跑 `npm run test:e2e` → **14 passed (35.2s)**；`check:e2e` exit 0（2 条 WARN 是 e1/e2 旧段，与本轮无关） |
| R5 server 门禁绿 | ✅ **复核为真** | 本会话重跑 server 三项：typecheck 无输出 / lint `0 warnings 0 errors` / **156 文件 1801 passed**（488.78s，exit 0）→ 与 baseline 一致 |
| **文件归属可分捡** | ✅ 全落 R1~R5 领地，无外来会话在途件 | `git status --porcelain -uall` **前置校验时点 40 项**（23 已跟踪改 + 17 未跟踪；拆件后变 43，见 §六）：`web/src/**` 18 改 + 2 新、`server/` 3 改、`e2e/` 1 新、`docs/comms/` 14 新（ledger 6 + 总纲 1 + 计划书 6 + 施工图 1）、`docs/comms/STATUS.md` 与 `scripts/accept-baseline.json`（R4 自己）→ `desktop/`·`shared/`·`worktrees/`·`server/src/` **零命中** |
| 工作区静止（无第二方写盘） | ✅ | 三次 `git status` 采样行数一致；各施工批 ledger 落盘时间均早于本会话开工 |
| 🔴 `accept.ps1` 十七道能否跑 | ❌ **物理跑不了**（与本轮红无关）| `accept.ps1:56-59`：存在未提交的已跟踪改动即 `Write-Error` 中止。真跑一次坐实：输出止于前置检查、**零道门禁执行**（日志 `temp/r4-accept-attempt.out.txt`）。与上一轮 `ledger_P5.md` §1.1/§8 是同一处死锁 |
| 环境就绪（E2E 探活） | ✅ | 按令用 `curl.exe --noproxy "*"`（未用 Invoke-WebRequest）：5099 空闲、`http://127.0.0.1:3000/api/health` → **200**；docker `commission-web` Up 27h (healthy)、`commission-caddy` Up |

**收口范围界定**：R1 的 W1~W6 🟢、W7 方案 A 🟢（已落地，不再是停等项）、R3 的 W8 🟢、R5 的依赖升级与 CI 健康 🟢（**未走降级路径**）。R2 是只读施工图批，无门禁。

---

## 二、合并回写 STATUS（守体例，未做归档搬动）

`docs/comms/STATUS.md`：

- **看板刷为第六次**：HEAD 回到 `de923472` + 「本轮成果挂工作区待提交令」；基线 server 1801 / **web 886（125）** / desktop 447 / shared 23 / **E2E 14**；迁移 **v76 不变**；🔴 单列两条「门禁不成立（file-size 真红）」与「十七道待补跑」。
- **下一步压到 5 条**，第 1 条改成「先裁决 R1 撞开的真红」，其余为提交令 / W4·W6 终审 / 黄红灯集中清 / G8+N2 单独批。
- **常驻纪律两条**（`src-tauri` 必跑 cargo check、ALLOWLIST 恒 0 项）与 `admin_qq` 硬警告未被冲刷，原样保留。
- **新增一条收口条目**（短标题 + 分组要点，逐条 ≤200 字，实测本会话新写行零超长），含 R1/R3/R5/W7 结论、门禁判读、真红上报、流程矛盾登记、G8 标注、ledger 指针（同批细节不互抄）。
- 🔴 **正文现 8 条**（`> 📌` 7 条 + `> 🔑` 1 条，与上一轮 P5 自报的「7 条」同口径 +1）、超体例「只留最新 5 条」：按 G8 红灯口径本批**一个字未搬**，只在条里标注待单独一批 + 字符总量前后差校验。
- **桌面端本轮零改动**，未碰 `desktop/docs/STATUS.md`。
- ⚠ 旧长行已顺手治瘦（不属归档搬动）：「起手必读」原 313 字一行（上一轮遗留、超体例）已拆为三行，**文字逐字保留、仅插换行与「起手必读续」标题**，未删未改内容；本批新写的行已逐行校 >200 字符 = 0。

---

## 三、`scripts/accept-baseline.json` 同步

| 键 | 改前 | 改后 | 依据（实测，不照抄 ledger） |
|---|---|---|---|
| `web` | 876 | **886** | 本会话重跑 `npm run test:web` → `Tests 886 passed`、`Test Files 125 passed`（R1 W1 新页 3 + ArtistManage.ban 3 + ReportManage 2 + ArtistDetailDrawer 2） |
| `e2e` | 13 | **14** | 本会话重跑 `npm run test:e2e` → `14 passed`（R3 新建 `e11-compliance.spec.ts`，单条 test） |
| `server` | 1801 | **1801（不变）** | 本会话重跑 server `npm test`，计数见 §四；R5 升 vitest 3→4 后计数口径与 v3 一致，未增删用例 |
| `desktop` | 447 | 447 不变 | 本轮未动 desktop；本会话仍复跑核对（447 / 30 文件） |
| `shared` | 23 | 23 不变 | 本轮未动 shared；复跑核对（23 / 4 文件） |
| `updatedAt` | 2026-09-13 | **2026-09-14** | — |
| `note` / `history` | — | 重写 | 写明「第二轮 R1 涨 web、R3 涨 E2E、R5 升 server 依赖（sharp+vitest）+ 修 1 处假绿、desktop/shared 本轮不变」，并保留上一轮链 |

- 写入后用 `node -e "require('./scripts/accept-baseline.json')"` **解析验证**，输出 `{server:1801,web:886,e2e:14,desktop:447,shared:23,updatedAt:"2026-09-14"}` → JSON 合法（防上一轮 P5 §3.2 踩过的「尾部残留成非法 JSON」）。
- ⚠ 这一步是防假红的前置：不同步则 accept 会把 886/14 判成「高于基线」提示或反向倒退。

---

## 四、全量门禁：accept.ps1 被拦死 → 逐道等价命令亲跑（完整输出）

### 4.1 accept.ps1 实跑坐实（未改脚本，红灯 N2 用户定先不修）

```
=== 验收流水线 ===
目标：D:/Hermes Agent CN Desktop/workspace/artist-commission （分支 master @ de923472）
Write-Error: scripts/accept.ps1:57
  前置检查失败：存在未提交的已跟踪改动（038 事故防再发）：
   M scripts/accept-baseline.json  M server/package-lock.json  M server/package.json
   M server/tests/publish-artwork.test.ts  M web/src/... （共 23 项）
ACCEPT_EXIT=1   ← 零道门禁执行
```

### 4.2 逐道等价复跑（同一命令、同一 cwd，脚本 `temp/r4-run-gates.ps1`，日志 `temp/r4-gates/*.log`）

| # | 门禁 | 命令 | 实测 | 退出 |
|---|---|---|---|---|
| 1 | server typecheck | `cd server && npm run typecheck` | tsc ×3（src/scripts/tests）无输出 | 0 ✅ |
| 2 | server lint | `npm run lint` | eslint + oxlint `Found 0 warnings and 0 errors.` | 0 ✅ |
| 3 | server vitest | `npm test` | **Test Files 156 passed / Tests 1801 passed**（488.78s）→ 与 baseline 持平，无倒退 | 0 ✅ |
| 4 | web lint（含 vue-tsc） | `cd web && npm run lint` | 无输出（0 错） | 0 ✅ |
| 5 | web vitest | `npm run test:web` | **Test Files 125 passed / Tests 886 passed**（15.82s） | 0 ✅ |
| 6 | web check-i18n | `npm run check:i18n` | `OK — 存量违规 13 条豁免，无新增硬编码中文，中英词条键集一致` | 0 ✅ |
| 7 | web build | `npm run build` | `✓ built in 21.95s` | 0 ✅ |
| 8 | desktop lint | `cd desktop && npm run lint` | eslint 无输出 | 0 ✅ |
| 9 | desktop vitest | `npm run test` | **Test Files 30 passed / Tests 447 passed**（5.28s） | 0 ✅ |
| 10 | desktop build | `npm run build` | `✓ built in 3.27s` | 0 ✅ |
| 11 | shared lint | `cd shared && npm run lint` | eslint 无输出 | 0 ✅ |
| 12 | shared vitest | `npm run test` | **Test Files 4 passed / Tests 23 passed**（1.56s） | 0 ✅ |
| 13 | shared typecheck | `npm run typecheck` | vue-tsc 无输出 | 0 ✅ |
| 14 | Playwright E2E | `npm run test:e2e` | **14 passed (35.2s)**，无倒退 | 0 ✅ |
| 15 | E2E check-locators | `npm run check:e2e` | 2 条既有 WARN（e1:15 / e2:25，非本轮引入）；e11 零告警 | 0 ✅ |
| 16 | test-tamper | `node scripts/check-test-tamper.mjs --base master` | `共 0 个变更文件 → ✅ 无改动，放行`（⚠ 见 §4.4：提交前结构性空转） | 0 ✅（弱证） |
| 17 | **file-size 巨型文件防阀** | `node scripts/check-file-size.mjs .` | 首轮 🔴 真红 2 项（ArtistLayout 807 / ArtistManage 848）→ **拆件后复跑 `✅ 通过`**（日志 `temp/r4-split-gates/file-size.log`） | 拆后 **0** ✅ |

### 4.3 npx bug 两道 node 补跑（沿上一轮口径）

- `test-tamper`、`file-size` 两道在 accept.ps1 里走 `npm exec --no -- node …`（`:105`/`:108`），当前 npm 把 `node` 当缺失包 → npx 取消、根本没执行（N2 红灯，用户定先不修）。故本批**用 node 直接补跑**取真结果。
- **补跑结果**：test-tamper exit 0（但见 §4.4，属空转放行）；**file-size exit 1 = 货真价实的检测出违规，不是假红**，不能按「exit 0 即放行」的口径放过。

### 4.4 本批新发现：test-tamper 这道在提交前是「结构性空转」

- 读 `scripts/check-test-tamper.mjs`：判定用 `git diff --name-only <base>...HEAD`，**只看已提交对象，不含工作区**。开工态 HEAD == base 的提交面 ⇒ 恒「0 个变更文件 → 放行」。
- 实测两跑均为 0：`--base master` → 0 变更；`--base de923472` → 0 变更。
- 结论：本轮「业务与测试同改」的真判据**只能在提交后**用 `node scripts/check-test-tamper.mjs --base de923472` 复跑取得（上一轮 P5 §9 正是提交后才拿到「业务 27 + 测试 9」的实质结果）。**建议 N2 工具批一并把这个「提交前空转」的口径写进 accept.ps1 注释或输出提示**，否则每轮收口都会拿一个恒绿的闸门当证据。
- 提交后跑 accept.ps1 时需带 `--ack-reason`，建议措辞（本批按未提交态人工分类得出）：`R1 新增管理端 UI（W1~W6）随功能补 mock 与断言；honestyCopy 断言日期 privacy.updated 2026-09-12→2026-09-13 系跟随隐私正文实改（诚实方向，非放宽）；R5 仅给 TC-PA-07 补漏 await，未删断言、未改期望值、未 skip`。

### 4.5 判读口径（诚实版）

逐道等价命令 **17 道全绿**（首轮 16 绿 + 1 真红 → 拆件后复跑全绿）。但：
- 因 accept.ps1 本体未跑成（脏工作区前置），**不得称「accept 十七道全绿」**；准确说法是「逐道等价命令 17 道全绿，十七道本体待提交后补跑」。
- test-tamper 的绿属弱证（提交前结构性空转，见 §4.4），真判据待提交后取。

---

## 五、🔴→✅ 巨型文件防阀真红：先只上报，用户放行后拆件消红

### 5.1 事件链（时间顺序，不粉饰）

1. 收口首轮复跑防阀 → exit 1 真红 2 项。按当时禁区口径（收口只合并不返工）**只登记上报**，写入 STATUS 与本节，未动 `web/src/**`。
2. 报告中列为「先要你表态的两件事」之一（选 (a) 先拆再提交 / (b) 先提交再拆）。
3. **用户回话：「按照工程学最优去做好」** → 按项目既定口径（口头指示优先、三维选最优解、避免不必要停等）理解为放行拆件（等价于选项 a）。
4. 本批因此**破例进入 `web/src/**` 拆件**——详见 §九（含可退回路径，待你追认）。

### 5.2 撞红与拆后数字

| 文件 | HEAD | R1 后 | 现（拆后） | R1 净增 | 诱因 |
|---|---|---|---|---|---|
| `web/src/components/ArtistLayout.vue` | 767 | 807 ❌ | **775** ✅ | +8（原 +40） | W4 主页下架横幅 |
| `web/src/views/admin/ArtistManage.vue` | 748 | 848 ❌ | **781** ✅ | +49/-16（原 +102/-2） | W3 下架/恢复双键 |
| `web/src/components/layout/HomeTakedownBanner.vue` | — | — | **57**（新） | — | 横幅标记 + 样式，逐字搬 |
| `web/src/composables/useHomeTakedown.ts` | — | — | **93**（新） | — | 两步确认 + step-up 链 |

### 5.3 拆法与零行为变更证据

- **横幅**：标记与 6 条 `.home-takedown-banner*` 样式规则逐字搬到子件（scoped 不跨组件边界，样式必须随元素搬）；`v-if` 判定与页宽 `pageWidthStyle` 下发仍留父页（页宽唯一生效点口径不变）；`formatDateTime` import 随之搬走。
- **下架链**：4 个函数（homeTakedown/submitHomeTakedown/homeRestore/submitHomeRestore）收敛为一条 `run` + 一条 `submit`，差异面入 `ACTIONS` 常量（文案键与接口方法）；文案键、prompt 参数顺序（message, title）、行级 loading 互斥、STEP_UP_REQUIRED 排队重提交、成功后刷新列表——全部与拆前逐字一致。
- **取键口径**：子件内用 `i18n.global.t`（与 `api/modules/http.ts` 同一先例），避免往 composable 里塞重载型 `t` 参数。
- **证据**：web lint（含 vue-tsc）零错、test:web **886/125 全过**——其中 `ArtistManage.ban.test.ts` 未改一行却仍覆盖「点「下架主页」→ prompt 参数→ 接口调用→ toast→ 刷新两次」与「step-up 弹框后自动重提交」（即行为等价的最硬证据）；E2E **14 passed**；防阀 **exit 0**；check:i18n 13 条豁免无新增。
- 拆后复跑日志：`temp/r4-split-gates/*.log`（gitignored）。

---

## 六、提交待令（不自动 commit、不 push）

**先说结论**：真红已消（§五），现在**只差你一句提交令**。逐领地 `git add` 后立即补跑 `pwsh scripts/accept.ps1` 取十七道硬结果，红的概率很低（本批已逐道等价复跑全绿），若仍红则补修一笔并回写本台账。

**git 归属核验**（禁 `git add -A`，逐路径加）：待提交 **43 项**（23 已跟踪改 + 20 未跟踪）= R1 `web/src/**`（18 改 + `views/admin/AdminActions.vue`、`views/admin/__tests__/AdminActions.test.ts`、**`components/layout/HomeTakedownBanner.vue`**、**`composables/useHomeTakedown.ts`**（后两件为 R4 拆件）共 4 新）· W7（locale 两条，含在 R1 的 `zh-CN.ts`/`en.ts` 同文件内）· R3 `e2e/tests/e11-compliance.spec.ts`（新）· R5 `server/package.json`·`package-lock.json`·`server/tests/publish-artwork.test.ts` · R2 `施工图-R2-W7主页不可访问文案-20260913.md` · R4 `docs/comms/STATUS.md` + `scripts/accept-baseline.json` + `docs/comms/待办-用户侧清单-20260914.md` · ledger `R1/R2/R3/R4/R5/W7` 6 份 · **编排 7 份**：总纲第二轮 + 计划书 R1/R2/R3/R4/R5/W7（你指令里的「6 份」指总纲 + R1~R5，本轮另有一份额外的 W7 落地批计划书，一并纳入共 7 份）。**非本轮文件：0 项**（无并行会话在途件混入，无 desktop/shared/worktrees 命中）。

**commit message 草稿**：

```
feat(web): P4 v75/v76 的前端配套 W1~W6 + W7 主页文案 + E2E 合规链路（第二轮定时开工）

R1 web 配套批（locale 全程单写者，中英成对）：
- W1 处置留痕页 AdminActions.vue + 路由 /admin/admin-actions + 管理端导航（此前 admin_actions 只写不读）
- W2 举报页来源 IP 列；W3 画师管理页与举报行「下架/恢复主页」双键（含 step-up）
- W4 画师后台主页被下架横幅（中性表述、不虚构申诉入口）
- W5 作品已下架徽标（管理端可恢复、画师端只读）；W6 隐私政策补三条 IP 披露（登录/举报/留言）
- API 层补 getAdminActions/homeTakedown/homeRestore/restoreArtwork 与 4 类 DTO 字段
- web 用例 876→886（125 文件）

W7 主页不可访问文案（用户拍板方案 A）：zh-CN.ts:844 / en.ts:845 改「中性提示 + 双指引」，与 W4 横幅闭环
R3 E2E 合规链路：新增 e2e/tests/e11-compliance.spec.ts（举报→下架→幂等→客户侧最小载荷→恢复→留痕→不重复记账反证），E2E 13→14
R5 依赖与 CI 健康（G9 解锁）：sharp ^0.35.4、vitest ^4.1.11（未走降级路径）；修 publish-artwork.test.ts
  TC-PA-07 漏 await 假绿（只补 await，未删断言）；关 dependabot PR #7/#8、dismiss glib #10；server 1801/156 不变
R4 收口：STATUS 看板第六次刷新 + 第二轮收口条；accept-baseline.json 同步 web 886 / e2e 14
按 T-08「长胖就拆」把 R1 顶爆 800 行的两处拆为 components/layout/HomeTakedownBanner.vue
  + composables/useHomeTakedown.ts（零行为变更，防阀回到豁免 0 项通过）
用户侧待办单独立档：docs/comms/待办-用户侧清单-20260914.md（U1~U19，下次开工第一条提醒）

门禁：逐道等价命令 17 道全绿；accept.ps1 本体因工作区脏被前置检查拦死，须提交后补跑。
台账：docs/comms/ledgers/ledger_R1.md · R2 · R3 · R5 · W7 · R4.md
```

- 叠在 `de923472` 之上；上一轮 `096c0b77`+`de923472` **仍未 push**，可本轮 + 上轮一起 push（push 后 dependabot 自动关剩余 6 条警报，并触发 CI 四 job + CodeQL）。
- 提交后本批要补做的两步：① `pwsh scripts/accept.ps1`（届时前置可过）；② `node scripts/check-test-tamper.mjs --base de923472` 取实质的同改判据（带 §4.4 的 `--ack-reason`）。

---

## 七、等你清单（随本报告交你，早上看）

**🔴 需要你先表态才能往下走的**

1. ✅（已办、待追认）**巨型文件防阀真红的处置**：你回「按照工程学最优去做好」→ 本批破例进 `web/src/**` 拆件消红（做法与零行为变更证据见 §五 / §九）。**如不认可这处越禁区，可整块退回**（§九给可执行路径），代码与文档不受影响。
2. **本地提交令 + message**：是否按 §六 草稿提交、单笔还是拆两笔（功能一笔 / 文档一笔）。**push 另需单独下令**（push 才能自动关那 6 条依赖警报）。

**🟢 本轮已完成、只需你知情**

3. **W7**：你已拍板方案 A 且**已落地**（`zh-CN.ts:844`·`en.ts:845`），不再是停等项；本轮收口把 `ledger_R2` §八的「停等」状态推进为「已落地」。→ 只剩**终审措辞**（如异议另批微调）。
4. **W4/W6 措辞审阅**（对外文书，最终定夺权在你）：W4 横幅 `guidance`＝「您仍可登录后台整改相关内容；整改完成后如有疑问，请联系平台管理员申请恢复。」（据实核实：画师后台无专门申诉入口，故**不虚构渠道**，与隐私政策 §五口径一致）；W6 三条披露＝登录 IP（补 v72 既存漏披露）/ 举报提交 IP / 留言提交 IP，均标「仅管理端可见」。
5. **R5 结果**：CI docker flaky 重跑一次转绿（四 job 全 success，本会话 `gh run view` 复核 `completed/success`）；sharp+vitest 已本地升级（**未走降级**）；PR #7/#8 已关（复核 open PR = 0）；glib #10 已 dismiss；**剩余 6 条 sharp/vitest 警报待你 push 后 dependabot 重扫自动关**（本会话复核 open=6）。
6. **R5 报的两条事实源纠偏**（建议落到 OPS 备忘，本批不改计划书）：① 计划书给的 `POST .../alerts/10/dismiss` 返回 404，现行可用是 `PATCH /repos/{o}/{r}/dependabot/alerts/{n}` + `state=dismissed`；② dependabot PR #7 真实目标是 vitest **5.0.0**（不是 4.1.11），这才是它 CI 必红的根因。

**🟡 黄灯（需你本人参与，均不得自动施工）**

7. **Y2** S-912 冒烟工单全单（A 组 18 条需你 TOTP；B 组开箱向导需空库独立实例，禁动 `data/commission.db`；C1 问卷需你手机 QQ 实点；C2 桌面波 1 活体终验 12 条，派工前先改 D4 后半句判据）。
8. **Y3** 公网解冻部署（🔴 升级前**必须先确认 `platform_config.admin_qq` 非空**；公网停在 v74，本地已 v76）。
9. **Y4** 桌面发布硬依赖（公网升级 / CF 规则放行桌面接口 / 更新通道密钥对 + GitHub vars·secrets / SignPath；⚠ vars 未配则发布流水线红在第 5 步）。
10. **Y5** `design/r2` 三版原型选定（可派子代理看图出评估，审美选定权留你）。
11. **Y6** F12 完稿引导卡放行（原型 `docs/comms/proto-f12/proto-delivered-guide-v1.html`；放行后 F12 施工另立单批，含 shared 本体 + 两端宿主壳）。
12. **Y7** 桌面波 2 拖拽追认（上一轮 P2 以「口头授权推翻停等」已施工，`ledger_P2.md` §6.1；不认可可另批回退）。

**🔴 红灯（未拍板禁止施工）**

13. **N1** 主页判定口径统一（主页 200 vs 其余 404，动 UI-8 旧拍板的公开端契约）→ 单独后端批。
14. **N2** 门禁工具批（accept.ps1 的 `npm exec --no -- node` npx bug；check:i18n baseline 路径失配；**本批新增一条：test-tamper 提交前结构性空转**）→ 你 9/13 定「先不修、记账待办」，现仍记账。
15. **N3** 板块级下架（需重建 `reports` 表，高风险迁移）。**N4** 数据服务（另立 REQ + PIPL 评估）。
16. **G8** STATUS 归档搬动（正文现 **8 条**、超体例 5 条）→ 高风险文本迁移，单独一批 + 字符总量差校验。
17. **上一轮 G1~G9 + F-31/32/35/36**：指针 `docs/comms/定时开工总纲-时间表与防冲突-20260912.md` 第 6 节，本轮一律未动（G9 已由 R5 处理完）。

**⚙ 编排侧一条（不影响代码，供你决定下轮怎么排）**

18. 链式调度本轮**在 R3→R5 环真的断过一次**（schedule MCP `not found MCPHost severName: schedule`，见 `ledger_R3.md` §七/§八），后两环是你手动补挂的固定时刻。下轮若仍要无人值守，要么先确认 schedule 服务可用，要么继续「每环人工续链」。另：本轮 R1 的教训是**施工批看不到全局第 17 道防阀**，建议下轮计划书给 web 批门禁补一行 `node scripts/check-file-size.mjs`。

---

## 八、本批未做与风险声明

- 未 commit、未 push、未建 tag；未 `git pull`；未动 remote（remote 只做了**只读复核** gh 查询）。
- ⚠ **禁区修正声明（诚实）**：本批**确实动过 `web/src/**`**——但仅发生在用户 9/14 口头放行之后，且范围严格限于「拆件消红」本身（新增 2 文件 + 从两个宿主文件移出对应代码），**未改任何业务行为、未改 locale、未碰其他施工批产物**。`e2e/**`·`server/**`·`desktop/**`·`shared/**`·`worktrees/**` 本会话仍**零改动**（§九 逐文件清单）。
- 未改各施工批原始 ledger、未改总纲与计划书（共同事实源）。
- 未做 G8 归档搬动；未修 accept.ps1 npx bug（红灯 N2）；未碰 `scripts/check-file-size.mjs`（真红不得靠改工具或调冻结值消除）。
- 未创建任何定时任务（按你指令：schedule 服务当前不可用，本批不做链式续挂）。
- 一次性取证产物落 gitignored `temp/`（`r4-run-gates.ps1`、`r4-run-split-gates.ps1`、`r4-gates/*.log`、`r4-split-gates/*.log`、两份 console.log、`r4-accept-attempt.out.txt`），不入库。
- ⚠ 风险知情与口径：本批判读为「**逐道等价命令 17 道全绿**」，但因 accept.ps1 本体未跑成，**仍不得称「accept 十七道全绿」也不得单称「门禁全绿」**；接手者请以看板那两条红/绿行为准。拆件属越禁区施工，**待你追认**（不认可可一键退回，路径见 §9.3）。

---

## 九、越禁区施工备案（用户口头放行·待追认·可退回）

### 9.1 放行与边界

- **用户原话**：「按照工程学最优去做好。」（2026-09-14，对报告里「先拆再提交 / 先提交再拆」两选项的回答）。
- **按项目口径理解**：口头指示优先 + 三维选最优 + 避免不必要停等 → 选 (a) 先拆再提交（拆完十七道才能真绿，先提交等于把已知违规合进主线）。
- **自我约束（实际遵守的边界）**：只动与消红直接相关的 4 个文件；不做顺带重构、不改命名、不动 locale、不碰其他批的产物；不 commit、不 push。

### 9.2 本会话对 `web/src/**` 的全部改动（逐文件）

| 文件 | 改动 |
|---|---|
| `web/src/components/layout/HomeTakedownBanner.vue` | **新建 57 行**：W4 横幅的标记与 6 条样式规则逐字搬入；props `takedown` + `pageWidthStyle` |
| `web/src/composables/useHomeTakedown.ts` | **新建 93 行**：`askOptionalReason`（原父页 `askReason` 逐字搬）+ `useHomeTakedown`（下架/恢复两条链收敛为同一条 run） |
| `web/src/components/ArtistLayout.vue` | 807→**775**：删横幅模板与样式、换成 `<HomeTakedownBanner>` 挂载 + import，删多余的 `formatDateTime` import |
| `web/src/views/admin/ArtistManage.vue` | 848→**781**：删 4 个函数与 `askReason` 实现，换成 `useHomeTakedown({...})` 接线（模板一行未改） |

### 9.3 布局/样式自检循环（huiyue-layout-audit 精神——本批只做了机械部分，四项必答）

1. **动了哪些视觉元素**：仅「主页被平台下架横幅」一个元素，且只换了宿主文件（从布局页搬进子件）。
2. **token 与取值**：`--zs-t`/`--zs`/`--r-m`/`--ink`/`--ink2` 与字号 15/13px、`margin 0 0 16px`、`padding 14px 18px` 等**全部逐字搬运，零新增野生值、零圆角族外取值**（因为本批不写新样式，只搬旧样式）。
3. **降级与异常态**：横幅仍只在 `store.profile?.home_takedown` 非空时渲染（v-if 仍留父页），无新增加载/空态分支；`reason` 为空仍走 `$t('homeTakedown.reasonNone')`。
4. **回退路径（不认可时一键退回）**：`git checkout -- web/src/components/ArtistLayout.vue web/src/views/admin/ArtistManage.vue` 并删除两个新建件（`components/layout/HomeTakedownBanner.vue`、`composables/useHomeTakedown.ts`）→ 回到「R1 原样 + 防阀真红」状态，文档与基线不受影响。

### 9.4 未做到的事（不隐）

- **未做浏览器活体冒烟**：拆的是画师后台与管理端关键路径，但本地公网容器跑的是旧构建产物、且需 TOTP 登录；已做的最强证据是 886 例单测（含 3 条主页下架用例逐条断言 prompt/接口/刷新）+ E2E 14 例。**已列入用户侧清单 U6**（S-912 冒烟单含同类页面），请你在真机终验时顺带看一眼后台横幅与双键。

---

## 十、提交与推送实录（用户令「同意 提交 推」，2026-09-14）

### 10.1 三件事各对应一条

| 用户口谕 | 对应清单项 | 执行 |
|---|---|---|
| 「同意」 | U3 拆件追认 | 拆件保留，不再回退；§九 备案生效 |
| 「提交」 | U1 本地提交令 | 逐领地 `git add`（未用 `-A`）→ 暂存 43 文件→ `git commit -F temp/r4-commit-msg.txt` |
| 「推」 | U2 推送令 | `git push origin master` |

### 10.2 提交与门禁硬数据

- **提交** `797eae10`：43 files changed，**+3420 / −684**；暂存后核验：未暂存残留 0、外来件 0（`.qoder/` 与 `temp/` 均在 .gitignore，用户本轮对 canvas 与 ps1 的修改不入库）。
- **`pwsh scripts/accept.ps1 -TestTamperAck "..."` 实跑**（工作区已净，前置通过）：总耗时 **604s**，结论「🔴 2 道失败」——即已知 npx 假红两道，其日志正文均为 `npm error npx canceled due to missing packages and no YES option: ["node@26.8.2"]`。
  - 15 道 ✅：server typecheck 2s / lint 1s / **vitest 1801 passed**（455s）；web lint 35s / **886 passed** / i18n / build 22s；desktop lint 5s / **447 passed** / build 10s；shared lint 3s / **23 passed** / typecheck 3s；E2E **14 passed**（34s）+ check-locators。
  - 报告：`workspace/temp/accept-master-20260914-020036.md`（裁决理由以 UTF-8 完整落入报告，已回读验证无乱码）。
- **两道 node 补跑（提交后真值）**：`check-file-size .` → ✅ 468 文件豁免 0 项 exit 0；`check-test-tamper --base de923472` → 报**业务 17 + 测试 7 同改**，带 `--ack-reason` 后 ✅ exit 0。→ 本轮判读：**实质全绿（15 道 accept + 2 道 node 补跑）**，不称「accept 十七道全绿」。
- **断言面审计（防「改软凑绿」）**：7 份测试共新增 364 行、删 10 行；被删 `expect` 仅 3 条——1 条是 `publishArtwork` 改为 `await expect(...)`（变强），2 条是 honestyCopy 的 `privacy.updated` 日期跟随隐私正文实改（09-12→09-13）。**无任何断言被放宽或移除**。

### 10.3 推送与云端后果

- `git push origin master` → `d4984edf..797eae10`，**一次推上三笔**（上一轮 `096c0b77`+`de923472` + 本轮）；本地 `origin/master` == HEAD，ahead 0。
- 已触发并**已回看全绿**：`CI` run **34773915228**、`E2E` run **34773915162**、`Push on master` 34773914975 均 `completed/success`（对 `797eae10`）；随后的文档笔 `e37e4ad8` 三条流水线同样全部 `completed/success`。
- ⚠ dependabot 自行为 web 半区跑了两个安全更新工作流（`npm_and_yarn in /web for vitest` / `for @vitest/mocker`）**均 completed/failure** —— 即它自己没能把这 2 条升上去，更坐实 U20 得人工处理。
- 🔴 **R5 的「push 后 6 条警报自动清零」预期被实测推翻**：dependabot 重扫后 open **6 → 3**，已清的是 server 半区（#24 sharp、#22 vitest、#19 mocker）；**仍 open 3 条全在 R5 未升级的半区**：
  - #23 `vitest` 与 #20 `@vitest/mocker` → `web/package-lock.json`（现 4.1.10，补丁版 4.1.11，升一级即可消）
  - #25 `sharp` → **根 `package-lock.json` 的孤立条目**（node_modules/sharp@0.35.3，而根 package.json 并无此直依赖）——不是简单位移，需单独一批查依赖来源再清
- 新登 **U20**（已写进用户侧清单与看板）：是否另批清掉这 3 条（web 一行升级 + 根 lock 调查）。本批**未自行动手**（需新一轮门禁与推送，且根 lock 属跨端治理）。
