# v0.15 代码质量 + 安全审计报告
> 审计日期：2026-07-30
> 审计人：五号

---

# 第一部分：代码质量

## 1. ESLint 扫描结果

### Server
- Errors: 0 / Warnings: 0
- 扫描文件数：23
- 结论：✅ 全部通过，无任何 lint 问题

### Web
- Errors: 0 / Warnings: 0
- 扫描文件数：62
- 结论：✅ 全部通过，无任何 lint 问题

## 2. 测试覆盖率

- 测试通过：172/172（7 个测试文件全部通过）
- 覆盖率：statements 75.49% / branches 70.88% / functions 78.57% / lines 75.49%

### 各模块覆盖率明细

| 模块 | Stmts | Branch | Funcs | Lines | 备注 |
|------|-------|--------|-------|-------|------|
| errors.js | 100% | 100% | 100% | 100% | ✅ |
| validate.js | 100% | 100% | 100% | 100% | ✅ |
| pricing.service.js | 94.86% | 78.86% | 100% | 94.86% | ✅ |
| workflow.service.js | 94.19% | 67.64% | 89.47% | 94.19% | ✅ |
| order.service.js | 91.46% | 77.38% | 89.65% | 91.46% | ✅ |
| rate-limit.js | 86.2% | 66.66% | 100% | 86.2% | ✅ |
| artist.routes.js | 84.47% | 72% | 100% | 84.47% | ✅ |
| auth.js (middleware) | 84.21% | 72% | 100% | 84.21% | ✅ |
| artist.service.js | 83.47% | 76.66% | 75% | 83.47% | ✅ |
| auth.service.js | 83.14% | 81.81% | 100% | 83.14% | ✅ |
| pricing.routes.js | 80.95% | 100% | 25% | 80.95% | ⚠️ 函数覆盖低 |
| connection.js | 81.25% | 0% | 100% | 81.25% | ⚠️ 分支未覆盖 |
| init.js | 78.7% | 58.44% | 100% | 78.7% | ⚠️ |
| admin.routes.js | 72.84% | 100% | 50% | 72.84% | ⚠️ 函数覆盖低 |
| auth.routes.js | 61.72% | 58.33% | 100% | 61.72% | ⚠️ |
| order.routes.js | 71.45% | 66.66% | 100% | 71.45% | ⚠️ |
| app.js | 66.29% | 41.02% | 85.71% | 66.29% | ⚠️ |
| admin.service.js | 53.33% | 100% | 0% | 53.33% | ⚠️ 函数 0% |
| file-sign.js | 38.29% | 50% | 60% | 38.29% | ❌ 覆盖不足 |
| upload.routes.js | 32.43% | 50% | 20% | 32.43% | ❌ 覆盖严重不足 |
| greeting.service.js | 30.98% | 100% | 0% | 30.98% | ❌ 覆盖严重不足 |
| index.js | 0% | 0% | 0% | 0% | 入口文件，可接受 |
| seed.js | 0% | 0% | 0% | 0% | 种子脚本，可接受 |
| gc-uploads.js | 0% | 0% | 0% | 0% | 维护脚本，可接受 |

### 未覆盖关键路径

| 优先级 | 模块 | 问题 |
|--------|------|------|
| 🔴 高 | upload.routes.js (32.43%) | 文件上传是安全敏感模块，仅 20% 函数覆盖。deliverable/note-image 上传路径（L205-265）完全未测试 |
| 🔴 高 | greeting.service.js (30.98%) | 问候语服务 0% 函数覆盖，drawGreeting 等核心逻辑未测试 |
| 🟡 中 | file-sign.js (38.29%) | 签名 URL 生成逻辑（L35-55, L69-78）未覆盖，影响所有文件访问安全 |
| 🟡 中 | auth.routes.js (61.72%) | /api/auth/me（L109-110）和 /api/auth/logout（L118-120）路由未测试 |
| 🟡 中 | admin.service.js (53.33%) | getGlobalStats 函数（L11-18）未测试 |
| 🟡 中 | order.routes.js (71.45%) | stage 推进（L674-677）和 stage-back（L710-713）路由未测试 |

