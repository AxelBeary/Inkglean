# 视觉批施工图：Dashboard 纸墨化（v0.9 原型落地）

> 状态：用户 2026-08-13 拍板「开稿」，响应式必须兼容好。
> 原型基准：workspace/temp/prototype-dashboard-v2/dashboard-v0.2.html（内容 v0.9 配色）
> 提案依据：docs/纸墨设计语言提案-v1.md §3/§5/§6 + 用户 08-12~13 五条口头拍板
> 施工：前端视觉一号亲做（审美不走便宜模型）；后端机械波派 codex。

## 一、模块清单（原型 → 真实组件映射）

| 模块 | 原型形态 | 真实落点 | 数据源 |
|---|---|---|---|
| 问候贴纸 | 固定容器+逐字洇墨+入场仪式+换一句+日期时段行+今日统计行+落款 | GreetingHero.vue 重写为 GreetingNote.vue | getGreeting + getStats（今日新单/收入字段已有） |
| 统计三卡 | 待处理新单/进行中/累计完成，状态色条+文楷墨字 | StatCards.vue 纸墨化（结构保留） | getStats |
| 挂牌+名额 | 可约稿⇄休息中 Y 轴翻牌+绳随翻+钟摆+光带；牌下名额条+已排满藤黄 | SlotOverview.vue 重写为 PlaqueStatus.vue | getSlots + updateStatus(open/break) |
| 排期卷轴 | 两端纸卷+轴头+宣纸长卷+纸签式五色条+今日笔触线 | 新组件 ScheduleScroll.vue | **新增 API** /artist/dashboard/schedule |
| 账本待办 | 一行一个动词+原地完成+5s 墨线冷却+沉底+撕页清账+泥金交付 | TodoList.vue 重写为 LedgerTodo.vue | getDashboardTodo + updateStatus/advanceStage |
| 留言审核 | 账本式列表+通过/拒绝/回复 | GuestbookReviewCard.vue 纸墨化 | 现有 |
| 订单动态 | 描述+#单号+相对时间 | ActivityFeed.vue 纸墨化 | 现有 |
| 开张任务 | 1/3 进度三任务 | OnboardingCard.vue 纸墨化 | 现有 |
| 百眼柜 | 快捷动作三分组 | QuickActions.vue 纸墨化分组 | 现有 |
| 公告行 | 问候便签下一行淡墨，看过即消 | GreetingNote 内嵌 | getAnnouncement（已有） |
| 月度小结 | 账本底部一行 | LedgerTodo 内 | getStats |
| 模块开关 | 设置页「看板显示」四开关 | 偏好设置 + dashboard_modules 字段 | **新增迁移** |

## 二、待办「一行一个动词」（用户已点头方向）

按钮 = 该订单下一步动词，全部原地完成不跳页，5s 墨线冷却，行体点击进详情（from=dashboard）：
- pending→确认 / confirmed→开始制作 / wip→推进节点（末节点变「完稿了」）/ revision→改完了 / done→去交付
- 要收的行→收到了
- 完成 = 石绿笔点→沉底；交付 = 泥金盖章后沉底；沉底区「清账·撕页」
- 排序：逾期→截稿近→新单；数据走现有 API（updateStatus/advanceStage，乐观锁 version 已就位）

## 三、响应式规则（用户点名必须兼容好）

| 断点 | 布局 |
|---|---|
| >960px | 原型 v0.9 布局：顶排（问候+统计 ｜ 挂牌+名额）→ 卷轴全宽 → 主栅格（账本/留言/动态 ｜ 开张任务/百眼柜） |
| ≤960px | 单列：问候→挂牌（居中收窄）→统计→卷轴→账本→其余；挂牌挂具宽度 224→200 |
| ≤600px | 统计三卡改单列堆叠（横排数字左+标签右，沿用 StatCards 812 既有修法挂 body 层）；卷轴日期栏隔日显示（偶数日隐）防挤；账本行动词按钮换行占整行 |
| 通用 | 问候容器高度固定不破；卷轴纸卷/轴头缩至 20px/探出减半；所有 hover 态触屏降级为 active；prefers-reduced-motion 全关动画 |

## 四、分期

**P1（本波）**：Dashboard 骨架重排 + GreetingNote + PlaqueStatus + LedgerTodo + ScheduleScroll（可先用假数据骨架，API 到位后接）+ 响应式全套。
**P2（接续）**：留言/动态/开张任务/百眼柜纸墨化 + 公告行 + 模块开关（随迁移）+ 泥金/撕页/逐字洇墨全动效移植 + 容器截图验收。

## 五、后端波（codex，worktree 813-dash-backend）

1. 迁移 v61：artists 加 last_login_at / last_greeting_shown_at（问候触发规则备料，本波只加列+回读测试）；artists 加 dashboard_modules TEXT DEFAULT NULL。
2. 新端点 GET /api/artist/dashboard/schedule：返回 [今日-1, 今日+6] 区间内的订单排期条（id/order_no/client_name/status/start_date/deadline/current_stage_name），排除 delivered/cancelled；+单测（区间边界/排除态/无数据空数组）。
3. 门禁：server typecheck/lint/vitest 全绿。

## 六、验收口径

前端：lint/vue-tsc/vitest/check-i18n/build 全绿 + Playwright 三档视口（1440/768/390）截图逐帧自审 + 交互冒烟（翻牌/推进/撕页/换一句/模块开关）。合入后容器重建 + 生产冒烟再交用户终验。
