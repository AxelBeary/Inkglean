import { test as base, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { readTokens } from '../token-store.js'
import { E2E_HOST, E2E_BASE_URL } from '../../playwright.config.js'

// v0.21: 共享登录 fixture（P3）
// token 由 globalSetup 预登录写入 .tokens.json；fixture 每次使用时重读文件
//（不网络请求，不触发限流）——E8 登出后写回的新 token 可立即被重试/后续用例读到
// 所有上下文强制 zh-CN + 注入 localStorage 标记
// B6（F0047/F0048/F0049）: 入 cookie 前先校验 token 非空、cookie domain 剥壳成纯主机名、
// 管理员身份先经真实 /auth/me 服务端核实——三者此前均为「静默半态 → 用例全程未登录假跑」的口子。

/** F0048: E2E_HOST 环境变量可能是 'host' / 'host:port' / 'http://host:port' 等形态，
 *  addCookies 的 domain 只接受纯主机名；原样透传会被静默拒配，用例全程未登录。 */
function resolveCookieDomain(host: string): string {
  let hostname: string
  try {
    hostname = new URL(host.includes('://') ? host : `http://${host}`).hostname
  } catch {
    throw new Error(`E2E_HOST="${host}" 无法解析为主机名，cookie domain 配置不合法`)
  }
  if (!hostname) throw new Error(`E2E_HOST="${host}" 解析出空主机名，cookie domain 配置不合法`)
  return hostname
}

/** F0047: readTokens() 结果先校验再入 cookie——.tokens.json 缺键/空值/半态写入时
 *  原 cookie value 会变成 'undefined' 字符串，用例静默跑成未登录态（假绿难排查）。 */
function requireToken(tokens: { artist?: unknown; admin?: unknown }, key: 'artist' | 'admin'): string {
  const value = tokens[key]
  if (typeof value !== 'string' || !value) {
    throw new Error(`.tokens.json 缺少可用的 ${key} token（global-setup 预登录可能失败），中止用例而非静默未登录`)
  }
  return value
}

/** F0049: 管理员身份不再纯靠 localStorage 标志伪装——先用真实 admin token 走一次
 *  /api/auth/me（与 useSessionGuard 同款真实登录态判定路径）核实服务端确实判 isAdmin；
 *  核实失败 fail-fast，杜绝 token 半态下管理用例假绿。 */
async function assertAdminToken(token: string): Promise<void> {
  const res = await fetch(`${E2E_BASE_URL}/api/auth/me`, { headers: { cookie: `artist_token=${token}` } })
  if (!res.ok) {
    throw new Error(`管理员 token 经 /api/auth/me 核实失败（HTTP ${res.status}），不伪装 localStorage 标志继续跑`)
  }
  const me = await res.json() as { isAdmin?: unknown }
  if (me.isAdmin !== true) {
    throw new Error('管理员 token 经 /api/auth/me 核实 isAdmin=false，E2E 管理员身份与真实登录态不符')
  }
}

async function createAuthedContext(browser: Browser, token: string, isAdmin: boolean = false): Promise<BrowserContext> {
  const context = await browser.newContext()
  await context.addCookies([
    // F0048: domain 统一经 resolveCookieDomain 剥壳（scheme/端口残留即 fail-fast）
    { name: 'artist_token', value: token, domain: resolveCookieDomain(E2E_HOST), path: '/', httpOnly: true, sameSite: 'Lax' }
  ])
  await context.addInitScript((admin: boolean) => {
    localStorage.setItem('artist_logged_in', '1')
    localStorage.setItem('artist_is_admin', admin ? '1' : '0')
    localStorage.setItem('huiyue-locale', 'zh-CN')
  }, isAdmin)
  return context
}

export const test = base.extend<{ artistPage: Page; adminPage: Page }>({
  // 覆盖默认 page：强制 zh-CN（E1/E2 客户端测试用）
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('huiyue-locale', 'zh-CN'))
    await use(page)
  },

  /** 画师登录（Alice, QQ 10001） */
  artistPage: async ({ browser }, use) => {
    const tokens = readTokens()
    const context = await createAuthedContext(browser, requireToken(tokens, 'artist'))
    const page = await context.newPage()
    await use(page)
    await context.close()
  },

  /** 管理员登录（Admin, QQ 10003） */
  adminPage: async ({ browser }, use) => {
    const tokens = readTokens()
    const adminToken = requireToken(tokens, 'admin')
    await assertAdminToken(adminToken) // F0049: localStorage 标志前先核实真实登录态
    const context = await createAuthedContext(browser, adminToken, true)
    const page = await context.newPage()
    await use(page)
    await context.close()
  }
})

export { expect } from '@playwright/test'
