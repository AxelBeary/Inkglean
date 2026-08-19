import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import * as orderWorkflowService from '../src/features/order/order-workflow.service.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'

/**
 * audit-a 批：P1-1 工作流状态机（pending→wip）+ P3-5 enableTracking 终态守卫
 */

/** 构造三节点工作流：定金(收款) → 线稿(非收款) → 交付(收款) */
function seedThreeStageArtist(qq: string, sub: string) {
  const artist = seedArtist({ qq_number: qq, subdomain: sub })
  db.prepare('DELETE FROM artist_workflow_stages WHERE artist_id = ?').run(artist.id)
  const insert = db.prepare(
    'INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, ?, ?)'
  )
  const id1 = Number(insert.run(artist.id, '定金', 1, 1, 3000).lastInsertRowid)
  const id2 = Number(insert.run(artist.id, '线稿', 2, 0, null).lastInsertRowid)
  const id3 = Number(insert.run(artist.id, '交付', 3, 1, 7000).lastInsertRowid)
  return { artist, stageIds: [id1, id2, id3] }
}

describe('audit-a P1-1 工作流状态机（pending→wip）', () => {
  beforeEach(() => cleanDb())

  it('TC-A1-01: 非收款第 2 节点从 pending 推进成功且状态为 wip', () => {
    const { artist, stageIds } = seedThreeStageArtist('88101', 'a1-three')
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    expect(order.status).toBe('pending')

    // 修复前：mapStageToStatus 返回 wip 但 pending 无 wip 出边 → INVALID_TRANSITION 卡死
    const advanced = orderWorkflowService.advanceStage(order.id, stageIds[1])
    expect(advanced.status).toBe('wip')
    expect(advanced.current_stage_id).toBe(stageIds[1])
  })

  it('TC-A1-02: 两节点常规路径回归不破（pending 直推末节点仍被拒）', () => {
    const artist = seedArtist({ qq_number: '88102', subdomain: 'a1-two' })
    db.prepare('DELETE FROM artist_workflow_stages WHERE artist_id = ?').run(artist.id)
    const insert = db.prepare(
      'INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, ?, ?)'
    )
    const id1 = Number(insert.run(artist.id, '定稿', 1, 0, null).lastInsertRowid)
    const id2 = Number(insert.run(artist.id, '交付', 2, 1, 10000).lastInsertRowid)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })

    expect(() => orderWorkflowService.advanceStage(order.id, id2)).toThrow('INVALID_TRANSITION')
    // 订单未被写入
    const after = db.prepare('SELECT status, current_stage_id FROM orders WHERE id = ?').get(order.id) as { status: string; current_stage_id: number | null }
    expect(after.status).toBe('pending')
    expect(after.current_stage_id).toBe(id1)
  })

  it('TC-A1-03: 默认 7 节点常规路径回归不破', () => {
    const artist = seedArtist({ qq_number: '88103', subdomain: 'a1-default' })
    seedArtistStages(artist.id)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const stages = db.prepare(
      'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
    ).all(artist.id) as Array<{ id: number }>

    for (let i = 1; i < stages.length; i++) {
      const updated = orderWorkflowService.advanceStage(order.id, stages[i].id)
      expect(updated.current_stage_id).toBe(stages[i].id)
    }
    expect(orderService.getOrder(order.id)!.status).toBe('done')
  })
})

describe('audit-a P3-5 enableTracking 终态守卫', () => {
  beforeEach(() => cleanDb())

  it('TC-A3-05: delivered 订单开启跟踪被拒', () => {
    const artist = seedArtist({ qq_number: '88104', subdomain: 'a1-done' })
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    db.prepare("UPDATE orders SET status = 'delivered' WHERE id = ?").run(order.id)
    seedArtistStages(artist.id)

    expect(() => orderWorkflowService.enableTracking(order.id)).toThrow('INVALID_TRANSITION')
  })

  it('TC-A3-05b: cancelled 订单开启跟踪被拒', () => {
    const artist = seedArtist({ qq_number: '88105', subdomain: 'a1-cancel' })
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(order.id)
    seedArtistStages(artist.id)

    expect(() => orderWorkflowService.enableTracking(order.id)).toThrow('INVALID_TRANSITION')
    // 守卫必须发生在写库前：current_stage_id 仍为 null
    const after = db.prepare('SELECT current_stage_id FROM orders WHERE id = ?').get(order.id) as { current_stage_id: number | null }
    expect(after.current_stage_id).toBeNull()
  })

  it('TC-A3-05c: 非终态订单开启跟踪不受影响', () => {
    const artist = seedArtist({ qq_number: '88106', subdomain: 'a1-open' })
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    seedArtistStages(artist.id)

    const tracked = orderWorkflowService.enableTracking(order.id)
    expect(tracked.current_stage_id).not.toBeNull()
  })
})
