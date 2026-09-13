# ledger_P3 · 定时开工前端批（2026-09-13）

> **批次**：P3 前端批（计划书 `docs/comms/定时开工计划书-P3-前端批-20260912.md`，schedule `05f1f69a` 触发）。
> **领地**：只 `web/src/**` + 本批产物三份新文档（均在 `docs/comms/`）。**未碰** STATUS / desktop / server / shared / design / worktrees / api barrel。
> **状态**：🟢 三处小修 + 设备补测已完成并过 web 四道门禁；🟡 F12 已按用户指示（“全部按工程学与社会学最优解去做”）推进到：**四个决策点已定 + 可交互原型已产出并机测通过**，仍**未写产品代码**，等你验收原型后开施工批。
> **本批不 commit、不 push**（等令）。

---

## 一、改了哪些文件（实际行号，共 5 个源文件）

> 补一（用户 9/13 放行“gif补”）：另改 `web/src/locales/zh-CN.ts:1878` 与 `en.ts:1881`——**头像提示句 `settings.avatarHint` 也补上 GIF**（就是第四节第 4 条那个新发现，现已经你同意一并修），改后 web 四道门禁已重跑全绿（见第二节）。

| # | 文件:行 | 改动 | 工单 |
|---|---|---|---|
| 1 | `web/src/constants/toolbox.ts:22` | 注释「19 个小工具」→「18 个小工具」（实测 `TOOLS_MENU_ITEMS` 恰 18 项：钱袋子 6 + 交付 6 + 客户 3 + 效率 3） | F-30 |
| 2 | `web/src/components/layout/artistMenu.ts:52` | 注释「13 个工具收进四分类抽屉」→「18 个工具」 | F-30 |
| 3 | `web/src/locales/zh-CN.ts:1672` | `artworks.tip` 图片格式列表补 GIF：「支持 JPG / PNG / WebP / GIF」 | F-24 |
| 4 | `web/src/locales/en.ts:1673` | 同步 `artworks.tip`：「JPG / PNG / WebP / GIF supported」 | F-24 |
| 5 | `web/src/views/admin/__tests__/ArtistDetailDrawer.test.ts` | 设备 tab 补测：+7 用例（8 → 15），并补 `adminApi` mock 登记与表格类 stub | 9/12 路 3 登记项 |

**F-30 行号漂移实录**（计划书已预警）：工单记的第二处是 `ArtistLayout.vue:366`，实际该注释已随 9/12 F-09 拆分流到 `components/layout/artistMenu.ts:52`，按计划书"跟着改到实际所在文件"处理。`ArtistLayout.vue` 本体无该注释，未动。

**F-30 其余两处不属本批**（按计划书划走）：`shared/src/utils/ink-palette.ts:24` → P5；`docs/CONTEXT.md:72` 的「161 DTO」→ P1 的 F-18。

**设备补测明细**（`ArtistDetailDrawer.test.ts`，新增 7 例）

1. 未切 tab 不预拉；切过去才调 `getArtistDevices(artistId)` 并逐行渲染（5 列 × 2 行，含 `last_login_ip`，`device_name`/`last_login_ip` 为 null 时兜底「-」）
2. 加载中：设备面板既不出表格也不出空态（防在途期间误显示「暂无设备」）
3. 空清单 → 面板显示 `account.devicesEmpty` 空态、无表格
4. 加载失败 → 错误横幅（非静默）+ 点重试恢复列表
5. 踢出：`popconfirm` 点确认才发 `revokeArtistDevice(1, 21)` → 成功提示 + 重新拉列表
6. 在途锁：请求挂起期间本行与他行确认均不重发，两行踢出按钮全程 `disabled`；完成后解锁
7. 踢出失败 → `ElMessage.error` 且锁已释放可重试

配套改动：`adminApi` mock 补登记 `getArtistDevices` / `revokeArtistDevice`；新增 `el-table` / `el-table-column` / `el-popconfirm` 三个 stub（列按真实 `data` 逐行渲染，沿用仓库既有 `RowColStub` 手法）；`el-tab-pane` stub 加 `data-pane` 属性以便按面板限定选择器（其余面板在 stub 下全部渲染，不限定会假绿）；`el-empty` stub 补 `description` 渲染。

