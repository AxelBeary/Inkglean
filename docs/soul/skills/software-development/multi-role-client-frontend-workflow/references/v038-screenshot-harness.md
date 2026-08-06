# v0.38 换肤批截图验收 harness（二号交付验证配方）

> 2026-08-05 v0.38 视觉第一批交付时验证有效。适用于任何「双主题 × 多页面」换肤批的截图验收。

## 环境搭建（生产容器占 3000 端口时）

1. **不要动生产容器**（commission-web 常驻 3000，健康检查 healthy）。
2. seed 隔离测试库：`$env:DB_PATH='<worktree>/server/data/test-xxx.db'; npx tsx src/db/seed.js`（需 `$env:ADMIN_QQ='10003'`）。
3. 造特定状态数据（如逾期单）：better-sqlite3 直写 orders 表。**先 `PRAGMA table_info(orders)` 核对列名**（tier 是 `tier_id` JOIN，不存在 `tier_name` 列；第一次 INSERT 带错列名会报 table has no column）。
4. TOTP 密钥注入：`UPDATE artists SET totp_secret='JBSWY3DPEHPK3PXP', totp_verified=1, totp_failed_attempts=0, totp_locked_until=NULL WHERE qq_number IN ('10001','10003')`（RFC 6238 文档示例密钥，仅测试库用）。
5. **前端构建 + WEB_DIST 直出**（不用 vite dev——proxy 硬编码 3000）：`cd web && npm run build`，然后 `PORT=3100 + DB_PATH=测试库 + WEB_DIST=web/dist + ADMIN_QQ=10003 + npm start`。
6. 真实登录拿 cookie：RFC 6238 现算 6 位码（代码抄 e2e/global-setup.js L20-55，零依赖纯 crypto）→ POST /api/auth/verify → 从 Set-Cookie 取 artist_token。

## Playwright 浏览器可用性

`%USERPROFILE%\AppData\Local\ms-playwright` 不存在**不代表没装**。先探测：
```powershell
node -e "const {chromium}=require('playwright'); console.log(chromium.executablePath())"
# 然后 Test-Path 输出的路径（Hermes 环境预装在 hermes-home/cache/ms-playwright/）
```
缺了才 `npx playwright install chromium`。

## 截图脚本结构（e2e/temp-xxx-shots.mjs，测完即删）

- `context.addCookies` 注入 token + `addInitScript` 设 `localStorage.artist_logged_in='1'`（路由守卫约定）
- 每页 goto 后 `waitForSelector` 关键容器（如 `.date-card`）+ `waitForTimeout(600~900)` 等动效/字体
- **主题断言用 DOM 属性**：`document.documentElement.getAttribute('data-artist-theme')` 应为 paper/ink；**客户端路由下必须 null**（验收 10 零影响的硬证据）
- **刷新保持验证**：切墨黑 → reload → 属性仍 ink
- **改期行为**：EP 日历面板定位不稳，直接 `input.fill('YYYY-MM-DD') + press('Enter')` 走即时保存链路；toast 用 MutationObserver 收 `.el-message` 到 `window.__msgLog`
- 移动端：`setViewportSize({width:390,height:844})` 截一张再切回
- 脚本末尾打印全部行为证据（before/after 值、toast 文案、属性值），交付报告引用

## vision 核验策略

- 关键截图逐张 vision_analyze（问题要具体：chip 颜色/文字、色条、错位、对比度）
- **vision 偶发超时**：同一张图重试一次，仍超时换同主题的另一张图核验（信息等价即可），不要卡死
- 核验问题模板：语义色是否正确（逾期=朱砂、进行中=花青）+ 朱砂是否克制（不大面积铺红）+ 布局对齐 + 对比度
