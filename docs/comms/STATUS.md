# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-03 二号客户端三步走审核完毕（暂不合入）
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`927b1c0`，与 origin 同步
- **后端测试**：651/651 通过（38 文件）
- **前端测试**：106/106 通过
- **迁移**：v36（multi_style_model）

---
## 当前阶段：v0.32 Phase 2 订单创建 API 扩展

### 进行中

| 角色 | 任务 | 分支 | 状态 |
|------|------|------|------|
| 三号 | POST /orders 扩展（styleSizeId + styleAddons + 价格计算） | `feat/v032-phase2-orders` | 🟡 已派工 |

### 挂起（等三号合入后处理）

| 角色 | 任务 | 分支 | 状态 |
|------|------|------|------|
| 二号 | 客户端三步走（代码完成，暂不合入——依赖三号后端扩展） | `feat/v032-phase2-client-ui` | ⏸️ 挂起 |

### 二号挂起原因

迁移 v36 后所有画师都有 1 个默认画风 → isStyleMode=true → 提交走画风路径 → 当前 POST /orders 不接受 styleSizeId → 订单无价格数据。三号扩展合入后，二号需改提交逻辑（传 styleSizeId + styleAddons，删 description 前缀方案），然后一起合入。

### 已完成（v0.32）

- ✅ Phase 1 后端：迁移 v36 + 5 表 + CRUD API + 公开配置
- ✅ Phase 1 画师端 UI：增项库 + 画风管理 + tabs 集成
- ✅ Phase 2 后端：calculate-style-price 价格引擎（29 测试）
- ✅ #5b 订单管理页卡顿（焦点图懒加载）

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | ✅ 干净 |
| feat/v032-phase2-orders | 待三号创建 | 🟡 已派工 |
| feat/v032-phase2-client-ui | `../artist-commission-wt-02c` | ⏸️ 挂起等三号 |

---
## v0.32 排期（REQ-023 多画风模型）

### Phase 1 ✅ 全部合入
### Phase 2
- ✅ 三号：价格计算引擎
- 🟡 三号：订单创建 API 扩展（进行中）
- ⏸️ 二号：客户端三步走（挂起，等三号合入后改提交逻辑再合入）

### Phase 3：4模板适配 + 测试
- ⏳ 全员

---
## 重要规则提醒

- 合并到 master 后**立即推送**
- 操作 master 前 `git log --oneline -5` 确认 HEAD
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 禁止 `git add -A`
- 并行角色必须在独立 worktree
- Docker 环境 SQLite 必须用 DELETE 模式
