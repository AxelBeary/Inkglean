# 变更日志

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