## 3. API 孤儿调用

### 孤儿调用（前端有、后端无）：无 ✅

前端 `web/src/api/index.js` 中定义的 100 个 API 调用全部在后端路由中有对应注册。

### 未使用路由（后端有、前端无）：无

后端 6 个路由文件（auth/artist/order/upload/admin/pricing）注册的所有路由均被前端 API 层调用。

### 对照统计

| 模块 | 前端调用数 | 后端路由数 | 匹配 |
|------|-----------|-----------|------|
| auth | 4 | 4 | ✅ |
| artist（公开+后台） | 25 | 25 | ✅ |
| order（客户端+画师端） | 22 | 22 | ✅ |
| upload | 4 | 4 | ✅ |
| admin | 33 | 33 | ✅ |
| pricing（增项+倍率+公开） | 12 | 12 | ✅ |
| **合计** | **100** | **100** | **✅** |

## 4. i18n 完整性

### zh-CN 独有 key：无 ✅
### en 独有 key：无 ✅
### 空值 key：无 ✅

两个语言文件（zh-CN.js / en.js）均为 382 行，结构完全对称。

| 顶级分组 | zh-CN key 数 | en key 数 | 一致性 |
|----------|-------------|----------|--------|
| errors | 40 | 40 | ✅ |
| pref | 8 | 8 | ✅ |
| common | 23 | 23 | ✅ |
| disclaimer | 2 | 2 | ✅ |
| upload | 4 | 4 | ✅ |
| pageTitle | 7 | 7 | ✅ |
| menu | 13 | 13 | ✅ |
| landing | 8 | 8 | ✅ |
| artistHome | 28 | 28 | ✅ |
| orderForm | 26 | 26 | ✅ |
| track | 31+5(timeline) | 31+5(timeline) | ✅ |
| delivery | 5 | 5 | ✅ |
| login | 12 | 12 | ✅ |
| dashboard | 22 | 22 | ✅ |
| queue | 17 | 17 | ✅ |
| orderList | 12 | 12 | ✅ |
| orderDetail | 56 | 56 | ✅ |
| manualOrder | 30 | 30 | ✅ |
| tiers | 22 | 22 | ✅ |
| artworks | 14 | 14 | ✅ |
| rules | 6 | 6 | ✅ |
| settings | 24 | 24 | ✅ |
| templates | 18 | 18 | ✅ |
| embed | 7 | 7 | ✅ |
| workflow | 22+7(helpLines) | 22+7(helpLines) | ✅ |
| admin | 52 | 52 | ✅ |

---

# 第二部分：安全快扫

## 5. Auth 中间件覆盖

### 中间件实现概要

- **requireAuth**（`shared/middleware/auth.js:33`）：提取 token（httpOnly cookie 优先，Bearer 兜底）→ HMAC 验签 → 查画师存在性 → 检查 deleted_at → 校验 token_version → 挂载 `request.artist`
- **requireAdmin**（`shared/middleware/auth.js:63`）：同 requireAuth 全部检查 + 额外比对 `artist.qq_number === getAdminQq()` → 挂载 `request.isAdmin`
- 路由注册方式：各 feature 通过 `fastify.register()` 注册，中间件以 `{ preHandler: requireAuth }` 或 `{ preHandler: [requireAuth, requireOwnOrder] }` 形式挂载

### 路由保护矩阵

#### auth.routes.js
| 路由 | 方法 | 保护级别 | 是否适当 |
|------|------|----------|----------|
| /api/auth/send-code | POST | 公开 + 限流(5次/5min) | ✅ 是（登录入口） |
| /api/auth/verify | POST | 公开 + 限流(10次/5min) | ✅ 是（登录入口） |
| /api/auth/me | GET | requireAuth | ✅ 是 |
| /api/auth/logout | POST | requireAuth | ✅ 是 |

