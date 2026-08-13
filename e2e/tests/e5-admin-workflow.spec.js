import { test, expect } from '../fixtures/auth.js'

// E5: 管理员配置流程 — 管理后台 → 画师详情 → 流程标签 → 添加阶段 → 列表更新
test('E5 管理员配置画师流程', async ({ adminPage: page }) => {
  await page.goto('/admin/artists')
  // 页面标题（管理端导航项与页面 h1 均有「画师管理」，用 heading 定位页面标题避免 strict violation）
  await expect(page.getByRole('heading', { name: '画师管理' })).toBeVisible()

  // 点击 Alice 行的"管理"按钮，打开详情抽屉
  const aliceRow = page.locator('tr', { hasText: 'Alice' })
  await aliceRow.getByRole('button', { name: '管理' }).click()

  // 切换到"流程与比例"标签
  await page.getByRole('tab', { name: '流程与比例' }).click()

  // 等待流程编辑器加载（限定在抽屉内）
  const drawer = page.locator('.el-drawer')
  await expect(drawer.getByText('流程节点')).toBeVisible({ timeout: 10_000 })

  // 添加新阶段（限定在抽屉内，避免匹配页面上的“+ 添加画师”按钮）
  // b5 无障碍化后阶段说明也是真按钮（.stage-desc，含「添加」字样），限 el-button 防 strict 多命中
  const stageName = `E2E阶段-${Date.now().toString().slice(-4)}`
  await drawer.getByPlaceholder('新节点名称，如「细化确认」').fill(stageName)
  await drawer.locator('button.el-button').filter({ hasText: '添加' }).click()

  // 新阶段出现在流程节点列表中（.stage-name 避免匹配流程全览的 .strip-name）
  await expect(drawer.locator('.stage-name', { hasText: stageName })).toBeVisible({ timeout: 10_000 })
})
