# 🎨 Brushline-HuiYue（绘约）

画师约稿管理平台 —— 为画师提供一站式约稿接单、排期管理和作品交付工具。

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
| 后端 | Fastify 5 + better-sqlite3 |
| 部署 | Docker Compose + Caddy（自动 HTTPS） |
| 认证 | HMAC-SHA256 签名会话 + 登录码 |

## 🚀 快速开始

### 方式一：Docker（推荐）

```bash
# 1. 复制环境配置
cp .env.example .env
# 编辑 .env，修改 SESSION_SECRET 和 ADMIN_QQ

# 2. 一键启动
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
```

## 📁 项目结构

```
├── server/                 # 后端 (Fastify)
│   └── src/
│       ├── routes/         # API 路由
│       ├── services/       # 业务逻辑
│       ├── middleware/     # 认证中间件
│       └── db/             # 数据库初始化 & 种子数据
├── web/                    # 前端 (Vue 3)
│   └── src/
│       ├── views/          # 页面组件
│       │   ├── artist/     # 画师后台
│       │   ├── client/     # 客户端
│       │   └── admin/      # 管理后台
│       ├── components/     # 公共组件
│       ├── api/            # API 封装
│       ├── router/         # 路由配置
│       └── stores/         # Pinia 状态管理
├── docs/                   # 文档
│   ├── 画师使用说明书.md
│   ├── 维护说明书.md
│   └── 开发自参考.md
├── docker-compose.yml
├── Dockerfile
├── Caddyfile
└── .env.example
```

## 📖 文档

- [画师使用说明书](docs/画师使用说明书.md) — 面向画师的操作指南
- [维护说明书](docs/维护说明书.md) — 部署、备份、运维手册
- [开发自参考](docs/开发自参考.md) — 架构设计、API 参考、已知问题

## 🔒 安全说明

- 会话 Token 使用 HMAC-SHA256 签名，timing-safe 比较防时序攻击
- 登录码使用 `crypto.randomInt` 密码学安全随机数生成
- 内置 IP 级速率限制，防暴力破解
- 生产环境务必修改 `SESSION_SECRET`（见 `.env.example`）

## 📄 License

[MIT](LICENSE)
