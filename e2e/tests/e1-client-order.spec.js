import { test, expect } from '../fixtures/auth.js'

// E1: 客户下单 — 下单页 → 选尺寸 → 选增项 → 填表 → 提交 → 成功提示
// SPEC-PRICE-2：画风模型唯一（单画风退化为 4 步：选尺寸→选增项→写需求→联系方式）
test('E1 客户下单完整流程', async ({ page }) => {
  await page.goto('/artist/alice/order')
  await expect(page.locator('.step-indicator')).toBeVisible()

  // ── 步骤一：选尺寸 ──
  await page.locator('.size-pick').first().click()
  await expect(page.locator('.size-pick--on')).toHaveCount(1)
  await page.getByRole('button', { name: '下一步' }).click()

  // ── 步骤二：选增项（可不选直接下一步） ──
  await expect(page.getByText('增项与加急')).toBeVisible() // addonStepTitle
  await page.getByRole('button', { name: '下一步' }).click()

  // ── 步骤三：写需求 ──
  await expect(page.getByText('描述你的需求')).toBeVisible() // locator-ok: step2Title 唯一（step-indicator 用短文本「写需求」不同文案）
  await page.locator('textarea').fill('E2E 测试约稿：一只猫')
  await page.getByRole('button', { name: '下一步' }).click()

  // ── 步骤四：联系方式 ──
  await expect(page.getByText('留下联系方式')).toBeVisible() // locator-ok: step3Title 唯一（step-indicator 用「联系方式」不同文案）
  await page.getByPlaceholder('画师会通过QQ联系你').fill('99999')
  // 勾选须知（Alice 有须知内容）
  await page.getByText('我已阅读并同意以上约稿须知').click() // locator-ok: agreeLabel 唯一（校验错误提示是「请勾选…」不同文案）
  await page.getByRole('button', { name: /提交约稿/ }).click()

  // ── 小票确认（CSS 类选择器，语言无关） ──
  await expect(page.locator('.receipt')).toBeVisible()
  await page.locator('.receipt-btn--primary').click()

  // ── 成功 ──
  await expect(page.getByText('约稿提交成功！')).toBeVisible({ timeout: 10_000 }) // locator-ok: successTitle 唯一（dialog 懒渲染）
})
