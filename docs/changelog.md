# 变更日志

## v0.27 — 2026-08-02

### ✨ 功能

- **多模板随机 UI 开关**：话术编辑区新增"随机模板"checkbox，画师可让客户每次访问看到不同模板风格（后端 v0.25 已就绪，前端开关补齐）
- **手动录单重设计**（REQ-015）：手动录单从 560px 抽屉升级为全屏双栏独立页（`/orders/new`），左栏"客户说了什么"（QQ/参考图粘贴/昵称/描述/优先级/截稿日）+ 右栏"我怎么安排"（档位/增项/倍率/流程/备注），QQ 输入后防抖自动查询历史订单

### 📊 测试

- 路由层集成测试新增 10 用例

---

## v0.26 — 2026-08-02

### ✨ 功能

- **档位拖拽排序**：档位管理页支持 vuedraggable 拖拽排序（`PUT /api/artist/tiers/reorder`），客户主页按新顺序展示
- **开工日**：订单新增开工日字段（迁移 v29），订单详情开工日 date-picker + 截稿日自动填充建议，排期看板时间条带子起点改为开工日
- **开稿管理独立页**（`/slots`）：名额/月度额度/队列行为四开关从设置页搬出为独立页面，侧边栏新增入口，设置页"接稿设置"tab 保留快捷按钮配置

---

## v0.25 — 2026-08-02

### ✨ 功能

- **封面图指定+轮播**：作品管理支持星标封面图（多张共存），客户主页 4 模板 el-carousel 轮播展示
- **多模板随机（后端）**：迁移 v28（artwork_is_cover + stage_random_template）+ randomTemplate 开关，画师可开启模板随机
- **快捷按钮持久化**：快捷按钮配置从 localStorage 迁移至 DB（前端 DB 优先 + 后端 schema 补全）
- **日历时间条视图**：排期看板第三 tab（时间条），缩放 + 今天参考线
- **移动端翻月手势**：月历视图支持左右滑动翻月

### 🐛 修复

- **截稿日日历点选失效**：只读 computed → 可写 computed
- **仪表盘待办返回导航**：加 `?from=dashboard` 参数
- **seedOrder 碰撞修复**：测试种子数据订单号碰撞

### 📊 测试

- 路由层集成测试 13 项
- 后端 545 + 前端 87 + E2E 5 = 637 个用例

---

## v0.24 — 2026-08-02

### ✨ 功能

- **档位展示柜**（REQ-013 #9）：档位区从固定高度裁切卡片改为"菜单 + 大图切换"展示柜模式，图片完整显示不裁切，移动端左右滑动切换，4 模板统一生效
- **档位三态**（REQ-013 #10）：档位可见性三态（开 / 只展示 / 不展示），迁移 v25 + API 过滤 + 下单校验，替代"删除即消失"
- **接稿设置独立标签页**（REQ-013 #4）：设置页新增"接稿设置"tab（名额/额度/缓冲整体挪入），名额概览改人话文案（复用 slotDisplay）+ 合并进度条 + 整卡跳转接稿设置
- **手动录单侧边栏入口**（REQ-013 #6）：侧边栏新增手动录单常驻菜单项
- **统计卡可点击**（REQ-013 #2）：仪表盘三张统计卡点击跳转订单列表对应筛选
- **留言管理页面**（REQ-013 #1）：画师端独立留言管理页（状态筛选/回复/通过/拒绝），侧边栏入口 + 未处理角标
- **快捷按钮自定义**（REQ-013 #3）：候选按钮池 + 勾选自定义（3~9 个），命名与侧边栏统一

### 🐛 修复

- **P0 审计修复**（3 项）：reset 禁止活跃订单 + 价格加减法 + 看板队列过滤 + 标签 UI（508 测试全绿）
- **看板完成订单驻留**（REQ-013 #7）：工作流 done 订单交付入口 + 完成区沉底 + 7 天过期隐藏

### 📊 测试

- 后端 489 + 前端 87 + E2E 5 = 581 个用例

---

## v0.23 — 2026-08-01

### ✨ 功能

- **额度池**（B7）：订单收款流水表 order_payments + 已收总额冗余字段 paid_total_cents（迁移 v24），收款/撤销 API，分期三态推算（paid/partial/pending）
- **额度池前端**：画师端收款区（记录/撤销弹窗 + 进度条 + 流水列表），客户端 track 进度条（已付/下期/待付/总额），管理端订单行展开收款流水

### 🐛 修复

- 话术变量替换 BUG 修复
- 删除 adjustInstallments 遗留接口
- admin 订单列表补 paidTotalCents/finalPriceCents/installments 字段

### 📊 测试

- 后端 482 个用例全绿

---

## v0.22 — 2026-08-01

### ✨ 功能

- **TypeScript 迁移完成**（A3）：features/ + utils/ + middleware/ 全部 JS→TS（29 文件），tsc --noEmit 零错误
- **Playwright E2E**（A2）：5 条核心路径端到端测试，接入 GitHub Actions CI（chromium + global-setup 自动构建）
- **Sentry 前端**（A1）：前端 SDK 接入，DSN 环境变量开关 + errorHandler 上报
- **EP CSS 按需引入**（A4）：删全量 index.css + JS API 组件手动补样式，gzip 93→46kB（-47kB）

### 🐛 修复

- PaymentBar 暗色适配（A5）：段底/文字亮度改 CSS 变量 + html.dark 覆写

### 📊 测试

- 后端 469 + 前端 87 + E2E 5 = 561 个用例

---

## v0.21 — 2026-07-31

### ✨ 功能

- **TypeScript 渐进迁移启动**：tsconfig + types/entities + pricing/shared 迁移 .ts + tsx 运行时（零配置 .ts/.js 混存）+ typecheck 脚本
- **Sentry 后端**：错误监控接入，DSN 环境变量开关
- **Playwright E2E 框架**：独立 DB + 预登录 token + zh-CN 强制，5 条核心路径 12.9s 全绿

### 🔧 工程化

- Dockerfile + compose 支持前端 Sentry DSN 构建时注入（ARG VITE_SENTRY_DSN）
- tsx 移 dependencies + entrypoint 改 tsx（Docker 部署适配 TS 迁移）

---

## v0.20 — 2026-07-31

### ✨ 功能

- **vue-i18n v11 升级**：前端国际化框架从 v9 升级到 v11（零 breaking change）
- **流程比例美化**：PaymentBar 色相区分 / grip 拖拽手柄 / 标尺刻度 / 圆角重做
- **主题切换 FAB**：亮暗/中英切换按钮从右上角 absolute 重做为右下角固定 FAB
- **EP 按需引入**：Element Plus 从全量引入改为按需引入

### 🐛 修复

- QueueBoard getWorkflow 静默失败改为 console.warn 输出

---

## v0.19 — 2026-08-01

### ✨ 功能

- **F2 瀑布流统一**：4 模板作品展示统一为 masonry 瀑布流布局，竖图/横幅保留原始比例不裁切（C36 已拍板）
- **F3 小公告**：画师设置页编辑一条短公告（顶掉模式），客户主页首屏醒目展示（📢 图标+底色区分），支持可选过期时间自动消失（C41/C42 已拍板）
- **F1 点赞**：客户主页作品心形点赞（匿名/可取消/同浏览器去重 localStorage），心形变色+填充微动画+计数
- **F4 留言板**：画师主页底部留言墙（任何人填昵称即可留言），先审后显（画师审核+管理员兜底强制删除），画师可回复，纯文字 200 字以内，客户/画师/管理 3 端
- **HC 系统自检**：管理后台"系统"菜单，按需触发 8 项检查（数据库/迁移/上传目录/磁盘/数据完整性/备份/JWT_SECRET/Node 版本），列表+折叠详情，诊断包下载
- **S2 进度条**：客户进度页流程进度条（SPEC-002 §八拍板项）
- **P1-4 参考图 tooltip**：客户下单页/画师手动下单页参考图标签 hover 显示详细说明（订单图库合计上限 20 张，下单后画师可补充）

### 🗄 迁移

- **v21**：`artists` 表 +`announcement TEXT` + `announcement_expires_at DATETIME`；`artworks` 表 +`like_count INTEGER DEFAULT 0`（F3 公告 + F1 点赞）
- **v22**：`guestbook_messages` 表（F4 留言板：artist_id / nickname / content / status / artist_reply / replied_at / deleted_by_admin）+ 索引

### 🧪 测试

- 后端 410 → **445**（+35 例：含 P1-6/P1-7 热修 2 + 公告+点赞 10 + 留言板 13 + 自检 8 + P1-5/P2-7 2）
- 前端 17 → **87**（+70 例：前端测试扩充，覆盖 4 模板 / 共享组件 / 交互）
- 合计 **532**

### 🔧 修复

