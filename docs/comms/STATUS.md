# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-02 收工
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`10d388c`，与 origin 同步
- **后端测试**：508/508 通过（29 文件）
- **前端测试**：87/87 通过（5 文件）
- **E2E 测试**：5/5 通过（Playwright，已接入 GitHub Actions CI）
- **迁移**：v25 已应用（tier_visibility）
- **容器**：⚠️ 需重建（迁移 v24/v25 尚未在容器中执行）
- **类型检查**：`npx tsc --noEmit` 零错误
- **字体**：霞鹜文楷子集拆分完成（3.3MB → 1.7MB，6 个 woff2 按需加载）

---
## v0.24 进度

| 批次 | 内容 | 状态 |
|------|------|------|
| v0.24-A | #9 展示柜 + #10 三态 + #6 录单入口 + #2 统计卡可点击 | ✅ 已合入 |
| v0.24-B | #4 接稿设置独立标签页 + 名额概览改版 | ✅ 已合入 |
| v0.24-C | #1 留言管理页面 + #3 按钮自定义 | ✅ 已合入 |
| P0 修复 | reset 禁止 + 价格加减法 + 看板队列过滤 + 标签 UI | ✅ 已合入 |
| P1 修复 | send-code 防枚举 + health promises + Q4 收入 + like 限流 | ✅ 已合入 |
| PERF-1 | 霞鹜文楷子集拆分 + profile 补 slotDisplay | ✅ 已合入 |
| 文档维护 | README/changelog/CONTEXT/specs/待修复清单 全面更新 | ✅ 已合入 |

---
## 待排期

| 项 | 说明 | 优先级 |
|---|------|--------|
| SPEC-005 排期日历视图 | 四号已出 spec，用户已拍板，~6-8h 前端 | 待排 |
| #5 封面图指定+轮播 | 建议 #9 上线观察后再定 | P2 |
| #8 话术界面改进 | 纯前端重构 | P2 |
| #8 多模板随机 | 需 DB 迁移 | P3 |
| 快捷按钮 localStorage→DB | 三号补 artists.quick_actions 字段 | 低 |
| SlotOverview 去掉公开 API 调用 | profile 已补 slotDisplay，前端可切 | 低 |
| 容器重建 | 迁移 v24/v25 需在线上执行 | 中 |
| P2 审计项（12 项） | 见 docs/待修复问题清单.md | 低 |

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | 当前 `10d388c` |

> 旧 worktree 待清理：fix-admin / fix013 / p0 / p1 / perf1 / v024 / fe（已合入，可删）

---
## 已知遗留（非阻塞）

| # | 项 | 严重度 |
|---|---|---|
| 1 | 容器重建（迁移 v24/v25） | 中 |
| 2 | P2 审计项 12 项 | 低 |
| 3 | 安全债（/api/orders/my QQ 当密码等） | 低 |
| 4 | seedOrder 随机订单号偶发碰撞（测试 flaky） | 低 |

---
## 重要规则提醒

- 合并到 master 后**立即推送**（同一命令链）
- 操作 master 前**必须 `git log --oneline -5` 确认 HEAD**
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 提交前 `git diff --stat` 确认只有授权文件（禁止 `git add -A`）
- **并行角色必须在独立 worktree 工作，主 worktree 永远停在 master**
