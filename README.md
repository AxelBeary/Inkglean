# 🎨 Brushline-HuiYue（绘约）

画师约稿管理平台 —— 为画师提供一站式约稿接单、排期管理和作品交付工具。零代码开发，请在使用前使用各种手段先检查代码。请勿直接用于生产环境。

## ✨ 功能特性

- **画师主页**：每位画师拥有独立主页（`/artist/子域名`），展示作品、价格档位和约稿须知
- **客户自助下单**：客户通过画师主页直接提交约稿需求
- **排期看板**：拖拽式队列管理，支持优先级排序
- **订单全流程**：待确认 → 制作中 → 修改 → 完成 → 交付，状态实时追踪
- **客户查单**：凭订单号查询进度和排队位置
- **文件交付**：画师上传成品，客户在线下载（HMAC 签名 URL，15 分钟有效）
- **多画师管理**：管理员后台统一管理平台内所有画师
- **QQ 登录码认证**：基于 QQ 号的免密码登录（6 位验证码 + HMAC 签名会话 + httpOnly cookie）
- **流程与比例**：画师自定义约稿流程节点 + Q弹拖拽收款比例条（v0.8.0）
- **问候系统**：按时段随机问候语，通用库 + 画师专属库（v0.8.0）
- **五色主题**：底色三选 + 主色五选 + 霞鹜文楷字体（v0.8.0）
- **中英双语**：前端 vue-i18n 完整覆盖 + 后端结构化错误码翻译（v0.8.0）
- **主页模板系统**：布局 × 配色自由组合（4 布局 × 4 配色 = 16 种风格），画师后台一键切换预览（v0.10.0，v0.11 新增画册工作室布局）
- **嵌入脚本**：画师在自己的网站粘贴一行 `<script>` 即可嵌入约稿下单功能（v0.9.0）
- **价格计算器**：增项（固定/百分比）+ 用途倍率（取最高）+ 加急倍率（可叠加），实时总价 + 分期预览（v0.9.0）
- **报价快照与最终价格**：下单自动生成可读报价描述，画师可手动设置/修改最终成交价（v0.11）
- **焦点图**：订单参考图中选一张设为焦点图，排期看板一眼看出画什么角色（v0.11）
- **粘贴上传**：所有图片上传处支持 Ctrl+V 粘贴截图，前端过滤非图片内容（v0.11）
- **修改次数告示**：画师自写修改规则文字，显示在客户流程预览中（v0.11）
- **外链列表**：画师自定义社交链接（最多 6 条，8 种图标），替代写死的微博/B站字段（v0.12）
- **订单图库**：参考图升级为图库（拖拽/点击/Ctrl+V 上传），来源角标（客户/画师），合计上限 20 张（v0.12）
- **备注附图**：订单备注支持可选附 1 张图，签名 URL + 缩略图 + 大图查看（v0.12）
- **侧边栏折叠**：画师端侧边栏手动折叠/窄屏自动/移动端抽屉/localStorage 记忆（v0.12）
- **流程状态机**：订单接入画师自定义工作流（推进/打回/关闭跟踪），客户 track 页显示节点名 + 进度（v0.13）
- **签名刷新**：useSignatureRefresh composable（10 分钟轮询 + @error 兜底），长停留页面不再 403（v0.13）
- **hidden 状态**：画师可隐藏公开主页（第四态），客户看到友好提示页（v0.13）
- **状态区重构**：订单详情页状态区方案B重构，信息层级更清晰（v0.14）
- **手动录单合并**：手动录单流程合并简化（v0.14）
- **须知编辑合并**：约稿须知编辑入口合并（v0.14）
- **焦点/放大互换**：图库焦点图与放大查看操作互换，更符合直觉（v0.14）
- **图库闪烁修复**：修复图库操作时的视觉闪烁（v0.14）
- **多选删除**：图库支持多选批量删除（v0.14）
- **备注拖拽**：订单备注支持拖拽排序（v0.14）

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Element Plus + Pinia + Vue Router + Vite + vue-i18n |
| 后端 | Fastify 5 + better-sqlite3（Feature-based 架构） |
| 部署 | Docker Compose（多阶段构建）+ Caddy（自动 HTTPS + healthcheck） |
| 认证 | HMAC-SHA256 签名会话 + httpOnly cookie + 登录码 |
| 测试 | Vitest（172 个用例，含路由层/价格计算器/报价焦点图/流程状态机测试，内存数据库） |
| 工程化 | ESLint + Prettier + GitHub Actions CI |

## 🚀 快速开始

### 方式一：Docker（推荐）

```bash
# 1. 复制环境配置
cp .env.example .env
# 编辑 .env，修改 SESSION_SECRET、COOKIE_SECRET 和 ADMIN_QQ

# 2. 一键启动（多阶段构建，自动编译前端）
docker compose up -d

# 3. 访问（容器端口仅 expose，不映射宿主机）
#    开发调试：docker compose exec web curl localhost:3000/api/health
#    生产访问：通过 Caddy 反向代理（80/443）
```

