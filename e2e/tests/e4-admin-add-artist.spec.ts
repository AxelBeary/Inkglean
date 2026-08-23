import { test, expect } from '../fixtures/auth.js'

// E4: 管理员添加画师 — 管理后台 → 填画师信息 → 提交 → 列表出现
test('E4 管理员添加画师', async ({ adminPage: page }) => {
  await page.goto('/admin/artists')
  // 页面标题（管理端导航项与页面 h1 均有「画师管理」，用 heading 定位页面标题避免 strict violation）
  await expect(page.getByRole('heading', { name: '画师管理' })).toBeVisible()

  // 打开添加弹窗
  await page.getByRole('button', { name: '+ 添加画师' }).click()
  await expect(page.locator('.el-dialog')).toBeVisible()

  // 填写表单
  const ts = Date.now().toString().slice(-6)
  await page.getByPlaceholder('画师的QQ号（用于登录）').fill(`2${ts}`)
  await page.getByPlaceholder('展示给客户的名字').fill(`E2E画师${ts}`)
  await page.getByPlaceholder('如 alice（小写字母/数字）').fill(`e2e${ts}`)

  // 提交并等待 API 响应（诊断：确认请求是否发出 + 状态码）
  const [response] = await Promise.all([
    page.waitForResponse(
      resp => resp.url().includes('/api/admin/artists') && resp.request().method() === 'POST',
      { timeout: 10_000 }
    ),
    page.locator('.el-dialog__footer .el-button--primary').click()
  ])
  expect(response.ok()).toBeTruthy()

  // 动态画师名：scope 到桌面表格 tbody（与 E3 同模式，防未来移动卡片双布局 strict）
  await expect(page.locator("tbody").getByText(`E2E画师${ts}`)).toBeVisible({ timeout: 10_000 })
})
