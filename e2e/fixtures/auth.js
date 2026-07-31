import { test as base } from '@playwright/test'
import { readFileSync } from 'fs'

// v0.21: 共享登录 fixture（P3）
// token 由 globalSetup 预登录写入 .tokens.json，fixture 只读文件（不网络请求，不触发限流）
// 所有上下文强制 zh-CN + 注入 localStorage 标记

const tokens = JSON.parse(readFileSync(new URL('../.tokens.json', import.meta.url), 'utf8'))

async function createAuthedContext(browser, token, isAdmin = false) {
  const context = await browser.newContext()
  await context.addCookies([
    { name: 'artist_token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }
  ])
  await context.addInitScript((admin) => {
    localStorage.setItem('artist_logged_in', '1')
    localStorage.setItem('artist_is_admin', admin ? '1' : '0')
    localStorage.setItem('huiyue-locale', 'zh-CN')
  }, isAdmin)
  return context
}

export const test = base.extend({
  // 覆盖默认 page：强制 zh-CN（E1/E2 客户端测试用）
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('huiyue-locale', 'zh-CN'))
    await use(page)
  },

  /** 画师登录（Alice, QQ 10001） */
  artistPage: async ({ browser }, use) => {
    const context = await createAuthedContext(browser, tokens.artist)
    const page = await context.newPage()
    await use(page)
    await context.close()
  },

  /** 管理员登录（Admin, QQ 10003） */
  adminPage: async ({ browser }, use) => {
    const context = await createAuthedContext(browser, tokens.admin, true)
    const page = await context.newPage()
    await use(page)
    await context.close()
  }
})

export { expect } from '@playwright/test'