- **P1-5**：deleteStage 阻止删除有活跃订单引用的流程节点（方案 A，防悬挂引用）
- **P1-6**：重复 qq/subdomain 注册 500→400（三号）
- **P1-7**：docker healthcheck localhost→127.0.0.1（IPv6 兼容，三号）
- **P2-7**：uncaughtException 处理加 db.close()（防数据库连接泄漏）
- **详细计价崩溃**：增项初始值 undefined + breakdown 防御（五号，P0）
- **admin messages API**：补 GET /api/admin/messages 端点（管理端留言列表，跨画师+artist_name）

### 📝 文档

- SPEC-002 §八 / SPEC-005 额度池设计评估（三号）
- v0.19 排期定稿 + P1-4 拍板记录（四号）
- 技术债占位：vue-i18n v9→v11 迁移（五号）
- 嵌入废弃代码清理：EmbedOrderPage + embed.html + vite 入口删除（一号）

---

## v0.18 — 2026-07-31

### ✨ 功能

- **节点话术**：画师为每个流程节点编辑话术模板（9 个变量替换：画师名/客户名/档位名/价格/节点名等），客户沟通卡片展示当前节点话术（迁移 v20）
- **仪表盘重构**：收入统计（月/周柱状图）+ 合并待办（截稿+pending+revision 统一列表）+ 活动流（最近操作时间线）+ 名额概览 + 双栏布局，7 个新组件
- **嵌入改跳转**：嵌入脚本从 iframe 内嵌改为跳转模式（消除 P0 审计问题）

### 🗄 迁移

- **v20**：`artist_workflow_stages` 表 +`speech_template TEXT`（节点话术模板）

### 🧪 测试

- 后端 320 → **410**（+90 例：节点话术 15 + 仪表盘 20 + 技术债 schema/date/price 14 + admin 补测试 23 + deleteArtist/bumpTokenVersion 15 + 其他 3）
- 前端 0 → **17**（前端测试基建：vitest + happy-dom + normalize 提取 + 17 个示范测试）
- 合计 **427**

### 🔒 安全

- **审计 P1×3**：hidden 画师公开 API 泄露修复 + 粘贴上传 403 修复 + 401 误登出修复（三号）

### 🐛 修复

- **Bug A**：看板下拉菜单对流程订单误显示状态变更选项（五号）
- **侧边栏头像**：画师后台侧边栏显示已上传头像，未设置时回退文字头像（五号）
- **流程比例手动输入**：PaymentBar 点击冒泡重置 + 无自动聚焦（五号，BUG-6）

### 📝 文档

- 五号 docs 审计：README 测试数修正 + 死链修复 + specs 状态标注
- 仪表盘验收标准（C48~C58 逐项）
- v0.19 画师主页预研草案 + 系统自检规格

---

## v0.17 — 2026-07-31

### ✨ 功能

- **R24 校验弹窗**：表单提交前校验弹窗确认
- **R25 ThemePicker 右下角**：主题选择器移至右下角，减少视觉干扰
- **BUG-5 按图刷新**：图库操作后按图刷新，避免全量重载
- **R58-8 平台链接 + 灵感标签**：画师设置页管理平台 URL（自动识别图标）+ 自定义灵感标签（最多 20 个），客户主页集成展示
- **SPEC-003 附加工作项**：订单附加项 CRUD（迁移 v18），尾款重算 + 付款节点联动，客户进度页价格展示
- **SPEC-004 名额与缓冲系统**：画师设置批次名额（batch_limit）+ 缓冲名额（buffer_limit），排队机制（满额→排队→递补），看板缓冲区显示，客户主页名额展示（"开放中 · 剩 X 席"），进度页排队位置

### 🗄 迁移

- **v17**：`artists` 表 +`platform_urls TEXT` + `inspiration_tags TEXT`（平台链接 + 灵感标签）
- **v18**：`order_extra_items` 表（SPEC-003 附加工作项：order_id / name / price_type / price_value / sort_order）
- **v19**：`artists` 表 +`batch_limit INTEGER` + `buffer_limit INTEGER` + `queue_count INTEGER`（SPEC-004 名额与缓冲）

### 🧪 测试

- 262 → **320**（+58 例：R58-8 + SPEC-003 + SPEC-004 + R24/R25）

### 📝 文档

- SPEC-003 附加工作项技术方案（三号）
- SPEC-004 名额与缓冲系统技术方案（三号）
- v0.18 仪表盘需求规格（C48~C58 用户已拍板）
- 五号 v0.17 前置审计（测试覆盖 + 迁移安全预检）

---

## v0.16 — 2026-07-31

### ✨ 功能

- **R58-1 约稿表单重构**：useOrderForm composable 抽取（页面纯布局化，行为不变）
- **R58-2 分步引导布局**：三步表单 + 档位卡片 + 粘性摘要卡
- **R58-3 小票确认**：下单前小票式确认摘要
- **R58-4 灵感标签**：约稿表单灵感标签选择
- **R58-5 复制约稿信息**：一键复制约稿摘要
- **R58-6 QQ 跳转 + 复制**：客户侧成功弹窗画师 QQ / 画师侧订单详情客户 QQ
- **R58-7 模板字段**：order_template_id（迁移 v16）+ API 读写 + 白名单校验
- **R54 档位页卡片布局**：表格→卡片，保留 R55 拖拽直传 + i18n 硬编码修复 + 空状态
- **工艺 CSS 升级**：弹性缓动 / 按钮三态 / clamp 流式字号 / minmax 防溢出 / reduced-motion 兜底
- **管理员回收站**：文件列表 + 清空二次确认 + 空状态（配合孤儿回收→回收站后端）

### 🗄 迁移

- **v16**：`orders` 表 +`order_template_id TEXT`（R58-7 模板字段）

### 🧪 测试

- 197 → **262**（+65 例：覆盖率专项 upload 32%→89% / greeting 31%→100% + 测试隔离 + R58-7 + BUG-3 去重）

### 🔧 重构

- **order.service.js 职责拆分**：拆为 order-workflow / order-gallery / order-queue / order-stats 4 个子模块（三号）
- **技术债清理**：价格回退链 / 活跃过滤 / ISO 日期统一为工具函数（三号）
- **测试隔离 + 孤儿回收→回收站**：生产数据丢失事故根因修复（三号）

### 🐛 修复

- **BUG-1**：焦点图闪烁（背景色防白闪 + refreshNow 防抖 300ms + 重试上限 2 次）
- **BUG-2 补充**：拖入非图片文件提示
- **BUG-3**：图库去重校验（三号）
- **BUG-4**：比例条右拖不回弹 + 报错（右拖弹性阈值与左拖对称）

### 📝 文档

- REQ-011 H5 设计原型深度分析（可吸收功能 + 避坑点）
- 五号代码文档审计（order.service 拆分建议 / docs 清理 / 测试根因）
- 6 个过时文档归档 archive/

---

## v0.15 — 2026-07-30

### ✨ 功能

- **R40 活动时间线**：订单详情状态卡+备注卡合并为时间线混排（方案A 纯前端），类型标识（🔄 状态变更 / 📝 备注 / 🖼 带图备注），操作条保持独立
- **R46 备注删除**：画师可删除自己的备注（悬停 ✕ + ElMessageBox.confirm），系统备注保护（403），带图备注由 GC 孤儿回收
- **R48 头像上传**：设置页点击上传头像（即时保存），客户主页 4 模板消费，无头像显示首字母占位
- **R49 强调色**：设置页 5 色预设选择器，客户主页通过 `data-accent` 全局注入（4 模板零改动），暗色模式自动提亮
- **R50 主页预览**：设置页"预览主页"按钮，URL 参数覆盖渲染层（_tpl/_pal/_accent），预览横幅提示，不影响线上数据
- **R51 截稿日与待办**：订单详情/手动录单设置截稿日（el-date-picker），仪表盘截稿日卡片（7 天内到期，≤3 天红色警示）+ 今日待办卡片（pending+revision+今日截稿，C62 口径）
- **R52 今日统计**：仪表盘紧凑行（今日新增订单金额 + 今日收入金额），始终显示，金额分→元 /100
- **R53 看板焦点替换**：排期看板已有焦点图支持拖拽/点击直接替换（复用 uploadAndSetFocus），不需要确认弹窗（旧图保留在图库）
- **R55 档位图拖拽**：档位管理页示例图支持列表级拖拽/点击直传，无图直传，有图先 ElMessageBox.confirm 再覆盖（旧图不可恢复）
- **CSP 安全头**：主站非 /embed 路由补 Content-Security-Policy（script-src 'self' 'unsafe-eval'，Vue/EP 运行时兼容）

### 🗄 迁移

- **v15**：`artists` 表 +`accent_color TEXT`（R49）；`orders` 表 +`deadline DATETIME`（R51）+ 索引 `idx_orders_deadline`

### 🧪 测试

- 172 → **197**（+25 例：备注删除 4 + 今日统计 4 + 截稿日 5 + 迁移幂等 2 + 强调色 4 + note-image 上传 3 + 路由层 3）

### 🔒 安全

- 五号审计：82 路由 auth 覆盖无遗漏、SQL 全参数化、上传多层纵深防御、Cookie 配置完整
- 主站 CSP 头补全（五号审计 S1 修复）

