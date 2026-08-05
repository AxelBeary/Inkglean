import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import * as activityLogService from '../src/features/order/activity-log.service.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { advanceStage, rollbackStage } from '../src/features/order/order-workflow.service.js'

// P0-1 (2026-08-05): 事务包裹验证
// 包装 refreshInstallmentLocks / logActivity 为可注入 mock（默认走真实实现），
// 用于模拟事务中间步骤抛错 → 断言整体回滚。
// order.service.js 不反向依赖 order-workflow（无循环依赖），mock 安全。
vi.mock('../src/features/order/order.service.js', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    refreshInstallmentLocks: vi.fn(mod.refreshInstallmentLocks)
  }
})

vi.mock('../src/features/order/activity-log.service.js', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    logActivity: vi.fn(mod.logActivity)
  }
})

describe('订单流程事务包裹 (P0-1)', () => {
  let artist, order, stages

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '11111', subdomain: 'alice' })
    seedArtistStages(artist.id)
    order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    stages = db.prepare(
      'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
    ).all(artist.id)
    // 恢复 mock 默认实现（真实行为），避免跨测试污染
    vi.mocked(orderService.refreshInstallmentLocks).mockRestore()
    vi.mocked(activityLogService.logActivity).mockRestore()
  })

  it('TC-TX-01: advanceStage 中间步骤抛错 → 事务回滚，orders/日志均未变更', () => {
    // R30d: createOrder 自动接入工作流（current_stage_id = 第一个节点）——操作前基线
    const before = db.prepare(
      'SELECT current_stage_id, status FROM orders WHERE id = ?'
    ).get(order.id)
    expect(before.current_stage_id).toBe(stages[0].id)

    // 模拟 refreshInstallmentLocks（第二步写）抛错
    vi.mocked(orderService.refreshInstallmentLocks).mockImplementationOnce(() => {
      throw new Error('mock refreshInstallmentLocks boom')
    })

    expect(() => advanceStage(order.id, stages[1].id)).toThrow('mock refreshInstallmentLocks boom')

    // orders 未变更（第一步 UPDATE 已回滚）
    const after = db.prepare(
      'SELECT current_stage_id, status FROM orders WHERE id = ?'
    ).get(order.id)
    expect(after.current_stage_id).toBe(before.current_stage_id)
    expect(after.status).toBe(before.status)
    // 操作日志未写入（logActivity 在事务内，随回滚撤销）
    const logs = db.prepare(
      'SELECT COUNT(*) AS c FROM order_activity_logs WHERE order_id = ?'
    ).get(order.id)
    expect(logs.c).toBe(0)
  })

  it('TC-TX-02: rollbackStage 中间步骤抛错 → 事务回滚，orders 与备注均未变更', () => {
    // 先推进到节点 3（写 1 条成功日志）
    advanceStage(order.id, stages[2].id)

    // 模拟 logActivity（最后一个写步骤）抛错
    vi.mocked(activityLogService.logActivity).mockImplementationOnce(() => {
      throw new Error('mock logActivity boom')
    })

    expect(() => rollbackStage(order.id, stages[0].id)).toThrow('mock logActivity boom')

    // orders 未变更（仍是节点 3）
    const after = db.prepare(
      'SELECT current_stage_id, status FROM orders WHERE id = ?'
    ).get(order.id)
    expect(after.current_stage_id).toBe(stages[2].id)
    expect(after.status).toBe('wip')
    // order_notes 未插入（事务内回滚）
    const notes = db.prepare(
      'SELECT COUNT(*) AS c FROM order_notes WHERE order_id = ?'
    ).get(order.id)
    expect(notes.c).toBe(0)
  })

  it('TC-TX-03: 成功路径原子提交（回归：orders 更新 + 日志写入）', () => {
    const advanced = advanceStage(order.id, stages[1].id)
    expect(advanced.current_stage_id).toBe(stages[1].id)
    expect(advanced.status).toBe('confirmed')

    const logs = db.prepare(
      'SELECT COUNT(*) AS c FROM order_activity_logs WHERE order_id = ?'
    ).get(order.id)
    expect(logs.c).toBe(1)
  })
})