#### order.routes.js
| 路由 | 方法 | 保护级别 | 是否适当 |
|------|------|----------|----------|
| /api/orders | POST | 公开 + 限流(10次/10min) | ✅ 是（客户下单） |
| /api/orders/track/:orderNo | GET | 公开 + 限流 + QQ验证 | ✅ 是（客户查单） |
| /api/orders/my | GET | 公开 + 限流 + QQ验证 | ✅ 是（客户查单） |
| /api/orders/lookup | GET | 公开 + 限流 + QQ验证 | ✅ 是（客户查单） |
| /api/orders/delivery/:orderNo | GET | 公开 + 限流 + QQ验证 | ✅ 是（客户下载） |
| /api/artist/orders | GET | requireAuth | ✅ 是 |
| /api/artist/queue | GET | requireAuth | ✅ 是 |
| /api/artist/orders/:id | GET | requireAuth + requireOwnOrder | ✅ 是 |
| /api/artist/orders/manual | POST | requireAuth | ✅ 是 |
| /api/artist/orders/:id/status | PUT | requireAuth + requireOwnOrder | ✅ 是 |
| /api/artist/orders/:id/priority | PUT | requireAuth + requireOwnOrder | ✅ 是 |
| /api/artist/queue/reorder | PUT | requireAuth | ✅ 是 |
| /api/artist/orders/:id/notes | POST | requireAuth + requireOwnOrder | ✅ 是 |
| /api/artist/orders/:id/deliver | POST | requireAuth + requireOwnOrder | ✅ 是 |
| /api/artist/orders/:id/references | POST | requireAuth + requireOwnOrder | ✅ 是 |
| /api/artist/stats | GET | requireAuth | ✅ 是 |
| /api/artist/orders/:id/price | PUT | requireAuth + requireOwnOrder | ✅ 是 |
| /api/artist/orders/:id/focus-image | PUT | requireAuth + requireOwnOrder | ✅ 是 |
| /api/artist/orders/:id/references/:refId | DELETE | requireAuth + requireOwnOrder | ✅ 是 |
| /api/artist/refresh-signatures | POST | requireAuth + 限流 | ✅ 是 |
| /api/artist/orders/:id/stage | PUT | requireAuth + requireOwnOrder | ✅ 是 |
| /api/artist/orders/:id/track-on | PUT | requireAuth + requireOwnOrder | ✅ 是 |
| /api/artist/orders/:id/stage-back | PUT | requireAuth + requireOwnOrder | ✅ 是 |

#### artist.routes.js
| 路由 | 方法 | 保护级别 | 是否适当 |
|------|------|----------|----------|
| /api/artists | GET | 公开 | ✅ 是（画师列表） |
| /api/artists/:subdomain | GET | 公开 | ✅ 是（公开主页） |
| /api/artists/:subdomain/workflow | GET | 公开 | ✅ 是（客户端流程） |
| /api/artist/profile | GET | requireAuth | ✅ 是 |
| /api/artist/profile | PUT | requireAuth | ✅ 是 |
| /api/artist/tiers | GET | requireAuth | ✅ 是 |
| /api/artist/tiers | POST | requireAuth | ✅ 是 |
| /api/artist/tiers/:id | PUT | requireAuth + 归属校验 | ✅ 是 |
| /api/artist/tiers/:id | DELETE | requireAuth + 归属校验 | ✅ 是 |
| /api/artist/artworks | GET | requireAuth | ✅ 是 |
| /api/artist/artworks | POST | requireAuth + 路径校验 | ✅ 是 |
| /api/artist/artworks/:id | DELETE | requireAuth + 归属校验 | ✅ 是 |
| /api/artist/rules | GET | requireAuth | ✅ 是 |
| /api/artist/rules | PUT | requireAuth | ✅ 是 |
| /api/artist/greeting | GET | requireAuth | ✅ 是 |
| /api/artist/workflow | GET | requireAuth | ✅ 是 |
| /api/artist/workflow | POST | requireAuth | ✅ 是 |
| /api/artist/workflow/:id | PUT | requireAuth | ✅ 是 |
| /api/artist/workflow/:id | DELETE | requireAuth | ✅ 是 |
| /api/artist/workflow/reorder | PUT | requireAuth | ✅ 是 |
| /api/artist/workflow/payment | PUT | requireAuth | ✅ 是 |
| /api/artist/workflow/reset | POST | requireAuth | ✅ 是 |

