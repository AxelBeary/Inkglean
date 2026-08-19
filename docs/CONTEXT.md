# 拾绘 / Inkglean — 领域术语表

> 所有角色共享此文件。需求文档、代码注释、comms 通信中使用统一术语，减少歧义。
> 维护者：四号（需求侧）+ 一号（技术侧）。新增术语需双方确认。

## 核心实体

| 术语 | 英文标识 | 定义 | 易混淆 |
|------|---------|------|--------|
| 画师 | artist | 提供约稿服务的创作者，平台的核心用户 | ≠ 用户（用户是客户） |
| 客户 | customer/client | 下单约稿的人，通过画师主页进入 | ≠ 用户（泛指） |
| 委托 / 约稿 | commission | 客户向画师发起的一次定制创作请求 | "订单"是委托进入流程后的管理视角 |
| 订单 | order | 委托被确认后的管理实体，有状态机流转，带 version 乐观锁（审计批 D） | 委托强调"请求"，订单强调"管理" |
| 档位（历史词） | tier | 旧模型的服务等级，已随 SPEC-PRICE-2 退役（v50 删表），由画风/尺寸/增项体系取代 | 历史文档中见到时按旧义理解 |
| 稿件 / 交付物 | deliverable | 画师提交的创作成果文件 | ≠ 参考图（参考图是客户提供的） |
| 参考图 | reference | 客户下单时提供的示例/需求图片；上传需 anon-token 归属登记（审计批 F） | ≠ 稿件 |

## 价格体系（SPEC-PRICE-2 统一模型，唯一事实源）

> 公式铁律：最终价 = (基础价 + Σ固定增项 + Σ百分比增项[只按基础价]) × 用途 × 加急 × 折扣；全程整数分。原始规范已归档：docs/specs/archive/SPEC-PRICE-2-价格模型统一重构.md（本文件为活规范）。

| 术语 | 英文标识 | 定义 |
|------|---------|------|
| 画风 | art_style | 一级服务维度（"日系""厚涂""Q版"），含封面图与描述 |
| 尺寸 | style_size | 画风的二级规格（"头像""半身""全身"），各自基础价（base_price，整数分） |
| 增项模板 | addon_template | 画师级增项库；两类控件（开关/个数）× 两种计价（¥固定/%百分比）× 三类 category（add 加法/usage 用途/rush 加急） |
| 用途增项 | usage multiplier | 商用/买断等，下单限选一个（ADDON_SELECTION_MUTEX），乘数语义 |
| 加急增项 | rush multiplier | 加急档，下单限选一个，乘数语义 |
| 折扣码 | discount_code | 画师可启用的优惠码（percent/fixed），fail-closed 日期校验 |
| 已付额度池 | paid_total_cents | 订单已收款总额（冗余字段，由 order_payments 流水事务维护） |
| 收款流水 | order_payments | 每笔收款/退款记录（正数=收款，负数=撤销/退款），永不 DELETE；提交带幂等键防重 |
| 零元单 | zero-price order | totalCents=0 的订单：系统备注显式标记，客户端显示「0 元订单」徽标 |
| 价格快照 | quote_snapshot | 下单时冻结的计价明细（订单创建后模板变更不影响存量单） |
| ~~分期~~ | ~~installment~~ | **已退役**（v52 删列迁移）：旧节点收款模型，由额度池模型取代 |

## 订单生命周期

| 术语 | 英文标识 | 定义 |
|------|---------|------|
| 排期 | queue | 画师待处理订单的时间线/看板视图（formal 正式区 / buffer 缓冲区双区） |
| 看板 | board / kanban | 排期的可视化展示（QueueBoard 组件，含时间条拖拽） |
| 截稿 | deadline | 订单的交付截止日期 |
| 完稿 | delivered | 画师提交最终稿件，订单进入终态 |
| 阶段 | stage | 流程模式下的订单推进节点（flow-mode 订单用 `current_stage_id`） |
| 状态转换 | transition | 订单从一个状态到另一个状态的合法跳转（后端 STATUS_TRANSITIONS 统一断言） |
| 乐观锁冲突 | ORDER_CONFLICT | 旧 version 快照写入被拒（409），前端提示刷新重试 |

## 平台功能

