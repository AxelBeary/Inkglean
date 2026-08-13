import { test, expect } from '../fixtures/auth.js'

// E2: 客户查进度 — 下单响应取 customerToken，凭令牌链接直达 → 看到阶段信息
// F1 围剿：QQ+订单号弱双因子已退役，查询身份 = 高熵令牌
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
  const { orderNo, customerToken } = await res.json()
  expect(orderNo).toBeTruthy()
  expect(customerToken).toBeTruthy()

  // 带 no+token 直达进度页（自动查询并保存到本地清单）
  await page.goto(`/artist/alice/track?no=${encodeURIComponent(orderNo)}&token=${encodeURIComponent(customerToken)}`)
  await expect(page.getByText('查询进度')).toBeVisible({ timeout: 10_000 })

  // 看到订单信息
  // 动态订单号：scope 到查询结果卡片（防未来双布局/重复文本 strict；桌面无移动卡片时仍安全）
  await expect(page.locator('.el-card', { hasText: orderNo }).getByText(orderNo)).toBeVisible({ timeout: 10_000 })
  // 新订单自动接入工作流（R30d），应显示流程进度
  await expect(page.locator('.timeline-block')).toBeVisible({ timeout: 10_000 })
  // 已保存的追踪链接清单应包含该订单
  await expect(page.locator('.my-orders-card').getByText(orderNo)).toBeVisible()
})
