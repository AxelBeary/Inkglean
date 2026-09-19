# 二号工作流踩坑与模式库

> 跨版本积累的持久经验。每次会话发现新坑/新模式时追加到本文件。
> 来源：v0.23 B7 额度池前端、v0.24-A 展示柜/三态/录单/统计卡等实战。

## 1. Windows PowerShell git 提交：add 与 commit 分两次调用

`git add ... && git commit -m "多行消息"` 在 pwsh 中会因多行字符串打断管道链重写而报
`标记"&&"不是此版本中的有效语句分隔符`。

**模式**：`git add` 一次 terminal 调用，`git commit` 单独一次调用。
短单行消息可以合并，多行 commit message 必须分开。

## 2. "等后端合入后开工" = 预读窗口，不是空闲

派工写"等三号后端合入后开工"时，不要干等。利用等待期预读全部关键文件：

- 派工授权列表里的每个文件（读完整或关键区域）
- 需求 spec（`docs/requirements/REQ-xxx-整理.md` 对应条目，含验收标准）
- 共享组件的所有消费方（如 4 个模板的调用点）
- **后端 API 契约：测试文件是最快来源**（见下条）

开工信号到达时零等待，直接写代码。

## 3. 后端 API 契约从测试文件读，比 grep 路由快且准

后端是 TS、路由分散在 `features/*/xxx.routes.ts` 时，直接 grep `visibility` 等关键词
可能漏（路由注册写法多样）。但后端测试文件（如 `server/tests/tier-visibility.test.js`）
包含完整契约：method、URL、payload、响应断言、枚举值。

**模式**：先找 `server/tests/<feature>.test.js`，用 `app.inject` 的用例反推 API 契约。

## 4. 授权边界三级处理

任务需要碰授权列表外的文件时，按三级分类：

| 级别 | 情形 | 做法 |
|------|------|------|
| A 必要连带 | 改共享组件导致消费方必须同步改（如加 prop 后 4 模板各加一行传参） | 直接改，comms 标注"超出授权列表的必要连带" |
| B 需他角色配套 | 你的改动需要别人文件配合才完整（如 StatCards 发 query，OrderList 需读 query 初始化 filter） | 只做自己这侧，不碰对方文件，comms 写清"需三号在 X 文件加 Y" |
| C 死参数 | 想传一个对方尚不支持的参数（如 `?tier=` 预选但 OrderForm 不读） | 不传。删掉死参数，comms 建议后续增强。死参数 = 看似有功能实则没有，违反"不留半成品" |

## 5. 复合条件发语义值，不发具体状态

统计卡跳转订单列表时，`active`（非终态）和 `completed`（done+delivered）是复合条件。
前端发送方**不硬编码状态列表**，发语义值（`pending`/`active`/`completed`），
由消费页面/后端统一解释。避免状态定义散落多处、后端改了前端不同步。

## 6. 开关类 UI 用乐观更新

三态切换等即时保存场景：本地先改 → 调 API → 失败回滚 + `ElMessage.error`。
比 loading 转圈体验好，且失败有明确反馈。注意保留 `prev` 值用于回滚。

## 7. write_file/patch 的 lint 误报（D:\d\ 前缀）