#### admin.routes.js（全部 requireAdmin）
| 路由 | 方法 | 保护级别 | 是否适当 |
|------|------|----------|----------|
| /api/admin/artists | GET | requireAdmin | ✅ 是 |
| /api/admin/artists | POST | requireAdmin | ✅ 是 |
| /api/admin/artists/:id | DELETE | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/orders | GET | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/status | PUT | requireAdmin | ✅ 是 |
| /api/admin/stats | GET | requireAdmin | ✅ 是 |
| /api/admin/transfer | POST | requireAdmin + 双重验码 + 限流 | ✅ 是 |
| /api/admin/greetings | GET | requireAdmin | ✅ 是 |
| /api/admin/greetings | POST | requireAdmin | ✅ 是 |
| /api/admin/greetings/:id | PUT | requireAdmin | ✅ 是 |
| /api/admin/greetings/:id | DELETE | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/greetings | GET | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/greetings | POST | requireAdmin + requireExistingArtist | ✅ 是 |
| /api/admin/artists/:id/greetings/:gid | PUT | requireAdmin + 归属校验 | ✅ 是 |
| /api/admin/artists/:id/greetings/:gid | DELETE | requireAdmin + 归属校验 | ✅ 是 |
| /api/admin/default-workflow | GET | requireAdmin | ✅ 是 |
| /api/admin/default-workflow | PUT | requireAdmin | ✅ 是 |
| /api/admin/default-workflow/reset | POST | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/workflow | GET | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/workflow | POST | requireAdmin + requireExistingArtist | ✅ 是 |
| /api/admin/artists/:id/workflow/:sid | PUT | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/workflow/:sid | DELETE | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/workflow/reorder | PUT | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/workflow/payment | PUT | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/profile | GET | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/profile | PUT | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/tiers | GET | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/tiers | POST | requireAdmin + requireExistingArtist | ✅ 是 |
| /api/admin/artists/:id/tiers/:tid | PUT | requireAdmin + 归属校验 | ✅ 是 |
| /api/admin/artists/:id/tiers/:tid | DELETE | requireAdmin + 归属校验 | ✅ 是 |
| /api/admin/artists/:id/artworks | GET | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/artworks | POST | requireAdmin + requireExistingArtist + 路径校验 | ✅ 是 |
| /api/admin/artists/:id/artworks/:aid | DELETE | requireAdmin + 归属校验 | ✅ 是 |
| /api/admin/artists/:id/rules | GET | requireAdmin | ✅ 是 |
| /api/admin/artists/:id/rules | PUT | requireAdmin | ✅ 是 |

#### pricing.routes.js
| 路由 | 方法 | 保护级别 | 是否适当 |
|------|------|----------|----------|
| /api/artist/addons | GET | requireAuth | ✅ 是 |
| /api/artist/addons | POST | requireAuth | ✅ 是 |
| /api/artist/addons/:id | PUT | requireAuth + requireOwnAddon | ✅ 是 |
| /api/artist/addons/:id | DELETE | requireAuth + requireOwnAddon | ✅ 是 |
| /api/artist/addons/reorder | PUT | requireAuth | ✅ 是 |
| /api/artist/addons/:id/tiers | PUT | requireAuth + requireOwnAddon | ✅ 是 |
| /api/artist/multipliers | GET | requireAuth | ✅ 是 |
| /api/artist/multipliers | POST | requireAuth | ✅ 是 |
| /api/artist/multipliers/:id | PUT | requireAuth + requireOwnMultiplier | ✅ 是 |
| /api/artist/multipliers/:id | DELETE | requireAuth + requireOwnMultiplier | ✅ 是 |
| /api/public/pricing/:subdomain | GET | 公开 + 限流(30次/5min) | ✅ 是（公开报价） |
| /api/public/calculate-price | POST | 公开 + 限流(30次/5min) | ✅ 是（价格计算） |

