# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-05 凌晨 v0.36 开工
> 维护者：一号（主理人）
> **刷新后自包含**：新会话只读本文件即可完全恢复，不依赖任何对话记忆。

---
## master 状态

- **HEAD**：`9fe02d8`，与 origin 同步
- **测试**：server 695/695 · web 144/144 · tsc 0 · eslint 0 · build ✓
- **容器**：v0.36 已重建验证（06:50）——healthy、数据完好（6 画风/11 尺寸/21 作品/4 订单）、旧增项 API 404、新读路径真数据跑通；备份 `data/commission.db.bak-v036-verify`
- **迁移**：v38（artists CHECK 补 hidden，事务外 12 步重建）

---
## 当前阶段：v0.36 清账版（波 1 后端已全合入，二号前端执行中）

### v0.36 波 1 合入记录

| 角色 | 内容 | commit | 测试 |
|------|------|--------|------|
| 四号 | v0.28~v0.35 changelog 补全 + docs 归档盘点清单（归档动作待发话） | `4a2a582` | — |
| 五号 | BUG-1 方案 b（getOrderInstallments 读池子推算）+ 死代码清账 5 项 | `17ed7f4` | 705→695（删例对账） |
| 三号 | 旧增项 API 六端点删除（净删 248 行）+ M1/M2 路径校验四处 + C-4 demo-data 断言 | `46983d8` | 同上 |
| 二号 | 时间条四档缩放 + 撤销 toast + L0/L1/L3/L5 | 执行中（子代理重发，首轮撞迭代上限未落码） | — |

**四号归档清单要点**：REQ-024 → archive/requirements/；SPEC-025 → archive/specs-done/（未覆盖项先转待修复清单）；feedback-20260802 的 E 类 #56/#13、F 类技术债未入清单——待一号决定是否转入后再归档。
**五号波 2 建议**：addPayment 节点 paid_cents 旧写路径停写或迁移删列，与 addons 表 drop 同批。

### v0.36 波 2 候选（波 1 合入后派）

- **已派：画廊画册翻页**（二号-B，worktree `-w2b` 分支 `feat/v036-gallery-album`，派工 `01-to-02b-gallery-album-20260805.md`）——用户拍板：替换网格、模板区分度、Gallery 模板大小交错
- **已拍板待派（等波 1 二号合入，同文件冲突）**：看板下拉「已交付」统一走 DeliverDialog 交付弹窗（防手滑直接改状态）——用户确认"好的 很重要的改动细节"
- 手动录单 ManualOrder 接新画风模型（现走旧档位 getPricing/calculatePrice，旧算价 API 保留中，波 2 改 `calculate-style-price` + `styleSizeId` 下单，参考 useOrderForm.js 现成链路）
- task-0 剩余小修：OrderDetail picker 保存失败不回滚、备注 Enter 重复提交、状态推进防连点、滑块 pointercancel
- 画师使用说明书漂移：仍写"档位"旧概念，未反映 v0.32+ 画风/尺寸模型——四号波 2 顺带修

### 已知遗留

| 项 | 归属 |
|----|------|
| addons 表是否 drop | 波 2 评估（历史订单外键） |
| addPayment 给节点写 paid_cents 的旧写路径 | 五号交付报告建议，波 2 评估 |
| AUTH_DEV_MODE=false + QQ Bot 接入 | 上线前必做清单 |

---
## 版本计划（用户拍板）

| 版本 | 内容 | 状态 |
|------|------|------|
| v0.35 | REQ-024 画风档位统一 F1-F6 | ✅ 全合入（用户未逐项终验，直接开下版） |
| v0.36 | 清账版：时间条四档+撤销 + BUG-1 方案 b + 旧增项 API + 死代码 + P2 批 | 🔧 波 1 已派工 |
| v0.37 | REQ-025 动态节点计价模型（已审核通过备案） | v0.36 后 |
| v0.38 | 画师后台视觉重设计（纸墨颜料盘，规范 v1 待用户正式定稿） | v0.37 后 |

**v0.38 之后**：上线安全前置 + REQ-022 剩余链路（交付→水印→发布→绑档位）+ 真实画师反馈批次。

---
## 各角色状态

- **二号**：v0.36 波 1 前端（时间条四档+撤销）执行中——worktree `-02` 分支 `feat/v036-web-timeline-undo`（子代理重发）
- **二号-B**：波 2-A 画廊画册翻页执行中——worktree `-w2b` 分支 `feat/v036-gallery-album`（子代理）
- **三号**：波 1 已合入；现派 errors.ts 死码清理（`01-to-03b-dead-errorcodes-20260805.md`，主 worktree 直提，单文件）
- **五号**：波 1 已合入；现派演示订单分期节点缺口修复（`01-to-05b-demo-installments-20260805.md`，worktree `-w5b` 分支 `fix/v036-demo-installments`）
- **四号**：changelog 已合入 + 归档已执行；现派说明书漂移修复（`01-to-04-manual-drift-20260805.md`，主 worktree 直提）

---
## ⚠️ v38 迁移事故记录（一号自查发现并已修复）

迁移运行器把迁移包在事务里，`PRAGMA foreign_keys` 事务内是 no-op，DROP artists 触发子表 CASCADE。修复：运行器 noTransaction + 事务外 12 步 + 双保险 + TC-MIG-38。教训：**任何 DROP/RENAME 父表的迁移必须事务外执行并显式关 FK**。

---
## 重要规则提醒

- 合并到 master 后**立即推送**；操作前 `git log --oneline -5` 确认 HEAD
- 禁止对 master `git reset --hard` / `git rebase`；禁止 `git add -A`
- 并行角色必须在独立 worktree；Docker 环境 SQLite 用 DELETE 模式
- **开工第一步 `git merge master` 再读派工文件**（追加派工后角色本地文件可能是旧版）
- 追加派工条目后一号必须提醒用户转达角色刷新