### 方式二：本地开发

```bash
# 后端
cd server
npm install
npm run db:init    # 初始化数据库
npm run db:seed    # 插入测试数据（可选）
npm run dev        # 启动开发服务器 (http://localhost:3000)

# 前端
cd web
npm install
npm run dev        # 启动 Vite 开发服务器 (http://localhost:5173)

# 测试
cd server
npm test           # 运行全部 172 个测试用例

# Lint
cd server && npm run lint
cd web && npm run lint
```

## 📁 项目结构

```
├── server/                     # 后端 (Fastify, Feature-based)
│   ├── eslint.config.js        # ESLint flat config
│   └── src/
│       ├── app.js              # 应用工厂（@fastify/cookie + CORS + 安全头）
│       ├── index.js            # 启动入口
│       ├── features/           # 按业务域划分
│       │   ├── auth/           # 认证（service + routes）
│       │   ├── artist/         # 画师（service + routes + workflow.service）
│       │   ├── order/          # 订单（service + routes）
│       │   ├── upload/         # 上传（routes）
│       │   ├── pricing/        # 价格计算（service + routes）
│       │   └── admin/          # 管理（service + routes）
│       ├── shared/             # 跨 feature 共用（errors, validate, middleware, file-sign）
│       └── db/                 # 数据库连接/建表/迁移/种子
├── web/                        # 前端 (Vue 3)
│   ├── eslint.config.js        # ESLint flat config + vue 插件
│   ├── .prettierrc             # Prettier 配置
│   └── src/
│       ├── views/              # 页面组件（artist/client/admin）
│       ├── components/         # 共享组件（artist/admin/shared）
│       ├── api/                # API 封装（withCredentials + i18n 错误翻译）
│       ├── router/             # 路由配置（含 404 catch-all）
│       ├── stores/             # Pinia 状态管理
│       ├── locales/            # i18n 语言包（zh-CN / en）
│       └── i18n/               # i18n 初始化
├── .github/workflows/ci.yml   # GitHub Actions CI（lint + test + build）
├── docs/                       # 文档（含 soul 角色定义、协作规则、提交模板）
├── docker-compose.yml          # web（healthcheck）+ caddy
├── Dockerfile                  # 多阶段构建
├── Caddyfile                   # 路径访问 + 自动 HTTPS
├── .gitignore / .dockerignore
└── .env.example
```

## 📖 文档

- [画师使用说明书](docs/画师使用说明书.md) — 面向画师的操作指南
- [维护说明书](docs/维护说明书.md) — 部署、备份、运维手册
- [开发自参考](docs/开发自参考.md) — 架构设计、API 参考、已知注意事项（60 条）
- [开发→生产切换指南](docs/开发→生产切换指南.md) — 开发模式切生产的完整检查清单
- [变更日志](docs/changelog.md) — 版本历史（v0.1 ~ v0.14）
- [主题规格](docs/theme-spec.md) — 五色主题 + 文楷字体设计规格
- [流程与比例计划](docs/plan-workflow-payment.md) — 流程收款系统设计文档
- [TDD 规格文档](docs/tdd-spec-v0.1.md) — 测试用例定义（TC-O/A/R/V/W/RT）
- [待修复问题清单](docs/待修复问题清单.md) — 审计问题追踪（v0.13 批次已关闭，UI-5/UI-6/UI-9/ENV-1 开放）
- [模板重构规划](docs/plan-template-refactor.md) — 布局×配色模板系统设计文档（已完成）
- [价格计算器规划](docs/plan-price-calculator.md) — 增项/倍率/分期计算设计文档（已完成）
- [协作规则](docs/协作规则.md) — 多角色 Agent 协作开发规范
- [Soul 角色定义](docs/soul/) — 五个角色的职责、权限、停止机制

## 🔒 安全说明

- 会话 Token 使用 HMAC-SHA256 签名，timing-safe 比较防时序攻击
- Token 存储于 httpOnly + SameSite=Lax cookie，JS 不可读，防 XSS 窃取
- 登录码使用 `crypto.randomInt` 密码学安全随机数生成
- 内置 IP 级速率限制，防暴力破解
- 上传文件有扩展名 + MIME 双重白名单校验
- 交付文件/参考图通过 HMAC 签名 URL 访问（15 分钟有效）
- 后端统一结构化错误码（~50 个），500 错误不透传内部信息
- 全局安全响应头（nosniff / DENY / strict-origin / Permissions-Policy）
- 生产环境务必修改 `SESSION_SECRET`、`COOKIE_SECRET`（见 `.env.example`）

## 📄 License

[MIT](LICENSE)
