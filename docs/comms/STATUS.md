# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-05 凌晨 v0.36 开工
> 维护者：一号（主理人）
> **刷新后自包含**：新会话只读本文件即可完全恢复，不依赖任何对话记忆。

---
## master 状态

- **HEAD**：`352eac7`，与 origin 同步
- **测试**：server 711/711 · web 144/144 · tsc 0 · eslint 0 · build ✓
- **迁移**：v38（artists CHECK 补 hidden，事务外 12 步重建）

---
## 当前阶段：v0.36 清账版开工（用户 2026-08-04 拍板时间条四档 + 点名要撤销）

### v0.35 终验状态

用户未逐项走完终验清单，但已直接给 v0.36 派活（时间条缩放、撤销），按开工处理。v0.35 功能全部在 master，若用户后续反馈 v0.35 问题，hotfix 插队。

### v0.36 波 1 派工（已发，等角色开工）

| 角色 | Worktree | 分支 | 派工文件 | 内容 |
|------|----------|------|----------|------|
| 二号 | `artist-commission-02` | `feat/v036-web-timeline-undo` | `01-to-02-timeline-zoom-undo-20260804.md` | 时间条缩放改四档（两周/一个月/三个月/半年，含刻度密度适配）+ 拖拽撤销 toast（改开工/改截稿/整条平移三种）+ L0 删旧增项前端封装 + L1/L3/L5 小修 |
| 三号 | `artist-commission-w3` | `feat/v036-server-cleanup` | `01-to-03-server-cleanup-20260804.md` | 旧增项 API 六端点删除（前端零消费已验证）+ M1/M2 图片路径校验 + M4 demo-data |
| 五号 | `artist-commission-w5` | `fix/v036-bug1-deadcode` | `01-to-05-bug1-deadcode-20260804.md` | BUG-1 方案 b（getOrderInstallments 池子推算，用户已拍板）+ BUG-5 死代码（一号已逐项验证，TplCoverShowcase 已不存在跳过） |

**合并顺序**：五号（后端读路径）→ 三号（后端删除）→ 二号（前端，含与三号配套的 L0）。每次合并后跑全量测试。

### v0.36 波 2 候选（波 1 合入后派）

- 手动录单 ManualOrder 接新画风模型（现走旧档位 getPricing/calculatePrice，旧算价 API 保留中，波 2 改 `calculate-style-price` + `styleSizeId` 下单，参考 useOrderForm.js 现成链路）
- task-0 剩余小修：看板平移两 PUT 非原子（可被撤销 toast 吸收一部分，二号自决）、OrderDetail picker 保存失败不回滚、备注 Enter 重复提交、状态推进防连点、滑块 pointercancel
- gallery 模板 layout 疑点（待用户定夺）
- 看板下拉 delivered 统一走 deliver-no-file（五号建议，待用户拍板）

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

- **二号/三号/五号**：v0.36 波 1 已派工，待开工
- **四号**：空闲；v0.36 收尾时负责 changelog + docs 归档

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
