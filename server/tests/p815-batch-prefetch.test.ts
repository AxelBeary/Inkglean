import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import * as styleService from '../src/features/pricing/style.service.js'
import * as artistService from '../src/features/artist/artist.service.js'
import * as orderService from '../src/features/order/order.service.js'
import { buildApp } from '../src/app.js'

// ============================================
// 815 剩余销账 P 路：N+1 查询性能修复回归
// P-1 公开画廊/画风批量预取；P-2 admin 订单分期批量预取
// ============================================

function setMultiStyleEnabled(artistId: number, enabled: number): void {
  db.prepare('UPDATE artists SET multi_style_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, artistId)
}

/** 设置管理员：写 platform_config + 返回管理员画师行 */
function setAdmin(qqNumber: string): ArtistRow {
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
  return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
}

/** 管理员 token（step-up 会话） */
function adminToken(artist: ArtistRow): string {
  return createSession(artist.id, artist.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })
}

// ─── P-1：公开画廊（getPublicGallery） ───

describe('815 P-1 公开画廊批量预取', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '81501', subdomain: 'p815-gallery' })
  })

  it('TC-P815-01: 多画风多作品 — 结构不变且查询次数恒定（不随作品/画风数增长）', async () => {
    setMultiStyleEnabled(artist.id, 1)
    const s1 = styleService.createArtStyle(artist.id, { name: '日系' })
    const s2 = styleService.createArtStyle(artist.id, { name: '厚涂' })
    const s3 = styleService.createArtStyle(artist.id, { name: '赛璐璐' })
    const sizeA = styleService.createStyleSize(artist.id, s1.id, { name: '头像', base_price: 100 })
    const sizeB = styleService.createStyleSize(artist.id, s1.id, { name: '全身', base_price: 300 })
    const sizeC = styleService.createStyleSize(artist.id, s2.id, { name: '半身', base_price: 200 })
    const sizeD = styleService.createStyleSize(artist.id, s3.id, { name: '立绘', base_price: 500 })

    const artworks: Array<{ id: number }> = []
    for (let i = 0; i < 5; i++) {
      artworks.push((await artistService.createArtwork(artist.id, { imagePath: `images/${artist.id}/p${i}.jpg` }))!)
    }
    artistService.setArtworkSizeTags(artist.id, artworks[0].id, [sizeA.id, sizeC.id])
    artistService.setArtworkSizeTags(artist.id, artworks[1].id, [sizeB.id, sizeD.id])
    artistService.setArtworkSizeTags(artist.id, artworks[2].id, [sizeA.id])

    const prepareSpy = vi.spyOn(db, 'prepare')
    prepareSpy.mockClear()
    const gallery = styleService.getPublicGallery(artist.id)
    const firstCount = prepareSpy.mock.calls.length
    prepareSpy.mockClear()

    // 追加 7 个作品后查询次数仍应恒定（N+1 已消除）
    for (let i = 5; i < 12; i++) {
      const art = (await artistService.createArtwork(artist.id, { imagePath: `images/${artist.id}/p${i}.jpg` }))!
      artistService.setArtworkSizeTags(artist.id, art.id, [sizeB.id])
    }
    prepareSpy.mockClear()
    const gallery2 = styleService.getPublicGallery(artist.id)
    const secondCount = prepareSpy.mock.calls.length
    prepareSpy.mockRestore()

    // 5 条固定查询：画风 / 开关 / 尺寸 / 作品 / 标注（与数据量无关）
    expect(firstCount).toBe(5)
    expect(secondCount).toBe(5)

    // 返回结构逐字段不变
    expect(Object.keys(gallery).sort()).toEqual(['artworks', 'filterSizes'])
    expect(Object.keys(gallery.artworks[0]).sort()).toEqual([
      'description', 'height', 'id', 'image_path', 'is_cover', 'like_count', 'size_tags', 'title', 'width'
    ])
    expect(gallery.filterSizes.map(s => s.name)).toEqual(['头像', '全身', '半身', '立绘'])
    expect(gallery.filterSizes.map(s => s.style_name)).toEqual(['日系', '日系', '厚涂', '赛璐璐'])
    expect(gallery.artworks).toHaveLength(5)
    expect(gallery.artworks[0].size_tags.map(t => t.size_name)).toEqual(['头像', '半身'])
    expect(gallery.artworks[1].size_tags.map(t => t.size_name)).toEqual(['全身', '立绘'])
    expect(gallery.artworks[2].size_tags.map(t => t.size_name)).toEqual(['头像'])
    expect(gallery2.artworks).toHaveLength(12)
  })
})

// ─── P-1：公开画风（getPublicStyles） ───

