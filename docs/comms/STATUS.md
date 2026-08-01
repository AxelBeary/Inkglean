# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-02 v0.25 开工
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`3c5b374`，与 origin 同步
- **后端测试**：512/512 通过（29 文件）
- **前端测试**：87/87 通过（5 文件）
- **E2E 测试**：5/5 通过（Playwright，已接入 GitHub Actions CI）
- **迁移**：v26 已应用（quick_actions）
- **容器**：✅ 已重建（v0.24 收工时）
- **字体**：霞鹜文楷子集拆分（3.3MB → 1.7MB，6 个 woff2 按需加载）

---
## v0.25 进行中

| 项 | 角色 | 分支 | 状态 |
|---|---|---|---|
| A 封面图指定+轮播（后端） | 三号 | feat/v025-cover-random | 🔵 已派工 |
| B 多模板随机（后端） | 三号 | feat/v025-cover-random | 🔵 已派工 |
| A 封面图轮播（前端） | 二号 | feat/v025-frontend | 🔵 已派工（等三号 API） |
| C 快捷按钮 localStorage→DB | 二号 | feat/v025-frontend | 🔵 已派工 |
| D 日历时间条视图 | 二号 | feat/v025-frontend | 🔵 已派工 |
| E 移动端翻月手势 | 二号 | feat/v025-frontend | 🔵 已派工 |
| H seedOrder 碰撞修复 | 一号 | master 直接修 | ✅ 已合入 |
| 文档维护 | 四号 | master 直接改 | 🔵 已派工 |
| 测试覆盖审计 | 五号 | master 只读 | 🔵 已派工 |

---
## 明天开工指南

### 二号：前端四件（C→E→D→A）

> **分支**：`feat/v025-frontend`
> **Worktree**：`D:\Hermes Agent CN Desktop\workspace\artist-commission-02`（已基于 master 3c5b374）
> **派工文件**：`docs/comms/01-to-02-v025-frontend-20260802.md`

**任务**（按顺序）：
| 序 | 工作 | 预估 | 依赖 |
|----|------|------|------|
| C | 快捷按钮 localStorage→DB | 1h | 无（DB 字段 v26 已有） |
| E | 月历翻月手势 | 30min | 无 |
| D | 时间条视图（SPEC-005 §3） | 2h | 无 |
| A | 封面图轮播（4 模板） | 2h | 等三号 API 合入 |

**授权文件范围**：QuickActions.vue / Settings.vue / QueueBoard.vue / Tpl*.vue / api/index.js / locales/

完成后写 comms `02-to-01-v025-frontend-{日期}.md`，申请审核。

### 三号：封面图 API + 多模板随机

> **分支**：`feat/v025-cover-random`
> **Worktree**：`D:\Hermes Agent CN Desktop\workspace\artist-commission-03`（已基于 master 3c5b374）
> **派工文件**：`docs/comms/01-to-03-v025-cover-random-20260802.md`

**任务**：
| 序 | 工作 | 预估 |
|----|------|------|
| A | 迁移 v27（artworks.is_cover）+ 封面 API | 1.5h |
| B | 迁移 v28（workflow_stages.random_template）+ 随机逻辑 | 2h |

**关键提醒**：
- 下一个迁移版本号是 **v27**（v26 是 quick_actions）
- artworks 表现有字段：id / artist_id / image_path / title / sort_order / like_count / created_at
- 封面 API 需 requireOwn 校验（对照 artist.routes.ts 已有模式）

完成后写 comms `03-to-01-v025-cover-random-{日期}.md`，申请审核。

### 四号：文档维护

> **直接在 master 操作**
> **派工文件**：`docs/comms/01-to-04-v025-docs-20260802.md`

任务：待修复清单更新（P1/PERF-1 标 ✅）+ specs 归档 + CONTEXT.md 更新 + requirements 归档。

### 五号：测试覆盖审计

> **直接在 master 只读**
> **派工文件**：`docs/comms/01-to-05-v025-audit-20260802.md`

任务：v0.24 功能测试覆盖审计（只审计不写测试），产出覆盖表 + 缺口风险评估。

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | 当前 `3c5b374` |
| feat/v025-frontend | artist-commission-02 | 二号 |
| feat/v025-cover-random | artist-commission-03 | 三号 |

---
## 后续版本待排

| 项 | 优先级 |
|---|---|
| 快捷按钮 localStorage→DB 前端切换 | ✅ v0.25 已排 |
| 日历时间条视图 | ✅ v0.25 已排 |
| 移动端翻月手势 | ✅ v0.25 已排 |
| E2E 用例扩充 | 中（用户已拒扩展，保持 5 个基线） |
| i18n embed.* 死键清理 | ✅ 已清零（验证 0 匹配） |
| seedOrder 随机碰撞修复 | ✅ v0.25 已修（自增计数器） |

---
## 重要规则提醒

- 合并到 master 后**立即推送**（同一命令链）
- 操作 master 前**必须 `git log --oneline -5` 确认 HEAD**
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 提交前 `git diff --stat` 确认只有授权文件（禁止 `git add -A`）
- **并行角色必须在独立 worktree 工作，主 worktree 永远停在 master**
