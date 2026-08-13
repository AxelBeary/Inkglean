/**
 * 批1 后端状态机修复测试（audit-b F1/F2 + audit-a F1）
 *
 * 覆盖：
 *   - R1: advanceStage 写库前过统一断言 assertStatusTransition，两节点工作流
 *         pending 直推末节点被拒；关跟踪（current_stage_id=null）不再绕过状态机
 *   - R1: 交付路径并入状态机——wip → delivered 显式合法
 *   - R2: rollbackStage done 守卫（REQ-025 R13）+ 写 revision 前过状态机断言，
 *         confirmed → revision 被拒；wip → revision 合法
 *   - R3: deleteExtraItem 减后总价不得为负守卫（与 addExtraItem 对称）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import { advanceStage, rollbackStage } from '../src/features/order/order-workflow.service.js'
import { deliverOrder, deliverOrderWithoutFile } from '../src/features/order/order-gallery.service.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

beforeEach(() => cleanDb())

/** P2-F8: 在临时上传目录真实落盘交付文件，返回相对路径（交付前校验文件存在） */
function ensureDeliverable(artistId, relName) {
  const absDir = join(process.env.UPLOAD_DIR, 'deliverables', String(artistId))
  mkdirSync(absDir, { recursive: true })
  writeFileSync(join(absDir, relName), 'b1 test file')
  return `deliverables/${artistId}/${relName}`
}

/**
 * 造两节点工作流画师（节点1 定稿 → pending；节点2 交付 → done）。
 * 该配置下「pending 直推末节点」是状态机外跳转，R1 必须拒绝。
 */
function seedTwoStageArtist(qq = '88011', sub = 'b1-two') {
  const artist = seedArtist({ qq_number: qq, subdomain: sub })
  db.prepare('DELETE FROM artist_workflow_stages WHERE artist_id = ?').run(artist.id)
  const insert = db.prepare(
    'INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, ?, ?)'
  )
  const id1 = Number(insert.run(artist.id, '定稿', 1, 0, null).lastInsertRowid)
  const id2 = Number(insert.run(artist.id, '交付', 2, 1, 10000).lastInsertRowid)
  return { artist, stageIds: [id1, id2] }
}

