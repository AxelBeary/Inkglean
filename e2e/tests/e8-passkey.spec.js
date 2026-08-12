import { test, expect } from '../fixtures/auth.js'

// e8: Passkey 虚拟验证器（CDP WebAuthn，仅 chromium；internal=平台验证器画像，对齐 Windows Hello）
// TC-PK-01 注册 + TC-PK-02 登出后免密登录合为一个用例：
// 虚拟验证器凭据绑定在 browser context 内，拆成两个用例需用 CDP addCredential 手工播种私钥
// （非真实 UI 链路），故在同一 context 中顺序覆盖两个场景，机械覆盖 counter 恒 0 豁免链路。
test('TC-PK-01/02 Passkey 注册 → 登出 → 免密登录（counter 恒 0 豁免）', async ({ artistPage: page }) => {
  const context = page.context()
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true
    }
  })

  // ── TC-PK-01 注册（cookie fixture 登录态 → /account → 注册本设备）──
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: '账号与安全' })).toBeVisible()

  const registerBtn = page.getByRole('button', { name: '注册本设备' })
  await expect(registerBtn).toBeVisible()
  await registerBtn.click()

  // 成功反馈：registerPasskey 成功后 loadCredentials 刷新，凭据表格出现条目
  const credTable = page.locator('.cred-table')
  await expect(credTable).toBeVisible({ timeout: 15_000 })
  await expect(credTable.locator('.el-table__row').first()).toBeVisible({ timeout: 15_000 })
  // 设备名由服务端按 UA 生成（Chrome · Windows 10），证明凭据已落库并回显
  await expect(credTable.getByText(/Chrome/)).toBeVisible()

  // ── TC-PK-02 登出（真实 UI 退出登录）→ Passkey 登录 ──
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

  await page.locator('#login-qq').fill('10001')
  const passkeyBtn = page.locator('.passkey-btn')
  await expect(passkeyBtn).toBeVisible()
  await passkeyBtn.click()

  // 落地断言：URL 离开 /login + dashboard 特征元素（internal transport 上报 counter=0，
  // 服务端 isCounterRegression 双侧 0 豁免，验证器断言必须被响应）
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
  await expect(page.locator('.stat-card--pending .stat-label')).toHaveText('待处理新单', { timeout: 10_000 })
})
