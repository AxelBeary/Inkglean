import { test, expect } from '../fixtures/auth.js'

// E2: 客户查进度 — 进度页 → 输入订单号+QQ → 看到阶段信息
test('E2 客户查进度', async ({ page }) => {
  // 先通过 API 创建一笔订单（公开接口，无需登录）
  const res = await page.request.post('http://localhost:3999/api/orders', {
    data: {
      subdomain: 'alice',
      clientQq: '88888',
      clientName: 'E2E查进度',
      description: 'E2E 测试订单',
      agreeRules: true
    }
  })
  expect(res.ok()).toBeTruthy()
  const { orderNo } = await res.json()
  expect(orderNo).toBeTruthy()

  // 进入进度查询页
  await page.goto('/artist/alice/track')
  await expect(page.getByText('查询进度')).toBeVisible()

  // 填写查询表单
  await page.getByPlaceholder('下单时填写的QQ号').fill('88888')
  await page.getByPlaceholder('如果不记得请留空').fill(orderNo)
  await page.getByRole('button', { name: '查询' }).click()

  // 看到订单信息
  await expect(page.getByText(orderNo)).toBeVisible({ timeout: 10_000 })
  // 新订单自动接入工作流（R30d），应显示流程进度
  await expect(page.locator('.timeline-block')).toBeVisible()
})
