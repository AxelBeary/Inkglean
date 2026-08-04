# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-05 晚 v0.36 波 2 终验反馈轮六路全合入收口，worktree/分支已清理，等用户终验
> 维护者：一号（主理人）
> **刷新后自包含**：新会话只读本文件即可完全恢复，不依赖任何对话记忆。
---
## master 状态

- **HEAD**：`3a7992c`（六路收口 + comms 清理），与 origin 同步
- **工作树**：干净。worktree 只剩主仓（8 个并行 worktree 已删），分支只剩 master（8 个功能分支已安全删除）
- **测试基线**：server 713/713 · web 166/166 · tsc 0 · eslint 0 · build ✓
- **容器**：六路合入后已重建，healthy，镜像已验证含全部修复（enrichOrderForArtist 24 处）
- **备份**：`data/commission.db.bak-v036-w2-verify`（六路合入前）+ `commission.db.bak-v036-verify`（波 1）
- **迁移**：v38
- **comms**：只剩本文件

---
## 当前阶段：v0.36 波 2 终验反馈轮全收口，等用户终验

用户 2026-08-04 终验反馈拆六路并行，全部审核合入（每路一号审 diff + 实测测试，不信 self-report）：

| 路 | 内容 | 合入 |
|----|------|------|
| B1（三号） | 变更端点统一 enrichOrderForArtist——修「加项/改价后收款区归零」根因 | `42fe432` |
| P 批（五号） | 收款三连：负数输入修复（去 :min/:max 硬钳制）+ 多收支持（后端正数无上限）+ 跟踪文案 | `6f57b3b` |
| F1（二号） | OrderForm 增项步骤跳过「写需求」修复 + 步骤导航组件测试 10 条 | `55b0cd1` |
| G1/G2（二号-B） | 页内拖拽守卫（7 处上传区，useDropGuard 捕获阶段）+ 手动录单价格脏标记（005 事故根因） | `c3cabd0` |
| H1（五号-B） | 看板「已交付」统一走 DeliverDialog 防手滑 | `3179351` |
| T 批（三号-B） | OrderDetail 四项健壮性：picker 失败回滚 + 备注 Enter 防重 + 推进防连点 + 滑块 pointercancel | `b795f6b` |

**用户终验重点路径**：加项目后收款区不再归零；负数退款输入顺畅；多收显示「多收 ¥X」（橙色）；约稿表单写需求步骤不丢；录单选档位+加增项价格跟随 380 不被抹；看板「已交付」弹交付窗；备注 Enter 不重复。

### 本轮踩坑记录（下轮派工前必读）

1. **候选清单过时**：波 2 候选里「四号归档清单」实际早已完成（文件已在 archive/）。派工前必须 search_files 验证代码现状，盲信列表 = 重复劳动。
2. **worktree 交叉污染**：五号 worktree 曾混入 B1 的残缺版 order.routes.ts（调用在、定义丢），致 32 测试 500。恢复：`git checkout -- <file>` 还原单文件 + `git merge master` 拉完整版。
3. **合入顺序约定生效**：五号（P 批）与三号-B（T 批）同改 OrderDetail.vue，约定五号先合、三号-B 交付后 merge master 重跑测试再放行——零冲突收工。
4. **三号-B 上报的「deleteNote 响应缺 currentStageId」**：已被 B1 enrich 覆盖修复（他测的是旧容器镜像），无需再处理。

### 待用户拍板（不阻塞派工）

1. **done 状态是否归入终态**：当前终态 = delivered + cancelled（OrderDetail isTerminal）。done（手动完成未走平台交付）仍可改价加项。「done/delivered 终态订单也生成了分期」一并定夺。
2. **Classic 模板画廊位置**：其余三模板画廊紧跟开场，仅 Classic 把画廊放在价格区后面。用户已问「画廊为什么在约稿下面」，等拍板（涉及模板区分度原则）。
3. 时间条「开稿/截稿日二合一」：属 v0.38 视觉重设计范围（设计 brief 已列），已答复用户。

### 下一轮候选（待终验通过后派）

- 手动录单 ManualOrder 接新画风模型（G2 已合入，依赖解除）
- createOrder 内联分期段与 generateInstallmentsForOrder 去重（依赖解除）+ addons 表/addPayment 旧写路径同批评估
- 文档轮（四号）：changelog v0.36 补全 + 画师使用说明书漂移修复——六路修复入账
- 容器重建验证清单：deleteNote 缺字段问题可在终验时顺手验证

### 已知遗留

| 项 | 归属 |
|----|------|
| AUTH_DEV_MODE=false + QQ Bot 接入 | 上线前必做清单 |
| done/delivered 终态订单也生成了分期 | 待用户拍板终态定义后处理 |
| addons 表是否 drop + addPayment 旧写路径 | 下一轮同批评估 |

---
## 版本计划（用户拍板）

| 版本 | 内容 | 状态 |
|------|------|------|
| v0.35 | REQ-024 画风档位统一 F1-F6 | ✅ 全合入 |
| v0.36 | 清账版 + 终验反馈轮六路修复 | ✅ 全合入，等用户终验 |
| v0.37 | REQ-025 动态节点计价模型（已审核通过备案） | v0.36 终验后 |
| v0.38 | 画师后台视觉重设计（纸墨颜料盘；含开稿/截稿日二合一 picker） | v0.37 后 |

**v0.38 之后**：上线安全前置 + REQ-022 剩余链路（交付→发布→绑档位，水印已砍）+ 真实画师反馈批次。

---
## 各角色状态

全部空闲，本轮六路均已合入。新会话开工前需重新建 worktree（旧 worktree 已清理）。

---
## ⚠️ v38 迁移事故记录（一号自查发现并已修复）

迁移运行器把迁移包在事务里，`PRAGMA foreign_keys` 事务内是 no-op，DROP artists 触发子表 CASCADE。修复：运行器 noTransaction + 事务外 12 步 + 双保险 + TC-MIG-38。教训：**任何 DROP/RENAME 父表的迁移必须事务外执行并显式关 FK**。

---
## 重要规则提醒

- 合并到 master 后**立即推送**；操作前 `git log --oneline -5` 确认 HEAD
- 禁止对 master `git reset --hard` / `git rebase`；禁止 `git add -A`
- 并行角色必须在独立 worktree（用完即删，本轮已清理）；Docker 环境 SQLite 用 DELETE 模式
- **开工第一步 `git merge master` 再读派工文件**；交付合入前再 merge 一次重跑测试
- **一号 commit 前逐行核对 git status 暂存区**——防误带他角色改动（e04f2f5 事故教训）
- **前端校验只能是后端规则的子集**（v0.36 L3 教训）；审入校验前对照后端完整能力设计
- **派工前验证代码现状**（候选清单可能过时，v0.36 波 2 教训）
- **self-report 不可信**：角色声称完成必须实测验证（跑测试/读 diff/grep 关键改动）
