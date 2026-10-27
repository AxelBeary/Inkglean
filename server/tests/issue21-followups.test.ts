import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import * as orderWorkflowService from '../src/features/order/order-workflow.service.js'
import { getClientQueuePosition } from '../src/features/order/order-read.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'

/**
 * issue #21 剩余两条小改：
 * - 补充 A：advanceStage(null) 走早退分支，绕过终态守卫
 * - 条目 10：hide_queue_position 只藏了 buffer 侧 queuePosition，主 position/total 仍下发
 */
describe('issue #21 跟进：关跟踪终态守卫', () => {
  beforeEach(() => cleanDb())

  function seedWithStage(qq: string, sub: string, status: string) {
    const artist = seedArtist({ qq_number: qq, subdomain: sub })
    seedArtistStages(artist.id)
    const stage = db.prepare(
      'SELECT id FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC LIMIT 1'
    ).get(artist.id) as { id: number }
    const order = seedOrder(artist.id, { status })
    db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(stage.id, order.id)
    return { artist, order, stageId: stage.id }
  }

  it('TC-21-A1: 已交付订单关跟踪被拒，节点与状态均不变', () => {
    const { order, stageId } = seedWithStage('99701', 'i21-a1', 'delivered')
    expect(() => orderWorkflowService.advanceStage(order.id, null)).toThrow('INVALID_TRANSITION')
    const after = db.prepare('SELECT status, current_stage_id FROM orders WHERE id = ?')
      .get(order.id) as { status: string; current_stage_id: number | null }
    expect(after.status).toBe('delivered')
    expect(after.current_stage_id).toBe(stageId)
  })

  it('TC-21-A2: 已取消订单关跟踪同样被拒', () => {
    const { order, stageId } = seedWithStage('99702', 'i21-a2', 'cancelled')
    expect(() => orderWorkflowService.advanceStage(order.id, null)).toThrow('INVALID_TRANSITION')
    const after = db.prepare('SELECT current_stage_id FROM orders WHERE id = ?')
      .get(order.id) as { current_stage_id: number | null }
    expect(after.current_stage_id).toBe(stageId)
  })

  it('TC-21-A3: 进行中订单关跟踪仍可用（守卫不误伤）', () => {
    const { order } = seedWithStage('99703', 'i21-a3', 'wip')
    const after = orderWorkflowService.advanceStage(order.id, null)
    expect(after.current_stage_id).toBeNull()
    expect(after.status).toBe('wip')
  })
})

describe('issue #21 跟进：隐藏队列位次', () => {
  beforeEach(() => cleanDb())

  it('TC-21-B1: hide_queue_position=1 时 position/total 均不下发', () => {
    const artist = seedArtist({ qq_number: '99711', subdomain: 'i21-b1' })
    db.prepare('UPDATE artists SET hide_queue_position = 1 WHERE id = ?').run(artist.id)
    const mine = seedOrder(artist.id, { status: 'wip', queue_zone: 'formal', queue_position: 1 })
    seedOrder(artist.id, { status: 'wip', queue_zone: 'formal', queue_position: 2 })

    const r = getClientQueuePosition(mine.order_no, mine.customerToken)
    expect(r).not.toBeNull()
    expect(r!.position).toBeNull()
    expect(r!.total).toBeNull()
  })

  it('TC-21-B2: 未开启隐藏时位次照常下发', () => {
    const artist = seedArtist({ qq_number: '99712', subdomain: 'i21-b2' })
    const mine = seedOrder(artist.id, { status: 'wip', queue_zone: 'formal', queue_position: 1 })
    seedOrder(artist.id, { status: 'wip', queue_zone: 'formal', queue_position: 2 })

    const r = getClientQueuePosition(mine.order_no, mine.customerToken)
    expect(r!.position).toBe(1)
    expect(r!.total).toBe(2)
  })
})
