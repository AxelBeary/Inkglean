/**
 * 批1 后端状态机修复测试（audit-b F1 + audit-a F1）
 *
 * 覆盖：
 *   - R1: advanceStage 写库前过统一断言 assertStatusTransition，两节点工作流
 *         pending 直推末节点被拒；关跟踪（current_stage_id=null）不再绕过状态机
 *   - R1: 交付路径并入状态机——wip → delivered 显式合法
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import { advanceStage } from '../src/features/order/order-workflow.service.js'
import { deliverOrder, deliverOrderWithoutFile } from '../src/features/order/order-gallery.service.js'

beforeEach(() => cleanDb())

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

describe('批1 状态机修复（R1）', () => {
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

    // 带文件交付：wip 允许上传交付物（状态不变，仅落文件）
    const wipOrder = seedOrder(artist.id, { status: 'wip', order_no: 'B1-DEL-FILE' })
    const withFile = deliverOrder(wipOrder.id, 'deliverables/1/art.png', 'art.png', 100)
    expect(withFile.statusChanged).toBe(false)
    expect(withFile.order.status).toBe('wip')
    const file = db.prepare('SELECT * FROM deliverables WHERE order_id = ?').get(wipOrder.id)
    expect(file).toBeTruthy()
  })
})