describe('批1 状态机修复（R1/R2/R3）', () => {
  // ─── R1: advanceStage 统一断言 ───

  it('TC-B1-01: 两节点工作流 pending 直推末节点被拒（pending→done 非法）', () => {
    const { artist, stageIds } = seedTwoStageArtist()
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    expect(order.status).toBe('pending')
    expect(order.current_stage_id).toBe(stageIds[0])

    expect(() => advanceStage(order.id, stageIds[1])).toThrow('INVALID_TRANSITION')

    // 订单未被写入：status 与 current_stage_id 均保持原样
    const after = db.prepare('SELECT status, current_stage_id FROM orders WHERE id = ?').get(order.id)
    expect(after.status).toBe('pending')
    expect(after.current_stage_id).toBe(stageIds[0])
  })

  it('TC-B1-02: 关跟踪后直推末节点被拒（current_stage_id=null 不再绕过状态机）', () => {
    const { artist, stageIds } = seedTwoStageArtist()
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })

    // 先关跟踪（行为保持不变：只清 current_stage_id，不动 status）
    const closed = advanceStage(order.id, null)
    expect(closed.current_stage_id).toBeNull()
    expect(closed.status).toBe('pending')

    // 关跟踪后直推末节点：仍按状态机拒绝（audit-b F1 绕过场景）
    expect(() => advanceStage(order.id, stageIds[1])).toThrow('INVALID_TRANSITION')
    const after = db.prepare('SELECT status, current_stage_id FROM orders WHERE id = ?').get(order.id)
    expect(after.status).toBe('pending')
    expect(after.current_stage_id).toBeNull()
  })

  it('TC-B1-03: wip 交付到 delivered 合法（交付路径并入统一状态机）', () => {
    const artist = seedArtist({ qq_number: '88013', subdomain: 'b1-deliver' })
    const order = seedOrder(artist.id, { status: 'wip' })

    // 无文件交付：wip → delivered 合法
    const result = deliverOrderWithoutFile(order.id)
    expect(result.statusChanged).toBe(true)
    expect(result.order.status).toBe('delivered')

    // 带文件交付（audit-a P2-1）：wip 直接交付 → delivered + 落文件
    const wipOrder = seedOrder(artist.id, { status: 'wip', order_no: 'B1-DEL-FILE' })
    const withFile = deliverOrder(wipOrder.id, ensureDeliverable(artist.id, 'art.png'), 'art.png', 100)
    expect(withFile.statusChanged).toBe(true)
    expect(withFile.order.status).toBe('delivered')
    const file = db.prepare('SELECT * FROM deliverables WHERE order_id = ?').get(wipOrder.id)
    expect(file).toBeTruthy()
  })

  // ─── R2: rollbackStage 守卫 ───

  /** 默认 7 节点工作流下合法推进到指定下标节点 */
  function advanceLegally(orderId, stages, toIdx) {
    for (let i = 1; i <= toIdx; i++) {
      advanceStage(orderId, stages[i].id)
    }
  }

  it('TC-B1-04: done 回退被拒（REQ-025 R13：done 后禁止工作流回退）', () => {
    const artist = seedArtist({ qq_number: '88014', subdomain: 'b1-done-back' })
    seedArtistStages(artist.id)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const stages = db.prepare(
      'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
    ).all(artist.id)

    // 逐级合法推进到末节点 → done
    advanceLegally(order.id, stages, stages.length - 1)
    const done = orderService.getOrder(order.id)
    expect(done.status).toBe('done')
    expect(done.current_stage_id).toBe(stages[stages.length - 1].id)

    // done 回退（含打回任意前序节点）一律拒绝，且无副作用
    expect(() => rollbackStage(order.id, stages[0].id)).toThrow('INVALID_TRANSITION')
    const after = orderService.getOrder(order.id)
    expect(after.status).toBe('done')
    expect(after.current_stage_id).toBe(stages[stages.length - 1].id)
    const notes = db.prepare("SELECT COUNT(*) AS c FROM order_notes WHERE order_id = ? AND content LIKE '%↩%'").get(order.id)
    expect(notes.c).toBe(0)
  })

  it('TC-B1-05: confirmed 回退被拒（confirmed→revision 非法，状态机拦截在写库前）', () => {
    const artist = seedArtist({ qq_number: '88015', subdomain: 'b1-conf-back' })
    seedArtistStages(artist.id)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const stages = db.prepare(
      'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
    ).all(artist.id)

    advanceStage(order.id, stages[1].id)
    expect(orderService.getOrder(order.id).status).toBe('confirmed')

    expect(() => rollbackStage(order.id, stages[0].id)).toThrow('INVALID_TRANSITION')
    const after = orderService.getOrder(order.id)
    expect(after.status).toBe('confirmed')
    expect(after.current_stage_id).toBe(stages[1].id)
    // 回退未写库：无 revision 状态、无系统打回备注
    const notes = db.prepare("SELECT COUNT(*) AS c FROM order_notes WHERE order_id = ? AND content LIKE '%↩%'").get(order.id)
    expect(notes.c).toBe(0)
  })

  it('TC-B1-06: wip 回退到 revision 合法', () => {
    const artist = seedArtist({ qq_number: '88016', subdomain: 'b1-wip-back' })
    seedArtistStages(artist.id)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const stages = db.prepare(
      'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
    ).all(artist.id)

    // pending → confirmed → wip
    advanceStage(order.id, stages[1].id)
    advanceStage(order.id, stages[2].id)
    expect(orderService.getOrder(order.id).status).toBe('wip')

    const rolledBack = rollbackStage(order.id, stages[1].id)
    expect(rolledBack.status).toBe('revision')
    expect(rolledBack.current_stage_id).toBe(stages[1].id)
  })

  // ─── R3: deleteExtraItem 减后总价不得为负 ───

  it('TC-B1-07: 改价1000→加项1500→改回1000→删项 抛 INVALID_PRICE 且订单数据无损', () => {
    const artist = seedArtist({ qq_number: '88017', subdomain: 'b1-price' })
    const order = seedOrder(artist.id)
    db.prepare('UPDATE orders SET total_price_cents = NULL, final_price_cents = NULL WHERE id = ?').run(order.id)

    // 复现 audit-a F1 序列：1000 → +1500 → 回 1000
    orderService.updateFinalPrice(order.id, 1000)
    orderService.addExtraItem(order.id, { name: '加急', priceCents: 1500 })
    expect(orderService.getOrder(order.id).final_price_cents).toBe(2500)
    orderService.updateFinalPrice(order.id, 1000)
    expect(orderService.getOrder(order.id).final_price_cents).toBe(1000)

    const itemId = db.prepare('SELECT id FROM order_extra_items WHERE order_id = ?').get(order.id).id
    const notesBefore = db.prepare('SELECT COUNT(*) AS c FROM order_notes WHERE order_id = ?').get(order.id).c
    const entriesBefore = db.prepare('SELECT COUNT(*) AS c FROM order_price_entries WHERE order_id = ?').get(order.id).c

    // 删 1500 的增项会把 1000 打成 -500 → 抛 INVALID_PRICE
    expect(() => orderService.deleteExtraItem(order.id, itemId)).toThrow('INVALID_PRICE')

    // 订单数据无损：final 仍 1000、增项仍在、备注与条目账本均未追加
    const after = orderService.getOrder(order.id)
    expect(after.final_price_cents).toBe(1000)
    expect(after.extraItems).toHaveLength(1)
    expect(after.extraItems[0].price_cents).toBe(1500)
    expect(db.prepare('SELECT COUNT(*) AS c FROM order_notes WHERE order_id = ?').get(order.id).c).toBe(notesBefore)
    expect(db.prepare('SELECT COUNT(*) AS c FROM order_price_entries WHERE order_id = ?').get(order.id).c).toBe(entriesBefore)
  })
})
