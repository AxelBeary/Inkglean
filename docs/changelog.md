# 变更日志

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
