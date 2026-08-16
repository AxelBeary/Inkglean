import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { toSqliteDate } from '../src/utils/date.js'
import * as dashboard from '../src/features/artist/dashboard.service.js'

// ============================================
// 仪表盘 API 测试（v0.18 第二批）
// 收入统计 + 合并待办 + 活动流
// ============================================

/** 设置订单为已完成并指定 completed_at */
function completeOrder(orderId, completedAt, finalPriceCents = 10000) {
  db.prepare("UPDATE orders SET status = 'done', completed_at = ?, final_price_cents = ? WHERE id = ?")
    .run(completedAt, finalPriceCents, orderId)
}

/** 添加订单备注 */
function addNote(orderId, content, createdAt) {
  db.prepare('INSERT INTO order_notes (order_id, content, created_by, created_at) VALUES (?, ?, ?, ?)')
    .run(orderId, content, 'artist', createdAt)
}

describe('收入统计 (getRevenue)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-DASH-01: 月维度——有完成订单返回柱状图+汇总', () => {
    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const completedAt = `${now.getFullYear()}-${month}-${day} 10:00:00`

    const o1 = seedOrder(artist.id, { order_no: 'T-001' })
    completeOrder(o1.id, completedAt, 50000)

    const result = dashboard.getRevenue(artist.id, 'month')
    expect(result.period).toBe('month')
    expect(result.bars.length).toBeGreaterThanOrEqual(28)
    expect(result.summary.totalCents).toBe(50000)
    expect(result.summary.completedCount).toBe(1)
  })

  it('TC-DASH-02: 月维度——无完成订单返回全0', () => {
    const result = dashboard.getRevenue(artist.id, 'month')
    expect(result.summary.totalCents).toBe(0)
    expect(result.summary.completedCount).toBe(0)
    expect(result.bars.every(b => b.cents === 0)).toBe(true)
  })

  it('TC-DASH-03: 年维度——按月聚合12个柱', () => {
    const now = new Date()
    const o1 = seedOrder(artist.id, { order_no: 'T-002' })
    completeOrder(o1.id, `${now.getFullYear()}-03-15 12:00:00`, 30000)

    const result = dashboard.getRevenue(artist.id, 'year')
    expect(result.period).toBe('year')
    expect(result.bars).toHaveLength(12)
    expect(result.bars[2].cents).toBe(30000) // 3月
    expect(result.summary.totalCents).toBe(30000)
  })

  it('TC-DASH-04: 季维度——按周聚合13个柱', () => {
    const now = new Date()
    const quarter = Math.floor(now.getMonth() / 3)
    const qMonth = quarter * 3 + 1
    const o1 = seedOrder(artist.id, { order_no: 'T-003' })
    completeOrder(o1.id, `${now.getFullYear()}-${String(qMonth).padStart(2, '0')}-05 08:00:00`, 20000)

    const result = dashboard.getRevenue(artist.id, 'quarter')
    expect(result.period).toBe('quarter')
    expect(result.bars).toHaveLength(13)
    expect(result.summary.totalCents).toBe(20000)
  })

  it('TC-DASH-05: 环比——有上期数据返回百分比', () => {
    const now = new Date()
    // 上月订单
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth()
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const o1 = seedOrder(artist.id, { order_no: 'T-004' })
    completeOrder(o1.id, `${prevYear}-${String(prevMonth).padStart(2, '0')}-15 10:00:00`, 40000)

    // 本月订单
    const curMonth = String(now.getMonth() + 1).padStart(2, '0')
    const o2 = seedOrder(artist.id, { order_no: 'T-005' })
    completeOrder(o2.id, `${now.getFullYear()}-${curMonth}-10 10:00:00`, 60000)

    const result = dashboard.getRevenue(artist.id, 'month')
    // 60000 vs 40000 → +50%
    expect(result.summary.changePercent).toBe(50)
  })

  it('TC-DASH-06: 环比——无上期数据返回null', () => {
    const now = new Date()
    const curMonth = String(now.getMonth() + 1).padStart(2, '0')
    const o1 = seedOrder(artist.id, { order_no: 'T-006' })
    completeOrder(o1.id, `${now.getFullYear()}-${curMonth}-10 10:00:00`, 10000)

    const result = dashboard.getRevenue(artist.id, 'month')
    expect(result.summary.changePercent).toBeNull()
  })

  it('TC-DASH-07: 金额回退链——无 final_price 用 total_price', () => {
    const now = new Date()
    const curMonth = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const o1 = seedOrder(artist.id, { order_no: 'T-007' })
    db.prepare("UPDATE orders SET status = 'done', completed_at = ?, final_price_cents = NULL, total_price_cents = 25000 WHERE id = ?")
      .run(`${now.getFullYear()}-${curMonth}-${day} 10:00:00`, o1.id)

    const result = dashboard.getRevenue(artist.id, 'month')
    expect(result.summary.totalCents).toBe(25000)
  })
})

