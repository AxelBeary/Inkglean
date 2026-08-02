# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-03 v0.31遗留合入
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`0bb2ff8`（merge: v0.31遗留前端），与 origin 同步
- **后端测试**：576/576 通过
- **前端测试**：106/106 通过
- **E2E 测试**：5/5 通过
- **迁移**：v35（order_activity_logs）
- **容器**：✅ Healthy

---
## 当前阶段：v0.32 Phase 1 开工（REQ-023 多画风模型）

### v0.31 遗留（已合入 ✅）

- 操作日志时间线（OrderDetail.vue）✅
- 折扣码输入验证（OrderForm.vue）✅

### v0.32 Phase 1 派工

| 角色 | 任务 | 分支 | 状态 |
|------|------|------|------|
| 三号 | 5表迁移v36 + 增项库/画风/尺寸/覆盖 CRUD API + 数据迁移（老档位→单画风退化） | `feat/v032-phase1-backend` | 🟡 待派工 |
| 二号 | 画师端增项库管理 + 画风配置 UI（尺寸编辑+增项导入+尺寸覆盖） | `feat/v032-phase1-artist-ui` | ⏳ 等三号 API |

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | ✅ 干净 |

---
## v0.32 排期（REQ-023 多画风模型，14天三阶段）

### Phase 1：数据模型 + 画师端配置（~6天）
- 三号：addon_template / art_style / style_size / style_addon / size_addon_override 5表 + 迁移v36 + CRUD API + 老数据迁移
- 二号：增项库管理页 + 画风管理页（尺寸编辑+增项导入+尺寸覆盖）

### Phase 2：客户端三步走 + 价格引擎（~3.5天）
- 二号：选画风卡片 → 选尺寸列表 → 勾增项（开关/数量/单选控件）
- 三号：价格计算引擎（覆盖+倍率+折扣码联动）+ 单画风退化逻辑

### Phase 3：4模板适配 + 测试（~3.5天）
- 二号：4模板价格表区域适配
- 全员：测试 + E2E

---
## 已知遗留

| 项 | 状态 |
|---|------|
| #5b 订单管理页卡顿（疑似焦点图太大） | 🔴 待排查，排 Phase 1 后 |

---
## 重要规则提醒

- 合并到 master 后**立即推送**
- 操作 master 前 `git log --oneline -5` 确认 HEAD
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 禁止 `git add -A`
- 并行角色必须在独立 worktree
- Docker 环境 SQLite 必须用 DELETE 模式
