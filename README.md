# 拾绘 Inkglean（原 Brushline-HuiYue）

画师约稿管理平台。画师用它在网上开一家自己的"约稿小店"：客户看到主页、选档位下单、画师接单排期、完成后交付文件、收钱记账，都在一个后台里完成。

作者：[AxelBeary（奚怡熊）](https://github.com/AxelBeary)。协议：AGPL-3.0（见 [LICENSE](LICENSE)，第三方资产见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)）。

> 本项目由 AI 辅助生成，使用前请自行检查代码，不建议直接用于生产环境。

## 它能做什么

对画师：

- **一个公开主页**：展示作品、价格档位、约稿须知，客户点进来就能看
- **客户自助下单**：客户在主页选档位/画风/尺寸，填需求直接提交
- **排期看板**：接单后拖拽管理队列，一眼看清手上的活
- **订单全流程**：待确认 → 制作中 → 修改 → 完成 → 交付，每一步客户都能查到进度
- **文件交付**：上传完稿，客户凭查单令牌完整下载一次后链接自动锁定（防转发盗用，画师可再许可）
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
| 测试 | Vitest（后端 `cd server && npm test`、前端 `cd web && npm run test:web`）+ Playwright E2E（根目录 `npm run test:e2e`）；用例数随开发增长，以实测为准（2026-08-19 参考：后端 1589 · 前端 651 · E2E 13） |
| 类型 | TypeScript（2026-08-19 起全仓 TS：后端/前端/测试/脚本/配置全部 strict 受检，零 any） |
| 监控 | Sentry |

## 快速开始

### 方式一：一键安装（推荐，全平台）

需要先装好 [Node.js](https://nodejs.org) **22~26 版**（推荐 22 版，与 Docker 生产环境一致；下载地址 https://nodejs.org/dist/latest-v22.x/，选 x64 的 .msi/.pkg 一路下一步即可）。

- **Windows**：双击仓库里的 `install.bat`
- **Linux / macOS**：终端里执行 `node install.mjs`

跟着提示一路按回车即可完成安装（自动安装 Docker 容器版或直接装到本机，二选一）。需要自选参数时见 `node install.mjs --help`。

> 裸 Linux 服务器还没装 Node.js？先执行 `bash setup.sh`（Docker 兜底安装）。
>
> 服务器上已有 Caddy/Nginx，或域名要走 Cloudflare 代理？见《维护说明书》「变体：宿主机已有反代 / 套 Cloudflare」节。

### 方式二：手动 Docker

```bash
cp .env.example .env
# 编辑 .env：至少修改 SESSION_SECRET、COOKIE_SECRET、ADMIN_QQ；生产再设置 DOMAIN（Caddy 域名）
# 默认 NODE_ENV=production、AUTH_DEV_MODE=false；开发本地调试按需改

docker compose up -d
# 访问：统一走 Caddy（80/443）；v0.42 起 compose 默认不把 3000 映射到宿主机，仅 expose（容器内自检：docker compose exec web curl localhost:3000/api/health）
```

### 方式三：本地开发

```bash
# 后端
cd server && npm install
npm run db:init    # 初始化数据库
npm run db:seed    # 插入测试数据（可选）
npm run dev        # http://localhost:3000

# 前端
cd web && npm install
npm run dev        # http://localhost:5173

# 测试（用例数随开发增长，以实测为准；2026-08-19 参考：后端 1589 · 前端 651 · E2E 13）
cd server && npm test          # 后端 Vitest
cd server && npm run lint
cd web && npm run lint
cd web && npm run test:web     # 前端 Vitest
cd .. && npm run test:e2e      # E2E（仓库根目录）
```

### 改动后最小验证

按改动类型跑最小验证清单（命令均为仓库既有脚本，不引入新工具）：

- 后端改动：`cd server && npm run typecheck && npm run lint && npm test`
- 前端改动：`cd web && npm run lint && npm run test:web && npm run check:i18n && npm run build`
- 涉及端到端流程：根目录 `npm run test:e2e`
- 一键全量验收：`pwsh scripts/accept.ps1`（可加 `-Worktree <路径>` 验收指定 worktree，产出结构化报告于 `workspace/temp/`）

## 目录结构

```
server/                 # 后端（Fastify，按业务域分目录）
  src/
    app.ts              # 应用工厂（cookie、CORS、安全头）
    features/           # admin / announcement / artist / auth / compliance / guestbook / invite / og / order / platform / pricing / setup / tracking / upload
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

- [赞助致谢](docs/赞助致谢.md) — 感谢每一位支持本项目的朋友 ❤️
- [画师使用说明书](docs/画师使用说明书.md) — 画师怎么用
- [维护说明书](docs/维护说明书.md) — 部署、备份、运维
- [贡献指南](CONTRIBUTING.md) — 报 bug / 提建议 / 贡献代码
- [安全策略](SECURITY.md) — 发现安全漏洞怎么私密报告
- [开发自参考](docs/开发自参考.md) — 架构、API、注意事项
- [开发→生产切换指南](docs/开发→生产切换指南.md)
- [变更日志](docs/changelog.md) — v0.1 至今
- [全局状态与待办](docs/comms/STATUS.md) — 当前状态、遗留项与待办
- [Soul 角色定义](docs/soul/) — 多角色协作的五个角色定义

## 安全说明

- 会话用 HMAC-SHA256 签名 + httpOnly cookie，JS 读不到
- 登录用 TOTP 动态口令（RFC 6238）+ IP 限速
- 上传文件有扩展名 + MIME 双重白名单
- 参考图走签名 URL（15 分钟有效）；交付文件凭查单令牌一次性下载（v1.0.0-beta.2 起）
- 后端统一错误码，不把内部信息透给用户
- 生产部署务必改 `SESSION_SECRET`、`COOKIE_SECRET`
- 发现安全漏洞？请勿公开，见 [安全策略](SECURITY.md)

## 许可

[AGPL-3.0](LICENSE) · 第三方资产声明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
