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

  // ─── resolveSpeechTemplate ───

  it('TC-RT-05: 单模板 + randomTemplate=1 → 返回唯一模板', () => {
    const stages = seed(artist.id)
    const stage = stages[0]
    wf.updateStage(artist.id, stage.id, {
      speechTemplate: '你好{客户名}',
      randomTemplate: true
    })
    const result = wf.resolveSpeechTemplate(stage.id, { '客户名': '小明' })
    expect(result).toBe('你好小明')
  })

  it('TC-RT-06: 多模板 + randomTemplate=0 → 始终第一个', () => {
    const stages = seed(artist.id)
    const stage = stages[0]
    wf.updateStage(artist.id, stage.id, {
      speechTemplate: '模板A\n模板B\n模板C',
      randomTemplate: false
    })
    // 多次调用都应返回第一个
    for (let i = 0; i < 10; i++) {
      const result = wf.resolveSpeechTemplate(stage.id, {})
      expect(result).toBe('模板A')
    }
  })

  it('TC-RT-07: 多模板 + randomTemplate=1 → 随机选择', () => {
    const stages = seed(artist.id)
    const stage = stages[0]
    wf.updateStage(artist.id, stage.id, {
      speechTemplate: '模板A\n模板B\n模板C',
      randomTemplate: true
    })
    // 多次调用，收集结果
    const results = new Set()
    for (let i = 0; i < 50; i++) {
      results.add(wf.resolveSpeechTemplate(stage.id, {}))
    }
    // 50 次调用应至少出现 2 种（概率极高）
    expect(results.size).toBeGreaterThanOrEqual(2)
    // 所有结果都在合法范围内
    for (const r of results) {
      expect(['模板A', '模板B', '模板C']).toContain(r)
    }
  })

  it('TC-RT-08: resolveSpeechTemplate 变量替换', () => {
    const stages = seed(artist.id)
    const stage = stages[0]
    wf.updateStage(artist.id, stage.id, {
      speechTemplate: '{客户名}的{节点名}完成了',
      randomTemplate: false
    })
    const result = wf.resolveSpeechTemplate(stage.id, { '客户名': '小红', '节点名': '线稿' })
    expect(result).toBe('小红的线稿完成了')
  })

  it('TC-RT-09: speechTemplate 为空 → 返回空字符串', () => {
    const stages = seed(artist.id)
    const stage = stages[0]
    wf.updateStage(artist.id, stage.id, { speechTemplate: null })
    const result = wf.resolveSpeechTemplate(stage.id, {})
    expect(result).toBe('')
  })

  it('TC-RT-10: 不存在的 stageId → 返回空字符串', () => {
    const result = wf.resolveSpeechTemplate(99999, {})
    expect(result).toBe('')
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