### 📝 文档

- 五号审计 14 处文档不一致修复（REQ 状态/soul 迁移版本/README 测试数/SIGN_SECRET 引用/v0.14 功能列表）
- SPEC-003 附加工作项技术方案（待用户确认）

---

## v0.14 — 2026-07-30

### ✨ 功能

- **R39 状态区重构**：订单详情页状态区方案B重构（工作流进度条为主 + 固定状态兜底），信息层级更清晰
- **R42a 手动录单合并**：手动录单流程合并简化
- **R42b 须知编辑合并**：约稿须知编辑入口合并
- **R44 焦点/放大互换**：图库焦点图与放大查看操作互换，更符合直觉
- **R43 图库闪烁修复**：修复图库操作时的视觉闪烁
- **R45 多选删除**：图库支持多选批量删除
- **R41 备注拖拽**：订单备注支持拖拽排序
- **track-on 接口**：订单启用流程跟踪独立接口

### 🧪 测试

- 165 → **172**（+7 例）

---

## v0.13 — 2026-07-30

### ✨ 功能

- **R30d 流程状态机**：订单接入自定义工作流（推进/打回/关闭跟踪），客户 track 页显示节点名 + ↩ 打回标记，看板"推进到下一节点"按钮
- **R33 签名刷新**：useSignatureRefresh composable（10 分钟轮询 + @error 兜底），OrderDetail/QueueBoard 接入，长停留页面不再 403
- **R34 三模板外链**：Gallery（展签式）/ Folio（胶囊）/ Atelier（笔触下划线）补齐外链展示
- **R30a/b/c/e 看板增强**：宽屏多列布局、下一步按钮外露、手机左滑进详情、取消滑块确认
- **UI-8 hidden 状态**：画师可隐藏公开主页（第四态），客户看到友好提示页
- **UI-7 管理员导航**：ArtistLayout 侧边栏对管理员追加"管理后台"入口

### 🗄 迁移

- **v13**：login_codes 表重建（expires_at DATETIME→INTEGER，幂等）
- **v14**：orders 表 +1 字段 `current_stage_id`（R30d 流程状态机）

### 🔒 安全修复

- **P1-A**：队列重排返回值补焦点图签名（拖拽后不再 403）
- **P1-C**：inquiry 增项改为 toggle 显式勾选（不再无条件加入）
- **P2-B**：定价器 addon_tiers 查询加 WHERE 过滤（消除全表扫描）
- **S-10**：交付文件前端白名单对齐后端 23 种
- **CVE**：Dockerfile 构建阶段升级 npm 工具链（消除 tar/brace-expansion 等已知漏洞）
- **P1-5 关闭**：Caddyfile 删泛域名预留，统一路径访问（C48 方案 B）

### 🚫 关闭（不做）

- **R37 SRI/CSRF**：CSRF 已有 SameSite=Lax（auth.routes.js:88），SRI 不适用（自托管无 CDN）

### 📊 测试

- 151 → 165（+14），7 文件全部通过

---

## v0.12 — 2026-07-30

### ✨ 功能

- **R15 外链列表**：画师自定义链接（最多 6 条，8 种图标），替代写死的微博/B站字段。旧列冻结只读，后端回退兼容老画师
- **R18 订单图库**：参考图区块升级为图库（拖拽/点击/Ctrl+V 上传），来源角标（客户/画师），点击图片设焦点，合计上限 20 张，客户查询页只返回客户图
- **R19 备注附图**：订单备注支持可选附 1 张图（notes/{artistId}/ 目录，签名 URL），备注流缩略图 + 大图查看
- **R21 侧边栏折叠**：画师端侧边栏手动折叠/窄屏自动/移动端抽屉/localStorage 记忆

### 🗄 迁移 v12

- `artists` 表 +1 字段：`custom_links`（TEXT，JSON 数组）
- `order_references` 表 +1 字段：`source`（TEXT DEFAULT 'client'）
- `order_notes` 表 +1 字段：`image_path`（TEXT）

### 🔒 安全修复

- **P0-3 转让防爆破**：POST /api/admin/transfer 增加 IP 维度限流 + JSON Schema 校验
- **P0-4 时间格式**：login_codes.expires_at 列类型 DATETIME→INTEGER（与代码一致）
- **P0-5 嵌入脚本**：CSP frame-ancestors 从 * 收紧为 'self' + 完整指令集，页面标注未开放

### 🐛 修复

- **UI-3**：订单列表焦点图签名未执行（result.orders→result.items 键名修正）

### 📊 测试

- 118 → 145（+27），7 文件全部通过

---

## v0.11 — 2026-07-29

### ✨ 功能

- **R1 流程展示整合**：流程展示整合至价格板块，新增修改次数告示（`revision_note`）
- **R2 报价快照与最终价格**：报价快照字符串（`quote_snapshot`）+ 最终价格手动设置（`final_price_cents`）+ 改价自动备注
- **R3 快速录单补全**：参考图上传、价格计算器联动、QQ 通知开关
- **R4 订单焦点图**：三态开关（off / small / large），排期看板显示焦点图
- **R5 全平台粘贴上传**：`usePasteUpload` composable，3 处接入
- **R6 新主页模板 atelier**：第 4 个主页模板「画册工作室」，思源宋体/黑体，纸感暖调
- **R7 每日一句交互优化**：改为整块点击换一句（删除独立按钮）
- **R8 仪表盘默认板块自定义**（后端就绪）：跳转式默认板块，后端存储字段已加（迁移 v11），前端尚未实现
- **R9 主页设置清理**：移除重复的「流程与比例」tab

### 🗄 迁移 v11

- `orders` 表 +4 字段：`quote_snapshot` / `final_price_cents` / `focus_image_path` / `focus_image_mode`
- `artists` 表 +2 字段：`dashboard_default_panel` / `revision_note`

### 🔒 安全修复

**P0 批次：**
- C-1 签名编码绕过修复
- C-2 `setErrorHandler` 位置修正
- C-3 references 零校验修复
- H-2 `authApi.logout` 修复
- M-1 avatar 路径校验

**P1 批次：**
- H-1 画师端签名 URL 修复
- H-3 admin artworks camelCase 修复
- H-4 `createTier` 兼容修复
- H-5 画师存在性校验
- H-6 问候语归属校验
- M-2 bio diff 快照
- M-3 seed 工作流修复
- M-4 `admin_qq` REPLACE 修复
- M-5 `.env.example` 补充 `COOKIE_SECRET`
- M-6 file-sign fail-fast

**P0 止血：**
- P0-3 转让防爆破计数回滚
- P0-4 登录码清理时间格式统一
- P0-5 嵌入脚本白屏修复（i18n + API payload）

**基础设施：**
- `@fastify/static` 8→10 升级 + `setHeaders` API 适配
- `TRUST_PROXY` 收紧为 Docker 内网段
- ports 3000 默认开放（开发环境）

### 🧪 测试

- 103 → 118 用例

---

## v0.10.1 — 2026-07-28

### 🧹 ESLint 全量清零（合并 fix/eslint 分支）

- 合并社区贡献的 `fix/eslint` 分支，修复全部 ESLint 错误与警告
- **双端 `npx eslint .` 均为 0 errors, 0 warnings**
- 冲突解决：3 个旧模板文件已在 v0.10.0 重命名重写，删除分支过时修改；OrderForm 保留价格计算器的 `@change` + 循环变量重命名
- 主要修复类型：
  - `vite.config.js` 改用 ESM 标准 `__dirname` 写法
  - 循环变量遮蔽（`t`→`tier`、`ref`→`reference`）
  - 未使用导入/参数清理（双端 + 测试文件）
  - Vue 选项顺序规范（`mounted` 前移）
  - `v-html` 逐行 `eslint-disable`（内容均经 `sanitizeHtml()`/DOMPurify 消毒，精确抑制优于全局关闭）

### ⚠️ 遗留事项（非本次范围）

- GitHub Actions 的 `actions/checkout@v4`/`setup-node@v4` Node 20 弃用警告（可升级 `@v5`）
- `vue-i18n@9` 已停止维护，建议评估迁移 v11

---

## v0.10.0 — 2026-07-28

### 🎨 模板系统重构：布局 × 配色

- **核心模型变更**：模板从「3 个独立页面」重构为「布局 × 配色」两个正交维度
  - **布局**（3 种，结构真正不同）：`classic` 经典工作室 / `gallery` 美术馆画廊 / `folio` 单页落地页
  - **配色**（4 种，每种亮暗两套）：`paper` 纸 / `ink` 墨 / `dusk` 暮 / `moss` 苔
  - 3 × 4 = 12 种主页风格；主色（五色系统）独立于配色，由访客控制
- **旧值映射兼容**：`default→classic`、`dark-gallery→gallery`、`single-page→folio`，老数据不炸

### 🏗 分层架构（防 Bug 核心）

