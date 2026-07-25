# 绘约平台 TDD 规格文档 v0.1

> 测试驱动开发规格。每个 TC 编号对应一个可独立运行的测试用例。
> 测试框架：Vitest + better-sqlite3（内存模式）
> 运行命令：`cd server && npx vitest run`

---

## 测试范围

| 模块 | 文件 | 优先级 |
|------|------|--------|
| 订单服务 | `features/order/order.service.js` | 🔴 核心 |
| 认证服务 | `features/auth/auth.service.js` | 🔴 核心 |
| 画师服务 | `features/artist/artist.service.js` | 🟡 重要 |
| 输入校验 | `shared/validate.js` | 🟡 重要 |
| 订单路由 | `features/order/order.routes.js` | 🟢 集成 |

---

## TC-O: 订单服务 (Order Service)

### TC-O-01: 创建订单 — 正常流程
- **前置**: 数据库有画师 `alice`（subdomain='alice', status='open'）
- **操作**: `createOrder({ artistId, clientQq: '123456', source: 'self' })`
- **断言**:
  - 返回订单 `order_no` 格式为 `A001`（首字母大写 + 3位序号）
  - `status` = `'pending'`
  - `queue_position` = 1
  - `source` = `'self'`

### TC-O-02: 创建订单 — 序号递增
- **前置**: 画师 `alice` 已有订单 A001
- **操作**: 再创建一个订单
- **断言**: `order_no` = `'A002'`

### TC-O-03: 创建订单 — 画师不存在
- **操作**: `createOrder({ artistId: 999, ... })`
- **断言**: 抛出 Error `'画师不存在'`

### TC-O-04: 订单状态流转 — 合法路径
- **前置**: 订单状态为 `pending`
- **操作**: 依次更新为 `confirmed → wip → revision → done → delivered`
- **断言**: 每步返回的 `status` 与目标一致

### TC-O-05: 订单状态流转 — 非法状态
- **操作**: `updateOrderStatus(id, 'invalid_status')`
- **断言**: 抛出 Error 包含 `'无效状态'`

### TC-O-06: 交付/取消后队列重排
- **前置**: 画师有 3 个活跃订单（位置 1,2,3）
- **操作**: 将位置 1 的订单改为 `delivered`
- **断言**: 剩余 2 个订单 `queue_position` 重排为 1,2

### TC-O-07: 拖拽排序 — 优先级继承
- **前置**: 队列中有 high(位置1) 和 medium(位置2,3) 订单
- **操作**: 将 medium 订单拖到位置 0（high 区域）
- **断言**: 被拖动订单 `priority` 变为 `'high'`

### TC-O-08: 更新优先级 — 非法值
- **操作**: `updatePriority(id, 'urgent')`
- **断言**: 抛出 Error 包含 `'无效优先级'`

### TC-O-09: 客户查询排队位置
- **前置**: 画师有 3 个活跃订单
- **操作**: `getClientQueuePosition('A002')`
- **断言**: `position` = 2, `total` = 3

### TC-O-10: 客户查询 — 已交付订单
- **前置**: 订单状态为 `delivered`
- **操作**: `getClientQueuePosition(orderNo)`
- **断言**: `position` = null, `total` = null

### TC-O-11: 添加备注
- **操作**: `addNote(orderId, '测试备注', 'artist')`
- **断言**: 返回订单的 `notes` 数组包含该备注

---

## TC-A: 认证服务 (Auth Service)

### TC-A-01: 生成登录码 — 正常
- **前置**: 画师 QQ 号 `12345` 已绑定
- **操作**: `generateLoginCode('12345')`
- **断言**:
  - 返回 6 位数字字符串
  - 返回 `artist` 对象

### TC-A-02: 生成登录码 — QQ 未绑定
- **操作**: `generateLoginCode('99999')`
- **断言**: 抛出 Error 包含 `'未绑定画师账号'`

