# Brushline-HuiYue（绘约）

画师约稿管理平台。画师用它在网上开一家自己的"约稿小店"：客户看到主页、选档位下单、画师接单排期、完成后交付文件、收钱记账，都在一个后台里完成。

作者：[AxelBeary（奚怡熊）](https://github.com/AxelBeary)。协议：AGPL-3.0（见 [LICENSE](LICENSE)，第三方资产见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)）。

> 本项目由 AI 辅助生成，使用前请自行检查代码，不建议直接用于生产环境。

## 它能做什么

对画师：

- **一个公开主页**：展示作品、价格档位、约稿须知，客户点进来就能看
- **客户自助下单**：客户在主页选档位/画风/尺寸，填需求直接提交
- **排期看板**：接单后拖拽管理队列，一眼看清手上的活
- **订单全流程**：待确认 → 制作中 → 修改 → 完成 → 交付，每一步客户都能查到进度
- **文件交付**：上传完稿，客户凭签名链接下载（15 分钟有效）
- **收款记账**：记录每笔收款、尾款、退款，仪表盘看收入
- **画师自定义**：工作流节点、收款比例、截稿日、开稿日、参考图库、修改规则

对客户：

- **查单**：凭订单号看进度和排队位置
- **约稿须知**：下单前看到画师的规则
- **留言板**：在画师主页留言，审核后展示

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Element Plus + Pinia + Vite |
| 后端 | Fastify 5 + better-sqlite3 |
| 部署 | Docker Compose + Caddy（自动 HTTPS） |
| 登录 | TOTP 动态口令（RFC 6238） |
| 测试 | Vitest（后端 1213 + 前端 332 = 1545 用例）+ Playwright E2E（7 条） |
| 类型 | TypeScript（后端 100% TS，strict 全开） |
| 监控 | Sentry |

## 快速开始

### 方式一：Docker

```bash
cp .env.example .env
# 编辑 .env：修改 SESSION_SECRET、COOKIE_SECRET、ADMIN_QQ

docker compose up -d
# 生产：通过 Caddy 访问（80/443）；开发调试：docker compose exec web curl localhost:3000/api/health
```

### 方式二：本地开发

```bash
# 后端
cd server && npm install
npm run db:init    # 初始化数据库
npm run db:seed    # 插入测试数据（可选）
npm run dev        # http://localhost:3000

# 前端
cd web && npm install
npm run dev        # http://localhost:5173

# 测试
cd server && npm test    # 1024 个用例
cd server && npm run lint
cd web && npm run lint
```

## 目录结构

```
server/                 # 后端（Fastify，按业务域分目录）
  src/
    app.ts              # 应用工厂（cookie、CORS、安全头）
    features/           # auth / artist / order / upload / pricing / admin
    shared/             # 错误码、校验、中间件、文件签名
    db/                 # 连接、建表、迁移、种子
web/                    # 前端（Vue 3）
  src/
    views/              # 页面（artist / client / admin）
    components/         # 组件
    api/                # 接口封装
    stores/             # Pinia
    locales/            # 中英文语言包
docs/                   # 文档（含 soul 角色定义）
```

## 文档

- [画师使用说明书](docs/画师使用说明书.md) — 画师怎么用
- [维护说明书](docs/维护说明书.md) — 部署、备份、运维
- [开发自参考](docs/开发自参考.md) — 架构、API、注意事项
- [开发→生产切换指南](docs/开发→生产切换指南.md)
- [变更日志](docs/changelog.md) — v0.1 至今
- [待修复问题清单](docs/待修复问题清单.md)
- [Soul 角色定义](docs/soul/) — 多角色协作的五个角色定义

## 安全说明

- 会话用 HMAC-SHA256 签名 + httpOnly cookie，JS 读不到
- 登录用 TOTP 动态口令（RFC 6238）+ IP 限速
- 上传文件有扩展名 + MIME 双重白名单
- 交付文件/参考图走签名 URL（15 分钟有效）
- 后端统一错误码，不把内部信息透给用户
- 生产部署务必改 `SESSION_SECRET`、`COOKIE_SECRET`

## 许可

[AGPL-3.0](LICENSE) · 第三方资产声明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
