# ledger_W7 · 第二轮定时开工 · W7 主页文案落地批（链式起点）

> **性质**：W7 落地施工台账（不写 STATUS，收口由 R4 统一合并回写）。
> **触发实况**：本批为第二轮**链式起点**，由主会话手动创建的 schedule 任务（`goalEnabled=true`）在独立 Quest 触发，goal 模式自持推进。
> **一句话**：把 `artistHome.hidden`（主页不可访问提示）从"仅给自隐身画师的自助指引"改为**方案 A**（中性 + 双指引），中英同步。

---

## 一、改了哪两条（改前 → 改后，实录）

### `web/src/locales/zh-CN.ts:844` `artistHome.hidden`

- **改前**：`该画师暂未开放主页。如你是店主，请到「设置 → 主页展示」开启「小店展示」。`
- **改后**：`该主页当前不可访问。若你是店主且主动关闭了展示，可到「设置 → 主页展示」重新开启；若主页是被平台下架，请在你的后台查看原因与指引。`

### `web/src/locales/en.ts:845` `artistHome.hidden`

- **改前**：`This artist's page is currently unavailable. If you're the owner, enable "Shop visibility" under Settings → Public Page.`
- **改后**：`This page is currently unavailable. If you're the owner and have turned off your showcase, you can re-enable it under Settings → Public Page. If your homepage was taken down by the platform, check your dashboard for the reason and next steps.`

**语义对齐**：中英文均为"中性提示 + 双指引"——① 自隐身店主 → 去「设置 → 主页展示 / Settings → Public Page」重开；② 被平台下架者 → 去后台看原因与指引。与方案 A 口径一致。

## 二、施工时核实的用词纠偏（计划书明写"以代码为准"）

- 计划书英文建议串里用了 `Settings → Homepage Showcase`，但**站内实际 UI 标签**（`en.ts:1822` `tabShowcase: 'Public Page'`、`en.ts:1842` `shopVisibleLabel: 'Shop visibility'`）是 **Public Page**，且旧 `hidden` 键本身也写的是 `Settings → Public Page`。
- 计划书 §抬头明写"用词与站内既有口径对齐，**施工时核 en.ts 现有 artistHome 段用词**"、"改法与代码冲突以代码为准"。故实写采用站内真实导航名 **`Settings → Public Page`**，不用假想的 `Homepage Showcase`，避免文案与真实菜单名脱节。
- 中文侧导航名 `主页展示`（`zh-CN.ts:1821` `tabShowcase`）与计划书建议一致，直接采用。

## 三、门禁（主代理亲跑）

| 门禁 | 命令 | 结果 |
|---|---|---|
| i18n | `cd web && npm run check:i18n` | ✅ OK — 存量违规 13 条豁免，无新增硬编码中文，**中英词条键集一致** |
| build | `cd web && npm run build` | ✅ `✓ built`，退出码 `BUILD_EXIT=0`（尾部仅 Rollup `#__PURE__`/动态导入 chunk 既有警告，非错误） |

- 纯文案改值、不新增键，`check:i18n` key-diff 天然绿。
- 未跑全量 `test:web`（计划书口径：纯文案改值无需）；`honestyCopy.p1-0912.test.ts` 不涉及 `artistHome`（测 privacy/notify/setup），本批不影响它。

## 四、自检

- `git diff` 核对本批仅改动 `zh-CN.ts:844` + `en.ts:845` 两条 `artistHome.hidden`（各 +1/-1）。
- **领地纪律**：locale 其他区（`compliance.admin`/`privacy`/`artworks`/`homeTakedown`/`admin` 等 R1 已落地区）、`artistHome` 段其他键、`ArtistHome.vue` 组件（纯数据驱动，未改）、`server/desktop/shared/e2e/STATUS/baseline` **一律未碰**。
- **注**：`git diff` 里 locale 文件同时出现的 `homeTakedown`/`adminActions`/`privacy W6`/`takenDown` 等改动，均为 **R1 已落地但未 commit 的在途产物**（R1 纪律=不 commit 等 R4 提交令），非本批所改；本批仅动两条 `hidden` 键。
- locale 单写者：R1 已 `completed` 收工，本批独占 locale，零并发。

## 五、🔗 链式推进

- 本批（链式起点）完成后已链式创建 **R3 E2E 合规链路批**：
  - `taskId` = `cf2c9f4d-db9e-43bc-95c0-66228f9f8619`
  - `at` = `2026-09-13T15:56:30Z`（Asia/Shanghai **23:56:30**，取时间 23:47 后 +10 分钟）
  - `goalEnabled` = true，`repeat.frequency` = none
- **链条全序**：W7 落地（本批）→ R3(E2E) → R5(依赖) → R4(收口·链尾)。

## 六、提交纪律

- **不 commit、不 push**（等 R4 收口批统一处理，R4 提交待令）。
- STATUS 不写，由 R4 统一回写（W7 状态从"已拍板·停等"变"已落地"，R4 的"等你清单"相应更新）。
