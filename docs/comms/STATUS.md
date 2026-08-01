# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-02 v0.28 派工
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`ad8340a`，与 origin 同步
- **后端测试**：567/567 通过（34 文件）
- **前端测试**：87/87 通过（5 文件）
- **E2E 测试**：5/5 通过
- **迁移**：v29
- **容器**：✅ Healthy

---
## v0.28 进行中

| 项 | 角色 | 分支 | 状态 |
|---|---|---|---|
| REQ-016 后台界面逻辑重组（设置页4Tab+侧边栏瘦身+接稿状态归位+app.js修复） | 三号 | feat/v028-req016-restructure | 🔵 已派工 |
| 画师后台现状审计 + 回归清单 | 五号 | audit/v028-artist-ui-audit | 🔵 已派工 |
| 时间条拖拽设计评估（只出方案） | 二号 | research/v028-timeline-drag | 🔵 已派工 |
| 文档维护（changelog补hotfix+REQ-016状态） | 四号 | master 直接提交 | 🔵 已派工 |

---
## 等待中

| 项 | 依赖 |
|---|---|
| 画师后台视觉统一（共享样式层+逐页改） | 用户带设计参考/设计稿回来后派工 |
| 时间条拖拽实施 | 二号评估方案→一号研判→排入 |

---
## 分支状态

| 分支 | Worktree | 角色 |
|------|----------|------|
| master | 主 worktree（一号专用） | `ad8340a` |
| feat/v028-req016-restructure | artist-commission-03 | 三号 |
| audit/v028-artist-ui-audit | artist-commission-05 | 五号 |
| research/v028-timeline-drag | artist-commission-02 | 二号 |

---
## 重要规则提醒

- 合并到 master 后**立即推送**
- 操作 master 前 `git log --oneline -5` 确认 HEAD
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 禁止 `git add -A`
- 并行角色必须在独立 worktree