| 术语 | 英文标识 | 定义 |
|------|---------|------|
| 画师主页 | artist profile / landing | 客户看到的画师展示页（含作品、规则），四套模板（atelier/classic/gallery/folio） |
| 嵌入 | embed | 将画师主页以 iframe 形式嵌入外部页面（locale 键空间 embed.*） |
| 签名 URL | signed URL | 带时效签名的私有文件访问链接（15 分钟有效，防直链盗用） |
| 匿名凭证 | anon-token | 客户侧埋点与参考图归属共用的匿名 token（x-anon-token header） |
| 幂等键 | idempotency-key | 下单/收款提交的防重放 header（同 key 重放返回首次结果） |
| 管理后台 | admin panel | 画师/管理员使用的运营管理界面 |
| 快捷按钮 | quick_actions | 画师自定义的常用操作入口（DB 字段 + localStorage 回退缓存） |
| 留言 | message / guestbook | 客户在画师主页的公开留言，画师后台分页管理（服务端分页）；画师可手动开关留言功能（guestbook_enabled，v68） |
| 功能开关 | feature toggles | 管理员级开关两层：留言开关（画师级，默认开）与统计开关（stats_enabled 平台级，默认关，未开时画师后台隐藏统计导航） |
| 封禁 / 移除 | ban / delete | 封禁=冻结（is_banned，登录拒绝+公开页隐身，随时可解封）；移除=软删（deleted_at，从在册列表消失，可在「已移除画师」清单恢复） |
| 更新检查 | system update | 管理端系统自检页只读面板：当前版本 vs GitHub 最新 commit + 更新命令复制（方案 A，只读不代执行） |
| 动态口令 | TOTP | RFC 6238 登录认证（REQ-027 起取代旧登录码），开发模式 AUTH_DEV_MODE=true 时绑定接口返回密钥明文 |

## 技术栈速查

| 层 | 技术 | 备注 |
|----|------|------|
| 后端 | Fastify 5 + better-sqlite3 | 单体，非微服务 |
| 后端运行时 | tsx | 支持 .ts 直跑；全仓 TS 收尾后已无 .js 混存 |
| 类型系统 | TypeScript strict（全仓） | 2026-08-19 一次性收尾：后端/前端/测试/脚本/配置全 TS，allowJs 已关；测试与脚本分别经 tsconfig.tests.json / tsconfig.scripts.json / e2e/tsconfig.json 纳入类型门禁；禁 any/@ts-ignore，类型缺口用局部 interface + as 断言 |
| 前端 | Vue 3 + Element Plus + Pinia | SPA；api 层 161 DTO；全量 .ts + vue script lang="ts"，vue-tsc 进 lint/CI |
| 前端 i18n | vue-i18n@11 | zh-CN + en 双键，check-i18n 门禁 |
| 数据库 | SQLite（better-sqlite3 单连接，同步 API），迁移当前 **v68**（v65 cancel_undo_windows 取消撤销窗口 / v66 deliverables 一次性下载状态列 / v67 greeting_slot_rework 问候档位重构 / v68 artists 留言开关+统计开关默认值） | 单进程单连接同步模型——不支持多实例共享同一 DB；DDL 双轨（完整 schema + 迁移链）由一致性测试锁定 |
| 部署 | Docker Compose + Caddy（自动 HTTPS） | entrypoint 带 DB 损坏自愈（自动恢复最新备份）；生产弱会话密钥拒绝启动（815 拍板 #12） |
| 备份 | DB 三档分层（每日 7 份 / 部署前 2 份 / 每周 4 份，815 拍板 #10）+ uploads tar 备份（2 份轮转）+ restore-db/rollback 恢复脚本（支持 -Tier 选档） | OPS.md「备份与恢复」章节 |
| 测试 | Vitest（后端 1589/134 文件 + 前端 651/98 文件，2026-08-19 实测，基线随批次变动以 STATUS 最新条目为准）+ Playwright E2E（13 条，接入 CI；global-setup 含管理员 step-up） | |
| 监控 | Sentry（后端+前端均已接入） | sentry.io 免费版，DSN 环境变量开关 |

## 使用规则

1. 需求文档（REQ/SPEC）中首次出现术语时加粗，后续可简称
2. 代码标识符用英文（artist, tier, multiplier），注释和文档用中文
3. 发现术语歧义（如"订单"和"委托"混用导致理解偏差），在此表补充区分说明
4. 新术语由提出者写入，标注日期，下次角色同步时确认
