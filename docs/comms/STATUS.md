# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-02 v0.27 派工完成
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`e8b7e92`，与 origin 同步
- **后端测试**：557/557 通过（33 文件）
- **前端测试**：87/87 通过（5 文件）
- **E2E 测试**：5/5 通过（Playwright，已接入 GitHub Actions CI）
- **迁移**：v29 已应用（order_start_date）
- **容器**：✅ 已重建（v0.26 全部功能）

---
## v0.27 进行中

| 项 | 角色 | 分支 | 状态 |
|---|---|---|---|
| A 多模板随机前端 UI 开关 | 二号 | feat/v027-random-template-ui | 🔵 已派工 |
| B REQ-015 手动录单重设计（全屏双栏+响应式+QQ历史面板） | 三号 | feat/v027-manual-order-redesign | 🔵 已派工 |
| C v0.26 路由层集成测试（reorder + start-date） | 五号 | test/v027-route-integration | 🔵 已派工 |

---
## 明天开工指南

### 二号：多模板随机前端 UI 开关

> **分支**：`feat/v027-random-template-ui`
> **Worktree**：`D:\Hermes Agent CN Desktop\workspace\artist-commission-02`
> **派工文件**：`docs/comms/01-to-02-v027-random-template-ui-20260802.md`

**任务**：StageListView.vue 话术编辑区加"随机"checkbox，保存时 PUT 附带 randomTemplate。

**后端 API 契约**（已合入 master）：
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/artist/workflow/stages | 返回含 `randomTemplate: boolean` |
| PUT | /api/artist/workflow/stages/:id | body 含 `randomTemplate: boolean` |

**授权文件**：StageListView.vue、WorkflowPaymentEditor.vue、locales/zh-CN.js + en.js

完成后写 comms `02-to-01-v027-random-template-ui-{日期}.md`，申请审核。

### 三号：REQ-015 手动录单重设计

> **分支**：`feat/v027-manual-order-redesign`
> **Worktree**：`D:\Hermes Agent CN Desktop\workspace\artist-commission-03`
> **派工文件**：`docs/comms/01-to-03-v027-manual-order-redesign-20260802.md`
> **Spec**：`docs/requirements/REQ-015-手动录单重设计.md`（用户已拍板，全文读）

**任务**：手动录单从 560px 抽屉改为全屏双栏独立页面 + 三档响应式 + QQ 历史面板。API 零改动。

**关键提醒**：
- ManualOrder.vue 组件逻辑保留复用，重排布局容器
- 档位卡片式（非下拉框）
- 参考图粘贴区在左栏顶部
- <600px 底部钉住价格条
- 旧路由重定向不断链

**授权文件**：ManualOrder.vue、OrderList.vue、router/index.js、api/index.js、locales、ArtistLayout.vue

完成后写 comms `03-to-01-v027-manual-order-redesign-{日期}.md`，申请审核。

### 五号：v0.26 路由层集成测试

> **分支**：`test/v027-route-integration`
> **Worktree**：`D:\Hermes Agent CN Desktop\workspace\artist-commission-05`
> **派工文件**：`docs/comms/01-to-05-v027-route-integration-20260802.md`

**任务**：补 `PUT /api/artist/tiers/reorder` + `PUT /api/artist/orders/:id/start-date` 路由层集成测试（app.inject 模式，参考 v025-route-integration.test.js）。

**授权文件**：`server/tests/v026-route-integration.test.js`（新建）

完成后写 comms `05-to-01-v027-route-integration-{日期}.md`，申请审核。

### 四号：空闲

---
## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | 当前 `e8b7e92` |
| feat/v027-random-template-ui | artist-commission-02 | 二号 |
| feat/v027-manual-order-redesign | artist-commission-03 | 三号 |
| test/v027-route-integration | artist-commission-05 | 五号 |

---
## 重要规则提醒

- 合并到 master 后**立即推送**（同一命令链）
- 操作 master 前**必须 `git log --oneline -5` 确认 HEAD**
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 提交前 `git diff --stat` 确认只有授权文件（禁止 `git add -A`）
- **并行角色必须在独立 worktree 工作，主 worktree 永远停在 master**
