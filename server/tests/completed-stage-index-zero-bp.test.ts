// 审计 #21 条目 5：basis_points=0/NULL 的收款阶段不得抬高「已完成收款节点」下标
// 分期节点由 takes_payment=1 AND basis_points>0 生成（order-create / generateInstallmentsForOrder 同口径），
// 锁定推导的计数必须用同一谓词——否则脏工作流/旧库会把中期订单的尾款提前判完成并锁定（locked=completed），
// 后续加价全摊到尾款，而 Σ 级守恒断言仍然通过，现有断言拦不住。
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import type { ArtistRow, SeededOrder } from './setup.js'
import { refreshInstallmentLocks } from '../src/features/order/order-pricing.js'

type InstRow = { id: number; label: string; sort_order: number; locked: number; locked_reason: string | null }

function addStage(artistId: number, name: string, sortOrder: number, takesPayment: number, basisPoints: number | null): number {
  const r = db.prepare(
    'INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, ?, ?)'
  ).run(artistId, name, sortOrder, takesPayment, basisPoints)
  return Number(r.lastInsertRowid)
}

/** 下单快照：只有的确生成出来的收款节点（bp>0 的两个），中间 bp=0 阶段不产生节点 */
function seedSnapshotNodes(order: SeededOrder, labels: Array<[string, number]>): void {
  const insert = db.prepare(
    'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)'
  )
  labels.forEach(([label, bp], i) => insert.run(order.id, label, bp, 30000, i + 1))
}

function readNodes(orderId: number): InstRow[] {
  return db.prepare(
    'SELECT id, label, sort_order, locked, locked_reason FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order ASC'
  ).all(orderId) as InstRow[]
}

describe('已完成收款节点下标与 bp=0 阶段（#21-5）', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '89550', subdomain: 'bp-zero' })
  })

  it('TC-BP0-01: 脏工作流中间的 bp=0 收款阶段不把尾款提前锁成 completed', () => {
    addStage(artist.id, '定金', 1, 1, 3000)
    addStage(artist.id, '线稿', 2, 1, 0)
    const 尾款 = addStage(artist.id, '尾款', 3, 1, 7000)
    const order = seedOrder(artist.id, { status: 'wip' })
    seedSnapshotNodes(order, [['定金', 3000], ['尾款', 7000]])

    // 当前停在末收款节点「尾款」：之前真正会生成节点的收款阶段只有定金一个
    db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(尾款, order.id)
    refreshInstallmentLocks(order.id)

    const nodes = readNodes(order.id)
    expect(nodes.map(n => n.locked_reason)).toEqual(['completed', null])
    expect(nodes[1].locked).toBe(0)
  })

  it('TC-BP0-02: basis_points 为 NULL 的收款阶段同样排除', () => {
    addStage(artist.id, '定金', 1, 1, 3000)
    addStage(artist.id, '草图', 2, 1, null)
    const 尾款 = addStage(artist.id, '尾款', 3, 1, 7000)
    const order = seedOrder(artist.id, { status: 'wip' })
    seedSnapshotNodes(order, [['定金', 3000], ['尾款', 7000]])

    db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(尾款, order.id)
    refreshInstallmentLocks(order.id)

    expect(readNodes(order.id).map(n => n.locked)).toEqual([1, 0])
  })

  it('TC-BP0-03: 无脏阶段时原语义不变（停在尾款即定金已完成锁定）', () => {
    addStage(artist.id, '定金', 1, 1, 3000)
    const 尾款 = addStage(artist.id, '尾款', 2, 1, 7000)
    const order = seedOrder(artist.id, { status: 'wip' })
    seedSnapshotNodes(order, [['定金', 3000], ['尾款', 7000]])

    db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(尾款, order.id)
    refreshInstallmentLocks(order.id)

    expect(readNodes(order.id).map(n => n.locked_reason)).toEqual(['completed', null])
  })

  it('TC-BP0-04: done 终态仍按快照节点数收口，全部收款节点完成锁定', () => {
    addStage(artist.id, '定金', 1, 1, 3000)
    addStage(artist.id, '线稿', 2, 1, 0)
    addStage(artist.id, '尾款', 3, 1, 7000)
    const order = seedOrder(artist.id, { status: 'done' })
    seedSnapshotNodes(order, [['定金', 3000], ['尾款', 7000]])

    refreshInstallmentLocks(order.id)

    expect(readNodes(order.id).map(n => n.locked_reason)).toEqual(['completed', 'completed'])
  })

  it('TC-BP0-05: 全是 bp=0 收款阶段的脏工作流 → 不参与锁定推导（返回 -1 语义）', () => {
    addStage(artist.id, '定金', 1, 1, 0)
    addStage(artist.id, '尾款', 2, 1, 0)
    const order = seedOrder(artist.id, { status: 'wip' })
    seedSnapshotNodes(order, [['定金', 0], ['尾款', 0]])

    refreshInstallmentLocks(order.id)

    // 无完成口径可依：既有锁定粘滞之外一律不新增 completed 锁
    expect(readNodes(order.id).every(n => n.locked_reason !== 'completed')).toBe(true)
  })
})
