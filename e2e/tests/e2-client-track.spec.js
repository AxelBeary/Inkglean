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
  await expect(page.getByText('查询进度')).toBeVisible() // locator-ok: TrackOrder 页仅 el-page-header content 渲染（导航/首页入口不在本页 DOM）

  // 填写查询表单
  await page.getByPlaceholder('下单时填写的QQ号').fill('88888')
  await page.getByPlaceholder('如果不记得请留空').fill(orderNo)
  await page.getByRole('button', { name: '查询' }).click()

  // 看到订单信息
  // 动态订单号：scope 到查询结果卡片（防未来双布局/重复文本 strict；桌面无移动卡片时仍安全）
  await expect(page.locator('.el-card', { hasText: orderNo }).getByText(orderNo)).toBeVisible({ timeout: 10_000 })
  // 新订单自动接入工作流（R30d），应显示流程进度
  await expect(page.locator('.timeline-block')).toBeVisible()
})
