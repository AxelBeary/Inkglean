import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import type { ArtistRow } from './setup.js'
import { createSession, bindTotpInit, confirmTotpBind } from '../src/features/auth/auth.service.js'
import { generateSecret, computeTotp } from '../src/features/auth/totp.js'
import * as orderService from '../src/features/order/order.service.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'
import { mkdirSync, writeFileSync, rmSync, utimesSync, existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

/** 设置管理员：写 platform_config + 返回管理员画师行 */
function setAdmin(qqNumber: string) {
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
  return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
}

/** 管理员 token */
function adminToken(artist: ArtistRow) {
  // REQ-041：管理后台路由需 step-up 升级会话（入口级 30 分钟窗口内）
  return createSession(artist.id, artist.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })
}

/** 为画师完成 TOTP 绑定（bind-init + bind-confirm），返回密钥（算码用） */
function bindArtistTotp(artistRow: ArtistRow) {
  const secret = generateSecret()
  bindTotpInit(artistRow.id, secret)
  confirmTotpBind(artistRow.id, computeTotp(secret, Date.now()))
  return secret
}

describe('管理员路由 (Admin Routes)', () => {
  let app: FastifyInstance

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
    const adminItem = list.find((a: Record<string, unknown>) => a.qq_number === '10001')
    const otherItem = list.find((a: Record<string, unknown>) => a.qq_number === '20002')
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
    const row = db.prepare('SELECT deleted_at FROM artists WHERE id = ?').get(target.id) as { deleted_at: string | null }
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

    // F-3（P3-22）: body enum schema 在 handler 前拦截，错误信息走 Fastify 校验默认文案
    expect(res.statusCode).toBe(400)
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
    const row = db.prepare("SELECT value FROM platform_config WHERE key = 'admin_qq'").get() as { value: string }
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
    const row = db.prepare("SELECT value FROM platform_config WHERE key = 'admin_qq'").get() as { value: string }
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
    const row = db.prepare("SELECT value FROM platform_config WHERE key = 'admin_qq'").get() as { value: string }
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
    const row = db.prepare('SELECT totp_secret, totp_verified FROM artists WHERE id = ?').get(artist.id) as { totp_secret: string | null; totp_verified: number }
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
    const row = db.prepare('SELECT totp_verified FROM artists WHERE id = ?').get(artist.id) as { totp_verified: number }
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
    const row = db.prepare('SELECT totp_verified FROM artists WHERE id = ?').get(artist.id) as { totp_verified: number }
    expect(row.totp_verified).toBe(0)
  })

  it('TC-AR-20: bind-confirm 未先生成密钥返回 400', async () => {
    const admin = setAdmin('10001')
    // 会话门禁批：显式造未生成密钥态（seedArtist 默认已带占位密钥）
    const artist = seedArtist({ qq_number: '77004', subdomain: 'totp-artist4', totp_secret: null, totp_verified: 0 })

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
    const row = db.prepare('SELECT totp_secret, totp_verified FROM artists WHERE id = ?').get(artist.id) as { totp_secret: string | null; totp_verified: number }
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

  // L-12（审计 九#5）: bind-confirm/reset 补软删除检查（bind-init 已有同款）
  it('TC-AR-24: 软删除画师 bind-confirm/reset 被拒（L-12）', async () => {
    const admin = setAdmin('10001')
    const target = seedArtist({ qq_number: '77008', subdomain: 'totp-removed' })
    bindArtistTotp(target)
    db.prepare("UPDATE artists SET deleted_at = datetime('now') WHERE id = ?").run(target.id)

    const confirm = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${target.id}/totp/bind-confirm`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { code: '123456' }
    })
    expect(confirm.statusCode).toBe(400)
    expect(confirm.json().error).toContain('已移除')

    const reset = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${target.id}/totp/reset`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })
    expect(reset.statusCode).toBe(400)
    expect(reset.json().error).toContain('已移除')

    // 绑定状态未被触碰
    const row = db.prepare('SELECT totp_secret FROM artists WHERE id = ?').get(target.id) as { totp_secret: string | null }
    expect(row.totp_secret).not.toBeNull()
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
    const insts = db.prepare('SELECT id FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order').all(order.id) as Array<{ id: number }>
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

  // ─── 回收站分页（REQ-022 F4） ───

  const rbBinRoot = join(resolve(process.env.UPLOAD_DIR || './uploads'), '.recycle-bin')
  const rbUploadRoot = resolve(process.env.UPLOAD_DIR || './uploads')

  /** 造 n 个回收站文件，mtime 从新到旧递减（file-0 最新），返回文件名数组（新→旧） */
  function seedRecycleFiles(n: number) {
    const dateDir = join(rbBinRoot, '2026-08-05')
    mkdirSync(dateDir, { recursive: true })
    const names = []
    const baseSec = Math.floor(Date.now() / 1000)
    for (let i = 0; i < n; i++) {
      const name = `file-${String(i).padStart(3, '0')}.png`
      const full = join(dateDir, name)
      writeFileSync(full, `data-${i}`)
      const t = baseSec - i * 60 // file-0 最新
      utimesSync(full, t, t)
      names.push(name)
    }
    return names
  }

  afterEach(() => {
    rmSync(rbBinRoot, { recursive: true, force: true })
    // 恢复测试会把文件移回 uploads 原始路径，一并清理防跨用例残留
    rmSync(rbUploadRoot, { recursive: true, force: true })
  })

  it('TC-RB-01: 不传参数默认 page=1/pageSize=20，返回 items/total/page/pageSize', async () => {
    const admin = setAdmin('10001')
    seedRecycleFiles(25)

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/recycle-bin',
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total).toBe(25)
    expect(body.items).toHaveLength(20)
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(20)
  })

  it('TC-RB-02: 翻页切片正确（第 2 页取剩余 5 条，与第 1 页无重叠）', async () => {
    const admin = setAdmin('10001')
    const names = seedRecycleFiles(25)

    const auth = { Authorization: `Bearer ${adminToken(admin)}` }
    const p1 = await app.inject({ method: 'GET', url: '/api/admin/recycle-bin?page=1', headers: auth })
    const p2 = await app.inject({ method: 'GET', url: '/api/admin/recycle-bin?page=2', headers: auth })

    expect(p1.statusCode).toBe(200)
    expect(p2.statusCode).toBe(200)
    const p1Names = p1.json().items.map((i: { fileName: string }) => i.fileName)
    const p2Body = p2.json()
    expect(p2Body.items.map((i: { fileName: string }) => i.fileName)).toEqual(names.slice(20))
    expect(p2Body.total).toBe(25)
    expect(p2Body.page).toBe(2)
    // 两页无重叠
    expect(p1Names.filter((n: string) => p2Body.items.some((i: { fileName: string }) => i.fileName === n))).toHaveLength(0)
  })

  it('TC-RB-03: movedAt 倒序（新删的在前）', async () => {
    const admin = setAdmin('10001')
    const names = seedRecycleFiles(3) // file-000 最新

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/recycle-bin',
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().items.map((i: { fileName: string }) => i.fileName)).toEqual(names)
  })

  it('TC-RB-04: page 越界返回空 items 不报错（total 照常）', async () => {
    const admin = setAdmin('10001')
    seedRecycleFiles(3)

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/recycle-bin?page=999',
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toEqual([])
    expect(body.total).toBe(3)
    expect(body.page).toBe(999)
  })

  it('TC-RB-05: pageSize/page 非法入参 400（F-3 schema 校验）', async () => {
    const admin = setAdmin('10001')
    seedRecycleFiles(3)

    const auth = { Authorization: `Bearer ${adminToken(admin)}` }
    // 超上限（150 > 100）→ 400（此前钳到 100，F-3 改为 schema 直接拒绝）
    const big = await app.inject({ method: 'GET', url: '/api/admin/recycle-bin?pageSize=150', headers: auth })
    expect(big.statusCode).toBe(400)

    // 非法值（0/非数字/负值/page=0）→ 400（此前回退默认/钳制，F-3 改为 schema 直接拒绝）
    for (const q of ['pageSize=0', 'pageSize=abc']) {
      const r = await app.inject({ method: 'GET', url: `/api/admin/recycle-bin?${q}`, headers: auth })
      expect(r.statusCode).toBe(400)
    }
    const negSize = await app.inject({ method: 'GET', url: '/api/admin/recycle-bin?pageSize=-5', headers: auth })
    expect(negSize.statusCode).toBe(400)
    const badPage = await app.inject({ method: 'GET', url: '/api/admin/recycle-bin?page=0', headers: auth })
    expect(badPage.statusCode).toBe(400)
  })

  it('TC-RB-06: 非管理员访问回收站返回 403', async () => {
    setAdmin('10001')
    const pleb = seedArtist({ qq_number: '20002', subdomain: 'rb-pleb' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/recycle-bin',
      headers: { Authorization: `Bearer ${adminToken(pleb)}` }
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('ADMIN_REQUIRED')
  })

  it('TC-RB-07: 清空接口语义不变（整体清空，不分页）', async () => {
    const admin = setAdmin('10001')
    seedRecycleFiles(25)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/recycle-bin',
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ success: true, deleted: 25 })

    const after = await app.inject({
      method: 'GET',
      url: '/api/admin/recycle-bin',
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })
    expect(after.json().total).toBe(0)
  })

  it('TC-RB-08: 恢复成功——文件从回收站移回原始路径（R-21）', async () => {
    const admin = setAdmin('10001')
    const dateDir = join(rbBinRoot, '2026-08-05', 'images', '1')
    mkdirSync(dateDir, { recursive: true })
    writeFileSync(join(dateDir, 'avatar.png'), 'bin-png-data')
    const originalAbs = join(rbUploadRoot, 'images', '1', 'avatar.png')

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/recycle-bin/restore',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { fileName: 'avatar.png' }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ success: true, restoredPath: 'images/1/avatar.png' })
    expect(existsSync(originalAbs)).toBe(true)
    expect(readFileSync(originalAbs, 'utf8')).toBe('bin-png-data')
    expect(existsSync(join(dateDir, 'avatar.png'))).toBe(false)
  })

  it('TC-RB-09: 重复恢复返回 404（文件已不在回收站）', async () => {
    const admin = setAdmin('10001')
    const dateDir = join(rbBinRoot, '2026-08-05', 'images', '1')
    mkdirSync(dateDir, { recursive: true })
    writeFileSync(join(dateDir, 'avatar.png'), 'bin-png-data')
    const auth = { Authorization: `Bearer ${adminToken(admin)}` }

    const first = await app.inject({ method: 'POST', url: '/api/admin/recycle-bin/restore', headers: auth, payload: { fileName: 'avatar.png' } })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({ method: 'POST', url: '/api/admin/recycle-bin/restore', headers: auth, payload: { fileName: 'avatar.png' } })
    expect(second.statusCode).toBe(404)
  })

  it('TC-RB-10: 目标路径已存在 → 409，不覆盖现有文件', async () => {
    const admin = setAdmin('10001')
    const dateDir = join(rbBinRoot, '2026-08-05', 'images', '1')
    mkdirSync(dateDir, { recursive: true })
    writeFileSync(join(dateDir, 'avatar.png'), 'bin-png-data')
    const originalAbs = join(rbUploadRoot, 'images', '1', 'avatar.png')
    mkdirSync(join(originalAbs, '..'), { recursive: true })
    writeFileSync(originalAbs, 'existing-data')

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/recycle-bin/restore',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { fileName: 'avatar.png' }
    })

    expect(res.statusCode).toBe(409)
    expect(readFileSync(originalAbs, 'utf8')).toBe('existing-data')
    expect(existsSync(join(dateDir, 'avatar.png'))).toBe(true)
  })

  it('TC-RB-11: fileName 含路径分隔符或超 255 字符被拒', async () => {
    const admin = setAdmin('10001')
    const auth = { Authorization: `Bearer ${adminToken(admin)}` }

    for (const bad of ['a/b.png', 'a\\b.png']) {
      const res = await app.inject({ method: 'POST', url: '/api/admin/recycle-bin/restore', headers: auth, payload: { fileName: bad } })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('路径分隔符')
    }

    const long = await app.inject({ method: 'POST', url: '/api/admin/recycle-bin/restore', headers: auth, payload: { fileName: 'x'.repeat(256) } })
    expect(long.statusCode).toBe(400)
  })

  it('TC-RB-12: 非管理员恢复返回 403', async () => {
    setAdmin('10001')
    const pleb = seedArtist({ qq_number: '20002', subdomain: 'rb-restore-pleb' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/recycle-bin/restore',
      headers: { Authorization: `Bearer ${adminToken(pleb)}` },
      payload: { fileName: 'a.png' }
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('ADMIN_REQUIRED')
  })

  it('TC-RB-13: 多日期同名文件恢复目标确定化——取最新日期目录', async () => {
    const admin = setAdmin('10001')
    const oldDir = join(rbBinRoot, '2026-08-04', 'images', '1')
    const newDir = join(rbBinRoot, '2026-08-05', 'images', '2')
    mkdirSync(oldDir, { recursive: true })
    mkdirSync(newDir, { recursive: true })
    writeFileSync(join(oldDir, 'dup.png'), 'old-data')
    writeFileSync(join(newDir, 'dup.png'), 'new-data')

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/recycle-bin/restore',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { fileName: 'dup.png' }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().restoredPath).toBe('images/2/dup.png')
    expect(readFileSync(join(rbUploadRoot, 'images', '2', 'dup.png'), 'utf8')).toBe('new-data')
    expect(existsSync(join(oldDir, 'dup.png'))).toBe(true)
    expect(existsSync(join(newDir, 'dup.png'))).toBe(false)
  })

  // L-11（审计 九#4）: 默认模板 basisPoints 上限与保存口径统一为 9500（宽松处收紧到严格处）
  it('TC-AR-WFBP: 默认模板单节点 basisPoints 超 9500 被 schema 拒绝（L-11）', async () => {
    const admin = setAdmin('10001')

    const over = await app.inject({
      method: 'PUT',
      url: '/api/admin/default-workflow',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { nodes: [{ name: '全款', takesPayment: true, basisPoints: 10000 }] }
    })
    expect(over.statusCode).toBe(400)

    // 9500 以内的合法模板仍可保存成功，验证统一后的上限未被误收
    const ok = await app.inject({
      method: 'PUT',
      url: '/api/admin/default-workflow',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { nodes: [
        { name: '定金', takesPayment: true, basisPoints: 5000 },
        { name: '尾款', takesPayment: true, basisPoints: 5000 }
      ] }
    })
    expect(ok.statusCode).toBe(200)
  })
})
