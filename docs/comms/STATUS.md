# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-03 Phase1 全部合入
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`7b06e79`（merge: v0.32 Phase1 画师端UI），与 origin 同步
- **后端测试**：622/622 通过（37 文件）
- **前端测试**：106/106 通过
- **迁移**：v36（multi_style_model）

---
## 当前阶段：v0.32 Phase 2 进行中

### 进行中

| 角色 | 任务 | 分支 | 状态 |
|------|------|------|------|
| 三号 | 多画风价格计算引擎 calculate-style-price | `feat/v032-phase2-pricing` | 🟡 进行中 |

### 已完成（本轮）

- ✅ v0.32 Phase 1 后端（迁移 v36 + CRUD API）
- ✅ v0.32 Phase 1 画师端 UI（增项库+画风管理+tabs）
- ✅ #5b 订单管理页卡顿（焦点图懒加载+异步解码）

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | ✅ 干净 |
| feat/v032-phase2-pricing | `../artist-commission-v032p2` | 🟡 三号进行中 |

---
## v0.32 排期（REQ-023 多画风模型）

### Phase 1：数据模型 + 画师端配置 ✅ 全部合入
- ✅ 三号：迁移 v36 + CRUD API + 公开配置
- ✅ 二号：增项库+画风管理 UI + tabs 集成

### Phase 2：客户端三步走 + 价格引擎
- 🟡 三号：价格计算引擎（进行中）
- ⏳ 二号：客户端三步走（等三号 API 合入后派工）

### Phase 3：4模板适配 + 测试
- ⏳ 全员

---
## 已知遗留

| 项 | 状态 |
|---|------|
| 老数据迁移：增项关联到默认画风（未还原旧档位级限制） | ℹ️ 画师需手动设尺寸覆盖隐藏 |

---
## 重要规则提醒

- 合并到 master 后**立即推送**
- 操作 master 前 `git log --oneline -5` 确认 HEAD
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 禁止 `git add -A`
- 并行角色必须在独立 worktree
- Docker 环境 SQLite 必须用 DELETE 模式