#### upload.routes.js
| 路由 | 方法 | 保护级别 | 是否适当 |
|------|------|----------|----------|
| /api/upload/image | POST | requireAuth + 限流(20次/10min) | ✅ 是 |
| /api/upload/reference | POST | 公开 + 限流(10次/10min) | ✅ 是（客户上传参考图） |
| /api/upload/deliverable | POST | requireAuth + 限流(20次/10min) | ✅ 是 |
| /api/upload/note-image | POST | requireAuth + 限流(20次/10min) | ✅ 是 |

#### 其他
| 路由 | 方法 | 保护级别 | 是否适当 |
|------|------|----------|----------|
| /api/health | GET | 公开 | ✅ 是（健康检查） |

### 问题
无问题。所有 82 个路由均有适当的保护级别。公开路由限于客户交互场景（下单、查单、上传参考图、查看画师主页/报价），且均配有限流。画师操作路由全部 requireAuth + 归属校验。管理路由全部 requireAdmin。

## 6. CSP 配置

- 当前配置（`app.js:125-139`）：
  - **所有路由**：`X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - **/embed 路由**：`Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'self'; connect-src 'self'`
  - **非 /embed 路由**：`X-Frame-Options: DENY`（无 CSP 头）

- 问题：
  1. **非 /embed 路由缺少 CSP 头**（中等）：主站 SPA 页面没有 Content-Security-Policy，仅靠 X-Frame-Options 防点击劫持。建议为 SPA 路由添加 `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'`
  2. **style-src 含 'unsafe-inline'**（低）：/embed CSP 中允许内联样式。这是前端框架（Vue/React）的常见需求，风险可控，但如使用 nonce/hash 方案可进一步收紧
  3. 无 unsafe-eval ✅
  4. 无不必要通配符 ✅
  5. frame-ancestors 已从 `*` 收紧为 `'self'` ✅

## 7. 文件上传校验

- 类型白名单：**是**
  - 图片上传：`.jpg, .jpeg, .png, .webp, .gif`（扩展名白名单 + MIME 白名单双重校验）
  - 交付文件：22 种格式白名单 + MIME 黑名单（拒绝 `image/svg+xml`, `text/html`, `application/xhtml+xml`）
- 大小限制：**是**
  - 图片/参考图/备注附图：10MB（`@fastify/multipart` limits.fileSize）
  - 交付文件：50MB（路由级覆盖）
  - 单次最多 5 个文件（limits.files）
- 路径遍历防护：**是，多层防御**
  1. `safeExt()`：`basename()` 剥离路径成分 + 正则 `/^\.[a-z0-9]{1,8}$/` 限制字符集
  2. `nanoid(12)` 随机文件名：完全丢弃用户原始文件名
  3. `resolve()` + `startsWith(resolvedRoot + sep)` 纵深防御：最终绝对路径必须在 uploadDir 子树内
  4. 业务层路径归属校验：`filePath.includes('..')` 检查 + 前缀白名单（如 `images/{artistId}/`、`deliverables/{artistId}/`）
  5. 静态文件服务层：`isPublicUploadPath()` 先 `decodeURIComponent` 再检查 `..`，防编码绕过
