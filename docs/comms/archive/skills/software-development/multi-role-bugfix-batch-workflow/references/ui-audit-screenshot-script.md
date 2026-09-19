# UI Audit Screenshot Script Template

Playwright script for capturing authenticated full-page screenshots of all artist dashboard pages. Used in "UI visual audit" mode.

## Prerequisites

- `npm install` at project root (installs `@playwright/test` from root `package.json` devDependencies)
- Docker container running with `AUTH_DEV_MODE=true` (returns `_dev_code` in send-code response)
- Playwright browsers installed (`npx playwright install chromium` — usually already present from E2E setup)

## Script template (e2e/audit-screenshots.mjs)

```js
/**
 * 五号审计截图脚本 — 逐页截取画师后台页面
 * 用法: node e2e/audit-screenshots.mjs
 * 产出: docs/audit-screenshots/*.png
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'docs/audit-screenshots')
const BASE = 'http://localhost:3000'

mkdirSync(OUT, { recursive: true })

// 1. 登录拿 token（AUTH_DEV_MODE=true 时 _dev_code 直接返回）
const sendRes = await fetch(`${BASE}/api/auth/send-code`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ qqNumber: '10001' })
})
const sb = await sendRes.json()
if (!sb._dev_code) throw new Error('未获取到开发登录码（需要 AUTH_DEV_MODE=true）')

const verRes = await fetch(`${BASE}/api/auth/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ qqNumber: '10001', code: sb._dev_code })
})
const setCookie = verRes.headers.getSetCookie?.() || []
const tokenCookie = setCookie.find(c => c.startsWith('artist_token='))
if (!tokenCookie) throw new Error('未收到 artist_token')
const token = tokenCookie.split(';')[0].split('=').slice(1).join('=')

// 2. 启动浏览器
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN'
})
await context.addCookies([
  { name: 'artist_token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }
])
await context.addInitScript(() => {
  localStorage.setItem('artist_logged_in', '1')
  localStorage.setItem('artist_is_admin', '0')
  localStorage.setItem('huiyue-locale', 'zh-CN')
})

const page = await context.newPage()

// 3. 页面清单（按审计需要调整）
const pages = [
  { name: '01-login', path: '/login' },
  { name: '02-dashboard', path: '/dashboard' },
  { name: '03-queue-board', path: '/queue' },
  { name: '04-orders', path: '/orders' },
  { name: '05-manual-order', path: '/orders/new' },
  { name: '06-order-detail', path: '/orders/1' },
  { name: '07-slots', path: '/slots' },
  { name: '08-tiers', path: '/tiers' },
  { name: '09-artworks', path: '/artworks' },
  { name: '10-guestbook', path: '/guestbook' },
  { name: '11-settings', path: '/settings' },
]

for (const p of pages) {
  try {
    await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(1000) // 等动画/渲染稳定
    const file = resolve(OUT, `${p.name}.png`)
    await page.screenshot({ path: file, fullPage: true })
    console.log(`✅ ${p.name} → ${file}`)
  } catch (e) {
    console.error(`❌ ${p.name}: ${e.message}`)
  }
}

await browser.close()
console.log('\n🏁 截图完成')
```

## Usage notes

- Run from project root: `node e2e/audit-screenshots.mjs`
- For admin pages, change qqNumber to admin QQ (e.g. '10003') and set `artist_is_admin` to '1'
- For mobile screenshots, change viewport to `{ width: 375, height: 812 }`
- Script is a TEMPORARY artifact — do NOT commit. Delete after audit is committed.
- Token file (if saved separately) contains session credentials — delete immediately after use.

## vision_analyze size limits (2026-08-02)

Empirical findings from the v0.28 audit:
- <50KB PNGs: vision_analyze works reliably (login page, empty states)
- 50-100KB: intermittent timeouts, retry once max
- >100KB: consistent timeouts — do NOT attempt, use source code analysis instead

Typical sizes: login ~28KB, dashboard ~152KB, queue ~101KB, orders ~93KB, manual-order ~258KB, order-detail ~28KB, slots ~82KB, tiers ~365KB, artworks ~260KB, guestbook ~43KB, settings ~110KB.

Strategy: analyze small pages via vision, analyze large pages via source code reading (template structure + CSS classes + component composition). Note in the audit report which method was used per page.
