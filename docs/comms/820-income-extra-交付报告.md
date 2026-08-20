# 820 worktree 批交付报告 —— oimimo 吸纳补遗：收入分布两聚合

> 分支：`feat/income-charts-extra-820`（提交 acd3c362）· worktree：`../artist-commission-wt-income-820`
> 基线：master 9f202f9c（v139 收口后）· 完工：2026-08-20
> 来源：oimimo 吸纳清单最后两块可食肉（v138 收入图表当时特意留下的品类分布/客户排名，拾绘化为画风分布）

## 本体

### 后端（server，两新端点，与 income-monthly 同窗口同口径）
- `GET /api/artist/tools/income-by-style?months=3〜24（默认 12）` → `{ styles: [{styleName, cents}] }` 降序
  - order_payments 按到账日窗口聚合；画风经 orders.style_size_id → style_sizes → art_styles 关联
  - 无画风关联订单（手动录单）落 styleName='' 桶，前端渲染为「未分类」
- `GET /api/artist/tools/top-clients?months=&limit=3〜20（默认 8）` → `{ clients: [{clientQq, clientName|null, totalCents, orderCount}] }`
  - 按 client_qq 聚合（同客户多单合并），金额降序，orderCount 为去重单数
  - clientName 取非空最大值，无则 null（前端回落 QQ）
- 窗口起点与 getIncomeMonthly 同源（本地月初零点 → UTC）

### 前端（web，挂入统计导出页既有收入趋势区）
- `IncomeTrendCharts.vue` 新增两格：
  - **画风收入分布环图**（Chart.js doughnut，宣纸色谱 hq/sl/zs/ink4/ink2 轮换，图例置底）
  - **客户消费排名榜**（纸墨列表非图表：排名/名字/单数/金额，榜首排名朱砂标，无名回落 QQ）
- 两聚合**独立失败隔离**：任一接口挂只落自己空态，不拖主图与主流程
- i18n：zh/en 各 5 键（incomeStyleTitle / incomeClientsTitle / incomeDistEmpty / incomeUncategorized / incomeClientOrders）

## worktree 内门禁实测（全部脚本实跑，非 self-report）

| 项 | 结果 |
|---|---|
| server typecheck（三配置） | 零错 |
| server lint（eslint+oxlint） | 0 warnings 0 errors |
| server vitest | **1612/1612**（基线 1608，+4：TC-IX-01〜04） |
| web lint（vue-tsc+eslint） | 0 errors 0 warnings |
| web vitest | **686/686**（基线 684，+2：TC-ITC-04〜05；worktree 内 vitest 正常，未撞双实例坑） |
| web check:i18n / build | 全过 |
| 布局审计 measure（IncomeTrendCharts.vue） | 零阻塞（新样式全 token/4px 栅格） |
| E2E | **未跑**（worktree 内起 E2E 会撞本机生产容器端口；合并窗口 accept.ps1 自带 E2E 补上） |

## 合并窗口接手清单

1. `git merge feat/income-charts-extra-820`（或按既有合并纪律操作），预期无冲突（仅触碰 tools.service/tools.routes/IncomeTrendCharts/api/types/locales，均为追加式改动）
2. 跑 `scripts/accept.ps1 -TestTamperAck "oimimo 吸纳补遗两聚合端点与图表随附 6 条新测试，存量零改动"`
3. accept-baseline.json 登记 **server 1612 / web 686 / E2E 13**
4. post-merge-deploy 进本机生产；公网由用户跑 update.sh
5. STATUS 落一条 v140（合并窗口负责，本分支不动 STATUS 防撞车）
6. 合并后 worktree 清理：`git worktree remove ../artist-commission-wt-income-820`

## 公网复验点

统计导出页 → 收入趋势区下方新增两块：画风收入分布环图（无收款时空态文案）+ 客户消费排名榜。