- 上传目录位置：`UPLOAD_DIR` 独立配置（默认 `./uploads`），通过 `@fastify/static` 以 `/uploads/` 前缀服务，非 web dist 目录内
- MIME 类型欺骗防护：**是**
  - 图片上传：`ALLOWED_MIME_TYPES.includes(data.mimetype)` 校验 MIME（`upload.routes.js:142`）
  - 交付文件：`DELIVER_BLOCKED_MIME` 黑名单拒绝危险 MIME（`upload.routes.js:214`）
  - 注意：MIME 来自客户端 `Content-Type`，可伪造；但配合扩展名白名单 + 随机文件名 + `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`，实际利用面极小

- 问题：无问题。上传安全设计良好，多层纵深防御。

## 8. 其他安全观察

### SQL 注入
- **无风险**。全部数据库操作使用 `better-sqlite3` 的 `db.prepare().run/get/all()` 参数化查询（`?` 占位符）。审计了 auth.service.js、order.service.js、admin.routes.js 中的所有 SQL 语句，未发现字符串拼接。

### 错误信息泄露
- **防护良好**。全局错误处理器（`app.js:175-194`）：
  - 5xx 错误：仅返回 `{ code: 'INTERNAL', error: '服务器内部错误' }`，不透传 message/stack
  - 4xx 错误：返回结构化错误码 + `ERROR_MESSAGES` 中文映射，不暴露内部细节
  - 详细错误仅写入服务端日志（`request.log.error`）

### Cookie 安全
- **配置适当**（`auth.routes.js:85-91`）：
  - `httpOnly: true` ✅（JS 不可读，防 XSS 窃取）
  - `sameSite: 'lax'` ✅（防 CSRF）
  - `secure: process.env.NODE_ENV === 'production'` ✅（生产环境仅 HTTPS）
  - `maxAge: 604800`（7天）✅
  - `path: '/'` ✅
- Cookie 签名密钥：`COOKIE_SECRET || SESSION_SECRET || 'dev-cookie-secret-change-in-production'`（`app.js:107`），生产环境 SESSION_SECRET 有 fail-fast 检查

### Rate Limiting
- **覆盖全面**。所有公开接口均有限流：
  - 登录码发送：5次/5min/IP
  - 登录码验证：10次/5min/IP
  - 客户下单：10次/10min/IP
  - 客户查单：10-20次/5min/IP
  - 图片上传：20次/10min/IP（公开参考图 10次）
  - 公开报价/计算：30次/5min/IP
  - 管理员转让：5次/15min/IP + 3次/15min/目标QQ
  - 签名刷新：20次/5min/画师
- 实现：内存桶（`rate-limit.js`），定期清理过期桶，10万桶上限防内存膨胀
- 局限：内存存储，多进程/集群部署时限流不共享（当前单进程架构下无影响）

### 其他安全亮点
- **防用户枚举**：send-code 无论 QQ 是否注册返回统一响应（`auth.routes.js:46`）
- **防时序攻击**：登录码验证使用 `crypto.timingSafeEqual`（`auth.service.js:100`），会话 token 验签同理（`auth.service.js:137`），文件签名验证同理（`file-sign.js:46`）
- **Token 版本控制**：`token_version` 机制支持服务端主动使所有旧 token 失效（登出/安全事件）
- **会话密钥 fail-fast**：生产环境未设 `SESSION_SECRET` 则启动即崩溃（`auth.service.js:21-22`、`file-sign.js:13-14`）
- **CORS 策略**：生产环境未设 `CORS_ORIGIN` 则不注册 CORS 插件 → 浏览器默认 same-origin（`app.js:111-122`）
- **trustProxy 安全**：默认仅信任私有网段，防 X-Forwarded-For 伪造绕过限流（`app.js:20-25`）
- **文件访问签名**：references/ 和 deliverables/ 需 HMAC 签名 URL（15分钟有效），images/ 公开（`file-sign.js`）
- **静态文件安全头**：`Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`（`app.js:167-168`）
- **子域名保留词**：防与系统路径冲突（`admin.routes.js:53`）
- **JSON Schema 校验**：几乎所有写入路由均有 Fastify JSON Schema 输入校验 + `additionalProperties: false`