- **数据适配层** `composables/useArtistData.js`：模板不直接碰 props 字段名，统一 `imgUrl()` / `statusText()` / `socialLinks` / `heroArtwork`；后端改字段只改这一处
- **配色 composable** `composables/usePalette.js`：设置/清理 `html[data-palette]`，离开主页自动清理
- **滚动渐入** `composables/useScrollReveal.js`：IntersectionObserver + MutationObserver（兼容异步组件晚到的节点）
- **吸底 CTA** `composables/useStickyCta.js`：监听 Hero 哨兵，watch 元素就绪（兼容 defineAsyncComponent）
- **6 个共享组件** `components/templates/`：TplHero（3 variant）/ TplTierGrid（addons 插槽）/ TplGallery（3 layout）/ TplRules / TplStickyCta / TplStatusBadge

### 🌈 配色系统

- **迁移 v10**：`artists` 表新增 `palette_id TEXT DEFAULT 'paper'`
- **`styles/palettes.css`**：4 配色 × 亮暗 `--pal-*` 变量
- **`styles/templates.css`**：滚动渐入 keyframes + 排版工具类
- **后端**：`artist.service.js` 白名单 + 校验；`artist.routes.js` 公开主页返回 `paletteId`
- **Settings**：主页模板 Tab 新增配色选择器（4 色板，亮暗预览）

### 🔧 i18n 修复

- 修复 SinglePage/DarkGallery 模板硬编码英文（约 15 处）→ 全部走 `$t()`
- 修复 2 个不存在的键引用（`artistHome.about` / `startCommission`）
- 中英语言包对齐至 515 键

### 三个布局重设计

| 布局 | 开场 | 特征 |
|------|------|------|
| `classic` | 代表作横幅 + 名字叠画 | 桌面双栏，左栏吸顶信息卡 + 约稿按钮常驻 |
| `gallery` | 全屏画作 + 角落展签 | 大小交错 editorial 画廊，悬停放大，吸底约稿条 |
| `folio` | 左文右图分屏 | 滚动侦测导航高亮，移动端汉堡菜单，吸底约稿条 |

### 文件变更

- 新增：`web/src/composables/`（4 个）、`web/src/components/templates/`（6 个）、`web/src/styles/palettes.css`、`web/src/styles/templates.css`
- 重命名：`ArtistHomeDefault.vue→ArtistHomeClassic.vue`、`ArtistHomeDarkGallery.vue→ArtistHomeGallery.vue`、`ArtistHomeSinglePage.vue→ArtistHomeFolio.vue`
- 修改：`ArtistHome.vue`（配色 + 注册表映射）、`Settings.vue`（配色选择器）、`main.js`（引入新 CSS）、`init.js`（迁移 v10）、`artist.service.js` / `artist.routes.js`（paletteId）

### 验证

- 后端测试：103/103 通过 | 前端构建：通过
- ad-hoc：i18n 对齐 515=515、13 新键完整、模板无硬编码英文、9/9 运行时检查通过（迁移 v10 + paletteId API + 3 模板 chunk + palettes.css 打包）

---

## v0.9.0 — 2026-07-28

### 🎨 主页模板系统
- **模板注册表**：`ArtistHome.vue` 改为模板路由，根据 `template_id` 动态懒加载对应组件
- **3 套模板**：经典（`ArtistHomeDefault.vue`）/ 深色画廊（`ArtistHomeDarkGallery.vue`）/ 单页SaaS（`ArtistHomeSinglePage.vue`）
- **迁移 v8**：`artists` 表新增 `template_id TEXT DEFAULT 'default'` + `custom_page_path TEXT` 字段
- **画师后台**：Settings 页新增「主页模板」Tab，可预览模板并一键切换
- **i18n**：新增 `templates` 命名空间（zh-CN + en，各 10 条键）

### 🔌 嵌入脚本（绕过平台，画师用自己的站）
- **`web/public/embed.js`**：~~2KB 原生 JS 嵌入脚本，画师在自己的网站上粘贴 `<script src data-artist>` 即可启用
- **`/embed.html`**：Vite 多入口构建，独立于主 SPA 的简约下单页（`EmbedOrderPage.vue`）
- **安全头适配**：`/embed` 路径使用 `CSP frame-ancestors *` 替代 `X-Frame-Options: DENY`，允许任意站点嵌入
- **Settings 集成**：Settings 页新增「嵌入脚本」Tab，一键复制代码 + 预览效果
- **i18n**：新增 `embed` 命名空间（zh-CN + en）

### 🔧 Bug 修复
- **静态文件服务重写**：`app.js` 从 `@fastify/static` wildcard 模式改为手动 `app.get('/*')` + `createReadStream`，修复 wildcard:false 导致所有 JS/CSS 返回 index.html 的白屏问题
- **画师主页模板白屏**：`ArtistHome.vue` 的 `shallowRef` 手写懒加载返回 ref 对象而非组件，`<component :is>` 无法解包 → 改为 Vue 官方 `defineAsyncComponent()`（25 行→8 行）
- **端口冲突**：本地 node 进程占用 3000 端口时 Docker 映射被静默跳过，需先杀进程再启动容器

### 新增文件
- `web/src/views/client/templates/ArtistHomeDefault.vue` — 经典模板（从原 ArtistHome.vue 提取）
- `web/src/views/client/templates/ArtistHomeDarkGallery.vue` — 深色画廊模板
- `web/src/views/client/templates/ArtistHomeSinglePage.vue` — 单页SaaS模板
- `web/public/embed.js` — 嵌入脚本（画师粘贴到自己的网站）
- `web/embed.html` — 嵌入页 Vite 入口
- `web/src/embed/main.js` — 嵌入页 Vue 入口
- `web/src/embed/EmbedOrderPage.vue` — 嵌入页下单组件

## v0.8.0 — 2026-07-28

### 🎨 五色主题系统
- **ThemePicker 组件**：底色三选（跟随系统/亮色/暗色）+ 主色五选（#34dbcb ~ #3445db），替换旧版 ThemeToggle
- **theme.css**：语义 CSS 变量 + `data-accent="1~5"` 属性选择器 + Element Plus 覆写
- **霞鹜文楷字体**：woff2 分包加载（`web/src/assets/fonts/wencai/`），全局应用
- **Pinia theme store**：`base(auto/light/dark)` + `accent(1-5)` + `matchMedia` 系统偏好检测 + localStorage 持久化

### 💬 问候系统
- **greeting_templates 表**（迁移 v6）：`artist_id` NULL=通用库，非 NULL=画师专属库
- **greeting.service.js**：按时段（morning/afternoon/evening/night/any）加权随机抽取，`{name}` 占位符替换
- **画师后台**：`GET /api/artist/greeting` 抽取问候语
- **管理员后台**：通用库 CRUD（`/api/admin/greetings`）+ 画师专属库 CRUD（`/api/admin/artists/:id/greetings`）
- **GreetingTable.vue**：通用/专属复用的问候语表格组件
- **GreetingManage.vue**：管理员问候语管理页

### 📐 流程与比例
- **artist_workflow_stages 表**（迁移 v5）：单表设计，`takes_payment` + `basis_points`（基点，10000=100%）
- **default_workflow_template 表**（迁移 v5）：管理员可编辑的出厂模板，新画师自动复制
- **order_payment_installments 表**（迁移 v5）：订单分期收款记录（预留）
- **workflow.service.js**：4 条不变式（I1 至少1个收款节点 / I2 尾款自动计算 / I3 最低5% / I4 最多20期），每次写入事务内强制校验
- **画师后台 API**：`/api/artist/workflow` CRUD + reorder + payment
- **客户端 API**：`GET /api/artists/:subdomain/workflow` 流程预览
- **管理员 API**：`/api/admin/default-workflow` 模板管理 + `/api/admin/artists/:id/workflow` 画师流程代理
- **WorkflowPaymentEditor.vue**：流程节点编辑 + Q弹拖拽比例条
- **PaymentBar.vue**：比例条可视化（拖拽调节，尾款自动计算）
- **StageListView.vue**：流程节点列表（vuedraggable 拖拽排序）
- **WorkflowOverviewStrip.vue**：流程预览条（客户端主页/下单页 + 后台复用）
- **DefaultWorkflowEditor.vue**：管理员默认流程模板编辑页

### 👤 管理员画师详情抽屉
- **ArtistDetailDrawer.vue**：6 Tab 抽屉（资料/档位/作品/须知/流程/问候语），管理员无需切换页面即可编辑任意画师的全部设置
- **管理员代理路由**：`/api/admin/artists/:id/profile|tiers|artworks|rules|orders|status`，复用 `artist.service.js` 业务逻辑
- **ArtistManage.vue**：画师列表行点击打开详情抽屉

### 🖥 客户页流程展示
- **ArtistHome.vue**：主页新增流程预览条（WorkflowOverviewStrip）
- **OrderForm.vue**：下单页展示流程 + 收款计划预览

