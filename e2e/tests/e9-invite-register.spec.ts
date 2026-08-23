import { test, expect } from '../fixtures/auth.js'
import { E2E_BASE_URL } from '../../playwright.config.js'
import { currentTotp } from '../totp-util.js'

// P1-10 补链一：邀请码注册链路（REQ-039）
// 管理员生成邀请码 → 新画师注册（信息表单）→ TOTP 首绑确认 → 会话生效
// 全部走 API（与 E6 同款驱动模式），覆盖注册/首绑/会话三个环节
test('E9 邀请码注册链路', async ({ page, adminPage }) => {
  const base = E2E_BASE_URL
  const qqNumber = '10099'
  // 子域名用纯字母数字：身份码 = 子域名大写（823 规则对齐批后标识字母表已去连字符，上限 2-20 位）
  const subdomain = 'e9invitee'

  // ── 0. 邀请模式开启（onboarding_mode=invite）──
  const statusRes = await page.request.get(base + '/api/invite/status')
  expect(statusRes.ok()).toBeTruthy()
  expect((await statusRes.json()).enabled).toBeTruthy()

  // ── 1. 管理员生成邀请码（1 个）──
  const genRes = await adminPage.request.post(base + '/api/admin/invite-codes', {
    data: { count: 1 }
  })
  expect(genRes.status()).toBe(201)
  const { codes } = await genRes.json()
  expect(codes).toHaveLength(1)
  const code = codes[0].code
  expect(code).toMatch(/^[A-Z0-9]{8}$/)

  // ── 2. 新画师注册（邀请码 + QQ + 昵称 + 子域名）──
  const regRes = await page.request.post(base + '/api/invite/register', {
    data: { code, qqNumber, name: 'E9 入驻画师', subdomain }
  })
  expect(regRes.status()).toBe(201)
  const regJson = await regRes.json()
  expect(regJson.otpauthUri).toBeTruthy()

  // 从 otpauthUri 解析首绑密钥（测试直取 secret，替代扫码）
  const secret = regJson.otpauthUri.match(/secret=([A-Z2-7]+)/)[1]
  expect(secret).toBeTruthy()

  // ── 3. TOTP 首绑确认（正确码一次过；P1-5 防爆破已接线，错码会计数故只用正确码）──
  const confirmRes = await page.request.post(base + '/api/invite/totp-confirm', {
    data: { qqNumber, code: currentTotp(secret) }
  })
  expect(confirmRes.ok()).toBeTruthy()
  const confirmJson = await confirmRes.json()
  expect(confirmJson.isAdmin).toBe(false) // 邀请入驻者恒非管理员
  expect(confirmJson.artist.subdomain).toBe(subdomain)

  // ── 4. 确认下发的会话生效（cookie 已在 page.request 上下文）──
  const meRes = await page.request.get(base + '/api/auth/me')
  expect(meRes.ok()).toBeTruthy()
  const me = await meRes.json()
  expect(String(me.qqNumber ?? me.qq_number)).toBe(qqNumber)

  // ── 5. 邀请码状态变 used（管理端列表核对）──
  const listRes = await adminPage.request.get(base + '/api/admin/invite-codes')
  expect(listRes.ok()).toBeTruthy()
  const listJson = await listRes.json()
  const used = (listJson.codes || listJson).find((c: { code: string; status: string }) => c.code === code)
  expect(used.status).toBe('used')
})