describe('合并待办列表 (getTodoList)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-DASH-08: 空列表返回空数组', () => {
    const result = dashboard.getTodoList(artist.id)
    expect(result).toEqual([])
  })

  it('TC-DASH-09: 逾期订单排最前+标签逾期', () => {
    const o1 = seedOrder(artist.id, { order_no: 'T-010', status: 'wip' })
    db.prepare("UPDATE orders SET deadline = '2020-01-01 00:00:00' WHERE id = ?").run(o1.id)

    seedOrder(artist.id, { order_no: 'T-011', status: 'pending' })

    const result = dashboard.getTodoList(artist.id)
    expect(result[0].orderNo).toBe('T-010')
    expect(result[0].tag).toBe('逾期')
    expect(result[1].tag).toBe('新单')
  })

  it('TC-DASH-10: 今日截稿排在逾期之后', () => {
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 12:00:00`

    const o1 = seedOrder(artist.id, { order_no: 'T-012', status: 'wip' })
    db.prepare("UPDATE orders SET deadline = '2020-01-01 00:00:00' WHERE id = ?").run(o1.id)

    const o2 = seedOrder(artist.id, { order_no: 'T-013', status: 'wip' })
    db.prepare('UPDATE orders SET deadline = ? WHERE id = ?').run(todayStr, o2.id)

    const result = dashboard.getTodoList(artist.id)
    expect(result[0].tag).toBe('逾期')
    expect(result[1].tag).toBe('截稿')
  })

  it('TC-DASH-11: pending 排在截稿之后', () => {
    seedOrder(artist.id, { order_no: 'T-014', status: 'pending' })
    seedOrder(artist.id, { order_no: 'T-015', status: 'revision' })

    const result = dashboard.getTodoList(artist.id)
    expect(result[0].tag).toBe('新单')
    expect(result[1].tag).toBe('修改')
  })

  it('TC-DASH-12: done 不算终态，仍在列表中', () => {
    seedOrder(artist.id, { order_no: 'T-016', status: 'done' })

    const result = dashboard.getTodoList(artist.id)
    expect(result).toHaveLength(1)
    expect(result[0].orderNo).toBe('T-016')
    expect(result[0].tag).toBe('进行中')
  })

  it('TC-DASH-13: delivered/cancelled 不出现', () => {
    seedOrder(artist.id, { order_no: 'T-017', status: 'delivered' })
    seedOrder(artist.id, { order_no: 'T-018', status: 'cancelled' })

    const result = dashboard.getTodoList(artist.id)
    expect(result).toHaveLength(0)
  })

  it('TC-DASH-14: 有 deadline 的 confirmed/wip 按 deadline 升序', () => {
    const o1 = seedOrder(artist.id, { order_no: 'T-019', status: 'wip' })
    db.prepare("UPDATE orders SET deadline = '2099-12-31 00:00:00' WHERE id = ?").run(o1.id)

    const o2 = seedOrder(artist.id, { order_no: 'T-020', status: 'confirmed' })
    db.prepare("UPDATE orders SET deadline = '2099-06-01 00:00:00' WHERE id = ?").run(o2.id)

    const result = dashboard.getTodoList(artist.id)
    expect(result[0].orderNo).toBe('T-020') // 更早的 deadline 排前
    expect(result[1].orderNo).toBe('T-019')
  })

  it('TC-DASH-15: 无 deadline 排最后', () => {
    const o1 = seedOrder(artist.id, { order_no: 'T-021', status: 'wip' })
    db.prepare("UPDATE orders SET deadline = '2099-12-31 00:00:00' WHERE id = ?").run(o1.id)

    seedOrder(artist.id, { order_no: 'T-022', status: 'wip' })
    // 无 deadline

    const result = dashboard.getTodoList(artist.id)
    expect(result[result.length - 1].orderNo).toBe('T-022')
  })
})

describe('活动流 (getActivity)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-DASH-16: 无备注返回空数组', () => {
    const result = dashboard.getActivity(artist.id)
    expect(result).toEqual([])
  })

  it('TC-DASH-17: 返回备注+订单号', () => {
    const o1 = seedOrder(artist.id, { order_no: 'T-030' })
    addNote(o1.id, '画师添加备注', '2026-08-01 10:00:00')

    const result = dashboard.getActivity(artist.id)
    expect(result).toHaveLength(1)
    expect(result[0].orderNo).toBe('T-030')
    expect(result[0].content).toBe('画师添加备注')
    expect(result[0].createdAt).toBe('2026-08-01 10:00:00')
  })

  it('TC-DASH-18: 限制10条', () => {
    const o1 = seedOrder(artist.id, { order_no: 'T-031' })
    for (let i = 1; i <= 15; i++) {
      addNote(o1.id, `备注${i}`, `2026-08-01 ${String(i).padStart(2, '0')}:00:00`)
    }

    const result = dashboard.getActivity(artist.id)
    expect(result).toHaveLength(10)
    // 最新的排前面
    expect(result[0].content).toBe('备注15')
  })

  it('TC-DASH-19: 按 created_at DESC 排序', () => {
    const o1 = seedOrder(artist.id, { order_no: 'T-032' })
    addNote(o1.id, '第一条', '2026-08-01 08:00:00')
    addNote(o1.id, '第二条', '2026-08-01 12:00:00')
    addNote(o1.id, '第三条', '2026-08-01 10:00:00')

    const result = dashboard.getActivity(artist.id)
    expect(result[0].content).toBe('第二条')
    expect(result[1].content).toBe('第三条')
    expect(result[2].content).toBe('第一条')
  })

  it('TC-DASH-20: 跨订单备注混合排列', () => {
    const o1 = seedOrder(artist.id, { order_no: 'T-033' })
    const o2 = seedOrder(artist.id, { order_no: 'T-034' })
    addNote(o1.id, '订单1备注', '2026-08-01 09:00:00')
    addNote(o2.id, '订单2备注', '2026-08-01 11:00:00')

    const result = dashboard.getActivity(artist.id)
    expect(result).toHaveLength(2)
    expect(result[0].orderNo).toBe('T-034')
    expect(result[1].orderNo).toBe('T-033')
  })
describe('时区口径（P2-1）：季度周分组与本地日期一致', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-DASH-TZ-01: 季度周分组——UTC 凌晨订单归入本地日期所在周', () => {
    // 构造一个 UTC 00:30 完成、本地时区同日 00:30 的订单（北京 +8）
    // 核心：completed_at 存 UTC；SQL 层 localtime 转本地日后再分周，不因 UTC/本地差跨周
    const now = new Date()
    const year = now.getFullYear()
    const quarter = Math.floor(now.getMonth() / 3)
    // 季度第 8 天本地 00:30 → 应在第 2 周（W2, index 1）
    const local8th = new Date(year, quarter * 3, 8, 0, 30, 0)
    const o = seedOrder(artist.id, { order_no: 'TZ-001' })
    // 存入 UTC 表示（toSqliteDate = UTC）
    completeOrder(o.id, toSqliteDate(local8th), 20000)

    const result = dashboard.getRevenue(artist.id, 'quarter')
    expect(result.period).toBe('quarter')
    // 本地第 8 天：距季度首日 7 天 → week = 1（W2）
    expect(result.bars[1].cents).toBe(20000)
    expect(result.bars[0].cents).toBe(0)
  })

  it('TC-DASH-TZ-02: 季度周分组——月末最后一天不溢出到下周', () => {
    const now = new Date()
    const year = now.getFullYear()
    const quarter = Math.floor(now.getMonth() / 3)
    // 季度第 14 天本地 23:59 → 第 2 周（week = 1）
    const local14th = new Date(year, quarter * 3, 14, 23, 59, 0)
    const o = seedOrder(artist.id, { order_no: 'TZ-002' })
    completeOrder(o.id, toSqliteDate(local14th), 30000)

    const result = dashboard.getRevenue(artist.id, 'quarter')
    expect(result.bars[1].cents).toBe(30000)
    expect(result.bars[2].cents).toBe(0)
  })

  it('TC-DASH-TZ-03: 月维度——UTC 凌晨订单按本地日期落柱', () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    // 本月第 3 天本地 00:30
    const local3rd = new Date(year, month, 3, 0, 30, 0)
    const o = seedOrder(artist.id, { order_no: 'TZ-003' })
    completeOrder(o.id, toSqliteDate(local3rd), 40000)

    const result = dashboard.getRevenue(artist.id, 'month')
    // 本地第 3 天 → bars[2]
    expect(result.bars[2].cents).toBe(40000)
    expect(result.bars[1].cents).toBe(0)
  })
})
})

// ============================================
// E3: 账本待办动词接真实工作流节点——todo 接口增补 stageName
// 只增字段不改语义；无工作流节点的订单降级为 null
// ============================================

/** 给画师建一个工作流节点并挂到订单上 */
function bindStage(artistId, orderId, name, sortOrder = 1) {
  const stage = db.prepare(
    'INSERT INTO artist_workflow_stages (artist_id, name, sort_order) VALUES (?, ?, ?)'
  ).run(artistId, name, sortOrder)
  db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(stage.lastInsertRowid, orderId)
}

describe('合并待办列表 stageName（E3）', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-DASH-21: wip 订单有工作流节点 → stageName 返回节点名', () => {
    const o = seedOrder(artist.id, { order_no: 'E3-001', status: 'wip' })
    bindStage(artist.id, o.id, '细化')

    const result = dashboard.getTodoList(artist.id)
    expect(result).toHaveLength(1)
    expect(result[0].orderNo).toBe('E3-001')
    expect(result[0].stageName).toBe('细化')
  })

  it('TC-DASH-22: 无工作流节点的订单 → stageName 为 null（降级不报错）', () => {
    seedOrder(artist.id, { order_no: 'E3-002', status: 'wip' })

    const result = dashboard.getTodoList(artist.id)
    expect(result).toHaveLength(1)
    expect(result[0].stageName).toBeNull()
  })

  it('TC-DASH-23: current_stage_id 指向不存在的节点（脏数据）→ stageName 为 null', () => {
    const o = seedOrder(artist.id, { order_no: 'E3-003', status: 'wip' })
    db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(999999, o.id)

    const result = dashboard.getTodoList(artist.id)
    expect(result).toHaveLength(1)
    expect(result[0].stageName).toBeNull()
  })

  it('TC-DASH-24: stageName 不影响既有字段与排序（只增不改）', () => {
    const o1 = seedOrder(artist.id, { order_no: 'E3-004', status: 'wip' })
    db.prepare("UPDATE orders SET deadline = '2020-01-01 00:00:00' WHERE id = ?").run(o1.id)
    bindStage(artist.id, o1.id, '线稿')
    seedOrder(artist.id, { order_no: 'E3-005', status: 'pending' })

    const result = dashboard.getTodoList(artist.id)
    expect(result.map(r => r.orderNo)).toEqual(['E3-004', 'E3-005'])
    expect(result[0].tag).toBe('逾期')
    expect(result[0]).toEqual({
      id: o1.id,
      orderNo: 'E3-004',
      clientName: null,
      status: 'wip',
      deadline: '2020-01-01 00:00:00',
      tag: '逾期',
      stageName: '线稿',
      // 815 审计 P1-2: 新增字段，单节点时 nextStageId 为 null
      currentStageId: expect.any(Number),
      nextStageId: null
    })
  })
})

// ============================================
// 815 审计 P1-2: 待办清单推进工作流单——todo 接口增补 currentStageId/nextStageId，
// R30d 放行 confirmed/wip 纯状态流转；done 仍须走节点推进
// ============================================

describe('待办清单工作流字段（815 审计 P1-2）', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  /** 建两个节点（草稿→线稿），订单挂到第一节点 */
  function bindTwoStages(artistId, orderId) {
    const s1 = db.prepare('INSERT INTO artist_workflow_stages (artist_id, name, sort_order) VALUES (?, ?, ?)').run(artistId, '草稿', 1)
    const s2 = db.prepare('INSERT INTO artist_workflow_stages (artist_id, name, sort_order) VALUES (?, ?, ?)').run(artistId, '线稿', 2)
    db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(s1.lastInsertRowid, orderId)
    return { s1: Number(s1.lastInsertRowid), s2: Number(s2.lastInsertRowid) }
  }

  it('TC-DASH-26: 多节点工作流单 → currentStageId/nextStageId 正确下发；已是末节点 → nextStageId 为 null', () => {
    const o = seedOrder(artist.id, { order_no: 'P12-001', status: 'wip' })
    const { s1, s2 } = bindTwoStages(artist.id, o.id)

    let result = dashboard.getTodoList(artist.id)
    expect(result[0].currentStageId).toBe(s1)
    expect(result[0].nextStageId).toBe(s2)

    // 推到末节点后无下一节点
    db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(s2, o.id)
    result = dashboard.getTodoList(artist.id)
    expect(result[0].currentStageId).toBe(s2)
    expect(result[0].nextStageId).toBeNull()
  })

  it('TC-DASH-27: 无工作流单 → currentStageId/nextStageId 均为 null', () => {
    seedOrder(artist.id, { order_no: 'P12-002', status: 'wip' })
    const result = dashboard.getTodoList(artist.id)
    expect(result[0].currentStageId).toBeNull()
    expect(result[0].nextStageId).toBeNull()
  })
})

describe('R30d 放行矩阵（815 审计 P1-2：工作流单纯状态流转）', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('TC-DASH-28: 工作流单 confirmed/wip 放行、done 仍拦截', async () => {
    const artist = seedArtist()
    const o = seedOrder(artist.id, { order_no: 'P12-010', status: 'pending' })
    const stage = db.prepare('INSERT INTO artist_workflow_stages (artist_id, name, sort_order) VALUES (?, ?, ?)').run(artist.id, '草稿', 1)
    db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(stage.lastInsertRowid, o.id)
    const token = createSession(artist.id, artist.token_version)
    const put = (status) => app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${o.id}/status`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { status }
    })

    // pending → confirmed：纯状态流转，放行
    const r1 = await put('confirmed')
    expect(r1.statusCode).toBe(200)
    // confirmed → wip：纯状态流转，放行
    const r2 = await put('wip')
    expect(r2.statusCode).toBe(200)
    // wip → done：绕过节点推进，仍拦
    const r3 = await put('done')
    expect(r3.statusCode).toBe(400)
    // 状态未被 r3 污染
    const row = db.prepare('SELECT status FROM orders WHERE id = ?').get(o.id)
    expect(row.status).toBe('wip')
  })
})