### 🗄 数据库迁移
- **v5**（workflow_stages_and_default_template）：创建 `artist_workflow_stages` + `default_workflow_template` + `order_payment_installments` 三表，种子默认模板（7节点），存量画师自动补种子
- **v6**（greeting_templates）：创建 `greeting_templates` 表，种子 8 条通用问候语
- **v7**（add_deleted_at_column）：`artists` 表新增 `deleted_at` 列（软删除）

### 新增文件
- `server/src/features/artist/workflow.service.js` — 流程与比例服务（不变式校验 + 默认模板）
- `web/src/components/admin/GreetingTable.vue` — 问候语表格组件
- `web/src/components/artist/WorkflowPaymentEditor.vue` — 流程节点编辑器
- `web/src/components/artist/PaymentBar.vue` — Q弹比例条
- `web/src/components/artist/StageListView.vue` — 流程节点列表
- `web/src/components/shared/WorkflowOverviewStrip.vue` — 流程预览条
- `web/src/views/admin/ArtistDetailDrawer.vue` — 画师详情抽屉（6 Tab）
- `web/src/views/admin/DefaultWorkflowEditor.vue` — 默认流程模板编辑
- `server/tests/workflow.service.test.js` — 流程服务测试（19 个用例）

### 变更统计
- 测试：63/63 通过 | 构建：vite build 成功

### 🔧 Bug 修复（16 项）
- **P0-1**：`WorkflowPaymentEditor.vue` 缺少 `computed` import → 流程编辑器白屏
- **P1-1**：模板更新允许 bp=0 收款节点 → 加 MIN_BP 校验
- **P1-2**：admin profile 路由无 schema → 字段白名单（additionalProperties: false）
- **P1-3**：tiers/artworks 路由无 schema → 加 body 校验
- **P1-4**：资源操作不校验归属 → 加 ownership check（tiers/artworks）
- **P1-5**：管理员自举不创建 workflow stages → 补种子
- **P1-6**：迁移无事务保护 → `database.transaction()` 包装
- **P1-7**：template 模式 isFinal 始终 false → 前端计算最后收款节点
- **P1-8**：savePayment 失败不阻断后续操作 → 返回 bool + 调用方检查
- **P1-9**：updateStage 事务外取 stage → 移入事务内（TOCTOU）
- **P2-1~7**：SNAP=100、弹回 Math.max 保护、输入无效值提示、模板只读 UI、import 合并、变量遮蔽、params schema integer

### 🛠 交互修缮（4 项）
- **500→400**：workflow.service.js 所有业务错误改用 `BizError`（statusCode=400），Fastify 正确返回中文提示
- **右拖吞并**：PaymentBar 支持向右拖拽吞并节点（关闭收款），尾款不可被吞并，隐含尾款保护
- **尾款视觉**：去掉灰色斜纹 + 🔒 锁图标，改为纯色金底 + 小字"尾款"徽章
- **恢复默认**：新增 `POST /api/artist/workflow/reset` + 画师端"恢复默认模板"按钮（ElMessageBox 确认）

### ✨ UI 打磨（3 项）
- **使用说明弹窗**：流程节点标题旁"使用说明"按钮，7 条结构化说明（$tm 数组渲染）
- **开关对齐**：StageListView 收款区固定 110px + 操作区固定 64px，比例徽章始终占位
- **节点说明可编辑**：灰色说明文字可点击编辑，回车/失焦保存（updateStage description）

### 🏗️ 工程化（v0.8.0 后期）
- **ESLint + Prettier**：server/web 双端 flat config，CI 集成 lint 检查
- **GitHub Actions CI**：server（npm ci + eslint + test）+ web（npm ci + eslint + build）
- **错误码化**：`AppError` 类 + `E` 常量枚举（~50 个错误码），后端所有 `throw new Error` 转换，前端 i18n 翻译层
- **路由层测试**：新增 `routes.test.js`（11 个用例），覆盖鉴权 401/越权 403/限流 429/业务错误码
- **测试总数**：74/74 通过（原 63 + 新增 11）
- **httpOnly Cookie 认证**：token 从 localStorage 迁移到 httpOnly cookie（`@fastify/cookie`），JS 不可读，防 XSS 窃取；前端 `withCredentials: true`，路由守卫改用非敏感 `artist_logged_in` 标记

---

## v0.7.1 — 2026-07-28

### 🔒 第二轮审计修复（23 项全量关闭）

**P0 安全止血（8 项）：**
- **签名 URL**：`/uploads/` 不再全公开，新增 `file-sign.js` HMAC 签名 + 15 分钟有效期，仅 `images/` 保留公开
- **软删除 token 失效**：`requireAuth`/`requireAdmin` 检查 `deleted_at`，已停用画师立即拒绝
- **token_version 激活**：`deleteArtist` 递增 `token_version`，管理员可强制吊销全部会话
- **索引修复**：`idx_artists_code` 改为 DROP+CREATE UNIQUE，老库升级不再静默跳过
- **tierId 归属校验**：`createOrder` 查档位加 `AND artist_id = ?`
- **filePath 前缀校验**：交付/参考图路径必须匹配 `deliverables/{artistId}/` 或 `references/`，拒绝 `..`
- **artworks Schema**：`POST /api/artist/artworks` 增加 JSON Schema（imagePath 必填 + 前缀校验）
- **错误处理器**：500 级别不再透传 `error.message`，改为固定文案 + 服务端日志

**P1 功能正确性（11 项）：**
- **订单号前缀碰撞**：`generateOrderNo` 改为按 `LIKE '${code}-%'` 查最大序号
- **pageSize 下界**：`Math.max(1, ...)` 封住负数（order + admin 两处）
- **401 路由名**：拦截器 `router.push({ name: 'ArtistLogin' })`，抽常量 `ROUTE_LOGIN`
- **TZ 时区**：docker-compose 加 `TZ=Asia/Shanghai`，vitest 固定 UTC
- **子域名 Phase 2 标注**：Caddyfile/README/开发自参考/维护说明书四处统一为路径访问 + Phase 2 规划
- **Dashboard 状态回滚**：影子变量 `lastKnownStatus` 记录上次成功值
- **图片预览 initial-index**：4 处 `el-image` 补 `:initial-index="idx"`
- **timingSafeEqual 统一**：`verifySession` 改用 `crypto.timingSafeEqual`
- **deliverOrder 状态前置**：仅 `wip/revision/done` 允许上传交付文件
- **updateOrderStatus 事务**：`db.transaction()` 包裹状态+completed_at+compactQueue
- **Settings 空值保护**：`artist_code` 空串跳过校验，`name` 增加非空校验

**P2 工程化（8 项）：**
- **用户枚举防护**：send-code 统一返回"若已注册则已发送"，verify 未注册返回 401 无区分信息
- **GC 内联**：`gcUploads` 改为 import 函数主进程内执行，启动时立即跑一次
- **进程退出加固**：`uncaughtException` 先 `db.close()` 再退出（500ms 超时 unref）
- **优雅停机超时**：`Promise.race([app.close(), timeout(10s)])`
- **CORS 注释修正**：`.env.example` 注释与实现对齐
- **禁止缩放移除**：`index.html` 删除 `maximum-scale=1.0, user-scalable=no`
- **安全响应头**：`X-Content-Type-Options`/`X-Frame-Options`/`X-XSS-Protection`/`HSTS`
- **SEO meta**：`index.html` 补 description + og:title

