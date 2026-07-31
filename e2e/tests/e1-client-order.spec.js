import { test, expect } from '../fixtures/auth.js'

// E1: 客户下单 — 画师主页 → 选档位 → 填表 → 提交 → 成功提示
test('E1 客户下单完整流程', async ({ page }) => {
  await page.goto('/artist/alice/order')
  await expect(page.locator('.step-indicator')).toBeVisible()

  // ── 步骤一：选档位 ──
  await page.locator('.tier-pick').first().click()
  await expect(page.locator('.tier-pick--on')).toHaveCount(1)
  await page.getByRole('button', { name: '下一步' }).click()

  // ── 步骤二：写需求 ──
  await expect(page.getByText('描述你的需求')).toBeVisible()
  await page.locator('textarea').fill('E2E 测试约稿：一只猫')
  await page.getByRole('button', { name: '下一步' }).click()

  // ── 步骤三：联系方式 ──
  await expect(page.getByText('留下联系方式')).toBeVisible()
  await page.getByPlaceholder('画师会通过QQ联系你').fill('99999')
  // 勾选须知（Alice 有须知内容）
  await page.getByText('我已阅读并同意以上约稿须知').click()
  await page.getByRole('button', { name: /提交约稿/ }).click()

  // ── 小票确认（CSS 类选择器，语言无关） ──
  await expect(page.locator('.receipt')).toBeVisible()
  await page.locator('.receipt-btn--primary').click()

  // ── 成功 ──
  await expect(page.getByText('约稿提交成功！')).toBeVisible({ timeout: 10_000 })
})
