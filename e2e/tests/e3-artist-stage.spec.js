import { test, expect } from '../fixtures/auth.js'
import { E2E_BASE_URL } from '../../playwright.config.js'

// E3: 画师改状态 — 登录 → 订单详情 → 改阶段 → 成功
test('E3 画师推进流程节点', async ({ artistPage: page }) => {
  // 通过 API 创建订单（公开接口）
  const res = await page.request.post(`${E2E_BASE_URL}/api/orders`, {
    data: {
      subdomain: 'alice',
      clientQq: '77777',
      description: 'E2E 画师改状态测试',
      agreeRules: true
    }
  })
  expect(res.ok()).toBeTruthy()
  const { orderNo } = await res.json()

  // 进入订单列表，找到该订单（订单列表有移动卡片 + 桌面表格双布局：移动端 order-card-no 在桌面视口 display:none，
  // 必须定位桌面表格 tbody 内的单元格——之前 .first() 会选中隐藏的移动元素导致 toBeVisible 超时）
  await page.goto('/orders')
  await expect(page.locator('tbody').getByText(orderNo)).toBeVisible({ timeout: 10_000 })

  // 点击该订单行的"详情"按钮
  const row = page.locator('tr', { hasText: orderNo })
  await row.getByRole('button', { name: '详情' }).click()

  // 订单详情页：应显示流程进度
  await expect(page.getByText(/进度 \d+\/\d+/)).toBeVisible({ timeout: 10_000 }) // locator-ok: OrderDetail 仅 stage-progress-text 一处

  // 点击"推进到"按钮（新订单在第一个节点，推进到第二个）
  const advanceBtn = page.getByRole('button', { name: /推进到/ })
  await expect(advanceBtn).toBeVisible()
  // 记录推进目标节点名（按钮文案「推进到：X」）与当前进度，供点击后复核状态真实变化
  const targetStageName = (await advanceBtn.textContent()).replace(/^推进到[:：]\s*/, '').trim()
  expect(targetStageName).toBeTruthy()
  const progressText = page.locator('.stage-progress-text')
  const beforeProgress = (await progressText.textContent()).trim()
  const beforeProgressMatch = beforeProgress.match(/进度 (\d+)\/(\d+)/)
  expect(beforeProgressMatch).toBeTruthy()
  await advanceBtn.click()

  // 成功提示（ElMessage toast）
  await expect(page.getByText('流程已更新')).toBeVisible({ timeout: 10_000 }) // locator-ok: ElMessage toast 一次性出现

  // E1 加固：toast 之外复核状态真实变化——进度前进一格、当前节点高亮落到按钮预告的目标节点
  await expect(progressText).not.toHaveText(beforeProgress)
  const afterProgressMatch = (await progressText.textContent()).trim().match(/进度 (\d+)\/(\d+)/)
  expect(afterProgressMatch).toBeTruthy()
  expect(Number(afterProgressMatch[2])).toBe(Number(beforeProgressMatch[2]))
  expect(Number(afterProgressMatch[1])).toBe(Number(beforeProgressMatch[1]) + 1)
  await expect(page.locator('.tl-node.current .tl-name')).toHaveText(targetStageName)
})
