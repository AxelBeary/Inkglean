import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow, type SeededOrder } from './setup.js'
import * as wf from '../src/features/artist/workflow.service.js'
import { replaceSpeechVars, getSpeechInfo, getStageInfo } from '../src/features/order/order-workflow.service.js'
import type { OrderDetail } from '../src/types/entities.js'

// ============================================
// plan-node-speech: 节点话术 + 变量替换 + 客户沟通数据
// ============================================

const DEFAULT_SPEECH = '{客户名}，你的订单已{节点名}。'

/** 给画师种入默认 7 节点 */
function seed(artistId: number): ReturnType<typeof wf.getWorkflow> {
  wf.seedArtistStages(artistId)
  return wf.getWorkflow(artistId)
}

describe('节点话术 (Speech Template)', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  // ─── 迁移 v20 ───

  it('TC-SP-01: 种子节点带默认话术', () => {
    const stages = seed(artist.id)
    for (const s of stages) {
      expect(s.speechTemplate).toBe(DEFAULT_SPEECH)
    }
  })

  it('TC-SP-02: addStage 新节点带默认话术', () => {
    seed(artist.id)
    const newStage = wf.addStage(artist.id, { name: '测试节点' })!
    expect(newStage.speechTemplate).toBe(DEFAULT_SPEECH)
  })

  it('TC-SP-03: updateStage 修改话术', () => {
    const stages = seed(artist.id)
    const target = stages[0]
    const updated = wf.updateStage(artist.id, target.id, {
      speechTemplate: '你好{客户名}，{节点名}完成了！'
    })!
    expect(updated.speechTemplate).toBe('你好{客户名}，{节点名}完成了！')
  })

  it('TC-SP-04: updateStage 不传 speechTemplate 不改', () => {
    const stages = seed(artist.id)
    const target = stages[0]
    // 先改话术
    wf.updateStage(artist.id, target.id, { speechTemplate: '自定义话术' })
    // 只改名字
    const updated = wf.updateStage(artist.id, target.id, { name: '新名字' })!
    expect(updated.speechTemplate).toBe('自定义话术')
    expect(updated.name).toBe('新名字')
  })

  it('TC-SP-05: updateStage speechTemplate=null 清空', () => {
    const stages = seed(artist.id)
    const target = stages[0]
    const updated = wf.updateStage(artist.id, target.id, { speechTemplate: null })!
    expect(updated.speechTemplate).toBeNull()
  })

  it('TC-SP-06: resetArtistStages 重置后带默认话术', () => {
    const stages = seed(artist.id)
    wf.updateStage(artist.id, stages[0].id, { speechTemplate: '自定义' })
    const reset = wf.resetArtistStages(artist.id)
    for (const s of reset) {
      expect(s.speechTemplate).toBe(DEFAULT_SPEECH)
    }
  })
})

describe('话术变量替换 (replaceSpeechVars)', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-SP-07: 9 个变量全部替换', () => {
    seed(artist.id)
    const stages = wf.getWorkflow(artist.id)
    const stage = stages[2] // 草稿确认

    // 创建带完整数据的订单
    const order = seedOrder(artist.id, {
      client_name: '张三',
      client_qq: '123456789',
      order_no: 'ALICE-001'
    }) as OrderDetail & SeededOrder
    // 设置 tier_name（JOIN 字段，手动补）+ deadline（seedOrder 不含此列）
    order.tier_name = '半身像'
    order.final_price_cents = 50000
    order.current_stage_id = stage.id
    order.deadline = '2026-08-05 00:00:00'
    order.paid_total_cents = 15000 // B7: 话术改读 paid_total_cents

    // 插入分期（仅作应收参考；status 列已随 v52 退役，不再写入）
    db.prepare(
      "INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, '定金', 3000, 15000, 0)"
    ).run(order.id)
    db.prepare(
      "INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, '尾款', 7000, 35000, 1)"
    ).run(order.id)

    const template = '{客户名}({客户QQ})，订单{订单号}，档位{档位名}，已{节点名}。截稿{截稿日}，总价{总价}，已付{已付}，待付{待付}。'
    const result = replaceSpeechVars(template, order, stage.name)

    expect(result).toBe('张三(123456789)，订单ALICE-001，档位半身像，已草稿确认。截稿8月5日，总价¥500，已付¥150，待付¥350。')
  })

  it('TC-SP-07b: d3 P2——UTC 存储串补 Z 解析，UTC+8 夜间不差一天', () => {
    const order = seedOrder(artist.id, { client_name: '夜班', client_qq: '888' }) as OrderDetail & SeededOrder
    order.deadline = '2026-08-12 20:00:00' // UTC 20:00 = 本地 8/13 04:00
    const result = replaceSpeechVars('截稿{截稿日}', order, '')
    expect(result).toBe('截稿8月13日')
  })

  it('TC-SP-08: 空值替换为空字符串', () => {
    const order = seedOrder(artist.id, {
      client_name: null,
      client_qq: '99999'
    }) as OrderDetail & SeededOrder
    order.tier_name = null
    order.final_price_cents = null
    order.total_price_cents = null
    order.deadline = null
    order.current_stage_id = null

    const template = '{客户名}，{档位名}，{截稿日}，{总价}'
    const result = replaceSpeechVars(template, order, '线稿确认')
    expect(result).toBe('，，，')
  })

  it('TC-SP-09: 默认话术替换', () => {
    const order = seedOrder(artist.id, { client_name: '李四' }) as OrderDetail & SeededOrder
    const result = replaceSpeechVars(DEFAULT_SPEECH, order, '完稿确认')
    expect(result).toBe('李四，你的订单已完稿确认。')
  })

  it('TC-SP-10: template 为 null 返回空串', () => {
    const order = seedOrder(artist.id) as OrderDetail & SeededOrder
    expect(replaceSpeechVars(null, order, '节点')).toBe('')
  })

  it('TC-SP-11: 金额非整数保留两位小数', () => {
    const order = seedOrder(artist.id) as OrderDetail & SeededOrder
    order.final_price_cents = 12345
    order.current_stage_id = null
    order.paid_total_cents = 3704 // B7: 话术改读 paid_total_cents

    db.prepare(
      "INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, '定金', 3000, 3704, 0)"
    ).run(order.id)

    const template = '总价{总价}，已付{已付}，待付{待付}'
    const result = replaceSpeechVars(template, order, '')
    expect(result).toBe('总价¥123.45，已付¥37.04，待付¥86.41')
  })
})

