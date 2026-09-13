# ledger_P5 · 收口批（定时开工 2026-09-13）

> **批次**：P5 收口批（计划书 `docs/comms/定时开工计划书-P5-收口批-20260912.md`，schedule `d22f8ec4`）。**本会话由用户在 P4 会话内直接下令执行**（用户原话「p五收口」），非到点自动触发。
> **性质**：合并 P1~P4 台账 → 回写 STATUS + 刷基线 → 做 shared 色值 → 全量门禁 → **提交待令**。
> **领地**：`docs/comms/STATUS.md`、`scripts/accept-baseline.json`、`shared/src/utils/ink-palette.ts`、本台账（各批原始 ledger 只读合并，不改）。
> **未 commit、未 push**（见 §5，卡在同一个前置上，需用户一句话）。

---

## 1. 前置校验结果（计划书写「不满足就停下报你，不硬收口」）

| 检查项 | 结果 | 证据 |
|---|---|---|
| ledger P1~P4 齐全 | ✅ 四份都在 | `ledger_P1.md`(12.0KB) / `P2`(18.3KB) / `P3`(8.8KB) / `P4`(21.1KB) |
| 各批端门禁绿 | ✅ 全部申报绿，**且本会话逐端复跑复核**（见 §2） | server 1801、web 876、desktop 447、shared 23 |
| 工作区是否静止 | ⚠ **一度未静止，现已判明收工** | 03:25~03:28 有 `web/src/locales`、`docs/comms/proto-f12/*` 写盘，且 `ledger_P3.md` 在我首次读后从 89 行长到 96 行 → 追查确认是 **P3 自己的第二轮**（用户 9/13 回「gif补」放行 `settings.avatarHint` 补 GIF，P3 已把"补一"写进 ledger §一并重跑 web 四道全绿）。**台账与实况已自洽**，非未记录的第二方改动 |
| 文件归属是否可分捡 | ✅ 全仓 105 项改动全部落在 P1~P5 五块领地内，无外来会话文件 | 按目录分组核对：P1 文档/CI/.gitignore/design/r2、P2 `desktop/**`、P3 `web/src` + proto-f12、P4 `server/**`、P5 shared/基线/STATUS |
| 🔴 `accept.ps1` 十七道能否跑 | ❌ **物理跑不了** | `scripts/accept.ps1:56-59`：存在未提交的已跟踪改动即 `Write-Error` + `exit 2`（038 事故防线）。工作区有 ~70 项待提交 → 十七道**一道都进不去** |

### 1.1 登记的流程矛盾（不改脚本、不改计划书，只报）

P5 计划书 §四「先跑全量门禁」→ §五「门禁全绿后提交待令」，但 `accept.ps1` 的前置检查要求**工作区干净**。两者互斥，**实操顺序必须是：提交 → 跑十七道 →（若红）补一笔修复提交**。本轮按实操顺序执行，计划书原文未动（它是共同事实源，施工会话不得修改）。

---

## 2. 本会话亲跑的实测（不凭各批汇报，全量复跑）

```
server  npm run typecheck → tsc ×3（src/scripts/tests）无输出
        npm run lint      → eslint . && oxlint src tests：0 warnings 0 errors（337 files, 98 rules）
        npm test          → Test Files 156 passed / Tests 1801 passed（440.55s）
web     npm run test:web  → Test Files 124 passed / Tests 876 passed（12.16s）
        npm run build     → ✓ built in 14.62s
desktop npm run test      → Test Files 30 passed / Tests 447 passed（3.74s）
        npm run build     → ✓ built in 2.82s
        npm run lint      → eslint . 无输出（0 错）
shared  npm run lint / test / typecheck → 0 错 / 4 files 23 passed / vue-tsc 无输出
根      node scripts/check-file-size.mjs → ✅ 通过（扫描 465 个源码文件，上限 800 行，豁免 0 项）
```