### TC-A-03: 验证登录码 — 正确
- **前置**: 已生成登录码
- **操作**: `verifyLoginCode(qq, correctCode)`
- **断言**: `{ valid: true, artist }` 且登录码被删除（不可重复使用）

### TC-A-04: 验证登录码 — 错误
- **操作**: `verifyLoginCode(qq, '000000')`
- **断言**: `{ valid: false }` 且 `attempts` 递增

### TC-A-05: 验证登录码 — 超过最大尝试次数
- **前置**: 已错误尝试 3 次
- **操作**: 再次验证
- **断言**: `{ valid: false, error }` 包含 `'尝试次数过多'`

### TC-A-06: 验证登录码 — 过期
- **前置**: 登录码 `expires_at` 设为过去时间
- **操作**: 验证
- **断言**: `{ valid: false, error }` 包含 `'已过期'`

### TC-A-07: 会话 Token — 创建与解析
- **操作**: `createSession(1)` → `parseSession(token)`
- **断言**: 返回 `{ artistId: 1 }`

### TC-A-08: 会话 Token — 篡改签名
- **操作**: 修改 token 最后一个字符后 `parseSession`
- **断言**: 返回 `null`

### TC-A-09: 会话 Token — 过期
- **操作**: 构造 timestamp 为 8 天前的 token
- **断言**: `parseSession` 返回 `null`

---

## TC-R: 画师服务 (Artist Service)

### TC-R-01: 创建画师 — 正常
- **操作**: `createArtist({ qqNumber: '111', name: '测试', subdomain: 'test' })`
- **断言**: 返回画师对象，`commission_rules` 自动初始化

### TC-R-02: 创建画师 — 子域名格式非法
- **操作**: `createArtist({ subdomain: 'AB CD!' })`
- **断言**: 抛出 Error 包含 `'子域名只能包含'`

### TC-R-03: 更新画师 — 白名单字段
- **操作**: `updateArtist(id, { name: '新名', hack: 'x' })`
- **断言**: `name` 更新成功，`hack` 字段被忽略

### TC-R-04: 价格档位 CRUD
- **操作**: 创建 → 读取 → 更新价格 → 删除
- **断言**: 各步骤返回正确数据，删除后查询为空

### TC-R-05: 作品 CRUD
- **操作**: 创建 → 读取 → 删除
- **断言**: `sort_order` 自动递增，删除后列表为空

---

## TC-V: 输入校验 (Validate)

### TC-V-01: clamp 截断
- **操作**: `clamp('a'.repeat(100), 'qq')`
- **断言**: 返回长度 = 15

### TC-V-02: clamp null 安全
- **操作**: `clamp(null, 'name')`
- **断言**: 返回 `null`

### TC-V-03: isValidQq 合法
- **操作**: `isValidQq('12345')`, `isValidQq('123456789012345')`
- **断言**: 均返回 `true`

### TC-V-04: isValidQq 非法
- **操作**: `isValidQq('1234')`, `isValidQq('abc')`, `isValidQq('')`
- **断言**: 均返回 `false`

---

## 测试基础设施

### 测试数据库
- 使用 `better-sqlite3` 的 `:memory:` 模式
- 每个测试文件 `beforeAll` 执行 `init.js` 的建表 SQL
- 每个测试 `beforeEach` 清空所有表（`DELETE FROM`）
- 不依赖外部文件，CI 可直接运行

### 文件结构
```
server/
├── tests/
│   ├── setup.js              # 共享：内存数据库 + 建表 + 清表
│   ├── order.service.test.js # TC-O-*
│   ├── auth.service.test.js  # TC-A-*
│   ├── artist.service.test.js# TC-R-*
│   └── validate.test.js      # TC-V-*
```

### 运行
```bash
cd server
npx vitest run          # 全部测试
npx vitest run --reporter=verbose  # 详细输出
```

---

## 覆盖率目标

| 模块 | 目标 |
|------|------|
| order.service.js | ≥ 90% 分支覆盖 |
| auth.service.js | ≥ 90% 分支覆盖 |
| artist.service.js | ≥ 80% |
| validate.js | 100% |
