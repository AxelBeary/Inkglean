---
name: huiyue-browser-regression-testing
description: "绘约(artist-commission)浏览器回归实测方法：Browserbase 崩→本地 Playwright 降级、e2e 认证配方、合成拖拽测 drop 守卫、造单/stageOff/取消清理、双布局选择器陷阱。触发：二号/五号在 artist-commission 做 UI 实测或交互诊断。"
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [artist-commission, playwright, e2e, regression, browser-testing]
    related_skills: [playwright-ui-diagnosis, multi-role-client-frontend-workflow]
---

# 绘约浏览器回归实测配方（v0.36 六路回归踩坑总结）

## 通道选择

1. **首选 Hermes 浏览器**（browser_navigate）：适合前几路、需要人眼判断的页面
2. **Browserbase 服务会崩**（症状：browser_navigate 报 os error 10060 超时 / console 报 localStorage Access is denied / 页面变 about:blank）。崩了别死等——**立刻降级本地 Playwright**，证据反而更可靠（请求计数、API 断言）
3. 降级步骤：worktree 根目录 `npm install`（@playwright/test）→ `npx playwright install chromium`（约 2 分钟）→ 写 `e2e/temp-*.mjs` 脚本 `node` 直跑（不用 playwright test runner，免配置）

## 认证配方（TOTP 动态口令，REQ-027 后 send-code 链路已删除）

旧 `send-code`/`_dev_code` 配方已失效。现走真实 TOTP：给测试库注入固定密钥 + RFC 6238 现算 6 位码（抄 `e2e/global-setup.js` 的 base32Decode/currentTotp 即可，零依赖纯 Node crypto）：

```js
const SECRET = 'JBSWY3DPEHPK3PXP' // RFC 6238 文档示例密钥，仅注入隔离测试库
// 1) better-sqlite3 直写：UPDATE artists SET totp_secret=?, totp_verified=1, totp_failed_attempts=0, totp_locked_until=NULL WHERE qq_number IN ('10001','10003')
// 2) currentTotp(SECRET) 现算 6 位码（30s 步长 HMAC-SHA1，代码在 e2e/global-setup.js L20-55）
const verify = await fetch(`${BASE}/api/auth/verify`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({qqNumber:'10001', code: currentTotp(SECRET)}) })
const token = verify.headers.getSetCookie().find(c=>c.startsWith('artist_token=')).split(';')[0].split('=').slice(1).join('=')
// Playwright context:
await context.addCookies([{name:'artist_token', value:token, domain:'localhost', path:'/', httpOnly:true, sameSite:'Lax'}])
await context.addInitScript(()=>{ localStorage.setItem('artist_logged_in','1') })
```

## 隔离测试环境（生产容器占 3000 时）

生产容器 `commission-web` 常驻 3000 端口，**不能动**。worktree 实测起隔离实例：
- seed 测试库：`$env:DB_PATH='...server/data/test-xxx.db'; npx tsx src/db/seed.js`（造 alice/bob + admin_qq=10003）
- **不要用 vite dev**（proxy 硬编码指向 3000）：`npm run build` 后用 WEB_DIST 模式——`PORT=3100 + DB_PATH=测试库 + WEB_DIST=web/dist + ADMIN_QQ=10003 + npm start`，SPA 由 server 直出
- 造特定状态数据（如逾期单）直接 SQL INSERT orders 表（先 `PRAGMA table_info(orders)` 核对列名，tier 是 tier_id 不是 tier_name）
- 画师后台主题断言：`document.documentElement.getAttribute('data-artist-theme')` 应为 paper/ink；**客户端路由下必须为 null**（验收 10 零影响检查项）
- EP date-picker 改期测试：日历面板 popper teleport 到 body 且单元格定位不稳（hidden 面板干扰），**直接 `input.fill('YYYY-MM-DD') + press('Enter')`** 走即时保存链路更可靠；toast 抓取用 MutationObserver 收 `.el-message`

## 合成拖拽（测 useDropGuard 类守卫）

守卫判 `dataTransfer.types` 含 'Files'。合成 DragEvent 直接构造 DataTransfer：
```js
const dt = new DataTransfer()
// 页内拖拽（应被拦）：dt.setData('text/html','<img>');  系统文件（对照放行）：dt.items.add(new File(['x'],'t.png',{type:'image/png'}))
target.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer:dt}))
// 断言 ev.defaultPrevented + MutationObserver 收 ElMessage toast
```
真实 setPointerCapture patch 不需要——DragEvent 路径不涉及 pointer。

## 陷阱清单

- **ManualOrder 双布局**：桌面 `.mo-col` + 移动 `el-container` 各渲染一套输入框。最终价格框用 `input[type=number][max="999999.99"]` 精确定位；`.last()`/`.first()` 盲选必错。档位卡 `.tier-card`，增项行 `.addon-item`（步进器 `.el-input-number__increase/__decrease`）
- **看板卡片**选择器 `.queue-item`（含 `.order-no` 显示 #ALICE-XXX），别用通用 card/bar 类（抓到布局容器）
- **新造订单自动接入工作流**：status 端点拒收（400 INVALID_TRANSITION）。要先 `PUT /stage {stageId:null}`（stageOff）才能走固定状态按钮
- **toast 3 秒自毁**：点击前先装 MutationObserver 写 `window.__msgLog`，事后读
- **演示数据纪律**：造单→测→取消；改价/收款→测→还原；报告逐项披露。临时脚本 `e2e/temp-*.mjs` 测完即删，交付时 git status 必须干净
- **vite dev** 起 worktree web/（`npm run dev`，5173），proxy 自动到容器 3000；worktree 无 node_modules 先装
- Hermes 浏览器里订单列表「详情」按钮点击可能不跳转（疑自动化环境问题），改 URL 直达 `/orders/{id}`

## 订单 ID 速查

`GET /api/artist/orders?page=1&pageSize=50`（带 cookie）→ items[].id/order_number/status/currentStageId
