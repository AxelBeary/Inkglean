# TOTP 认证配方 + 端口隔离（v0.37 起，浏览器实测必读）

> ⚠️ `huiyue-browser-regression-testing` 技能正文的认证配方已过时：`POST /api/auth/send-code` + `_dev_code` 在 v0.37 移除（login_codes 表已删，迁移 v41）。照旧配方走必 404。该技能非 agent 创建、curator 无法自动改，**以本文件为准**。

## 登录接口（TOTP，REQ-027）

`POST /api/auth/verify`，body `{ qqNumber, code }`，code = 6 位 TOTP 动态码。成功返回 set-cookie `artist_token`（httpOnly）；401 含剩余锁定时间。限流：同 IP 10 次/5 分钟。

## 动态码不用手机——服务端纯函数直接算

`server/src/features/auth/totp.ts` 零依赖纯函数（Node crypto），tsx 可 import：

```js
import { computeTotp } from './server/src/features/auth/totp.js'
const code = computeTotp(artist.totp_secret, Date.now())  // 校验 ±1 窗口容错
const verify = await fetch(`${BASE}/api/auth/verify`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ qqNumber: '10001', code })
})
const token = verify.headers.getSetCookie().find(c => c.startsWith('artist_token=')).split(';')[0].split('=').slice(1).join('=')
```

Playwright/Hermes 浏览器注入：
```js
await context.addCookies([{ name: 'artist_token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }])
```

## 前置：画师必须已绑定 TOTP

`totp_secret` 非空且 `totp_verified = 1`。测试库直接写：
```sql
UPDATE artists SET totp_secret = 'JBSWY3DPEHPK3PXP', totp_verified = 1 WHERE qq_number = '10001';
```
密钥为任意合法 Base32（RFC 4648，大写+2-7，32 字符）。

## 端口隔离（v0.38 教训）

3000 端口被生产容器 `commission-web` 占用，**绝不能杀**。worktree 起隔离实例：
```powershell
$env:PORT='3100'; $env:DB_PATH='./data/test-<批次>.db'; npm start   # server/ 目录
```
- 测试库首启自动跑全部迁移（v41+），再 seed 最小数据；测完删库文件
- `web/vite.config.js` proxy 写死 `localhost:3000`——实测时临时改指 3100，**勿 commit**

## 接力批次收尾顺序（v0.38 第四轮撞上限教训）

浏览器截图/实测是最耗迭代的一步。**先 commit 已完成的代码（含"截图进行中"注释的 commit）锁定成果，再开实测**。撞迭代上限时工作区未 commit 的改动全靠下一轮 `git status` 抢救——交接话术必须写明"第一件事：检查工作区未 commit 文件并逐个 add + commit"。