对 .js 文件编辑触发 `node --check` 时可能出现
`Cannot find module 'D:\d\Hermes...'`（路径前缀被错误拼接为 `D:\d\`）。
这是沙箱路径解析 bug，**不是真实语法错误**。看到 `D:\d\` 前缀直接忽略，
以 ESLint / build 的实际运行结果为准。

## 8. ESLint 既有格式 warning 用 --fix 清理

`npx eslint . --fix` 可自动修复 `vue/multiline-html-element-content-newline` 等格式类 warning。
提交前跑一次，保持 0 错 0 警。

## 9. 派工说的字段来源要核实——派生字段常只在公开 API

派工可能写"复用后端 X 字段（store.profile.x 或从 getProfile 返回）"，但**画师端
`GET /api/artist/profile` 返回原始 DB 行（`...artist`），不含计算字段**。派生/聚合字段
（如 `slotDisplay` 由 `computeSlotDisplay()` 算出）通常只在**公开主页 API**
`GET /api/artists/:subdomain` 的显式响应对象里返回。

**模式**：写代码前先 grep 后端 routes，确认字段到底在哪个端点返回。若画师端没有、
公开端有，纯前端方案是调 `artistPublicApi.getProfile(subdomain)` 取该字段（画师看自己
公开主页数据一致、无权限问题），取不到时回退占位、不阻塞渲染。comms 里标注数据源
与派工描述的差异，并建议后续让三号在画师端 API 直接返回（省一次请求）。

**判断信号**：后端 route 里 `return { ...artist, ... }`（展开原始行）= 无派生字段；
`return { 显式字段列表 }` = 逐个核实。

## 10. STATUS.md 是状态板不是派工——等一号正式派工文件才开工

**用户纠正（v0.29，原话「你不等一号派工吗？」）**：读完 STATUS.md 看到「下一步执行顺序」
就自己挑活开工是错的。STATUS.md 只记录 master 状态、反馈分类、执行顺序建议——
它是**一号维护的只读状态板**，不是工作授权。

**规则**：二号开工的唯一触发信号是一号在 `docs/comms/` 写的正式派工文件
（`01-to-02-{主题}-{日期}.md`），内含任务清单 + 授权文件范围 + 约束。
没有派工文件时，即使 STATUS.md 列了执行顺序、即使反馈文档里有明确的客户前端 Bug，
也**只做调研准备（读文件、确认现状、把结论写清楚），不切分支、不写代码、不 commit**。

派工到达后的标准动作：读派工 → 确认 worktree/分支（`git branch --show-current`，
worktree 路径和分支名以派工为准）→ 建 todo → 按派工约束逐项实施。
派工里的「授权文件范围」和「约束」是硬边界，超出部分按第 4 节三级处理。
派工若标注某任务「依赖后端合入」，按第 2 节预读窗口处理，或按约束里给的
mock/向后兼容方案先行（如 #54 effectiveStatus 缺失时 fallback 旧行为）。

## 11. 动手前先审计「派工项是否已实现」——别重复造轮子

派工清单里的功能项，可能已被现有代码或上一个 REQ 覆盖。v0.31 Wave1 实例：

- **F5 增项点击勾选**：`AddonManager.vue` 已有 `@click="startEdit(a)"`（点击=编辑）+ `handle=".drag-handle"`（拖拽=排序），点击与拖拽本就不冲突 → 已实现，零改动。
- **F6 作品主图设置**：REQ-017 的封面星标（`is_cover` 切换，复用 `PUT/DELETE /artist/artworks/:id/cover`）就是主图设置 → 已实现，零改动。

**模式**：拿到派工后，先逐项 grep/读现有实现，判断「已实现 / 部分实现 / 需新做」。
已实现的项**不写代码**，在 comms 里明确标注「已由 X 实现，无需改动」及判断依据。
这既避免重复开发，也让一号看到诚实的交付边界（而不是把别人的成果算成自己的工作量）。
只有确认「需新做」的项才进入编码（v0.31 实际只需做 F2/F3/F7 三项）。

## 12. 按功能拆 commit 时：暂存区残留会把文件带进错误的 commit

「每个功能一个 commit」要求精确暂存。v0.31 事故：

1. 早期为验证一次性 `git add` 了全部 4 个改动文件（含 F7 的 `ArtworkManage.vue`）。
2. 之后想拆成 F2+F3 和 F7 两个 commit，只 `git add` 了 F2+F3 的 3 个文件就 commit——
   但 `ArtworkManage.vue` **仍在暂存区**（第 1 步 add 的残留），被静默带进 F2+F3 commit
   （`git show --stat` 显示 4 files changed，而预期是 3）。

**规则**：
- 拆 commit 前先看 `git status --short` / `git diff --cached --name-only`，确认暂存区是干净的、只含本 commit 的文件。
- 发现 commit 混入多余文件且**分支未推送**时：`git reset --soft HEAD~N` 撤销 commit（保留改动）→ `git reset HEAD` 全部取消暂存 → 重新按功能精确 `git add` + commit。
- i18n 文件同时含多个功能的键时，用「临时移除 B 功能的键 → commit A → 加回 B 的键 → commit B」技巧拆分，但前提是暂存区干净。