**技术债（6 项）：**
- **preHandler 抽取**：6 处重复归属校验 → `requireOwnOrder` 公共 preHandler
- **死代码清理**：删除 `STATUS_STEP`、`isValidQq` 未用导入、`allowScripts` 字段
- **补索引**：`idx_artists_qq ON artists(qq_number)`
- **errorHandler + accept 白名单 + 分页 UI**：全局错误兜底、OrderDetail accept 扩展、OrderList 分页组件
- **审计注释清理**：57 处 `(P0|P1|P2|S|TC)-\d+` 注释替换为领域描述（安全/可靠性/输入校验等）
- **`.gitignore` 创建**：排除 node_modules/dist/uploads/.env/*.db/.hermes/

### 新增文件
- `server/src/shared/file-sign.js` — HMAC 签名 URL 工具
- `server/src/features/artist/greeting.service.js` — 问候语抽取 + CRUD
- `web/src/components/ThemePicker.vue` — 主题选择器（底色三选 + 主色五选）
- `web/src/styles/theme.css` — 语义变量 + 5 色 data-accent + EP 覆写
- `web/src/assets/fonts/wencai/` — 霞鹜文楷 woff2 分包
- `web/src/assets/logo.webp` — 平台 Logo
- `web/src/views/admin/GreetingManage.vue` — 管理员问候语管理
- `web/src/constants/order.js` — 订单状态/优先级常量
- `.gitignore` — 版本控制排除规则

### 变更统计
- 53 个文件，+2663 / -334 行
- 测试：44/44 通过 | ad-hoc：36/36 通过 | 构建：vite build 成功

---

## v0.7.0 — 2026-07-27

### 🔒 第三次审计修复（P1×9 + P2×14 + P3×40+）

**P1 高优（9 项）：**
- **trustProxy 可配置**：支持 `TRUST_PROXY` 环境变量，默认信任 Docker 内网段
- **上传 MIME 安全**：移除 `.svg`，增加 MIME 黑名单（SVG/HTML/JS/ZIP 炸弹）
- **队列重排校验**：`reorderQueue` 增加重复/缺失 ID 校验
- **价格档位 Schema**：POST/PUT tiers 增加 JSON Schema 校验
- **画师创建校验**：QQ 格式、subdomain 截断、保留词黑名单
- **CORS 收紧**：生产环境仅 `CORS_ORIGIN` 设置时注册
- **Token 版本失效**：`token_version` 列 + JWT payload 比对，管理员可强制 token 失效
- **401 全面清理**：清除所有 localStorage key + 重置 Pinia store + 跳转登录
- **`/api/auth/me` 增强**：返回 `isAdmin` 标记

**P2 中优（14 项）：**
- **icons-vue 依赖**：加入 `package.json` dependencies
- **参考图删除精确匹配**：uid→filePath Map
- **状态机 UI 一致**：QueueBoard 交付按钮 `v-if="done"`；OrderDetail 修改按钮仅 `wip`
- **月收入时区修正**：本地时区月初 UTC 时间戳
- **迁移 v4**：`token_version` 列 + schema 同步
- **seed 修复**：先调 `initDatabase()`，不再重复创建 admin
- **entrypoint 精简**：移除手动 `init.js` 调用
- **busy_timeout**：SQLite 加 `busy_timeout = 5000`
- **孤儿文件回收**：app.js 内 setInterval 每 24h 自动清理
- **画师软删除**：`deleted_at` 字段，公开查询自动过滤
- **登录码清理**：每小时定时清理过期码
- **限流桶上限**：`MAX_BUCKETS = 100_000` 防内存膨胀
- **订单分页**：service 层 LIMIT/OFFSET + 路由传参 + 前端适配
- **分页回归修复**：OrderList.vue / ArtistManage.vue 适配 `{items}` 格式

**P3 低优（40+ 项）：**

*安全：*
- `window.open` 全部加 `noopener`（3 处）
- `target="_blank"` 链接补 `rel="noopener noreferrer"`（LandingPage 2 处）
- 服务端 `clamp()` 统一 `.trim()` 防空白注入

*无障碍：*
- 6 处 `el-image` 补 `:alt` 属性
- LandingPage 画师卡片加 `tabindex`/`role="button"`/`@keyup.enter`
- ThemeToggle 按钮补 `aria-label`
- Logo emoji 加 `aria-hidden="true"`
- 拖拽手柄加 `title` + `aria-hidden`
- 上传按钮加 `aria-label`
- ArtworkManage 删除按钮加 `:focus-within` 可见性

*功能缺陷：*
- 上传静默失败 → catch 后 re-throw，el-upload 正确标记错误
- 状态更新失败 → 回滚 `currentStatus`
- AdminDashboard 加 `v-loading` + `loading` ref

*i18n：*
- OrderDetail 3 处硬编码中文 → `$t()` 调用
- 补全 zh-CN/en 共 8 个新键

*代码质量：*
- 魔法数字提取为命名常量（`CODE_MIN/MAX`、`CODE_TTL_MS`、`MAX_ATTEMPTS`、`SESSION_TTL_MS`、`SEQ_PAD_THRESHOLD`、`API_TIMEOUT_MS`）
- 前端 4 个表单组件提交前 `.trim()`
- 硬编码颜色 → CSS 变量（`--overlay-bg`、`--el-color-white`）

### 变更统计
- 41 个文件，~350 行新增 / ~80 行删除
- 测试：44/44 通过 | 构建：vite build 成功

---

## v0.6.3 — 2026-07-27

### 🔒 第二次审计修复（补充报告全部 27 项）

**🔥 致命回归（1 项）：**
- **N0-1 收入统计**：回滚 `localtime` 修复 → 改用 `completed_at` + `price_snapshot`（新增列+迁移v3）

**🟠 严重问题（3 项）：**
- **N1-1 跨优先级拖拽**：`getArtistQueue` 去掉优先级排序，拖拽即绝对顺序（方案A）
- **N1-2 transfer 爆破**：加 `rateLimit('transfer:'+newQq)`，隐藏原始错误，先验画师再验码
- **R0-1 参考图被吞**：schema 补 `references` 字段，`createOrder` 事务内落库

**🚑 必修修复（5 项）：**
- **R0-2 部署配置**：`docker-compose.yml` NODE_ENV→production, AUTH_DEV_MODE→false
- **R1-1 测试损坏**：TC-O-07 适配新 `reorderQueue` 语义
- **R1-2 timingSafeEqual**：加 6位数字长度守卫+try/catch，auth/verify 加 schema
- **R1-3 管理员自举**：UNIQUE 冲突退让（fallback subdomain）+ try/catch
- **R1-4 transfer 事务化**：`db.transaction()` 包裹

**📋 中等改进（6 项）：**
- **R2-1** `.env.example` 创建，SESSION_SECRET 留空
- **R2-3** `datetime.js` 改用 `undefined` locale（跟随浏览器）
- **R2-5** `deliverOrder` 返回 `statusChanged`
- **R2-6** schema 补全（auth/send-code）
- **R2-7** 交付文件白名单（22 种）+ nosniff + Content-Disposition
- **P0-3** trustProxy 收紧（仅 127.0.0.1，可配置 TRUST_PROXY）

**🧹 技术债：**
- 版本号统一为 0.6.3（server + web package.json）
- N2-1/N2-2 文案同步/时区标注

### 变更统计
- 15 个文件，~120 行新增 / ~30 行删除

---

## v0.6.2 — 2026-07-27

### 🔒 审计修复（32 项全部完成）

**P0 严重（6 项）：**
- **登录码时序攻击**：验证改用 `crypto.timingSafeEqual`（P0-4c）
- **存储型 XSS**：DOMPurify 替换自研消毒器（P0-2）
- **外链协议注入**：weibo_url/bilibili_url 增加 `https?://` 协议校验（P0-7）
- **SESSION_SECRET 静默回退**：未设置时启动报错（P0-1）
- **AUTH_DEV_MODE 显式开关**：不再依赖 NODE_ENV 判断是否返回 `_dev_code`（P0-5）
- **管理员自举**：`initDatabase()` 自动创建管理员账号（P0-6）

**P1 高优（11 项）：**
- **参考图关联订单**：上传时写入 `order_references` 表（P1-1）
- **拖拽排序重写**：前端发送完整 `orderedIds` 数组，后端按序分配 `queue_position`（P1-2）
- **交付事务化**：`addDeliverable()` 包装在 `db.transaction()` 中（P1-3）
- **上传 MIME 白名单**：扩展名 + MIME 双重校验（P1-4）
- **路由守卫 isAdmin**：前端管理员路由检查 `localStorage` 标记（P1-5）
- **CORS 收紧**：生产环境由 `CORS_ORIGIN` 控制（P1-6）
- **订单创建事务**：`createOrder()` 包装在 `db.transaction()` 中防竞态（P1-7）
- **JSON Schema 校验**：8 个写入路由增加 Fastify JSON Schema（P1-8）
- **端口 expose**：容器仅 `expose: ["3000"]`，不映射宿主机（P1-9）
- **Caddy DOMAIN**：补充环境变量配置（P1-10）
- **子域名文档**：更新为参数化路由说明（P1-11）

**P2 中优（13 项）：**
- **时区修复**：SQLite UTC 存储 + 前端 `datetime.js` 本地化显示（P2-1）
- **收入统计**：SQL 改用 `datetime('now','localtime')` 计算月初（P2-2）
- **SPA fallback**：限制仅 GET 请求返回 index.html（P2-3）
- **健康检查**：加 `.catch()` 防未捕获异常（P2-4）
- **版本化迁移**：新增 `schema_migrations` 表 + `MIGRATIONS` 数组（P2-5）
- **死配置清理**：`ADMIN_QQ` 不再 export，仅内部引导用（P2-6）
- **dotenv 全局加载**：`connection.js` 顶部 `import 'dotenv/config'`（P2-7）
- **clamp 映射修复**：`weibo_url`/`bilibili_url` key 改为 `'url'`（P2-8）
- **路由 parseInt**：6 个路由增加 `parseInt` + `isNaN` 校验（P2-9）
- **track QQ 校验**：`getClientQueuePosition`/`getOrderByNo` 增加 `isValidQq`（P2-10）
- **favicon**：新增 SVG favicon（P2-11）
- **交付前端检查**：50MB 限制 + 扩展名白名单 + `file-list` 绑定（P2-12/P2-13）

**P3 低优：**
- 死代码检查（无未使用导入）
- 文档同步更新（开发自参考 #25-#30、维护说明书安全章节、切换指南、画师说明书）

### 新增文件
- `web/src/utils/datetime.js` — 时区工具（formatDateTime / formatDateTimeShort）
- `web/public/favicon.svg` — SVG favicon

### 变更统计
- 32 个文件，+886 / -248 行

---

## v0.6.1 — 2026-07-26

### 🔧 部署修复（启动阻塞 + SPA 服务）

- **SQLite 迁移崩溃**：`ALTER TABLE ADD COLUMN ... UNIQUE` 不被 SQLite 支持 → 改为先加列再 `CREATE UNIQUE INDEX`
- **SPA 静态文件缺失**：`app.js` 未 serve `web/dist/` → 新增 `fastifyStatic(web/dist)` + `setNotFoundHandler` fallback 到 `index.html`
- **`/uploads/` 404 被 SPA fallback 截获**：fallback 排除 `/api/` 和 `/uploads/` 前缀
- **`getPlatformConfig` 空字符串变 null**：`||` → `??`（空字符串是合法配置值）
- **`platform_config` 默认值**：`initDatabase()` 中 `INSERT OR IGNORE` 确保 `admin_qq` 键存在

### 变更文件
- `server/src/app.js` — SPA 静态文件服务 + fallback
- `server/src/db/init.js` — 迁移修复 + 平台配置默认值
- `server/src/features/order/order.service.js` — `??` 修复

---

## v0.6.0 — 2026-07-26

### ⚠️ 已知问题

- **需重建容器才能生效**：v0.6.0 的代码改动（TrackOrder 新流程、Disclaimer 等）已提交，但运行中的 Docker 容器仍为旧版。部署时需执行 `docker compose up -d --build` 重建镜像并重启，否则页面仍显示旧版 UI。

### 🆕 新功能

- **平台职责声明**：新增 `Disclaimer.vue` 共享组件，在 LandingPage、ArtistHome、OrderForm 三个客户页面展示免责声明（"本平台仅协助验证身份与连接双方…不提供托管、仲裁服务"），中英文双语
- **订单查询流程重构**（TrackOrder.vue）：
  - QQ号 + 订单号双输入，订单号可留空（placeholder: "如果不记得请留空"）
  - 留空订单号 → 调用 `GET /api/orders/lookup` 检查该QQ是否有订单
  - 有订单 → 弹出联系引导弹窗，显示画师联系QQ + 管理员QQ（均可一键复制）
  - 无订单 → 弹出 **3秒不可关闭** 提示窗（倒计时结束前无法点击关闭/确认）
- **画师联系QQ配置化**：`artists` 表新增 `contact_qq` 列，画师可在设置页自定义客户可见的联系QQ（留空默认用登录QQ），解决画师换号/多号问题
- **平台配置表**：新增 `platform_config` 表（key-value），存储 `admin_qq` 等全局配置

### 📦 变更文件

**后端：**
- `server/src/db/init.js` — 新增 `platform_config` 表、`contact_qq` 列迁移
- `server/src/db/seed.js` — 种子数据含 `contact_qq`、`admin_qq` 配置
- `server/src/shared/validate.js` — 新增 `contactQq` 长度限制
- `server/src/features/artist/artist.service.js` — `updateArtist` 允许 `contact_qq`
- `server/src/features/artist/artist.routes.js` — 公开主页返回 `contactQq`
- `server/src/features/order/order.service.js` — 新增 `hasClientOrders()`、`getPlatformConfig()`
- `server/src/features/order/order.routes.js` — 新增 `GET /api/orders/lookup` 端点

**前端：**
- `web/src/components/Disclaimer.vue` — 新增免责声明组件
- `web/src/views/client/TrackOrder.vue` — 重写查询流程（双输入、联系引导、3秒锁定弹窗）
- `web/src/views/client/LandingPage.vue` — 加入 Disclaimer
- `web/src/views/client/ArtistHome.vue` — 加入 Disclaimer
- `web/src/views/client/OrderForm.vue` — 加入 Disclaimer
- `web/src/views/artist/Settings.vue` — 新增联系QQ编辑字段
- `web/src/api/index.js` — 新增 `orderApi.lookup()`
- `web/src/locales/zh-CN.js` / `en.js` — 新增 disclaimer/track/settings 键

---

## v0.5.0 — 2026-07-26

### 🔒 安全修复（5 严重 + 5 高优）

**严重（Critical）：**
- **存储型 XSS**：新增 `web/src/utils/sanitize.js` HTML 消毒工具（白名单标签+属性），ArtistHome/RulesEditor 的 `v-html` 全部替换为 `sanitizeHtml()` 过滤
- **水平越权**：画师后台所有订单/档位/作品操作增加 `artist_id` 归属校验（`requireAuth` 中间件注入 `req.artist`，service 层校验所有权）
- **订单号碰撞**：订单号改为 `{身份码}-{序号}` 格式（如 `ALICE-001`），序号从该画师最后一条订单推导，`order_no` 列加 UNIQUE 约束
- **任意文件上传**：`upload.routes.js` 增加 MIME 白名单（jpg/png/webp/gif/pdf/psd/ai/zip/rar），非白名单返回 403
- **订单号可猜测**：客户查询进度改为 **QQ号+订单号双验证**（`getClientQueuePosition` 比对 `client_qq`），防止枚举

**高优（High）：**
- **速率限制**：新增 `shared/middleware/rate-limit.js` 内存桶限流器，覆盖登录码发送(5次/分)、验证(5次/分)、公开下单(10次/分)、订单查询(10次/分)
- **SESSION_SECRET 回退移除**：生产环境未设置 `SESSION_SECRET` 时启动报错（不再静默使用 `Date.now()`）
- **管理员 QQ 固定**：`ADMIN_QQ` 默认 `10000`，开发模式登录码输出到控制台（`🔑 [DEV]` 前缀）
- **订单状态机**：严格状态转换（pending→confirmed→wip→revision→done→delivered/cancelled），禁止跳跃
- **CORS 收紧**：生产环境默认禁止跨域（`CORS_ORIGIN` 环境变量控制）

### 🆕 新功能

- **画师身份码（artist_code）**：订单号前缀改为画师身份码（如 `ALICE-001`），可自定义（2-10位大写字母/数字），系统自动生成默认值（子域名大写），唯一性约束
- **动态位数**：订单序号 >999 时自动扩展位数（`ALICE-1000`），不再补零
- **"不知道订单号"按钮**：TrackOrder 页面新增按钮，客户可凭 QQ 号查询在该画师处的所有订单（`getClientOrdersByQq`）
- **数据库增量迁移**：`init.js` 使用 `PRAGMA table_info` 检测缺失列，自动添加 `artist_code` 列并回填 `UPPER(subdomain)`
- **前端 HTML 消毒工具**：`web/src/utils/sanitize.js`，白名单标签（h1-h3/p/ul/ol/li/strong/em/br/a/img/blockquote）+ 属性过滤（href/src/alt/title），剥离 script/事件/危险属性

### 🐛 Bug 修复

- **TierManage 字段名不一致**：前端统一使用 camelCase（`workDays`/`exampleImage`），后端 `updateTier()` 同时接受 camelCase 和 snake_case
- **OrderDetail 交付弹窗**：打开弹窗时重置文件选择（`openDeliverDialog()`），防止残留文件
- **getClientOrdersByQq 排序**：`ORDER BY id DESC` 替代 `created_at DESC`（同毫秒创建时排序不可靠）

### 📦 变更文件

**后端新增/重写：**
- `server/src/shared/middleware/rate-limit.js` — 内存桶速率限制器
- `server/src/shared/validate.js` — 增加 `isValidArtistCode`、`LLM_PROMPT_MAX`、trim/escape
- `server/src/db/init.js` — `artists` 表新增 `artist_code` 列、UNIQUE 约束、增量迁移
- `server/src/db/seed.js` — 管理员 QQ=10000、画师含 artist_code
- `server/src/features/order/order.service.js` — 订单号生成（身份码+末单推导）、QQ 双验证、状态机
- `server/src/features/artist/artist.service.js` — 身份码自动生成/唯一性、归属校验、camelCase 兼容
- `server/src/features/auth/auth.service.js` — 开发模式控制台输出登录码、5次尝试锁定、HMAC 会话
- `server/src/features/auth/auth.routes.js` — 速率限制集成
- `server/src/features/artist/artist.routes.js` — 归属校验、身份码字段
- `server/src/features/order/order.routes.js` — QQ+订单号双验证、速率限制
- `server/src/features/upload/upload.routes.js` — MIME 白名单、403 拒绝
- `server/src/features/admin/admin.routes.js` — 删除画师清理文件
- `server/src/app.js` — 全局速率限制器、CORS、NODE_ENV
- `server/src/shared/middleware/auth.js` — 注入 `req.artist` 完整对象

**前端新增/修改：**
- `web/src/utils/sanitize.js` — HTML 消毒工具（新增）
- `web/src/views/client/TrackOrder.vue` — QQ+订单号双输入、"不知道订单号"按钮
- `web/src/views/client/DeliveryPage.vue` — 路径改为 `/artist/:subdomain/delivery/:orderNo`
- `web/src/views/client/ArtistHome.vue` — v-html → sanitizeHtml()
- `web/src/views/client/OrderForm.vue` — 字段对齐
- `web/src/views/artist/RulesEditor.vue` — v-html → sanitizeHtml()
- `web/src/views/artist/Settings.vue` — 新增身份码编辑字段
- `web/src/views/artist/TierManage.vue` — 字段名统一 camelCase
- `web/src/views/artist/OrderDetail.vue` — 交付弹窗重置
- `web/src/views/admin/ArtistManage.vue` — 新增身份码字段
- `web/src/api/index.js` — 新增 `getClientOrdersByQq` API
- `web/src/locales/zh-CN.js` / `en.js` — 新增 track/settings/admin 键
- `web/src/router/index.js` — delivery 路径参数化

**部署/测试：**
- `docker-compose.yml` — `NODE_ENV=production`
- `server/tests/*` — 全部更新，42 个用例通过

---

## v0.4.1 — 2026-07-26

### 修复：路由 + API 调用全面修正
- **路由表重构**：`/home` → `/artist/:subdomain`、`/order` → `/artist/:subdomain/order`、`/track` → `/artist/:subdomain/track`（修复"画师不存在"错误）
- **ArtistHome.vue**：`artistApi.getArtistBySubdomain()` → `artistPublicApi.getProfile(subdomain)`（一次请求返回 profile+tiers+artworks+rules）
- **LandingPage.vue**：`artistApi.getArtists()` → `artistPublicApi.getAll()`；script 中 `$t()` → `t()`；字段 `weibo_url` → `weiboUrl`
- **OrderForm.vue**：`artistApi.createOrder()` → `orderApi.create()`；字段对齐后端（`subdomain`、`agreeRules`、`clientNotify`、`orderNo`）
- **TrackOrder.vue**：`artistApi.trackOrder()` → `orderApi.track(orderNo)`；字段 snake_case → camelCase（`orderNo`、`artistName`、`tierName`、`position`、`total`、`createdAt`、`fileName`、`url`）
- **DeliveryPage.vue**：`artistApi.trackOrder()` → `orderApi.delivery(orderNo)`；同上字段映射修正
- **Login.vue**：`artistApi.requestLoginCode()` → `authApi.sendCode()`；`res.devCode` → `res._dev_code`（匹配后端实际返回字段）
- **ThemeToggle.vue**：重写为极简按钮（去掉 el-dropdown/el-tooltip），修复侧边栏 scrollbar 溢出

### 变更文件
- `web/src/router/index.js`：路由路径参数化
- `web/src/views/client/ArtistHome.vue`
- `web/src/views/client/LandingPage.vue`
- `web/src/views/client/OrderForm.vue`
- `web/src/views/client/TrackOrder.vue`
- `web/src/views/client/DeliveryPage.vue`
- `web/src/views/artist/Login.vue`
- `web/src/components/ThemeToggle.vue`

---

## v0.4.0 — 2026-07-26

### 新增：多语言支持（i18n）
- **vue-i18n@9** 集成，支持 **简体中文（zh-CN）** 和 **English（en）**
- 全部 19 个 Vue 视图 + 2 个组件的硬编码文本替换为 `$t()` 调用
- 语言包：`web/src/locales/zh-CN.js`（~150 条）、`web/src/locales/en.js`
- 自动检测浏览器语言，手动切换持久化至 `localStorage`（key: `huiyue-locale`）
- Element Plus 组件库 locale 随应用语言动态切换（`ElConfigProvider`）
- 日期格式化跟随当前语言（`zh-CN` / `en-US`）

### 新增：亮暗主题切换
- **CSS 变量体系**：`:root` 定义 8 个语义变量（`--bg-page`、`--bg-card`、`--text-primary` 等），`html.dark` 覆盖暗色值
- **Element Plus 暗色**：引入 `element-plus/theme-chalk/dark/css-vars.css`，`html.dark` 类名自动激活
- **Pinia store**（`stores/theme.js`）：检测系统偏好 → 持久化至 `localStorage`（key: `huiyue-theme`）→ `watch` 自动应用
- **ThemeToggle 组件**：🌙/☀️ 切换 + 🌐 语言下拉，嵌入 ArtistLayout 侧边栏、LandingPage、ArtistHome、Login 四处
- 所有 scoped 样式中的硬编码颜色替换为 CSS 变量（`#999` → `var(--text-secondary)` 等）

### 新增文件
| 文件 | 说明 |
|------|------|
| `web/src/i18n/index.js` | i18n 实例 + `setLocale()` |
| `web/src/locales/zh-CN.js` | 中文语言包 |
| `web/src/locales/en.js` | 英文语言包 |
| `web/src/stores/theme.js` | 主题 Pinia store |
| `web/src/components/ThemeToggle.vue` | 主题/语言切换组件 |

### 变更文件
- `web/src/main.js`：集成 i18n + Element Plus dark CSS
- `web/src/App.vue`：`ElConfigProvider` 动态 locale + 全局 CSS 变量
- 全部 19 个 `.vue` 视图文件：`$t()` 替换 + CSS 变量适配
- `web/package.json`：新增 `vue-i18n@^9` 依赖

---

## v0.3.0 — 2026-07-26

### 规范化：消除技术债
- **新增 `GET /api/artists`**：画师列表公开端点（LandingPage 之前 404）
- **消除所有裸 SQL**：`order.routes.js` 三处、`admin.routes.js` 一处裸 SQL 全部迁入 service 层
  - 新增 `order.service.js`：`getArtistOrders()` / `getArtistStats()` / `addDeliverable()`
  - 新增 `admin.service.js`：`getGlobalStats()`
- **`upload.routes.js`**：`saveUpload()` 改为接收 `uploadDir` 参数（不再依赖模块级变量）；`UPLOAD_DIR` 由 `app.js` 通过插件选项统一传入
- **`app.js`**：路径解析改为基于 `__dirname`（不依赖 CWD），`entrypoint.sh` 不再 `cd /app/server`
- **`db/init.js`**：import 时不再自动执行建表（副作用消除），CLI 直接执行时才建表
- **`db/connection.js`**：移除未使用的 `__dirname`；`:memory:` 模式跳过 mkdir
- **`auth.routes.js`**：`setInterval` 加 `.unref()` 避免阻止进程退出/测试挂起
- **前端路由**：添加 404 catch-all（`/:pathMatch(.*)*` → LandingPage）

### 工程化
- **Dockerfile**：改为多阶段构建（frontend-build → production），生产镜像不含前端 devDependencies
- **docker-compose.yml**：添加 `healthcheck`（`/api/health`），Caddy `depends_on: service_healthy`
- **entrypoint.sh**：使用绝对路径（`/app/server/src/...`），不再依赖 CWD
- **新增 `.gitignore`**：node_modules / dist / data / uploads / .env / *.db / temp
- **新增 `.dockerignore`**：排除 node_modules / dist / data / uploads / .git / docs
- **清理**：删除根目录空壳 `package-lock.json`、`temp/` 残留脚本、`server/data/` 重复 DB

### 测试
- 新增 3 个用例（TC-O-12 ~ TC-O-14）：订单列表筛选、统计数据、交付文件
- 总计 **32 个测试用例**，全部通过

---

## v0.2.0 — 2026-07-26

### 重构：Feature-based 目录结构
- **旧结构**: `server/src/{routes,services,middleware}/` 按技术层分
- **新结构**: `server/src/features/{auth,artist,order,upload,admin}/` 按业务域分
- 每个 feature 包含 `*.service.js` + `*.routes.js`
- 跨 feature 共用代码移至 `server/src/shared/`（validate.js、middleware/auth.js）
- 拆分 `index.js` → `app.js`（应用工厂）+ `index.js`（启动入口）
- `db/init.js` 导出 `schema` 和 `initDatabase()` 供测试复用

### 新增：TDD 测试基础设施
- 添加 Vitest 3.2 测试框架
- 内存数据库（`:memory:`）隔离测试，不依赖外部文件
- `tests/setup.js` 提供 `cleanDb()` / `seedArtist()` / `seedOrder()` 工具
- 29 个测试用例全部通过：
  - 订单服务 11 个（TC-O-01 ~ TC-O-11）
  - 认证服务 9 个（TC-A-01 ~ TC-A-09）
  - 画师服务 5 个（TC-R-01 ~ TC-R-05）
  - 输入校验 4 个（TC-V-01 ~ TC-V-04）

### 新增：文档
- `docs/tdd-spec-v0.1.md` — TDD 规格文档（所有 TC 编号用例的详细定义）
- `docs/changelog.md` — 本文件
- `docs/开发自参考.md` — 更新为新目录结构 + 测试章节

### 运行测试
```bash
cd server
npm test
```

---

## v0.1.0 — 初始版本
- Fastify 5 + SQLite + Vue 3 全栈
- 画师公开主页、客户下单、排期队列、拖拽排序
- 6位登录码认证 + HMAC 会话
- Docker Compose + Caddy 部署
- 三份文档（使用说明书、维护说明书、开发自参考）