⚠ **不得称「门禁全绿」**：那专指 `pwsh scripts/accept.ps1` 十七道全过。本轮是「四端各端门禁 + 防阀实测全绿，十七道待提交后补跑」。
E2E 未复跑（13 沿旧值）：本批未改 web 路由与交付链路；但 P4 新增的 compliance/下架管理端点在 E2E 是**零覆盖**，已登记为待派项（ledger_P4 §9.5 W8）。

---

## 3. P5 自己的三项交付

### 3.1 F-30 第四处：shared 石绿浅底色值对齐

`shared/src/utils/ink-palette.ts:24` `slT: '#EAF3EC'` → **`#E5F1E9`**，与两处 css 事实源（`web/src/styles/artist-tokens.css --sl-t`、`desktop/src/styles/paper-ink.css --sl-t`）统一。
- 改前核实计划书断言「无测试钉死」：`git grep EAF3EC -- *.ts *.vue *.css` 改后仅命中我新写的那行说明性注释，**零实际取值、零断言** → 断言属实。
- 改后按 AGENTS.md 共享层清单复跑：shared 三道 + **web build + desktop build**（shared 以 `file:../shared` 直导源码，两端都吃）→ 均绿，web/desktop 用例数不变（876 / 447）。

### 3.2 `scripts/accept-baseline.json` 同步

`server 1715→1801`、`web 869→876`、`desktop 281→447`、`shared 23 不变`、`e2e 13 未复跑`、`updatedAt 2026-09-13`；note 与 history 写明每一笔涨在哪个批、哪几个测试文件。
- ⚠ 中途我把新 JSON 写坏过一次（尾部残留旧 note/history 两行，成非法 JSON）——已重写并用 `node -e "require(...)"` **解析验证通过**。教训照旧：写入工具报成败不可信，落盘要回验。

### 3.3 `docs/comms/STATUS.md` 回写（守体例）

- **看板刷新为第五次**：HEAD `d4984edf` + 「工作区挂着五批成果未提交」；基线四端 + 迁移 v76；🔴 明写「十七道未跑 + 原因」；本轮改动归属；公网冻结与 `admin_qq` 硬警告保留。
- **下一步压到 5 条**（体例 3~5 条）：commit 令 → W1~W8 → 两处待追认 → 活体债归拢一条（含 E2E 补 compliance）→ 黄红灯集中清（并把过期的「公网升 v74」纠正为「公网停在 v74，本轮已到 v76」）。
- 旧看板里两条**常驻纪律**（改 `src-tauri` 必跑 `cargo check`、ALLOWLIST 为 0 项不得续命）没有随看板刷新被冲掉，单列「常驻纪律」小节保留。
- **新增一条 9/13 收口条目**：短标题 + 分组要点，无超长行；含 P4 性质纠正（REQ-042 需求回归）、新能力、门禁、流程矛盾、G8 标注、台账指针（桌面端细节指回 `desktop/docs/STATUS.md`，不互抄全文）。
- 🔴 **未做归档搬动**（G8 红灯）：正文现 **7 条**，超体例 5 条，已在收口条里标注「待 G8 归档批单独处理」，本批一个字未搬。

---

## 4. 对各批交回项的裁决（P5 权限内的才裁决，越权的转用户）

