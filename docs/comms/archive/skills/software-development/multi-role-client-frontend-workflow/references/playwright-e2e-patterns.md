# Playwright E2E patterns (artist-commission, v0.21)

Known-good templates for the 5-route E2E suite. All hard-won — see SKILL.md pitfalls for WHY each choice exists. Adapt paths/ports to the dispatch.

## Architecture

```
root/
  package.json            # NEW: "type":"module", "test:e2e":"playwright test", @playwright/test devDep
  playwright.config.js    # NEW: chromium, workers:1, globalSetup/Teardown
  e2e/
    global-setup.js       # clean → deps → build web → seed DB → spawn server:3999 → health poll → pre-login → .tokens.json
    global-teardown.js    # kill server → delete test.db/uploads/.tokens.json
    fixtures/auth.js      # read .tokens.json, inject cookie + localStorage, force zh-CN
    tests/e1..e5-*.spec.js
```

Server isolation = env vars on the spawned process: `DB_PATH=<abs>/e2e/test.db`, `UPLOAD_DIR=<abs>/e2e/test-uploads`, `AUTH_DEV_MODE=true`, `ADMIN_QQ=10003`, `WEB_DIST=<abs>/web/dist`, `PORT=3999`, `NODE_ENV=development`. The app reads `DB_PATH` in `server/src/db/connection.js` and serves the SPA from `WEB_DIST` (app.js fallback). Seed via `node src/db/seed.js` (cwd `server/`, env `DB_PATH`+`ADMIN_QQ`) — seed.js calls initDatabase internally (migrations + admin bootstrap).

## playwright.config.js

```js
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  retries: 1,
  workers: 1,            // shared single server + DB — never parallel
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3999', trace: 'on-first-retry', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  globalSetup: './e2e/global-setup.js',
  globalTeardown: './e2e/global-teardown.js'
})
```

## global-setup.js (key parts)

```js
import { execSync, spawn } from 'child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEST_DB = resolve(ROOT, 'e2e/test.db')
const TEST_UPLOADS = resolve(ROOT, 'e2e/test-uploads')
const PID_FILE = resolve(ROOT, 'e2e/.server-pid')
const TOKENS_FILE = resolve(ROOT, 'e2e/.tokens.json')
const PORT = 3999

async function apiLogin(baseURL, qqNumber) {           // native fetch, NOT page.request
  const send = await (await fetch(`${baseURL}/api/auth/send-code`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qqNumber })
  })).json()
  if (!send._dev_code) throw new Error(`no dev code for ${qqNumber}`)   // AUTH_DEV_MODE returns it
  const verify = await fetch(`${baseURL}/api/auth/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qqNumber, code: send._dev_code })
  })
  if (!verify.ok) throw new Error(`verify ${verify.status}`)            // .ok is a PROPERTY
  const cookie = (verify.headers.getSetCookie?.() || []).find(c => c.startsWith('artist_token='))
  return cookie.split(';')[0].split('=').slice(1).join('=')
}

export default async function globalSetup() {
  // 1. clean (DB + wal/shm/journal + uploads)
  // 2. if (!existsSync(web/dist/index.html)) { npm install (if no web/node_modules/.bin) ; npm run build } cwd web/
  // 3. if (!existsSync(server/node_modules/.bin)) npm install cwd server/
  //    execSync('node src/db/seed.js', { cwd: server, env: {...env, DB_PATH: TEST_DB, ADMIN_QQ:'10003'} })
  // 4. spawn('node', ['src/index.js'], { cwd: server, env: {PORT,DB_PATH,UPLOAD_DIR,AUTH_DEV_MODE,ADMIN_QQ,WEB_DIST,NODE_ENV} })
  //    writeFileSync(PID_FILE, String(server.pid))
  // 5. poll GET /api/health until ok (30s deadline, 500ms sleep)
  // 6. writeFileSync(TOKENS_FILE, JSON.stringify({ artist: await apiLogin(base,'10001'), admin: await apiLogin(base,'10003') }))
}
```

New worktrees have NO node_modules — the `npm install` guards (check `node_modules/.bin`) are mandatory or `npm run build`/`seed.js` fail with "vite is not recognized" / "Cannot find package 'dotenv'".

## fixtures/auth.js

```js
import { test as base } from '@playwright/test'
import { readFileSync } from 'fs'
const tokens = JSON.parse(readFileSync(new URL('../.tokens.json', import.meta.url), 'utf8'))