**F-24 甄别结果**：水印 LOGO 入口那句「LOGO 需 PNG」（`zh-CN.ts:710` / `en.ts:711`）与 `Watermark.vue:408` 的 `file.type !== 'image/png'` 拒绝逻辑**未动**——水印只收透明底 PNG 是设计意图，与作品上传不是一回事。

---

## 二、门禁数字（web 四道，2026-09-13 02:48~02:56 实跑）

| 道 | 命令 | 结果 |
|---|---|---|
| lint | `cd web && npm run lint`（= typecheck：`vue-tsc --noEmit` + `tsc -p tsconfig.scripts.json` → 再 `eslint .`） | **exit 0，零错误零警告**（eslint 无输出） |
| test | `cd web && npm run test:web` | **Test Files 124 passed (124) / Tests 876 passed (876)**，Duration 12.22s |
| i18n | `cd web && npm run check:i18n` | **OK — 存量违规 13 条豁免，无新增硬编码中文，中英词条键集一致**（exit 0，**豁免数 13 → 13 无新增**） |
| build | `cd web && npm run build` | **✓ built in 19.90s**（exit 0） |

**门禁跑了两轮**：第一轮在三处小修+补测后（build 20.45s），第二轮在补上头像 GIF 后全量重跑（上表即第二轮结果，12.22s/19.90s）。两轮数字一致。

基线对照：计划书登记 web 基线 869（124 文件）→ 实测 **876 = 869 + 本批新增 7 条设备用例**，文件数不变（用例落在既有测试文件内）。新基线取实测 876。

> 注：本批只跑 web 四道，**不等于「门禁全绿」**（那专指 `pwsh scripts/accept.ps1` 十七道全过，由 P5 收口批跑）。

---

## 三、F12 网页端完稿引导卡（🟡 决策已定 + 原型已出，**未写代码**）

- **施工图**：`docs/comms/施工图-F12-网页端完稿引导卡-20260913-待用户确认.md`（§一已改为“按最优解定”并给出工程/社会双栏理由；§十是原型机测结论）。
- **四个决策点已定**（用户口头指示按最优解推进，可逐条推翻）：A 右下角浮层纸签卡 / B 三动作全用站内既有词（**发布为作品 · 分享完稿 · 打开图片水印**，两个出口：知道了 / 不再提示）/ C **单独立批**（shared 本体 + 两端宿主壳，不塞 P5 收口批）/ D 第一版不做埋点（事件名要进 server 禁区白名单）。
- **可交互原型**：`docs/comms/proto-f12/proto-delivered-guide-v1.html`（单文件零依赖；没放 `design/**`——那是 P1 领地）。预览：临时静态服务 `temp/f12-proto-serve.mjs`（端口 8971，gitignored）。
- **机测结果**：用仓库已有 jsdom 无头驱动点击跑完整判定链，最终 **28 条断言全过 / 0 失败**（取证脚本 `temp/f12-proto-verify.mjs`，gitignored 不入库）。零浏览器/零桌面操作。
- **用户反馈“话术口径与现有不一致”→ 已逐条对站内核并修正两处真错**（详见施工图 §一❶ 与 §十一）：
  1. 第 2 个动作原写「分享跟踪链接/给客户取件用」——站内 `shareBtn:'分享'` / `shareDialogTitle:'分享完稿'` 其实是**发社交平台**，「追踪链接」是客户查单用——已改名「分享完稿」；
  2. 我上轮判「预填文案 = 新机制、第一版不做」**不属实**：REQ-031 B1 已落 `shareTemplate` + 占位符 = 现成预填文案——已收回该结论并写回施工图（三项动作全部复用既有能力，零新机制）。
  其余已对齐：已交付/交付图/公开作品区/非图片不可发布/交付成功！/图片水印/完稿图/不再提示（与开张任务卡同词）/知道了。