| 来源 | 事项 | 裁决 |
|---|---|---|
| P2 待核点① | 发布清单第 19 项标 `[x]`（连带纠错） | ✅ **认可**。本会话核代码坐实：`.github/workflows/desktop-release.yml:50` 确有 `Install shared dependencies`，文档原写"漏网至今"已与代码不符，按 AGENTS.md「以代码为准」就地纠错正确 |
| P2 待核点③ | 波2 施工图是否与波1 同目录（波1 在 `docs/comms/`，波2 在 `desktop/docs/`） | ✅ **保持现状不搬**。波1 在 P1 领地、波2 在桌面领地；纯文本搬动属高风险迁移，按纪律单独一批做，不夹进代码收口 |
| P2 待核点④ | 基线以实测为准刷 baseline | ✅ 已做（447） |
| P2 待核点② | `desktop/docs/STATUS.md` 看板日期标签仍是「（2026-09-05）」 | ⏳ **转用户/桌面批**。该文件不属 P5 领地（P5 只碰主 STATUS），且"看板回写权限"归桌面端；主 STATUS 已加指针 |
| P2 待核点⑤ / P4 / P3 | 「口头授权推翻停等」追认（P2 波2 拖拽已施工 165+ 例、P4 两项已施工、P3 F12 已到原型） | 🔴 **必须由用户本人追认**，P5 不代拍。三批都是照同一句「全部按照工程学和社会学的最优方法去做」推进的，口径一致；若要退，P2 已给出可整批退回路径（`git checkout -- desktop/src` + 删 4 个新文件，文档不受影响） |
| P1 交回 | 「P5/用户终验请对新增正文再通读一遍」（转义码点形近错字病） | ✅ **已做筛查**：一次性脚本 `temp/p5-typo-scan.mjs`（gitignored），以 299 个已提交文档的 1933 个常用汉字做参照字集，扫本轮 41 个 .md，18 个命中"参照集外汉字"，逐条人眼判定全为正当用字（纲/抉/咬/盯/搓/歇/慑/赚/旺/砸/疼/塑/俱…），**无残留错字**。本会话自查阶段已改掉的七处（研究/钳制/照拄→照抄/栏→漏判风险重写/价值/不必要/公开挂牌示众）是在筛查前就当场发现并修的，不在这批残留里 |
| P1 交回 | F-16 提及「server-backup.sh 脚本本体重做移交 P5」 | ⏳ **未做，转用户**。它不在 P5 计划书领地（P5 只列 STATUS/baseline/ink-palette/ledger 合并），且属运维脚本改动需单独门禁；本轮只在台账登记，不夹带 |

---

## 5. 提交待令（本轮唯一硬卡点）

工作区待提交内容 = P1~P5 五批 + 本台账。按纪律**不自动 commit**，且提交时**禁 `git add -A`**（须按领地逐文件加，防误扫并行会话在途件）。

**commit message 草稿**（用户下令后按此提交，或拆成 2 笔：功能一笔、文档一笔）：

```
feat(server,shared): 管理动作留痕补 IP + 主页/作品级内容下架（v75/v76，REQ-042 需求回归）

P4 后端批：补 REQ-042 §三 C「内容级下架（作品/留言/主页）」与 §三 B 阶梯中间格。
- v75 forensic_ip：admin_actions.admin_ip / reports.report_ip / guestbook_messages.ip
  （取 IP 一律 request.ip，CF→Caddy 已在反代层换算；留言 IP 按 SQL 构造只到管理端）
- v76 content_takedown：artists.home_takedown_{at,reason}、artworks.takedown_{at,reason}
  主页下架不踢登录、画师自助不可解；作品下架由物理删改为可恢复
- 新增 GET /api/admin/admin-actions（此前留痕表只写不读）+ home-takedown/restore + artwork restore
- 可见性判定收口为 artist-visibility.service（此前散落 10+ 处且不一致），顺带修 hidden 画师日历订阅漏判
- 补 3 处零留痕管理动作（设 hidden / 移除画师 / 管理端删作品）；server 1715→1801 例
- shared/dto.ts：下架原因不平铺进任意响应体，管理端照 last_login_ip 范式显式重附

docs(P1)/feat(desktop,P2)/fix(web,P3)/chore(P5)：定时开工编排五批合并收口，详见
docs/comms/ledgers/ledger_P1..P5.md；基线刷新 server 1801 / web 876 / desktop 447 / shared 23。
STATUS 看板刷新至第五次，正文超体例待 G8 归档批。
```

**提交后必做的两步**：① `pwsh scripts/accept.ps1` 十七道（需 Docker/服务就绪，E2E 走 5099 端口）；② 若十七道出现红，补修后追加一笔提交，并把结果回写本台账。

**⚠ 提交前注意**：`accept.ps1` 的 test-tamper 闸门（`--base master`）会对"业务与测试同改"要求 `--ack-reason` 裁决理由——本轮 P4 既改源码又改测试断言，届时须带理由跑，理由建议：`P4 v75/v76 契约变更（下架由物理删改软下架、留痕表加列），断言随之更新，非为过门禁放宽断言`。

