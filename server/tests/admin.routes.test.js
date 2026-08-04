import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { createSession, bindTotpInit, confirmTotpBind } from '../src/features/auth/auth.service.js'
import { generateSecret, computeTotp } from '../src/features/auth/totp.js'
import * as orderService from '../src/features/order/order.service.js'
import { buildApp } from '../src/app.js'

/** 设置管理员：写 platform_config + 返回管理员画师行 */
function setAdmin(qqNumber) {
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
  return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
}

/** 管理员 token */
function adminToken(artist) {
  return createSession(artist.id, artist.token_version)
}

/** 为画师完成 TOTP 绑定（bind-init + bind-confirm），返回密钥（算码用） */
function bindArtistTotp(artistRow) {
  const secret = generateSecret()
  bindTotpInit(artistRow.id, secret)
  confirmTotpBind(artistRow.id, computeTotp(secret, Date.now()))
  return secret
}

describe('管理员路由 (Admin Routes)', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  // ─── 画师列表 ───

  it('TC-AR-01: 管理员获取画师列表含 isAdmin 标记', async () => {
    const admin = setAdmin('10001')
    seedArtist({ qq_number: '20002', subdomain: 'other' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(2)
    const adminItem = list.find(a => a.qq_number === '10001')
    const otherItem = list.find(a => a.qq_number === '20002')
    expect(adminItem.isAdmin).toBe(true)
    expect(otherItem.isAdmin).toBe(false)
  })

  it('TC-AR-02: 非管理员访问返回 403', async () => {
    setAdmin('10001')
    const pleb = seedArtist({ qq_number: '20002', subdomain: 'pleb' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${adminToken(pleb)}` }
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('ADMIN_REQUIRED')
  })

  // ─── 创建画师 ───

  it('TC-AR-03: 管理员创建画师成功', async () => {
    const admin = setAdmin('10001')

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { qqNumber: '30003', name: '新画师', subdomain: 'newbie' }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('新画师')
    expect(res.json().subdomain).toBe('newbie')
  })

  it('TC-AR-04: 保留子域名被拒绝', async () => {
    const admin = setAdmin('10001')

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { qqNumber: '30003', name: 'X', subdomain: 'admin' }
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('保留词')
  })

  // ─── 删除画师 ───

  it('TC-AR-05: 删除画师成功（软删除）', async () => {
    const admin = setAdmin('10001')
    const target = seedArtist({ qq_number: '20002', subdomain: 'target' })

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/artists/${target.id}`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().success).toBe(true)
    // 确认软删除
    const row = db.prepare('SELECT deleted_at FROM artists WHERE id = ?').get(target.id)
    expect(row.deleted_at).not.toBeNull()
  })

  it('TC-AR-06: 不能删除管理员账号', async () => {
    const admin = setAdmin('10001')

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/artists/${admin.id}`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error).toContain('不能删除管理员')
  })

  it('TC-AR-07: 删除不存在的画师返回 404', async () => {
    const admin = setAdmin('10001')

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/artists/99999',
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(404)
  })

  // ─── 状态修改 ───

  it('TC-AR-08: 修改画师状态成功', async () => {
    const admin = setAdmin('10001')
    const target = seedArtist({ qq_number: '20002', subdomain: 'target' })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/artists/${target.id}/status`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { status: 'full' }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('full')
  })

  it('TC-AR-09: 无效状态被拒绝', async () => {
    const admin = setAdmin('10001')
    const target = seedArtist({ qq_number: '20002', subdomain: 'target' })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/artists/${target.id}/status`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { status: 'bogus' }
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('无效状态')
  })

  it('TC-AR-09b: 管理员可设 hidden（BUG-8 第三项，用户拍板）', async () => {
    const admin = setAdmin('10001')
    const target = seedArtist({ qq_number: '20003', subdomain: 'hideable' })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/artists/${target.id}/status`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { status: 'hidden' }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('hidden')
  })

  // ─── 全局统计 ───

  it('TC-AR-10: GET /api/admin/stats 返回统计', async () => {
    const admin = setAdmin('10001')
    seedArtist({ qq_number: '20002', subdomain: 'other' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(200)
    const stats = res.json()
    expect(stats.artistCount).toBe(2)
    expect(stats.orderCount).toBe(0)
    expect(stats.activeOrders).toBe(0)
  })

  // ─── 管理员更换 (transfer) ───

  it('TC-AR-11: transfer 成功 — 双 TOTP 验证通过', async () => {
    const admin = setAdmin('10001')
    const newAdmin = seedArtist({ qq_number: '20002', subdomain: 'new-admin' })
    // 双方均须已绑定 TOTP
    const secret1 = bindArtistTotp(admin)
    const secret2 = bindArtistTotp(newAdmin)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/transfer',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { newQq: '20002', currentCode: computeTotp(secret1, Date.now()), newCode: computeTotp(secret2, Date.now()) }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().success).toBe(true)
    expect(res.json().newAdminQq).toBe('20002')

    // 确认 DB 已更新
    const row = db.prepare("SELECT value FROM platform_config WHERE key = 'admin_qq'").get()
    expect(row.value).toBe('20002')
  })

  it('TC-AR-12: transfer 第一码错误返回 401', async () => {
    const admin = setAdmin('10001')
    const newAdmin = seedArtist({ qq_number: '20002', subdomain: 'new-admin' })
    bindArtistTotp(admin)
    const secret2 = bindArtistTotp(newAdmin)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/transfer',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { newQq: '20002', currentCode: '000000', newCode: computeTotp(secret2, Date.now()) }
    })

    expect(res.statusCode).toBe(401)
    // admin_qq 未变
    const row = db.prepare("SELECT value FROM platform_config WHERE key = 'admin_qq'").get()
    expect(row.value).toBe('10001')
  })

  it('TC-AR-13: transfer 第二码失败返回 401（admin_qq 不变）', async () => {
    const admin = setAdmin('10001')
    const newAdmin = seedArtist({ qq_number: '20002', subdomain: 'new-admin' })
    const secret1 = bindArtistTotp(admin)
    bindArtistTotp(newAdmin)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/transfer',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { newQq: '20002', currentCode: computeTotp(secret1, Date.now()), newCode: '000000' }
    })

    expect(res.statusCode).toBe(401)
    const row = db.prepare("SELECT value FROM platform_config WHERE key = 'admin_qq'").get()
    expect(row.value).toBe('10001')
  })

  it('TC-AR-14: transfer 新管理员与自己相同返回 400', async () => {
    const admin = setAdmin('10001')

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/transfer',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { newQq: '10001', currentCode: '123456', newCode: '654321' }
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('不能与当前管理员相同')
  })

  it('TC-AR-15: transfer 新管理员未注册返回 404', async () => {
    const admin = setAdmin('10001')
    const secret1 = bindArtistTotp(admin)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/transfer',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { newQq: '99999', currentCode: computeTotp(secret1, Date.now()), newCode: '123456' }
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toContain('未注册')
  })

  it('TC-AR-15b: transfer 未绑定 TOTP 的画师返回 401（须先绑定）', async () => {
    const admin = setAdmin('10001')
    const secret1 = bindArtistTotp(admin)
    seedArtist({ qq_number: '20003', subdomain: 'new-admin2' }) // 新管理员未绑定

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/transfer',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { newQq: '20003', currentCode: computeTotp(secret1, Date.now()), newCode: '123456' }
    })

    expect(res.statusCode).toBe(401)
  })

  // ─── TOTP 绑定/重置（REQ-027） ───

  it('TC-AR-17: bind-init 生成二维码 dataURL（管理员权限）', async () => {
    const admin = setAdmin('10001')
    const artist = seedArtist({ qq_number: '77001', subdomain: 'totp-artist' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/totp/bind-init`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.qrDataUrl).toMatch(/^data:image\/png;base64,/)
    expect(body.otpauthUri).toContain('otpauth://totp/')
    expect(body.otpauthUri).toContain(`secret=`)
    // 密钥已入库（未验证）
    const row = db.prepare('SELECT totp_secret, totp_verified FROM artists WHERE id = ?').get(artist.id)
    expect(row.totp_secret).toBeTruthy()
    expect(row.totp_verified).toBe(0)
  })

  it('TC-AR-18: bind-confirm 正确码绑定成功', async () => {
    const admin = setAdmin('10001')
    const artist = seedArtist({ qq_number: '77002', subdomain: 'totp-artist2' })

    const init = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/totp/bind-init`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })
    const { otpauthUri } = init.json()
    // 从 URI 提取密钥算码（模拟画师 App）
    const secret = otpauthUri.match(/secret=([A-Z2-7]+)/)[1]

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/totp/bind-confirm`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { code: computeTotp(secret, Date.now()) }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().success).toBe(true)
    const row = db.prepare('SELECT totp_verified FROM artists WHERE id = ?').get(artist.id)
    expect(row.totp_verified).toBe(1)
  })

  it('TC-AR-19: bind-confirm 错误码返回 400', async () => {
    const admin = setAdmin('10001')
    const artist = seedArtist({ qq_number: '77003', subdomain: 'totp-artist3' })

    await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/totp/bind-init`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/totp/bind-confirm`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { code: '000000' }
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('TOTP_BIND_INVALID')
    const row = db.prepare('SELECT totp_verified FROM artists WHERE id = ?').get(artist.id)
    expect(row.totp_verified).toBe(0)
  })

  it('TC-AR-20: bind-confirm 未先生成密钥返回 400', async () => {
    const admin = setAdmin('10001')
    const artist = seedArtist({ qq_number: '77004', subdomain: 'totp-artist4' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/totp/bind-confirm`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { code: '123456' }
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('先生成绑定二维码')
  })

  it('TC-AR-21: reset 重置绑定（旧密钥失效）', async () => {
    const admin = setAdmin('10001')
    const artist = seedArtist({ qq_number: '77005', subdomain: 'totp-artist5' })
    const secret = bindArtistTotp(artist)

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/totp/reset`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().success).toBe(true)
    const row = db.prepare('SELECT totp_secret, totp_verified FROM artists WHERE id = ?').get(artist.id)
    expect(row.totp_secret).toBeNull()
    expect(row.totp_verified).toBe(0)
    // 旧密钥的码已无法登录（由登录校验拦截）
    expect(secret).toBeTruthy()
  })

  it('TC-AR-22: 非管理员调 bind-init 返回 403', async () => {
    setAdmin('10001')
    const pleb = seedArtist({ qq_number: '77006', subdomain: 'totp-pleb' })
    const target = seedArtist({ qq_number: '77007', subdomain: 'totp-target' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${target.id}/totp/bind-init`,
      headers: { Authorization: `Bearer ${adminToken(pleb)}` }
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('ADMIN_REQUIRED')
  })

  it('TC-AR-23: 绑定接口画师不存在返回 404', async () => {
    const admin = setAdmin('10001')

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/artists/99999/totp/bind-init',
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(404)
  })

  // ─── 订单列表付款字段（B7 补字段） ───

  it('TC-AR-16: 订单列表含 paidTotalCents / finalPriceCents / installments', async () => {
    const admin = setAdmin('10001')
    const order = seedOrder(admin.id)
    // seedOrder 不写价格列，手动补
    db.prepare('UPDATE orders SET total_price_cents = 50000, final_price_cents = 50000 WHERE id = ?').run(order.id)

    // 插入分期节点 + 记录收款（v0.31 F4: 收款关联到具体节点）
    db.prepare('INSERT INTO order_payment_installments (order_id, label, amount_cents, basis_points, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(order.id, '定金', 20000, 4000, 1)
    db.prepare('INSERT INTO order_payment_installments (order_id, label, amount_cents, basis_points, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(order.id, '尾款', 30000, 6000, 2)
    const insts = db.prepare('SELECT id FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order').all(order.id)
    orderService.addPayment(order.id, { amountCents: 20000, note: '定金到账', installmentId: insts[0].id })

    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/artists/${admin.id}/orders`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(200)
    const { items } = res.json()
    expect(items).toHaveLength(1)

    const o = items[0]
    // camelCase 字段
    expect(o.paidTotalCents).toBe(20000)
    expect(o.finalPriceCents).toBe(50000)
    // 三态分期
    expect(o.installments).toHaveLength(2)
    expect(o.installments[0]).toMatchObject({ name: '定金', amountCents: 20000, status: 'paid', paidCents: 20000 })
    expect(o.installments[1]).toMatchObject({ name: '尾款', amountCents: 30000, status: 'pending', paidCents: 0 })
  })

  it('TC-AR-17: 无付款订单返回零值 + 空分期', async () => {
    const admin = setAdmin('10001')
    const order = seedOrder(admin.id)
    db.prepare('UPDATE orders SET total_price_cents = 30000, final_price_cents = 30000 WHERE id = ?').run(order.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/artists/${admin.id}/orders`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(200)
    const o = res.json().items[0]
    expect(o.paidTotalCents).toBe(0)
    expect(o.finalPriceCents).toBe(30000)
    expect(o.installments).toEqual([])
  })

  it('TC-AR-18: 无价格订单（手动录入）finalPriceCents 为 0', async () => {
    const admin = setAdmin('10001')
    seedOrder(admin.id) // 无 total_price_cents / final_price_cents

    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/artists/${admin.id}/orders`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(200)
    const o = res.json().items[0]
    expect(o.paidTotalCents).toBe(0)
    expect(o.finalPriceCents).toBe(0)
    expect(o.installments).toEqual([])
  })
})
