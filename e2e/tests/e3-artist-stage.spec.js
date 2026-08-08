import { test, expect } from '../fixtures/auth.js'

// E3: 画师改状态 — 登录 → 订单详情 → 改阶段 → 成功
test('E3 画师推进流程节点', async ({ artistPage: page }) => {
  // 通过 API 创建订单（公开接口）
  const res = await page.request.post('http://localhost:3999/api/orders', {
    data: {
      subdomain: 'alice',
      clientQq: '77777',
      description: 'E2E 画师改状态测试',
      agreeRules: true
    }
  })
  expect(res.ok()).toBeTruthy()
  const { orderNo } = await res.json()

  // 进入订单列表，找到该订单（订单列表有移动卡片 + 桌面表格双布局，同订单号出现 2 次 → .first() 避免 strict violation）
  await page.goto('/orders')
  await expect(page.getByText(orderNo).first()).toBeVisible({ timeout: 10_000 })

  // 点击该订单行的"详情"按钮
  const row = page.locator('tr', { hasText: orderNo })
  await row.getByRole('button', { name: '详情' }).click()

  // 订单详情页：应显示流程进度
  await expect(page.getByText(/进度 \d+\/\d+/)).toBeVisible({ timeout: 10_000 })

  // 点击"推进到"按钮（新订单在第一个节点，推进到第二个）
  const advanceBtn = page.getByRole('button', { name: /推进到/ })
  await expect(advanceBtn).toBeVisible()
  await advanceBtn.click()

  // 成功提示（ElMessage toast）
  await expect(page.getByText('流程已更新')).toBeVisible({ timeout: 10_000 })
})