---

## 6. 等你清单（汇总一份，不施工）

- **一句 commit 令**：要不要提交、是否按上述 message、单笔还是拆两笔。
- **两处追认**：P2 波2 拖拽（已施工，447 例）与 P4 两项（已施工）按「口头授权推翻停等」推进是否认可；P3 F12 引导卡原型待你看 `docs/comms/proto-f12/proto-delivered-guide-v1.html` 验收观感。
- **P4 的 web 侧 W1~W8**（详单 `ledger_P4.md` §9.5）：W1 留痕页 / W3 下架按钮 / W4 画师下架横幅 / **W6 隐私政策三条披露（含既存漏披露的登录 IP）——不做就是对外不诚实，且有诚实测试会红**。
- **黄灯 4 项**：S-912 冒烟（需你 TOTP/真机）、公网解冻部署（🔴 先确认 `admin_qq` 非空，且公网停在 v74 落后到 v76）、桌面发布硬依赖（密钥对/vars/SignPath）、`design/r2` 三版原型选定。
- **红灯**：G1~G9 + F-31/F-32/F-35/F-36（详单见总纲 §6），**以及 G8 STATUS 归档搬动**（正文已 7 条超体例）。
- **两处转来的待办**：`desktop/docs/STATUS.md` 看板日期标签刷新（属桌面批）；`server-backup.sh` 脚本本体重做（属运维批，P1 移交）。

---

## 7. 本批未做与风险声明

- 未跑 `accept.ps1`（被前置检查物理拦下）、未 commit、未 push、未建 tag。
- 未碰各施工批领地返工（发现问题只登记：见 §1.1 流程矛盾、§4 转用户项）。
- 未碰 `worktrees/**`、`.qoder/**`、资金域、`data/commission.db`。
- 未做 G8 归档搬动（高风险文本迁移，单独一批）。
- `temp/p5-typo-scan.mjs` 与 `temp/p5-typo-scan.out.txt` 是一次性取证产物，落在 gitignored `temp/`，不入库。

---

## 8. 第二次触发复核（schedule `d22f8ec4` 到点，2026-09-13 04:10）

- **性质**：P5 此前已被手动执行过一次（§抬头记的「p五收口」令）。本次是**定时触发的第二跑**，只复核 + 补硬证据，未重写任何既有产物，未返工任何施工批。
- **①②③⑤⑥ 复核无误**（逐条对代码核实，非信转述）：
  - `shared/src/utils/ink-palette.ts:27` `slT:'#E5F1E9'` 在位 + F-30 注释齐全；`git grep EAF3EC` 全仓零残留。
  - `scripts/accept-baseline.json` 五数在位（server 1801 / web 876 / desktop 447 / shared 23 / e2e 13）、`node -e require` 解析合法。
  - `docs/comms/STATUS.md` 看板第五次刷新 + 9/13 收口条在位、守体例（短标题+分组要点、无超长行）、G8「正文超 5 条待归档批」已标注未搬。
- **④ 十七道：本会话亲跑取硬证据**：真跑 `pwsh scripts/accept.ps1`（输出留 `temp/p5-accept-attempt.out.txt`，gitignored），在 `:57` 前置检查 `Write-Error` 中止、退出非 0、**零门禁执行**——把 §1.1 的「读脚本推断死锁」升级为「实跑坐实」。工作区脏（未提交跟踪件）即被 038 防线拦死，与「不提交」令互斥。
- **文件归属复核**：全仓 **109 项**（72 改 + 37 新，比首跑的 105 略增＝各批收尾又落了盘），用过滤器排除 P1~P5 五领地后查外来件返回 **0** → 无并行会话在途件混入，提交可按领地逐文件分捡（禁 `git add -A` 仍照守）。
- **结论未变**：仍卡在同一处——须用户下**本地提交令**（不 push）才能解锁十七道。本会话同样**未 commit、未 push**。
