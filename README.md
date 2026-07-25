# 🎨 Brushline-HuiYue（绘约）

画师约稿管理平台 —— 为画师提供一站式约稿接单、排期管理和作品交付工具。零代码开发，请在使用前使用各种手段先检查代码。请勿直接用于生产环境。

## ✨ 功能特性

- **画师主页**：每位画师拥有独立子域名主页，展示作品、价格档位和约稿须知
- **客户自助下单**：客户通过画师主页直接提交约稿需求
- **排期看板**：拖拽式队列管理，支持优先级排序
- **订单全流程**：待确认 → 制作中 → 修改 → 完成 → 交付，状态实时追踪
- **客户查单**：凭订单号查询进度和排队位置
- **文件交付**：画师上传成品，客户在线下载
- **多画师管理**：管理员后台统一管理平台内所有画师
- **QQ 登录码认证**：基于 QQ 号的免密码登录（6 位验证码 + HMAC 签名会话）

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Element Plus + Pinia + Vue Router + Vite |
| 后端 | Fastify 5 + better-sqlite3（Feature-based 架构） |
| 部署 | Docker Compose（多阶段构建）+ Caddy（自动 HTTPS + healthcheck） |
| 认证 | HMAC-SHA256 签名会话 + 登录码 |
| 测试 | Vitest（32 个用例，内存数据库） |

## 🚀 快速开始

### 方式一：Docker（推荐）

```bash
# 1. 复制环境配置
cp .env.example .env
# 编辑 .env，修改 SESSION_SECRET 和 ADMIN_QQ

# 2. 一键启动（多阶段构建，自动编译前端）
docker compose up -d

# 3. 访问 http://localhost:3000
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
npm test           # 运行全部 32 个测试用例
```

## 📁 项目结构

```
├── server/                     # 后端 (Fastify, Feature-based)
│   └── src/
│       ├── app.js              # 应用工厂
│       ├── index.js            # 启动入口
│       ├── features/           # 按业务域划分
│       │   ├── auth/           # 认证（service + routes）
│       │   ├── artist/         # 画师（service + routes）
│       │   ├── order/          # 订单（service + routes）
│       │   ├── upload/         # 上传（routes）
│       │   └── admin/          # 管理（service + routes）
│       ├── shared/             # 跨 feature 共用（validate, middleware）
│       └── db/                 # 数据库连接/建表/种子
├── web/                        # 前端 (Vue 3)
│   └── src/
│       ├── views/              # 页面组件（artist/client/admin）
│       ├── api/                # API 封装（统一入口）
│       ├── router/             # 路由配置（含 404 catch-all）
│       └── stores/             # Pinia 状态管理
├── docs/                       # 文档（四份说明书 + changelog）
├── docker-compose.yml          # web（healthcheck）+ caddy
├── Dockerfile                  # 多阶段构建
├── Caddyfile                   # 泛解析 + 自动 HTTPS
├── .gitignore / .dockerignore
└── .env.example
```

## 📖 文档

- [画师使用说明书](docs/画师使用说明书.md) — 面向画师的操作指南
- [维护说明书](docs/维护说明书.md) — 部署、备份、运维手册
- [开发自参考](docs/开发自参考.md) — 架构设计、API 参考、已知问题
- [开发→生产切换指南](docs/开发→生产切换指南.md) — 开发模式切生产的完整检查清单
- [变更日志](docs/changelog.md) — 版本历史

## 🔒 安全说明

- 会话 Token 使用 HMAC-SHA256 签名，timing-safe 比较防时序攻击
- 登录码使用 `crypto.randomInt` 密码学安全随机数生成
- 内置 IP 级速率限制，防暴力破解
- 生产环境务必修改 `SESSION_SECRET`（见 `.env.example`）

## 📄 License

[MIT](LICENSE)
