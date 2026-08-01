# 绘约 / Brushline-HuiYue — 领域术语表

> 所有角色共享此文件。需求文档、代码注释、comms 通信中使用统一术语，减少歧义。
> 维护者：四号（需求侧）+ 一号（技术侧）。新增术语需双方确认。

## 核心实体

| 术语 | 英文标识 | 定义 | 易混淆 |
|------|---------|------|--------|
| 画师 | artist | 提供约稿服务的创作者，平台的核心用户 | ≠ 用户（用户是客户） |
| 客户 | customer/client | 下单约稿的人，通过画师主页进入 | ≠ 用户（泛指） |
| 委托 / 约稿 | commission | 客户向画师发起的一次定制创作请求 | "订单"是委托进入流程后的管理视角 |
| 订单 | order | 委托被确认后的管理实体，有状态机流转 | 委托强调"请求"，订单强调"管理" |
| 档位 | tier | 画师预设的服务等级（如"头像档""全身档"），含基础价格 | ≠ 倍率（倍率是价格调整系数） |
| 档位三态 | tier display status | v0.24：visible（正常展示可下单）/ showcase（仅展示不可下单）/ hidden（完全隐藏） | ≠ 档位本身（三态是展示控制，不是服务等级） |
| 稿件 / 交付物 | deliverable | 画师提交的创作成果文件 | ≠ 参考图（参考图是客户提供的） |
| 参考图 | reference | 客户下单时提供的示例/需求图片 | ≠ 稿件 |

## 价格体系

| 术语 | 英文标识 | 定义 |
|------|---------|------|
| 基础价格 | basePrice | 档位自带的固定价格 |
| 倍率 | multiplier | 价格调整系数，分用途倍率（usageMultiplier）和加急倍率（rushMultiplier） |
| 详细计价 | pricing breakdown | 基础价格 × 各倍率 = 最终价格的展开明细 |
| 计价预览 | pricePreview | 客户选档后实时显示的预估价格（未提交） |
| 已付额度池 | paid_total_cents | v0.23 B7：订单已收款总额（冗余字段，由 order_payments 流水事务维护） |
| 收款流水 | order_payments | 每笔收款/退款记录（正数=收款，负数=撤销/退款），永不 DELETE |
| 分期三态 | installment status | paid（完全覆盖）/ partial（部分覆盖）/ pending（未覆盖），由 paid_total_cents 推算 |

## 订单生命周期

| 术语 | 英文标识 | 定义 |
|------|---------|------|
| 排期 | queue | 画师待处理订单的时间线/看板视图 |
| 看板 | board / kanban | 排期的可视化展示（QueueBoard 组件） |
| 截稿 | deadline | 订单的交付截止日期 |
| 完稿 | delivered | 画师提交最终稿件，订单进入终态 |
| 阶段 | stage | 流程模式下的订单推进节点（flow-mode 订单用 `current_stage_id`） |
| 状态转换 | transition | 订单从一个状态到另一个状态的合法跳转（后端强制校验） |

## 平台功能

| 术语 | 英文标识 | 定义 |
|------|---------|------|
| 画师主页 | artist profile / landing | 客户看到的画师展示页（含档位、作品、规则） |
| 嵌入 | embed | 将画师主页以 iframe 形式嵌入外部页面 |
| 签名 URL | signed URL | 带时效签名的私有文件访问链接（防直链盗用） |
| 管理后台 | admin panel | 画师/管理员使用的运营管理界面 |
| 快捷按钮 | quick_actions | v0.24：画师自定义的常用操作入口（DB 字段 + localStorage MVP），管理后台可配置 |
| 留言 | message / guestbook | v0.24：客户在画师主页的公开留言，画师后台可管理（独立页面 + 侧边栏角标） |
| 开发模式 | dev mode | 当前阶段，AUTH_DEV_MODE=true，登录页显示验证码，非生产环境 |

## 技术栈速查

| 层 | 技术 | 备注 |
|----|------|------|
| 后端 | Fastify 5 + better-sqlite3 | 单体，非微服务 |
| 后端运行时 | tsx（v0.21） | 支持 .ts/.js 混存，零配置 |
| 前端 | Vue 3 + Element Plus | SPA |
| 前端 i18n | vue-i18n@11 | v0.20 从 v9 升级 |
| 类型系统 | TypeScript（渐进迁移中） | v0.21 起，v0.22 完成 features/ + utils/ + middleware/ 全部 TS；剩余 app.js/index.js/db/ 入口 |
| 数据库 | SQLite | 开发期正确选择，不上 PG/MySQL。迁移当前 v26（quick_actions） |
| 部署 | Docker Compose + Caddy | 容器化 |
| 测试 | Vitest（后端 512 + 前端 87）+ Playwright E2E（5 条路径，已接入 CI） | |
| 监控 | Sentry（后端+前端均已接入） | sentry.io 免费版，DSN 环境变量开关 |

## 使用规则

1. 需求文档（REQ/SPEC）中首次出现术语时加粗，后续可简称
2. 代码标识符用英文（artist, tier, multiplier），注释和文档用中文
3. 发现术语歧义（如"订单"和"委托"混用导致理解偏差），在此表补充区分说明
4. 新术语由提出者写入，标注日期，下次角色同步时确认