- **新增话术硬锁（防再犯）**：取证脚本直接从 `web/src/locales/zh-CN.ts` 抽 5 个站内词真值去比卡片动作名，并扫 9 个旧自造词；断言绑 `data-branch` 键而不绑文字；另加“字面量确实被扫到”防自检本身假绿。施工图 §十一 已把这三条写成施工批规矩。
- **视觉自检（本轮新增，用户指示“直接截图自己看，不绕其他 skill”）**：用仓库已有 Playwright 起本地无头实例拍 10 张状态图（脚本 `temp/f12-proto-shoot.mjs`、图 `temp/f12-shots/`，均 gitignored；**不碰用户浏览器与桌面**），目测发现 **6 处真问题并已全部修完**：① 窄窗降级是坏的（动作被挤进 62px 列、一字一行）② 三动作全实心大块→主次糊且字号 20px 时卡片顶页面、与 toast 相叠（改为 1 实心主按钮 + 2 文字链，并加 `max-height` 护栏）③ 暗色下主按钮 hover 变浅（改 `filter: brightness(.92)`，双主题同向）④ 次级动作“名称·说明”被拆两行⑤ 原型 toast 无限叠加盖控件⑥ 缩略图占位在暗色看不见。修后实测：字号 20px 卡片高 584/顶边 y=178、窄窗卡片高 350px、与页面按钮遮叠数 0。详见施工图 §十二。
- **跑出来的硬收获**：卡片初稿偷偷用了 `--hq-t`/`--hq-d`/`--dur-mid` 三个契约外 token——已改为只消费 15 项清单内的 13 个，**F12 落地不需扩 `shared/README.md` 契约、不需桌面端先建 token 注入层**；浮层不投影只描边，与设计语言“一叠纸不是悬浮盒子”同向（已经截图证实两主题都读得清）。
- **仍未完成的卡点**：只剩**文案语感与整体观感**（机测与截图自看都替不了你）——等你看过原型再开施工批。
- **顺带发现的口径差**（只登记，不改文档）：REQ-014 原文写「订单**点完成**时弹」（done 态），9/4 与计划书细化为「**delivered** 交付后弹」。施工图按 delivered 设计，并建议在文档收口批把这条差异回写。

---

## 四、卡点清单

1. **F12 前置已基本扫清**：施工图✓ 决策定✓ 原型出✓ 机测 28 条绿✓ 视觉自检 6 处修完✓ → **只差你验收文案语感**；过了才开施工批（shared 本体 + 两端宿主壳，按决策 C 单独立批，需用户同时解禁 `shared/**`）。验收前不得有人照施工图改代码。
2. **G1 图片链接续期**：红灯未拍，**本批一个字没碰**（`web/src/composables/useSignatureRefresh.ts` 原样）。
3. **S-912 冒烟 A 组 18 条**：黄灯需你 TOTP 登录，本批不代替。
4. ~~**`settings.avatarHint` 也漏 GIF**~~ → **已解除**：用户 9/13 回“gif补”，本批已一并修正（zh `:1878` / en `:1881`），并已过第二轮 web 门禁。

---

## 五、自检三关（计划书第七节）

1. **越界自查**：本批产物 = `web/src/` 下 5 个文件（三处小修 + 设备补测）+ `docs/comms/` 下 3 份新文档（本 ledger、F12 施工图、原型 html）；取证与预览脚本只在 gitignored `temp/`。无一处落 `shared/` `desktop/` `server/`，未碰 `docs/comms/STATUS.md`，未动 `web/src/api/**` barrel，未碰 `design/**`（P1 领地）。（工作区同时存在 P1/P2/P4 其他会话的在途改动，非本批所为，未代其提交。）
2. **F-30 反查**：全仓搜「19 个小工具」「13 个工具」→ web 代码零残留；仅剩两处**应当保留**的原文：`docs/comms/文档系统交叉审计-修复工单-20260905.md:281`（工单本身在描述这个错）、`docs/comms/archive-20260819/STATUS-archive-20260814.md:121`（历史归档，记的是当时确实只有 13 项）。
3. **F-24 反查**：水印 LOGO 的「只接受 PNG」未被误加 GIF（`zh-CN.ts:710`/`en.ts:711`/`Watermark.vue:408` 三处原样）；中英 locales 同步改，`check:i18n` key-diff 绿。
4. **视觉自检（本轮新增第 4 关，用户指示直接截图自己看不绕 skill）**：无头 Chromium 拍 10 张状态图逐张目测，发现并修完 6 处（窄窗降级坏 / 主次糊与高度失控 / 暗色 hover 反向 / 行中断句 / toast 叠加 / 暗色占位看不见），修后重拍复核通过；详见施工图 §十二。

---

## 六、收尾声明

- 本批**不写 STATUS**，看板与 STATUS 新条目由 P5 收口批统一合并回写。
- 本批**未 commit、未 push**（按总纲第 7 节「提交待令」）。
- 若 P5 收口要引用新基线：web 用例数 **876 / 124 文件**，i18n 豁免 **13 条无新增**。