describe('客户沟通数据 (getSpeechInfo)', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-SP-12: 有流程节点 → speechText + 价格小结', () => {
    const stages = seed(artist.id)
    const order = seedOrder(artist.id, {
      client_name: '王五',
      client_qq: '888888888'
    }) as OrderDetail & SeededOrder
    order.final_price_cents = 100000
    order.current_stage_id = stages[3].id // 线稿确认
    order.tier_name = '全身像'
    order.paid_total_cents = 30000 // B7: 话术改读 paid_total_cents

    db.prepare(
      "INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, '定金', 3000, 30000, 0)"
    ).run(order.id)
    db.prepare(
      "INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, '尾款', 7000, 70000, 1)"
    ).run(order.id)

    const info = getSpeechInfo(order)
    expect(info.speechText).toBe('王五，你的订单已线稿确认。')
    expect(info.clientQq).toBe('888888888')
    expect(info.totalPriceCents).toBe(100000)
    expect(info.paidCents).toBe(30000)
    expect(info.unpaidCents).toBe(70000)
  })

  it('TC-SP-13: 无流程节点 → speechText=null，价格小结仍有', () => {
    const order = seedOrder(artist.id, { client_qq: '777777777' }) as OrderDetail & SeededOrder
    order.final_price_cents = 50000
    order.current_stage_id = null

    const info = getSpeechInfo(order)
    expect(info.speechText).toBeNull()
    expect(info.clientQq).toBe('777777777')
    expect(info.totalPriceCents).toBe(50000)
    expect(info.paidCents).toBe(0)
    expect(info.unpaidCents).toBe(50000)
  })

  it('TC-SP-14: 无价格 → totalPriceCents=null', () => {
    const stages = seed(artist.id)
    const order = seedOrder(artist.id) as OrderDetail & SeededOrder
    order.current_stage_id = stages[0].id
    order.final_price_cents = null
    order.total_price_cents = null

    const info = getSpeechInfo(order)
    expect(info.speechText).toContain('你的订单已')
    expect(info.totalPriceCents).toBeNull()
    expect(info.unpaidCents).toBeNull()
  })

  it('TC-SP-15: 自定义话术生效', () => {
    const stages = seed(artist.id)
    const stage = stages[0]
    wf.updateStage(artist.id, stage.id, {
      speechTemplate: '嗨{客户名}！{订单号}已到{节点名}阶段，预计{截稿日}前完成~'
    })

    const order = seedOrder(artist.id, {
      client_name: '赵六',
      order_no: 'ALICE-099'
    }) as OrderDetail & SeededOrder
    order.current_stage_id = stage.id
    order.deadline = '2026-09-15 00:00:00'

    const info = getSpeechInfo(order)
    expect(info.speechText).toBe('嗨赵六！ALICE-099已到定稿阶段，预计9月15日前完成~')
  })

  // L-4（审计 三#10）: stage id 查询必须带画师归属过滤（纵深防御）
  it('TC-SP-16: 跨画师 stage id 按 artistId 过滤为不存在（L-4）', () => {
    seed(artist.id)
    const other = seedArtist({ qq_number: '22333', subdomain: 'other-speech' })
    seed(other.id)
    const otherStage = wf.getWorkflow(other.id)[0]

    const order = seedOrder(artist.id) as OrderDetail & SeededOrder
    order.current_stage_id = otherStage.id

    // 显式传本画师 id → 跨画师节点视为不存在（话术与进度都按归属过滤）
    const info = getSpeechInfo(order, artist.id)
    expect(info.speechText).toBeNull()
    expect(getStageInfo(order, artist.id)).toBeNull()
    // 缺省回落 order.artist_id，同口径
    expect(getSpeechInfo(order).speechText).toBeNull()
  })
})
