# 全局状态（一号维护，其他角色只读）

> 最后更新：2026-08-01 收工
> 维护者：一号（主理人）

---
## master 状态

- **HEAD**：`89377f6`，与 origin 同步
- **后端测试**：482/482 通过（28 文件）
- **前端测试**：87/87 通过（5 文件）
- **E2E 测试**：5/5 通过（Playwright，已接入 GitHub Actions CI）
- **构建**：通过（main CSS 123.63 kB / gzip 46.14 kB，main JS 402.66 kB / gzip 150.28 kB）
- **迁移**：v24 已应用（quota_pool_paid_total）
- **容器**：⚠️ 需重建（迁移 v24 尚未在容器中执行）
- **类型检查**：`npx tsc --noEmit` 零错误（features/ + utils/ + middleware/ 全部 TS）

---
## v0.23 进度

| # | 项 | 负责 | 状态 |
|---|---|---|---|
| B7 后端 | 额度池（迁移 v24 + 收款 API + 三态推算 + 话术 BUG 修复 + 删 adjustInstallments） | 三号 | ✅ 已合入 master |
| B7 前端 | 画师端收款区 + 客户端 track + 管理端流水 | 二号 | 🔵 **明天开工**（见下方派工） |
| B4 留言板 | 前端 + 后端 | — | ✅ v0.19 已完成（核实确认，无增量） |

---
## 明天开工指南（各角色必读）

### 二号：B7 额度池前端

> **分支**：`feat/v023-frontend`
> **Worktree**：`D:\Hermes Agent CN Desktop\workspace\artist-commission-fe`（已 rebase 到 master）
> **派工文件**：`docs/comms/01-to-02-v023-b7-go-20260801.md`（含完整 API 契约）
> **Spec 参考**：`docs/specs/plan-v023-quota-pool.md` §4（前端交互设计）

**任务**（按顺序）：

| 波 | 工作 | 预估 |
|----|------|------|
| 2 | 画师端收款区重做：OrderDetail.vue 价格小结区（L879-905）→ 额度池模型（已收/应收/待收 + 进度条 + 流水列表 + 记录/撤销弹窗 + 应收参考区）。新建 useOrderPayments composable + api 方法 + i18n | 3h |
| 3a | 客户端 track 页：TrackOrder.vue 分期列表（L103-107）→ 进度条 + 四项数据（已付/下期应付/待付/总额），不显示画师内部节点名 | 1h |
| 3b | 管理端收款流水：ArtistManage.vue 订单列表弹窗内加行展开或 drawer（你定），只读展示 | 1h |

**关键提醒**（预读发现，已确认）：
1. **PaymentBar 保留不动**——它是工作流比例编辑组件（WorkflowPaymentEditor 消费），与订单收款无关。B7 是 OrderDetail 新增收款记录区
2. OrderDetail L879-905 价格小结区 → 替换为额度池模型
3. TrackOrder L103-107 分期列表 → 改为四项数据 + 进度条
4. 管理端无订单详情页 → 在订单列表弹窗内加行展开或 drawer

**后端 API 契约**（已合入 master）：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/artist/orders/:id/payments | body: `{ amountCents: integer, note?: string }` → `{ payment, paidTotalCents, finalPriceCents }` |
| GET | /api/artist/orders/:id/payments | → `{ payments: [...] }` |
| GET | /api/artist/orders/:id | 响应含 `paidTotalCents` / `remainingCents` / `installments`（三态 + paidCents） |
| GET | /api/orders/track/:orderNo | 响应含 `paidTotalCents` |

**授权文件范围**：
- `web/src/views/artist/OrderDetail.vue`
- `web/src/views/track/TrackOrder.vue`
- `web/src/views/admin/ArtistManage.vue`
- `web/src/composables/useOrderPayments.js`（新建）
- `web/src/api/index.js`
- `web/src/i18n/`
- `web/test/`

完成后写 comms `02-to-01-v023-b7-frontend-{日期}.md`，申请审核。

---

### 三号：空闲，可选任务

v0.23 后端全部完成。可选：
1. **容器重建**（迁移 v24 需在容器中执行）——需一号协调
2. **GET /api/admin/messages 补齐**（v0.19 遗留，管理端前端静默降级）——小活，~30min
3. 待命

---

### 四号：空闲，可选任务

可选：REQ-012 日历视图 spec 草案（用户已拍板"做"，未展开）。参考 `docs/requirements/REQ-012-画师工具需求反馈.md`。

---

### 五号：空闲，可选任务

可选：全量审计（测试覆盖率 / EP CSS 边角页面视觉走查 / CI workflow 验证）。

---

## 分支状态

| 分支 | Worktree | 状态 |
|------|----------|------|
| master | 主 worktree（一号专用） | 当前 `89377f6` |
| feat/v023-frontend | `../artist-commission-fe` | 二号（已 rebase，明天开工） |

---
## 已知遗留（非阻塞）

| # | 项 | 严重度 | 说明 |
|---|---|---|---|
| 1 | 容器重建（迁移 v24） | 中 | 线上容器未跑 v24 |
| 2 | GET /api/admin/messages 缺失 | 低 | v0.19 遗留，前端静默降级 |
| 3 | P2-2 Redis 限流 | 低 | 生产前处理 |
| 4 | 安全债 4 项 | 低 | 已知，非紧急 |
| 5 | A4 边角页面视觉回归 | 低 | HealthCheck/TierManage 未验证 |

---
## 重要规则提醒

- 合并到 master 后**立即推送**（同一命令链）
- 操作 master 前**必须 `git log --oneline -5` 确认 HEAD**
- 禁止对 master 执行 `git reset --hard` / `git rebase`
- 提交前 `git diff --stat` 确认只有授权文件（禁止 `git add -A`）
- **并行角色必须在独立 worktree 工作，主 worktree 永远停在 master**
- **验证证据**：comms 中写 commit hash + 数字即可，不需要在会话内重跑命令给系统看。一号合入前独立验证
