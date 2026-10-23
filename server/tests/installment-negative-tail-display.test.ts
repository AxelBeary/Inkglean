// 审计 #21 条目 2：负尾款（R8 应退额度）参与「已收封顶」口径导致的节点级待收错算
// 复现：30/70 两节点、总价 50000、已收 30000（首节点已付清锁定），随后降价到 10000
// → 节点价 [15000, -5000]。旧口径 covered=min(paid, Σ含负)=10000，首节点仍显示
//   locked=true + 待收 5000；而订单级待收 = max(0, 终价−已收) = 0，两端相反。
// 修复：封顶只取正节点之和 → 首节点 paid/pending 归零，与订单级口径一致。
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import type { ArtistRow, SeededOrder } from './setup.js'
import { getOrderInstallments } from '../src/features/order/order-pricing.js'

function seedInstallments(
  artist: ArtistRow,
  insts: Array<[string, number]>,
  priceCents: number | null,
  paidCents: number
): SeededOrder {
  const order = seedOrder(artist.id)
  db.prepare('UPDATE orders SET total_price_cents = ?, final_price_cents = ?, paid_total_cents = ? WHERE id = ?')
    .run(priceCents, priceCents, paidCents, order.id)
  const insert = db.prepare(
    'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order, locked, locked_reason) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  insts.forEach(([name, amt], i) => insert.run(order.id, name, 0, amt, i + 1, i === 0 ? 1 : 0, i === 0 ? 'paidOff' : null))
  return order
}

describe('节点待收展示口径（#21-2 负尾款）', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '89220', subdomain: 'inst-display' })
  })

  it('大幅降价压出负尾款且已收 ≥ 正节点之和：不再有幻影待收', () => {
    const order = seedInstallments(artist, [['定金', 15000], ['尾款', -5000]], 10000, 30000)

    const rows = getOrderInstallments(order.id)

    expect(rows.map(r => r.status)).toEqual(['paid', 'paid'])
    expect(rows.map(r => r.paidCents)).toEqual([15000, 0])
    expect(rows.map(r => r.remainingCents)).toEqual([0, 0])
    // 节点级待收合计必须与订单级口径（max(0, 终价−已收)）一致
    expect(rows.reduce((s, r) => s + r.remainingCents, 0)).toBe(Math.max(0, 10000 - 30000))
  })

  it('三节点含负尾款，已收恰好覆盖全部正节点：前两个不再欠收', () => {
    const order = seedInstallments(artist, [['定金', 10000], ['中期', 10000], ['尾款', -5000]], 15000, 20000)

    const rows = getOrderInstallments(order.id)

    expect(rows.map(r => r.status)).toEqual(['paid', 'paid', 'paid'])
    expect(rows.map(r => r.remainingCents)).toEqual([0, 0, 0])
  })

  it('未付清时仍按顺序回填：首节点 partial，后续节点 pending（口径不外溢）', () => {
    const order = seedInstallments(artist, [['定金', 15000], ['尾款', -5000]], 10000, 5000)

    const rows = getOrderInstallments(order.id)

    expect(rows.map(r => r.status)).toEqual(['partial', 'paid'])
    expect(rows[0].paidCents).toBe(5000)
    expect(rows[0].remainingCents).toBe(10000)
  })

  it('无负尾款的常规分期不受影响', () => {
    const order = seedInstallments(artist, [['定金', 10000], ['中期', 20000], ['尾款', 20000]], 50000, 30000)

    const rows = getOrderInstallments(order.id)

    expect(rows.map(r => r.status)).toEqual(['paid', 'paid', 'pending'])
    expect(rows.map(r => r.paidCents)).toEqual([10000, 20000, 0])
    expect(rows[2].remainingCents).toBe(20000)
  })

  it('全零/负节点订单：不产生待收，也不产生负待付', () => {
    const order = seedInstallments(artist, [['定金', 0], ['尾款', -3000]], 0, 3000)

    const rows = getOrderInstallments(order.id)

    expect(rows.map(r => r.status)).toEqual(['paid', 'paid'])
    expect(rows.every(r => r.remainingCents === 0 && r.paidCents === 0)).toBe(true)
  })

  it('批量视图与单订单视图同口径（getOrdersInstallments）', async () => {
    const order = seedInstallments(artist, [['定金', 15000], ['尾款', -5000]], 10000, 30000)
    const { getOrdersInstallments } = await import('../src/features/order/order-pricing.js')

    const batch = getOrdersInstallments([order.id]).get(order.id) ?? []

    expect(batch).toEqual(getOrderInstallments(order.id))
    expect(batch.map(r => r.remainingCents)).toEqual([0, 0])
  })
})