async function authedContext(browser, token, isAdmin = false) {
  const context = await browser.newContext()
  await context.addCookies([{ name: 'artist_token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await context.addInitScript((admin) => {
    localStorage.setItem('artist_logged_in', '1')
    localStorage.setItem('artist_is_admin', admin ? '1' : '0')   // admin guard reads this, NOT the cookie
    localStorage.setItem('huiyue-locale', 'zh-CN')               // browser defaults en-US else
  }, isAdmin)
  return context
}

export const test = base.extend({
  page: async ({ page }, use) => {                                // force zh-CN for plain client tests too
    await page.addInitScript(() => localStorage.setItem('huiyue-locale', 'zh-CN'))
    await use(page)
  },
  artistPage: async ({ browser }, use) => {
    const ctx = await authedContext(browser, tokens.artist)
    await use(await ctx.newPage()); await ctx.close()
  },
  adminPage: async ({ browser }, use) => {
    const ctx = await authedContext(browser, tokens.admin, true)
    await use(await ctx.newPage()); await ctx.close()
  }
})
export { expect } from '@playwright/test'
```

## Test-writing rules that bit us

- **Force zh-CN** (above) or every Chinese selector times out.
- **Scope + exact + CSS classes** to dodge strict-mode collisions:
  `page.locator('.el-dialog').getByRole('button', { name: '添加', exact: true })`,
  `drawer.locator('.stage-name', { hasText: stageName })` (NOT `getByText` — name renders in 2 spots).
- **API-assisted setup** (create an order to query/advance): `page.request.post('http://localhost:3999/api/orders', { data: {...} })` in the TEST BODY works fine (hang is fixture-setup-only). Public route, no login needed.
- **Intercept the real response when a form "silently" won't submit:**
  ```js
  const [resp] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/admin/artists') && r.request().method() === 'POST', { timeout: 10_000 }),
    page.locator('.el-dialog__footer .el-button--primary').click()
  ])
  expect(resp.ok()).toBeTruthy()   // a 400 body names the exact rejected field
  ```
- **Hyphen-free subdomains** for add-artist tests (backend derives artistCode = subdomain.toUpperCase(), validated letters+digits only).
- **Debug loop:** run `npx playwright test e4 --retries=0` (single file, no retry) → read `test-results/<name>/error-context.md` (accessibility tree at failure) → fix selector → repeat. Full suite: `npm run test:e2e`.

## .gitignore additions

```
test-results/
playwright-report/
playwright/.cache/
e2e/test.db*
e2e/test-uploads/
e2e/.server-pid
e2e/.tokens.json
```

## CI integration (GitHub Actions, v0.22 A2)

Known-good `.github/workflows/e2e.yml` — global-setup already does web/server dep-install + build + server-spawn + pre-login, so CI only needs root deps + chromium:

```yaml
name: E2E
on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install root dependencies
        run: npm ci
      - name: Install web dependencies        # pre-install for CI cache; global-setup would do it anyway
        run: npm ci
        working-directory: web
      - name: Install server dependencies
        run: npm ci
        working-directory: server
      - name: Install Playwright Chromium
        run: npx playwright install chromium --with-deps   # --with-deps adds OS libs
      - name: Run E2E tests
        run: npm run test:e2e
      - name: Upload test report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

Notes: no `cache:` on setup-node at root (root lockfile is tiny; web/server caches would need per-job `cache-dependency-path` — simpler to let global-setup's guards handle it). The web/server pre-install steps exist purely to warm the npm cache layer; they're removable without breaking anything.

## Results achieved (v0.21)

5 routes (client order / client track / artist advance-stage / admin add-artist / admin configure-workflow), all green in **12.9s** total (45s on a fresh worktree where global-setup must install server deps first). Frontend 87/87 + backend 469/469 unaffected. Zero `server/` or `web/` files touched (P5 isolation).

**Fresh-worktree gotcha:** a new worktree has no ROOT `node_modules` either — `npm run test:e2e` fails with `'playwright' is not recognized`. Fix: `npm install` at the worktree ROOT (then `npx playwright install chromium` if the browser cache is also cold), not just in `web/`. The suite then doubles as the best regression net for risky global changes (see the A4 EP-CSS entry in SKILL.md).