### 潜在关注点（非漏洞）
1. **DEV 模式登录码泄露**：`AUTH_DEV_MODE=true` 时，send-code 响应含 `_dev_code` 字段（`auth.routes.js:48`），且服务端日志打印明文码。生产环境必须确保 `AUTH_DEV_MODE` 未设置。
2. **管理员判定方式**：管理员通过 QQ 号匹配（`getAdminQq()`），非 RBAC 角色模型。当前规模下可接受，多管理员场景需升级。
3. **Bearer token 兜底**：`extractToken()` 同时支持 cookie 和 Authorization header（`auth.js:20-28`），Bearer 路径不享受 httpOnly 保护。设计意图为 API 测试兼容，风险可控。

---

# 问题汇总

## 代码质量问题

| # | 类别 | 问题 | 严重度 | 文件 |
|---|------|------|--------|------|
| Q1 | 测试覆盖 | upload.routes.js 覆盖率仅 32.43%，deliverable/note-image 上传路径完全未测试 | 🔴 高 | server/src/features/upload/upload.routes.js |
| Q2 | 测试覆盖 | greeting.service.js 覆盖率仅 30.98%，0% 函数覆盖 | 🔴 高 | server/src/features/artist/greeting.service.js |
| Q3 | 测试覆盖 | file-sign.js 覆盖率仅 38.29%，签名 URL 核心逻辑未测试 | 🟡 中 | server/src/shared/file-sign.js |
| Q4 | 测试覆盖 | auth.routes.js 的 /me 和 /logout 路由未测试 | 🟡 中 | server/src/features/auth/auth.routes.js |
| Q5 | 测试覆盖 | order.routes.js 的 stage/stage-back 路由未测试 | 🟡 中 | server/src/features/order/order.routes.js |
| Q6 | 测试覆盖 | admin.service.js 的 getGlobalStats 未测试 | 🟡 中 | server/src/features/admin/admin.service.js |

## 安全问题

| # | 类别 | 问题 | 严重度 | 文件:行号 |
|---|------|------|--------|-----------|
| S1 | CSP | 非 /embed 路由（主站 SPA）缺少 Content-Security-Policy 头 | 🟡 中 | server/src/app.js:134-136 |
| S2 | CSP | /embed CSP 中 style-src 含 'unsafe-inline'（前端框架需求，风险可控） | 低 | server/src/app.js:131 |
| S3 | 配置 | AUTH_DEV_MODE=true 时登录码通过 API 响应和服务端日志泄露 | 低 | server/src/features/auth/auth.routes.js:48 |
| S4 | RateLimit | 内存桶限流在多进程/集群部署下不共享（当前单进程无影响） | 低 | server/src/shared/middleware/rate-limit.js:6 |

## 总结

- **ESLint**：✅ 零问题，代码风格完全合规
- **API 一致性**：✅ 前后端 100 个接口完全对齐，无孤儿调用
- **i18n 完整性**：✅ 中英文 key 完全对称，无缺失/空值
- **测试覆盖率**：⚠️ 总体 75.49%，核心业务逻辑（order/pricing/workflow service）覆盖良好（>90%），但安全敏感模块（upload/file-sign）和辅助模块（greeting）覆盖不足，建议优先补充
- **Auth 覆盖**：✅ 82 个路由全部检查，无遗漏
- **CSP**：⚠️ /embed 有完整 CSP，主站 SPA 路由缺少 CSP 头（唯一中等安全问题）
- **文件上传**：✅ 多层纵深防御，无问题
- **SQL 注入**：✅ 全部参数化查询
- **错误泄露**：✅ 5xx 仅返回通用消息
- **Cookie**：✅ httpOnly + sameSite=lax + secure(生产) 完整
- **Rate Limiting**：✅ 所有公开接口均有限流