describe('815 P-1 公开画风批量预取', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '81502', subdomain: 'p815-styles' })
  })

  it('TC-P815-02: 多画风多尺寸增项 — 结构不变且查询次数恒定', async () => {
    setMultiStyleEnabled(artist.id, 1)
    const s1 = styleService.createArtStyle(artist.id, { name: '日系' })
    const s2 = styleService.createArtStyle(artist.id, { name: '厚涂' })
    const s3 = styleService.createArtStyle(artist.id, { name: '赛璐璐' })

    const artwork = (await artistService.createArtwork(artist.id, { imagePath: `images/${artist.id}/ref.jpg` }))!
    const sizeA = styleService.createStyleSize(artist.id, s1.id, { name: '头像', base_price: 100 })
    styleService.createStyleSize(artist.id, s1.id, { name: '全身', base_price: 300, image_artwork_id: artwork.id })
    const sizeC = styleService.createStyleSize(artist.id, s2.id, { name: '半身', base_price: 200 })
    styleService.createStyleSize(artist.id, s3.id, { name: '立绘', base_price: 500 })

    const tpl = styleService.createAddonTemplate(artist.id, {
      name: '加人', control_type: 'quantity', price_mode: 'fixed', default_price: 100, unit_label: '人'
    })
    styleService.setStyleAddons(artist.id, s1.id, [{ addon_template_id: tpl.id }])
    styleService.setStyleAddons(artist.id, s2.id, [{ addon_template_id: tpl.id }])
    const personAddon = styleService.getStyleAddons(s1.id).find(a => a.template_category === 'add')
    const personAddon2 = styleService.getStyleAddons(s2.id).find(a => a.template_category === 'add')
    // s1 头像：覆盖价 200；s2 半身：隐藏
    styleService.setSizeOverrides(artist.id, s1.id, sizeA.id, [{ style_addon_id: personAddon!.id, price_override: 200 }])
    styleService.setSizeOverrides(artist.id, s2.id, sizeC.id, [{ style_addon_id: personAddon2!.id, is_hidden: true }])

    const prepareSpy = vi.spyOn(db, 'prepare')
    prepareSpy.mockClear()
    const result = styleService.getPublicStyles(artist.id)
    const queryCount = prepareSpy.mock.calls.length
    prepareSpy.mockRestore()

    // 6 条固定查询：画风 / 开关 / 尺寸 / 增项 / 覆盖 / 引用图路径（与数据量无关）
    expect(queryCount).toBe(6)

    expect(result).toHaveLength(3)
    expect(result.map(s => s.name)).toEqual(['日系', '厚涂', '赛璐璐'])
    expect(result[0].sizes).toHaveLength(2)
    expect(result[0].sizes[0].artwork_image_path).toBeNull()
    expect(result[0].sizes[1].artwork_image_path).toBe(`images/${artist.id}/ref.jpg`)
    expect(result[0].sizes[0].addons.find(a => a.category === 'add')!.price).toBe(200)
    expect(result[1].sizes[0].addons.find(a => a.category === 'add')).toBeUndefined()
    expect(Object.keys(result[0].sizes[0]).sort()).toEqual([
      'addons', 'artwork_image_path', 'base_price', 'description', 'display_status',
      'id', 'image', 'image_artwork_id', 'name', 'sort_order', 'work_days'
    ])
  })
})

// ─── P-2：admin 画师订单列表分期批量预取 ───

describe('815 P-2 admin 订单分期批量预取', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(() => app.close())

  it('TC-P815-03: 多订单多分期 — 每单分期与逐行结果一致且仅 2 条批量查询', async () => {
    const admin = setAdmin('10001')

    // 订单1：全款付清第一期
    const o1 = seedOrder(admin.id)
    db.prepare('UPDATE orders SET total_price_cents = 50000, final_price_cents = 50000 WHERE id = ?').run(o1.id)
    db.prepare('INSERT INTO order_payment_installments (order_id, label, amount_cents, basis_points, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(o1.id, '定金', 20000, 4000, 1)
    db.prepare('INSERT INTO order_payment_installments (order_id, label, amount_cents, basis_points, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(o1.id, '尾款', 30000, 6000, 2)
    const o1Insts = db.prepare('SELECT id FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order').all(o1.id) as Array<{ id: number }>
    orderService.addPayment(o1.id, { amountCents: 20000, note: '定金到账', installmentId: o1Insts[0].id })

    // 订单2：第二期部分覆盖（partial）
    const o2 = seedOrder(admin.id)
    db.prepare('UPDATE orders SET total_price_cents = 30000, final_price_cents = 30000 WHERE id = ?').run(o2.id)
    db.prepare('INSERT INTO order_payment_installments (order_id, label, amount_cents, basis_points, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(o2.id, '定金', 10000, 3000, 1)
    db.prepare('INSERT INTO order_payment_installments (order_id, label, amount_cents, basis_points, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(o2.id, '尾款', 20000, 7000, 2)
    const o2Insts = db.prepare('SELECT id FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order').all(o2.id) as Array<{ id: number }>
    orderService.addPayment(o2.id, { amountCents: 15000, note: '部分收款', installmentId: o2Insts[1].id })

    // 订单3：无分期
    seedOrder(admin.id)

    const prepareSpy = vi.spyOn(db, 'prepare')
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/artists/${admin.id}/orders`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })
    // 只统计分期/额度池相关查询：批量预取应固定 2 条（分期 + paid_total_cents）
    const batchQueryCount = prepareSpy.mock.calls
      .filter(([sql]) => typeof sql === 'string' && /order_payment_installments|paid_total_cents/.test(sql)).length
    prepareSpy.mockRestore()

    expect(res.statusCode).toBe(200)
    expect(batchQueryCount).toBe(2)

    const { items } = res.json()
    expect(items).toHaveLength(3)
    for (const item of items) {
      // 与逐行查询结果逐字段一致（返回结构不变）
      expect(item.installments).toEqual(orderService.getOrderInstallments(item.id))
    }
    const byNo = new Map<string, { order_no: string; installments: Array<{ status: string; paidCents: number }> }>(items.map((o: { order_no: string }) => [o.order_no, o]))
    expect(byNo.get(o1.order_no)!.installments.map((i: { status: string }) => i.status)).toEqual(['paid', 'pending'])
    expect(byNo.get(o2.order_no)!.installments.map((i: { status: string }) => i.status)).toEqual(['paid', 'partial'])
    expect(byNo.get(o2.order_no)!.installments[1].paidCents).toBe(5000)
  })
})
