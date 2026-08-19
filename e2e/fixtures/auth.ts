import { test as base, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { readTokens } from '../token-store.js'
import { E2E_HOST } from '../../playwright.config.js'

// v0.21: 共享登录 fixture（P3）
// token 由 globalSetup 预登录写入 .tokens.json；fixture 每次使用时重读文件
//（不网络请求，不触发限流）——E8 登出后写回的新 token 可立即被重试/后续用例读到
// 所有上下文强制 zh-CN + 注入 localStorage 标记

async function createAuthedContext(browser: Browser, token: string, isAdmin: boolean = false): Promise<BrowserContext> {
  const context = await browser.newContext()
  await context.addCookies([
    { name: 'artist_token', value: token, domain: E2E_HOST, path: '/', httpOnly: true, sameSite: 'Lax' }
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
    const context = await createAuthedContext(browser, tokens.artist)
    const page = await context.newPage()
    await use(page)
    await context.close()
  },

  /** 管理员登录（Admin, QQ 10003） */
  adminPage: async ({ browser }, use) => {
    const tokens = readTokens()
    const context = await createAuthedContext(browser, tokens.admin, true)
    const page = await context.newPage()
    await use(page)
    await context.close()
  }
})

export { expect } from '@playwright/test'
