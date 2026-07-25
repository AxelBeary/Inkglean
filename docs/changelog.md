# 变更日志

## v0.4.1 — 2026-07-26

### 修复：路由 + API 调用全面修正
- **路由表重构**：`/home` → `/artist/:subdomain`、`/order` → `/artist/:subdomain/order`、`/track` → `/artist/:subdomain/track`（修复"画师不存在"错误）
- **ArtistHome.vue**：`artistApi.getArtistBySubdomain()` → `artistPublicApi.getProfile(subdomain)`（一次请求返回 profile+tiers+artworks+rules）
- **LandingPage.vue**：`artistApi.getArtists()` → `artistPublicApi.getAll()`；script 中 `$t()` → `t()`；字段 `weibo_url` → `weiboUrl`
- **OrderForm.vue**：`artistApi.createOrder()` → `orderApi.create()`；字段对齐后端（`subdomain`、`agreeRules`、`clientNotify`、`orderNo`）
- **TrackOrder.vue**：`artistApi.trackOrder()` → `orderApi.track(orderNo)`；字段 snake_case → camelCase（`orderNo`、`artistName`、`tierName`、`position`、`total`、`createdAt`、`fileName`、`url`）
- **DeliveryPage.vue**：`artistApi.trackOrder()` → `orderApi.delivery(orderNo)`；同上字段映射修正
- **ThemeToggle.vue**：重写为极简按钮（去掉 el-dropdown/el-tooltip），修复侧边栏 scrollbar 溢出

### 变更文件
- `web/src/router/index.js`：路由路径参数化
- `web/src/views/client/ArtistHome.vue`
- `web/src/views/client/LandingPage.vue`
- `web/src/views/client/OrderForm.vue`
- `web/src/views/client/TrackOrder.vue`
- `web/src/views/client/DeliveryPage.vue`
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
