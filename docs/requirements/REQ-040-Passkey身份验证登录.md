# REQ-040 Passkey 身份验证登录

> 状态：方案落档（2026-08-11 用户拍板「1.0 必须有这个才能上线」）
> 整理：四号（借一号窗口）
> 关联：REQ-027（TOTP，并存兜底）、REQ-039（1.0 清单 M6）
> 技术：WebAuthn（FIDO2）/ Windows Hello / 平台认证器

---

## 一、背景与目标

画师每天登录后台接单，现在必须输 6 位 TOTP 动态码。目标是**一键登录**：点「使用 Windows Hello / 指纹登录」→ 系统弹窗 → 指纹/PIN → 进入后台。宝宝级体验。

**用户拍板（2026-08-11）**：1.0 必须有此功能才能上线。

---

## 二、方案设计

### 总原则（建议，待确认）

- **TOTP 并存，Passkey 便捷**：登录时二选一。Passkey 是日常主路径；TOTP 兜底换设备/重装系统场景。**不替代 TOTP**——Passkey 私钥锁在设备里，设备丢失且无 TOTP 将死锁（TOTP 上线初期同款教训）。
- **多设备多凭据**：一个画师可注册多个凭据（家里电脑 + 手机 + 平板），设置页统一管理。
- **全平台**：Windows Hello（指纹/PIN/人脸）+ 手机（面容/指纹/iCloud/Google 同步）均走 WebAuthn，天然支持。

### 登录流程

```
登录页输 QQ 号 → 两种方式任选：
  A. 「使用 Windows Hello / 指纹登录」→ 浏览器调系统认证（navigator.credentials.get）
     → 后端校验签名 → 建会话 → 进后台
  B. 「输入动态码」→ 现有 TOTP 流程（不变）
```

### 注册/管理流程（画师设置页新增「登录设备」）

```
已登录画师 → 设置 → 登录设备：
  · 「注册此设备」→ 系统认证 → 保存凭据（显示设备名，可改）
  · 凭据列表：设备名 / 最后使用时间 / 删除按钮（删除后该设备不可一键登录，TOTP 仍可用）
  · 换设备：新设备注册即用（旧设备可删可留）
```

### 后端

- 依赖：`@simplewebauthn/server`（验证注册/认证；前端用浏览器原生 API，零依赖）
- **迁移 v57**：新表 `webauthn_credentials`（id、artist_id、public_key、counter、device_name、created_at、last_used_at；UNIQUE(artist_id, credential_id)）
- challenge：注册/认证前签发，一次性 + 短时效（建议 5 分钟），存内存或 DB
- API：
  - `POST /api/auth/webauthn/register-options`（登录态，生成注册 challenge + 参数）
  - `POST /api/auth/webauthn/register-verify`（验证 attestation，存凭据）
  - `GET /api/auth/webauthn/credentials`（列表）
  - `PATCH /api/auth/webauthn/credentials/:id`（改设备名）
  - `DELETE /api/auth/webauthn/credentials/:id`（删除）
  - `POST /api/auth/webauthn/login-options`（公开，按 QQ 生成认证 challenge）
  - `POST /api/auth/webauthn/login-verify`（公开+限流，验证签名 → 复用 createSession 登录）
- 安全：counter 递增校验（防克隆）；RP ID = 部署域名；登录接口限流（复用 rate-limit）；未注册 QQ 与认证失败同响应（防枚举，对齐 TOTP 现状）

### 前端

- 登录页：输 QQ 后出现「使用 Windows Hello / 指纹登录」按钮（浏览器支持才显示，不支持/非 HTTPS 降级为仅动态码）
- 设置页：「登录设备」tab——注册/列表/改名/删除（纸墨设计语言）
- i18n 键（zh/en）

### 测试

- 后端单测：注册/认证/challenge 过期/counter 递增/删除/限流
- 前端 E2E：Playwright 虚拟认证器（webAuthn addCredential）跑通「注册→登录」链路

---

## 三、验收标准

1. 画师在设置页注册本设备后，登录页输 QQ → 点「Windows Hello 登录」→ 系统认证 → 直接进入后台（可测：Playwright 虚拟认证器）
2. TOTP 登录不受影响（并存）（可测）
3. 画师可注册多个设备、改名、删除；删除后该设备 Passkey 失效（可测）
4. 未注册 QQ 请求 Passkey 登录与动态码错误同响应（防枚举）（可测）
5. 不支持 WebAuthn 的浏览器（或非 HTTPS）登录页不显示 Passkey 按钮，仅动态码（可测）
6. 认证成功走与 TOTP 相同的会话/token 机制（cookie、isAdmin 判定不变）（可测）

---

## 四、待确认

| # | 事项 | 建议 |
|---|------|------|
| 1 | TOTP 并存（不替代） | 建议并存，TOTP 兜底 |
| 2 | 多设备多凭据 | 建议支持（WebAuthn 天然支持） |
| 3 | 设备名自动生成 | 建议自动填「浏览器+系统」名，可改 |
| 4 | 开发量 | 预计 3~5 天（后端 2-3 + 前端 1-2） |

---

## 五、边界声明

- 本 REQ 只做画师登录的 Passkey 能力；管理后台/客户端登录（若有）不涉及
- 不引入外部身份服务（Google/微软登录）——Passkey 走设备自带认证器
- 不替代 TOTP，不做「忘记所有凭据」自助恢复（兜底仍靠 TOTP + 管理员 CLI 重绑，REQ-027 既有）
