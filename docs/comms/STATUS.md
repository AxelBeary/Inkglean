# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-02 v0.24 收工
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`77bb969`，与 origin 同步
- **后端测试**：512/512 通过（29 文件）
- **前端测试**：87/87 通过（5 文件）
- **E2E 测试**：5/5 通过（Playwright，已接入 GitHub Actions CI）
- **迁移**：v26 已应用（quick_actions）
- **容器**：✅ 已重建（迁移 v24/v25/v26 已执行）
- **字体**：霞鹜文楷子集拆分（3.3MB → 1.7MB，6 个 woff2 按需加载）

---
## v0.24 完成清单

| 项 | 状态 |
|---|---|
| #9 档位展示柜（4 模板统一） | ✅ |
| #10 档位三态（visible/showcase/hidden） | ✅ |
| #6 手动录单侧边栏入口 | ✅ |
| #2 统计卡可点击 + 复合筛选 | ✅ |
| #4 接稿设置独立标签页 + 名额概览改版 | ✅ |
| #1 留言管理独立页面 + 侧边栏角标 | ✅ |
| #3 快捷按钮自定义（localStorage MVP + DB 字段） | ✅ |
| #8 话术界面重构（变量公共区 + 折叠） | ✅ |
| SPEC-005 排期日历视图（月历 + 画带） | ✅ |
| P0 修复（reset 禁止 + 价格加减法 + 队列过滤 + 标签 UI） | ✅ |
| P1 修复（send-code 防枚举 + health promises + Q4 收入 + like 限流） | ✅ |
| P2 修复（11 项审计修复） | ✅ |
| PERF-1 字体子集拆分 + profile 补 slotDisplay | ✅ |
| 迁移 v26（quick_actions）+ UTC 月初修复 | ✅ |
| 容器重建 | ✅ |
| 文档维护（README/changelog/CONTEXT/specs） | ✅ |
| embed 死代码清理 | ✅ |

---
## 后续版本待排

| 项 | 优先级 |
|---|---|
| #5 封面图指定 + 轮播 | P2 |
| #8 多模板随机（需 DB 迁移） | P3 |
| 快捷按钮 localStorage→DB 前端切换 | 低 |
| 日历时间条视图（SPEC-005 §3 第二优先级） | 低 |
| 移动端翻月手势 | 低 |
| E2E 用例扩充（覆盖 v0.24 新功能） | 中 |
| i18n embed.* 死键清理 | 低 |
| seedOrder 随机碰撞修复（测试 flaky） | 低 |

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | 当前 `77bb969` |

> 旧 worktree 待清理：fix-admin / fix013 / p0 / p1 / p2 / perf1 / v024 / misc / fe

---
## 重要规则提醒

- 合并到 master 后**立即推送**（同一命令链）
- 操作 master 前**必须 `git log --oneline -5` 确认 HEAD**
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 提交前 `git diff --stat` 确认只有授权文件（禁止 `git add -A`）
- **并行角色必须在独立 worktree 工作，主 worktree 永远停在 master**
