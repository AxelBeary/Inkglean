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
  // exact:true：F1 令牌化后页内 link-hint 文案含「查询进度」子串，防 strict 双命中
  await expect(page.getByText('查询进度', { exact: true })).toBeVisible({ timeout: 10_000 })

  // 看到订单信息
  // 锁定结果卡内 .my-order-no 单元素（F1 令牌化后卡内另有「订单号: xxx」 span，防 strict 双命中）
  await expect(page.locator('.el-card', { hasText: orderNo }).locator('.my-order-no')).toBeVisible({ timeout: 10_000 })
  // 新订单自动接入工作流（R30d），应显示流程进度
  await expect(page.locator('.timeline-block')).toBeVisible({ timeout: 10_000 })
  // 已保存的追踪链接清单应包含该订单
  await expect(page.locator('.my-orders-card').getByText(orderNo)).toBeVisible()
})
