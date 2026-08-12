import { test, expect } from '@playwright/test'
import { E2E_TOTP_SECRET, currentTotp, nextStepTotp } from '../totp-util.js'

// e7: 登录 UI 旅程（裸 context，不注入 cookie，走真实 UI 全链路）
// 每个用例独立 context 防 cookie 串味；全部 zh-CN（localStorage huiyue-locale）

async function newLoginPage(browser) {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    localStorage.setItem('huiyue-locale', 'zh-CN')
  })
  const page = await context.newPage()
  return { context, page }
}

test('TC-LJ-01 登录页渲染', async ({ browser }) => {
  const { context, page } = await newLoginPage(browser)
  try {
    await page.goto('/login')

    // 品牌：卡片主标为 login.brandTitle=「拾绘」，完整品牌「拾绘 Inkglean」落在文档标题
    // （真实 DOM 无「拾绘 Inkglean」单节点，勿臆造选择器——两者都断言）
    await expect(page.locator('#login-title')).toHaveText('拾绘')
    await expect(page).toHaveTitle(/拾绘 Inkglean/)

    await expect(page.locator('#login-qq')).toBeVisible()
    await expect(page.locator('#login-code')).toBeVisible()
    await expect(page.locator('.login-btn')).toBeVisible()
    // REQ-039：seed 库 onboarding_mode=invite，入驻入口应显示
    await expect(page.locator('.invite-entry')).toBeVisible()
  } finally {
    await context.close()
  }
})

test('TC-LJ-02 错误动态码', async ({ browser }) => {
  const { context, page } = await newLoginPage(browser)
  try {
    await page.goto('/login')

    // 守卫：若当前真实码恰为 000000 则改用 999999，避免误命中
    const wrongCode = currentTotp(E2E_TOTP_SECRET) === '000000' ? '999999' : '000000'
    await page.locator('#login-qq').fill('10001')
    await page.locator('#login-code').fill(wrongCode)
    await page.locator('.login-btn').click()

    // errors.TOTP_INVALID 的 zh-CN 真实键值（locales/zh-CN.js）
    await expect(page.locator('#login-notice')).toHaveText('QQ号或动态口令错误')
    await expect(page).toHaveURL(/\/login/)
  } finally {
    await context.close()
  }
})

test('TC-LJ-03 正确登录 UI 全链路', async ({ browser }) => {
  const { context, page } = await newLoginPage(browser)
  try {
    await page.goto('/login')

    // 预登录已消费当前步码（重放防护）→ 必须用下一步码，服务端 ±1 窗口可命中
    const code = nextStepTotp(E2E_TOTP_SECRET)
    await page.locator('#login-qq').fill('10001')
    await page.locator('#login-code').fill(code)
    await page.locator('.login-btn').click()

    // 落地断言（不许只看没报错）：URL 离开 /login + dashboard 特征元素（待处理新单统计卡）
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })
    await expect(page.locator('.stat-card--pending .stat-label')).toHaveText('待处理新单', { timeout: 10_000 })
  } finally {
    await context.close()
  }
})
