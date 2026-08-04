# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-05 B1（三号）已合入 master；其余五路进行中
> 维护者：一号（主理人）
> **刷新后自包含**：新会话只读本文件即可完全恢复，不依赖任何对话记忆。
---
## master 状态

- **HEAD**：`42fe432`（B1 合入），与 origin 同步
- **测试基线**：server 712/712（B1 +13）· web 144/144 · tsc 0 · eslint 0 · build ✓
- **容器**：commission-web healthy（含全部热修）；备份 `data/commission.db.bak-v036-verify`
- **迁移**：v38

---
## 当前阶段：用户终验反馈轮（四路并行）

用户 2026-08-04 终验反馈共 10 项，一号已逐项侦察实锤（005 改价/收款归零/跳步均拿到操作日志或代码级根因），拆成四路并行派工：

| 角色 | worktree / 分支 | 派工文件 | 内容 | 风险 |
|------|----------------|----------|------|------|
| 三号 | — | ✅ **B1 已合入**（`5faf437`→merge `42fe432`） | 变更端点统一 enrichOrderForArtist；一号审 diff + 712/712 实测全绿 | 中 |
| 五号 | wt-05 / v036-w2-bugfix | `01-to-05-收款三连-20260804.md` | P1 负数卡死 + P2 多收支持 + P3 跟踪提示文案 | 中 |
| 二号 | wt-02 / v036-w2-client | `01-to-02-orderform跳步修复-20260804.md` | F1：增项步骤"下一步"跳过写需求修复（349 行） | 低 |
| 二号-B | wt-03b / v036-w2-dragguard | `01-to-02b-拖拽守卫+录单价格修复-20260804.md` | G1 禁页内图拖入上传区 + G2 录单手动价抹除增项修复（005 根因） | 低/中 |
| 五号-B | wt-05b / v036-w2-board-deliver（自建 worktree） | `01-to-05b-看板交付统一走弹窗-20260804.md` | H1：看板下拉「已交付」统一走 DeliverDialog 防手滑 | 低 |
| 三号-B | wt-03b2 / v036-w2-odfix（自建 worktree） | `01-to-03b-orderdetail四项小修-20260804.md` | T1-T4：picker 失败回滚 + 备注防重 + 推进防连点 + 滑块 pointercancel | 低 |

**一号已实锤的根因（派工文件里有细节，角色不要重复侦查）**：
1. 005 订单 380→200：ManualOrder.vue 447-448 行 finalPriceYuan 只在 null 时自动填，加增项后不更新，提交时 200≠380 被误判为画师改价自动抹除（操作日志 id=35 同秒发生、reason 是程序生成的报价快照，实锤）
2. 收款区变 0：GET /orders/:id 有 paidTotalCents/installments/startDate 增强，但 PUT price、POST/DELETE extra-items 等变更端点返回裸订单，前端直接覆盖 order.value 导致字段丢失
3. 写需求被跳过：OrderForm.vue 349 行 addonStep 下一步直连 contactStep，漏了 detailStep

**用户已确认/无需动作**：撤销成功反馈已存在（不动）；负数退款规则已恢复（上轮修复）。

### 待用户拍板（不阻塞派工）

1. **done 状态是否归入终态**：当前终态 = delivered + cancelled（OrderDetail isTerminal）。done（手动完成未走平台交付）仍可改价加项。STATUS 遗留「done/delivered 终态订单也生成了分期」一并定夺。
2. **Classic 模板画廊位置**：其余三模板画廊紧跟开场，仅 Classic 把画廊放在价格区后面。用户已问"画廊为什么在约稿下面"，等拍板是否调整（涉及模板区分度原则）。
3. 时间条「开稿/截稿日二合一」：确认属 v0.38 视觉重设计范围（设计 brief 已列），本轮不做。「设开工日自动建议截稿日」已存在于订单详情（v0.26），已答复用户。

### v0.36 波 2 候选（本轮未派，排队中）

- ~~看板下拉「已交付」统一走 DeliverDialog 交付弹窗~~ → 已派五号-B（H1）
- 手动录单 ManualOrder 接新画风模型（注意：G2 先合入，避免 ManualOrder 冲突）
- ~~task-0 剩余小修~~ → 已派三号-B（T1-T4）
- createOrder 内联分期段与 generateInstallmentsForOrder 去重（五号-B 遗留 2）——缓派：与三号 order.routes / 五号-B 分期测试文件冲突，待本轮合入后再派
- ~~四号归档清单执行~~ → 已核实完成（REQ-024 / SPEC-025 / feedback-20260802 均已在 archive/，候选清单过时）

### 已知遗留

| 项 | 归属 |
|----|------|
| addons 表是否 drop | 评估中（历史订单外键） |
| addPayment 给节点写 paid_cents 的旧写路径 | 与 addons 表同批评估 |
| AUTH_DEV_MODE=false + QQ Bot 接入 | 上线前必做清单 |
| done/delivered 终态订单也生成了分期 | 待用户拍板终态定义后处理 |

---
## 版本计划（用户拍板）

| 版本 | 内容 | 状态 |
|------|------|------|
| v0.35 | REQ-024 画风档位统一 F1-F6 | ✅ 全合入 |
| v0.36 | 清账版 + 本轮终验反馈修复 | 🔧 波 1 已合入，终验反馈轮四路进行中 |
| v0.37 | REQ-025 动态节点计价模型（已审核通过备案） | v0.36 后 |
| v0.38 | 画师后台视觉重设计（纸墨颜料盘；含开稿/截稿日二合一 picker） | v0.37 后 |

**v0.38 之后**：上线安全前置 + REQ-022 剩余链路（交付→发布→绑档位，水印已砍）+ 真实画师反馈批次。

---
## 各角色状态

- **二号**：已派 F1（跳步修复），在 wt-02
- **二号-B**：已派 G1+G2，在 wt-03b（新 worktree，一号已建好）
- **三号**：B1 已合入，空闲
- **五号**：已派 P1/P2/P3，在 wt-05
- **五号-B**：已派 H1（看板交付弹窗），worktree wt-05b 自建
- **三号-B**：已派 T1-T4（订单详情四项小修），worktree wt-03b2 自建；**合入顺序：五号先合，三号-B 交付后等一号安排**（同改 OrderDetail.vue）
- **四号**：空闲（归档已核实完成；下一轮文档活在修复合入后）

---
## ⚠️ v38 迁移事故记录（一号自查发现并已修复）

迁移运行器把迁移包在事务里，`PRAGMA foreign_keys` 事务内是 no-op，DROP artists 触发子表 CASCADE。修复：运行器 noTransaction + 事务外 12 步 + 双保险 + TC-MIG-38。教训：**任何 DROP/RENAME 父表的迁移必须事务外执行并显式关 FK**。

---
## 重要规则提醒

- 合并到 master 后**立即推送**；操作前 `git log --oneline -5` 确认 HEAD
- 禁止对 master `git reset --hard` / `git rebase`；禁止 `git add -A`
- 并行角色必须在独立 worktree；Docker 环境 SQLite 用 DELETE 模式
- **开工第一步 `git merge master` 再读派工文件**（追加派工后角色本地文件可能是旧版）
- **一号 commit 前逐行核对 git status 暂存区**——主 worktree 有角色直提任务时防误带（e04f2f5 事故教训）
- **前端校验只能是后端规则的子集**（v0.36 L3 教训：前端自行收紧拦死了后端支持的负数退款）
- **审入校验前对照后端完整能力设计**：读 schema + 注释 + 服务层逻辑再定前端规则