describe('账本待办接口路由层（E3）', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('TC-DASH-25: GET /api/artist/dashboard/todo 返回含 stageName 的 items 契约', async () => {
    const artist = seedArtist()
    const o = seedOrder(artist.id, { order_no: 'E3-010', status: 'wip' })
    bindStage(artist.id, o.id, '上色')
    const token = createSession(artist.id, artist.token_version)

    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/dashboard/todo',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({
      id: o.id,
      orderNo: 'E3-010',
      status: 'wip',
      stageName: '上色'
    })
  })

  it('TC-DASH-26: 无节点订单路由层 stageName 为 null（降级契约）', async () => {
    const artist = seedArtist()
    seedOrder(artist.id, { order_no: 'E3-011', status: 'wip' })
    const token = createSession(artist.id, artist.token_version)

    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/dashboard/todo',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().items[0].stageName).toBeNull()
  })
})

// ============================================
// E2 补全（清扫批）：画师 profile 端点下发 quotaInfo，仪表盘满态牌额度轴数据源
// ============================================

describe('画师 profile quotaInfo（E2 额度轴数据源）', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('TC-DASH-27: 未启用月度额度 → quotaInfo 为 null', async () => {
    const artist = seedArtist()
    const token = createSession(artist.id, artist.token_version)
    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/profile',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().quotaInfo).toBeNull()
  })

  it('TC-DASH-28: 启用月度额度 → quotaInfo 含 used/quota/remaining（本月未取消单计入）', async () => {
    const artist = seedArtist()
    db.prepare('UPDATE artists SET monthly_quota = 2 WHERE id = ?').run(artist.id)
    seedOrder(artist.id, { order_no: 'E2-001', status: 'wip' })
    seedOrder(artist.id, { order_no: 'E2-002', status: 'cancelled' }) // 取消不计入
    const token = createSession(artist.id, artist.token_version)

    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/profile',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().quotaInfo).toEqual({ used: 1, quota: 2, remaining: 1 })
  })
})
