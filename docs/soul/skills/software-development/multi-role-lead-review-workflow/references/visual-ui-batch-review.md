# 视觉/UI 批次交付审核 — 截图核验与"截图标错 vs 代码坏"分流

触发：审核任何视觉/换肤/UI 改版批次（画师后台视觉批、模板改版、配色/token 切换），交付报告附带实测截图 + 声称的验证数据。

## 核心教训：交付截图是 self-report，标签可能是错的；关键 UI 声称必须亲测复现

实例（v0.38 第二批）：二号交付报告声称管理后台两张截图为墨黑主题（`16-admin-dashboard-ink.png` / `17-admin-health-ink.png`）。逐张 `vision_analyze` 核验后发现**两张实际是浅色**——与报告声称不符。若只信报告就放行，等于把未验证的 UI 声称合入；若直接打回又冤枉——**代码本身可能没问题，只是截图拍错/标错**。

所以关键动作不是"信 or 拒"，而是**自己起隔离实例复现**，把"代码坏"和"证据标错"分开。本例复现结果：管理后台墨黑**真实生效**（`data-artist-theme=ink`、body 背景墨色），代码没问题，仅截图标错 → 照合，但把"截图标错"记入 merge message 留证。

## 审核步骤

1. **黑名单核查**（先做，快）：`git diff --stat master...<branch> -- <黑名单路径>` 应全空。视觉批黑名单通常是 theme.css/templates.css/palettes.css 只读 + views/client/ + components/templates/ + ThemePicker + server/ 零触碰。
2. **diff 逐行过**：token 体系是否 scoped（无 `:root`，挂 `html[data-...]` 条件属性）、作用域 enter/leave 生命周期是否正确、统计数字是否"墨色不上色"（铁律）、有无新增 eslint-disable/locales 键/依赖（报告声称"无"要 grep 复核）。
3. **实跑门禁**：web vitest + `npx eslint .`（web）+ `npm run build`（在 worktree 内）。
4. **截图逐张 vision 核验**：对关键截图（声称的深色主题、逾期/状态色、客户端零影响页）用 `vision_analyze` 提**针对性问题**（"这是深色还是浅色？第一句直接回答"）。把 vision 结论与报告声称逐条对照。
5. **发现不符 → 起隔离实例复现**（见下方配方），区分代码坏 vs 证据标错。
6. **客户端零影响实锤**：确认客户端路由下作用域属性为 null（脚本断言，非肉眼）。

## 隔离实例复现配方（PowerShell）

```
1. 临时库：Copy-Item 主库 → temp/<name>.db（⚠️ 别用生产库；跑完迁移 runner 会在库旁生成 .db.bak.v* 残留，清理时连 temp/<name>.db.bak.* 一起删）
2. seed + 注入验证凭证（如 TOTP：裸 better-sqlite3 直写 totp_secret/verified，别走 connection.js 防 journal_mode 切 WAL）
3. spawn 隔离服务器实例到备用端口（如 3100），WEB_DIST 指向 worktree 的 dist（先 npm run build）
4. playwright：真实登录 → page.evaluate 注入主题持久化键（localStorage）→ goto 目标路由 → reload → 断言 document.documentElement.getAttribute('data-...-theme') + getComputedStyle(body).backgroundColor → page.screenshot
5. vision_analyze 这张自拍截图，确认主题真实生效
6. 清理：删临时库（含 -wal/-shm/.bak.v*）+ 上传目录 + 脚本 + 截图；Test-Path 双确认零残留
```

⚠️ 临时脚本放 OS TEMP 或用完即删，别留在项目树（扫描器会反复标记）。

## 分流决策树

| vision/复现结论 | 处置 |
|---|---|
| 截图标签对、代码也对 | 直接合入 |
| **截图标错、代码对**（本例） | 合入，但 merge message 注明"交付截图 X/Y 标错为浅色拍，一号亲测复现生效" |
| 截图对、代码实际不生效 | **打回**，列出复现证据（属性值/背景色/截图），要求修复后重交 |
| 客户端路由作用域属性非 null（泄漏） | **打回**，这是验收硬指标 |

## 与既有纪律的关系

- 这是 soul「关键 UI 决策验证」条款的落地技术：合并前对照验收标准逐条验证，读代码+截图，截图存疑就复现。
- self-report 不可信在视觉批的具体形态 = **截图文件名/标签不可信**，内容要 vision 过、声称要复现过。

## 用户合入后吐槽视觉丑的分诊（2026-08-05 v0.38 实录）

触发：视觉重设计批已合入上线，用户看完说「做的好丑/怎么办」。**第一反应不是推翻重做**——v0.38 方向是用户拍板过的（纸墨颜料盘提案），先定性再决定动作：

1. **先确认用户看的是哪个实例**：容器部署版 vs 某角色 worktree 的 dev 实例——后者可能是旧版/半成品，白担心一场。
2. **定性二选一**（处置完全不同）：
   - **实现走样**（没按视觉规范来：7 色语义/文楷黑体分工/间距节奏/token 未套全）→ 小成本：派前端角色按 `docs/画师后台视觉规范-v1.md` + 提案 HTML 逐页校准
   - **方向落地后观感不行**（规范都遵守了但整体不好看）→ 设计问题：对照提案 HTML 找落差，落差本身是线索，再决定调 token 还是重做
3. **要证据再动手**：让发截图标出丑在哪几页+哪个维度（配色/字体/间距/气质），或文字描述。自己没 vision 能力时明说「我看不了图」，别假装有。
4. 手头有的证据先自查：docs/audit-screenshots/ 下各批截图的时间戳（区分新旧版本）、提案文档三件套是否还在。

反模式：用户一喊丑就承诺重做（方向是用户拍板的，重做=否定用户拍板，必须先分清走样 vs 方向）；或反过来只安抚不看证据。
