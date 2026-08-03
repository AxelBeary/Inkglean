import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import * as wf from '../src/features/artist/workflow.service.js'
import { getSpeechInfo } from '../src/features/order/order-workflow.service.js'

// ============================================
// v0.25 #8: 多模板随机
// ============================================

/** 给画师种入默认 7 节点 */
function seed(artistId) {
  wf.seedArtistStages(artistId)
  return wf.getWorkflow(artistId)
}

describe('多模板随机 (Random Template)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  // ─── updateStage: randomTemplate 字段 ───

  it('TC-RT-01: updateStage 设置 randomTemplate=true', () => {
    const stages = seed(artist.id)
    const updated = wf.updateStage(artist.id, stages[0].id, { randomTemplate: true })
    expect(updated.randomTemplate).toBe(true)
  })

  it('TC-RT-02: updateStage 设置 randomTemplate=false', () => {
    const stages = seed(artist.id)
    wf.updateStage(artist.id, stages[0].id, { randomTemplate: true })
    const updated = wf.updateStage(artist.id, stages[0].id, { randomTemplate: false })
    expect(updated.randomTemplate).toBe(false)
  })

  it('TC-RT-03: 默认 randomTemplate=false', () => {
    const stages = seed(artist.id)
    for (const s of stages) {
      expect(s.randomTemplate).toBe(false)
    }
  })

  it('TC-RT-04: updateStage 不传 randomTemplate 不改', () => {
    const stages = seed(artist.id)
    wf.updateStage(artist.id, stages[0].id, { randomTemplate: true })
    // 只改名字
    const updated = wf.updateStage(artist.id, stages[0].id, { name: '新名字' })
    expect(updated.randomTemplate).toBe(true)
  })

  // ─── getSpeechInfo 集成（order-workflow.service.ts） ───

  it('TC-RT-11: getSpeechInfo 接入随机选择', () => {
    const stages = seed(artist.id)
    const stage = stages[2] // 草稿确认
    wf.updateStage(artist.id, stage.id, {
      speechTemplate: '话术A\n话术B\n话术C',
      randomTemplate: true
    })

    const order = seedOrder(artist.id, { client_name: '测试客户' })
    // seedOrder INSERT 不含 current_stage_id，手动关联
    db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(stage.id, order.id)
    // getSpeechInfo 接收订单对象，不是 ID
    const freshOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id)

    const results = new Set()
    for (let i = 0; i < 30; i++) {
      const info = getSpeechInfo(freshOrder)
      if (info.speechText) results.add(info.speechText)
    }
    // 应出现多种结果
    expect(results.size).toBeGreaterThanOrEqual(2)
  })

  it('TC-RT-12: getSpeechInfo randomTemplate=0 始终第一个', () => {
    const stages = seed(artist.id)
    const stage = stages[2]
    wf.updateStage(artist.id, stage.id, {
      speechTemplate: '话术A\n话术B',
      randomTemplate: false
    })

    const order = seedOrder(artist.id, { client_name: '测试客户' })
    db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(stage.id, order.id)
    const freshOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id)

    for (let i = 0; i < 10; i++) {
      const info = getSpeechInfo(freshOrder)
      expect(info.speechText).toBe('话术A')
    }
  })
})
