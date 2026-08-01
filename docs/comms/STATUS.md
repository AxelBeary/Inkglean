# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-02 v0.26 完成
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`8987041`，与 origin 同步
- **后端测试**：557/557 通过（33 文件）
- **前端测试**：87/87 通过（5 文件）
- **E2E 测试**：5/5 通过（Playwright，已接入 GitHub Actions CI）
- **迁移**：v29 已应用（order_start_date）
- **容器**：✅ 已重建（v0.26 全部功能）

---
## v0.26 完成清单

| 项 | 角色 | 状态 |
|---|---|---|
| A 档位卡片拖动排序（vuedraggable + PUT reorder） | 三号 | ✅ |
| B 开工日 + 截稿日自动建议（迁移 v29 + picker + QueueBoard 带子起点） | 三号 | ✅ |
| C 开稿管理独立页（/slots + SlotManage.vue + Settings 移出） | 三号 | ✅ |
| 审核补修：draggable grid class + 截稿日时区 off-by-one | 一号 | ✅ |
| 审核补修：TierManage 缩进对齐 | 一号 | ✅ |

---
## v0.27 待排（用户已拍板）

| 项 | 角色 | 预估 | 状态 |
|---|---|---|---|
| **REQ-015 手动录单重设计**（全屏双栏+响应式+QQ历史面板） | 三号 | ~7-9h | 用户已拍板，API 零改动 |
| B 多模板随机前端 UI 开关（后端 v0.25 已就绪） | 二号 | ~2-3h | 待排 |

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | 当前 `8987041` |

（无在途分支）

---
## 重要规则提醒

- 合并到 master 后**立即推送**（同一命令链）
- 操作 master 前**必须 `git log --oneline -5` 确认 HEAD**
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 提交前 `git diff --stat` 确认只有授权文件（禁止 `git add -A`）
- **并行角色必须在独立 worktree 工作，主 worktree 永远停在 master**
