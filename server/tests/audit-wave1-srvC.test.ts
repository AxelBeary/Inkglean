/**
 * 审计缺陷修复波1 · SRV-C 路回归用例
 * SRV-01: 收入统计按实收（paid_total_cents）而非合同额
 * SRV-12: 删画风/尺寸有在途订单时拒绝
 * SRV-16: 分期节点生成两路径过滤对称（basis_points > 0）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import { getArtistStats } from '../src/features/order/order-stats.service.js'
import { generateInstallmentsForOrder } from '../src/features/order/order-status.js'
import { createOrder } from '../src/features/order/order-create.js'
import * as styleService from '../src/features/pricing/style.service.js'

// ─── 辅助函数 ───

function nowSqlite(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

/** 为画师创建默认画风 + 尺寸，返回 ids */
function seedStyleAndSize(artistId: number, sizeName = '全身', basePrice = 500) {
  const style = styleService.createArtStyle(artistId, { name: '日系' })
  const size = styleService.createStyleSize(artistId, style.id, { name: sizeName, base_price: basePrice })
  return { styleId: style.id, sizeId: size.id }
}

/** 直接插入带 style_size_id 的订单（seedOrder 不支持该字段） */
function seedOrderWithSize(artistId: number, sizeId: number, overrides: Record<string, unknown> = {}) {
  const orderNo = (overrides.order_no as string) || `SRVC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const status = (overrides.status as string) || 'pending'
  const result = db.prepare(`
    INSERT INTO orders (order_no, artist_id, style_size_id, client_qq, status, priority, source, queue_position, queue_zone, customer_token_hash)
    VALUES (?, ?, ?, ?, ?, 'medium', 'self', 1, 'formal', 'test-hash')
  `).run(orderNo, artistId, sizeId, '99999', status)
  return Number(result.lastInsertRowid)
}

// ═══════════════════════════════════════════════════════════
// SRV-01: 收入统计改为按实收（paid_total_cents）
// ═══════════════════════════════════════════════════════════
describe('SRV-01: 收入统计按实收聚合', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '30001', subdomain: 'srv01-test' })
  })

  it('TC-SRV01-01: 月收入 = paid_total_cents 之和（非合同额）', () => {
    const ts = nowSqlite()
    // 订单合同额 50000 分，但只收了 30000 分
    const o1 = seedOrder(artist.id, { status: 'done' })
    db.prepare('UPDATE orders SET final_price_cents = 50000, paid_total_cents = 30000, completed_at = ? WHERE id = ?').run(ts, o1.id)
    // 订单合同额 20000 分，全额已收
    const o2 = seedOrder(artist.id, { status: 'delivered' })
    db.prepare('UPDATE orders SET final_price_cents = 20000, paid_total_cents = 20000, completed_at = ? WHERE id = ?').run(ts, o2.id)

    const stats = getArtistStats(artist.id)
    // 新口径：实收之和 = 30000 + 20000 = 50000（旧口径按合同额会是 70000）
    expect(stats.monthRevenueCents).toBe(50000)
    expect(stats.monthRevenue).toBe(500)
  })

  it('TC-SRV01-02: 今日收入 = 当天完成订单的 paid_total_cents 之和', () => {
    const ts = nowSqlite()
    const o = seedOrder(artist.id, { status: 'done' })
    db.prepare('UPDATE orders SET final_price_cents = 80000, paid_total_cents = 50000, completed_at = ? WHERE id = ?').run(ts, o.id)

    const stats = getArtistStats(artist.id)
    // 实收 50000（旧口径按合同额会是 80000）
    expect(stats.todayRevenueCents).toBe(50000)
    expect(stats.todayRevenueCount).toBe(1)
  })

  it('TC-SRV01-03: done 但 paid_total_cents=0 的订单不计入收入', () => {
    const ts = nowSqlite()
    const o = seedOrder(artist.id, { status: 'done' })
    db.prepare('UPDATE orders SET final_price_cents = 100000, paid_total_cents = 0, completed_at = ? WHERE id = ?').run(ts, o.id)

    const stats = getArtistStats(artist.id)
    // 合同额 100000 但实收 0 → 收入应为 0
    expect(stats.monthRevenueCents).toBe(0)
    expect(stats.todayRevenueCents).toBe(0)
  })

  it('TC-SRV01-04: todayNewOrderCents 仍用合同额（非收入字段语义不变）', () => {
    const o = seedOrder(artist.id, { status: 'pending' })
    db.prepare('UPDATE orders SET final_price_cents = 20000 WHERE id = ?').run(o.id)

    const stats = getArtistStats(artist.id)
    // todayNewOrderCents 是今日新增订单的合同价值，不受 SRV-01 修改影响
    expect(stats.todayNewOrderCents).toBe(20000)
  })
})

// ═══════════════════════════════════════════════════════════
// SRV-12: 删画风/尺寸有在途订单守卫
// ═══════════════════════════════════════════════════════════
describe('SRV-12: 删画风/尺寸在途订单守卫', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '30002', subdomain: 'srv12-test' })
  })

  it('TC-SRV12-01: 有在途订单引用尺寸时 deleteStyleSize 被拒 409', () => {
    const { styleId, sizeId } = seedStyleAndSize(artist.id)
    // 创建引用该尺寸的在途订单（status=wip）
    seedOrderWithSize(artist.id, sizeId, { status: 'wip' })

    expect(() => {
      styleService.deleteStyleSize(artist.id, styleId, sizeId)
    }).toThrow('STYLE_SIZE_IN_USE')
  })

  it('TC-SRV12-02: 有在途订单引用画风下尺寸时 deleteArtStyle 被拒 409', () => {
    const { styleId, sizeId } = seedStyleAndSize(artist.id)
    // pending 也是在途
    seedOrderWithSize(artist.id, sizeId, { status: 'pending' })

    expect(() => {
      styleService.deleteArtStyle(artist.id, styleId)
    }).toThrow('STYLE_IN_USE')
  })

  it('TC-SRV12-03: 在途订单全部已交付/已取消后允许删除', () => {
    const { styleId, sizeId } = seedStyleAndSize(artist.id)
    // 只有终态订单引用
    seedOrderWithSize(artist.id, sizeId, { status: 'delivered' })
    seedOrderWithSize(artist.id, sizeId, { status: 'cancelled' })

    // 不应抛错
    const result = styleService.deleteStyleSize(artist.id, styleId, sizeId)
    expect(result.deleted).toBe(true)
  })

  it('TC-SRV12-04: 无订单引用时 deleteArtStyle 正常', () => {
    const { styleId } = seedStyleAndSize(artist.id)

    const result = styleService.deleteArtStyle(artist.id, styleId)
    expect(result.deleted).toBe(true)
  })

  it('TC-SRV12-05: done 状态订单也视为在途（done 未 delivered）', () => {
    const { styleId, sizeId } = seedStyleAndSize(artist.id)
    seedOrderWithSize(artist.id, sizeId, { status: 'done' })

    expect(() => {
      styleService.deleteStyleSize(artist.id, styleId, sizeId)
    }).toThrow('STYLE_SIZE_IN_USE')
  })

  it('TC-SRV12-06: 多尺寸画风下只有一个尺寸被引用时仍拒绝删画风', () => {
    const style = styleService.createArtStyle(artist.id, { name: '多尺寸' })
    const size1 = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 100 })
    const size2 = styleService.createStyleSize(artist.id, style.id, { name: '全身', base_price: 500 })

    // 只有 size2 被引用
    seedOrderWithSize(artist.id, size2.id, { status: 'confirmed' })

    // 删画风应被拒（因为 size2 有在途订单）
    expect(() => {
      styleService.deleteArtStyle(artist.id, style.id)
    }).toThrow('STYLE_IN_USE')

    // 但删 size1 应成功（无订单引用）
    const result = styleService.deleteStyleSize(artist.id, style.id, size1.id)
    expect(result.deleted).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════
// SRV-16: 分期节点生成两路径过滤对称
// ═══════════════════════════════════════════════════════════
describe('SRV-16: 分期节点 basis_points 过滤对称', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '30003', subdomain: 'srv16-test' })
  })

  /** 直接插入工作流节点 */
  function seedStage(artistId: number, name: string, sortOrder: number, takesPayment: number, basisPoints: number | null) {
    db.prepare(
      'INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, ?, ?)'
    ).run(artistId, name, sortOrder, takesPayment, basisPoints)
  }

  /** 直接插入订单（带 final_price_cents），返回 orderId */
  function seedDirectOrder(artistId: number, totalCents: number, overrides: Record<string, unknown> = {}) {
    const orderNo = (overrides.order_no as string) || `SRV16-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const r = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, priority, source, queue_position, queue_zone, total_price_cents, final_price_cents, customer_token_hash)
      VALUES (?, ?, '88888', 'pending', 'medium', 'self', 1, ?, ?, ?, 'test-hash')
    `).run(orderNo, artistId, (overrides.queue_zone as string) || 'formal', totalCents, totalCents)
    return Number(r.lastInsertRowid)
  }

  function instsOf(orderId: number): Array<{ label: string; basis_points: number; amount_cents: number }> {
    return db.prepare('SELECT * FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order ASC').all(orderId) as Array<{ label: string; basis_points: number; amount_cents: number }>
  }

  it('TC-SRV16-01: basis_points=0 的收款节点被跳过（generateInstallmentsForOrder 路径）', () => {
    // 节点1: takes_payment=1, basis_points=5000 → 应生成
    seedStage(artist.id, '定金', 1, 1, 5000)
    // 节点2: takes_payment=1, basis_points=0 → 应被跳过（脏数据场景）
    seedStage(artist.id, '空节点', 2, 1, 0)
    // 节点3: takes_payment=1, basis_points=5000 → 应生成
    seedStage(artist.id, '尾款', 3, 1, 5000)

    const orderId = seedDirectOrder(artist.id, 20000)
    generateInstallmentsForOrder(orderId)

    const insts = instsOf(orderId)
    // basis_points=0 的节点被跳过，只生成 2 个
    expect(insts).toHaveLength(2)
    expect(insts[0].label).toBe('定金')
    expect(insts[0].amount_cents).toBe(10000) // 50%
    expect(insts[1].label).toBe('尾款')
    expect(insts[1].amount_cents).toBe(10000) // 50%
  })

  it('TC-SRV16-02: basis_points=NULL 的收款节点被跳过', () => {
    seedStage(artist.id, '定金', 1, 1, 3000)
    seedStage(artist.id, '脏节点', 2, 1, null)  // basis_points=NULL
    seedStage(artist.id, '尾款', 3, 1, 7000)

    const orderId = seedDirectOrder(artist.id, 10000)
    generateInstallmentsForOrder(orderId)

    const insts = instsOf(orderId)
    // NULL 节点被跳过，只生成 2 个
    expect(insts).toHaveLength(2)
    expect(insts[0].label).toBe('定金')
    expect(insts[0].amount_cents).toBe(3000) // 30%
    expect(insts[1].label).toBe('尾款')
    expect(insts[1].amount_cents).toBe(7000) // 70%
  })

  it('TC-SRV16-03: 全部收款节点 basis_points=0 时不生成分期', () => {
    seedStage(artist.id, '空节点A', 1, 1, 0)
    seedStage(artist.id, '空节点B', 2, 1, 0)

    const orderId = seedDirectOrder(artist.id, 10000)
    generateInstallmentsForOrder(orderId)

    expect(instsOf(orderId)).toHaveLength(0)
  })

  it('TC-SRV16-04: createOrder 路径同样跳过 basis_points=0（与 generateInstallmentsForOrder 对称）', () => {
    // 使用 createOrder 路径：建画风尺寸 + 工作流节点，其中包含 basis_points=0 脏节点
    const { sizeId } = seedStyleAndSize(artist.id, '全身', 200)
    seedStage(artist.id, '定金', 1, 1, 4000)
    seedStage(artist.id, '脏节点', 2, 1, 0) // 应被跳过
    seedStage(artist.id, '尾款', 3, 1, 6000)

    // createOrder 内部走 SQL 过滤（SRV-16 修复后含 basis_points > 0）
    const order = createOrder({ artistId: artist.id, clientQq: '77777', styleSizeId: sizeId })

    const insts = instsOf(order.id)
    // basis_points=0 的脏节点被跳过，只生成 2 个
    expect(insts).toHaveLength(2)
    expect(insts[0].label).toBe('定金')
    expect(insts[1].label).toBe('尾款')
    // 4000:6000 → 40%:60% of 20000 = 8000:12000
    expect(insts[0].amount_cents).toBe(8000)
    expect(insts[1].amount_cents).toBe(12000)
  })
})
