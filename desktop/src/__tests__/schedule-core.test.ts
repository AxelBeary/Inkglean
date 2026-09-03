// 9/4 主页重设计落码波1 · 契约层口径哨兵。
// 钉住四件事：①六态判定顺序（照网页端平移，改序即红）②月历格子口径（42 格/周一开头/free 受名额约束）
// ③摘要签三条诚实口径（逾期压满窗口/已完成不占/未设截稿画满）④归一化（双模式 key 前缀防撞 + 本地不伪造开工日）。
import { describe, it, expect } from 'vitest'
import { bandLabel, bandTone, daysLeft, parseDate, todayStart } from '../schedule/band'
import { buildCalCells, monthCursor, orderSpan, shiftMonth } from '../schedule/cal'
import { buildSchedStrip } from '../schedule/strip'
import { computeCanAccept } from '../schedule/accept'
import { fromLocalOrders, fromQueueRows } from '../schedule/types'
import type { SchedOrder } from '../schedule/types'
import type { QueueRow } from '../api/types'
import type { LocalOrder } from '../stores/localLedger'

// ─── 构造器 ───

/** 相对今天的 YYYY-MM-DD（负数=过去）；date-only 串按 UTC 解析，daysLeft 内部归一到本地日故不受时区影响 */
function iso(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 本地零点 ISO（无 Z 后缀 → JS 按本地时区解析）：固定月份用例用它，跨时区确定性 */
function localIso(y: number, m1: number, d: number): string {
  return `${y}-${String(m1).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00`
}

function sched(p: Partial<SchedOrder> = {}): SchedOrder {
  return {
    id: 1, key: 'cloud-1', who: '桃桃', what: 'OC立绘', status: 'wip',
    zone: 'formal', startDate: null, deadline: null, createdAt: null, done: false, ...p
  }
}

function queueRow(p: Partial<QueueRow> = {}): QueueRow {
  return {
    id: 1, order_no: 'SHI-1', client_name: '桃桃', client_qq: '10001', status: 'wip',
    queue_zone: 'formal', queue_position: 1, deadline: null, start_date: null, startDate: null,
    created_at: '2026-09-01T10:00:00', tier_name: '头像 / 半身', version: 3, ...p
  }
}

function localOrder(p: Partial<LocalOrder> = {}): LocalOrder {
  return {
    id: 1, client_name: '阿江', title: '双人插图', price: 300, deadline: null,
    status: 'in_progress', created_at: '2026-09-01T10:00:00', updated_at: '', ...p
  }
}

// ─── 六态与日期口径 ───

describe('bandTone（六态判定顺序，照网页端 queue-band 平移）', () => {
  it('未设截稿且未完成 → nodeadline', () => {
    expect(bandTone(sched({ deadline: null }))).toBe('nodeadline')
  })
  it('已完成优先于逾期（截稿已过但已交付 → done 不显朱砂）', () => {
    expect(bandTone(sched({ deadline: iso(-3), done: true, status: 'delivered' }))).toBe('done')
  })
  it('截稿已过 → over', () => {
    expect(bandTone(sched({ deadline: iso(-1) }))).toBe('over')
  })
  it('今天截稿与剩 3 天 → soon；剩 4 天 → formal', () => {
    expect(bandTone(sched({ deadline: iso(0) }))).toBe('soon')
    expect(bandTone(sched({ deadline: iso(3) }))).toBe('soon')
    expect(bandTone(sched({ deadline: iso(4) }))).toBe('formal')
  })
  it('缓冲区 → buffer；正式区 → formal', () => {
    expect(bandTone(sched({ deadline: iso(10), zone: 'buffer' }))).toBe('buffer')
    expect(bandTone(sched({ deadline: iso(10), zone: 'formal' }))).toBe('formal')
  })
})

describe('daysLeft / parseDate / bandLabel', () => {
  it('今天 0、未来正、过去负、空与非法 null', () => {
    expect(daysLeft(iso(0))).toBe(0)
    expect(daysLeft(iso(3))).toBe(3)
    expect(daysLeft(iso(-2))).toBe(-2)
    expect(daysLeft(null)).toBeNull()
    expect(daysLeft('不是日期')).toBeNull()
    expect(parseDate('2026-09-01')).toBeInstanceOf(Date)
    expect(parseDate('')).toBeNull()
  })
  it('带文字＝客户-档位；未设截稿且未完成前置警示符', () => {
    expect(bandLabel(sched({ deadline: iso(5) }))).toBe('桃桃-OC立绘')
    expect(bandLabel(sched({ deadline: null }))).toBe('⚠ 桃桃-OC立绘')
    expect(bandLabel(sched({ deadline: null, done: true }))).toBe('桃桃-OC立绘')
    expect(bandLabel(sched({ who: '', deadline: iso(5) }))).toBe('OC立绘')
  })
  it('todayStart 是本地零点', () => {
    const t = todayStart()
    expect([t.getHours(), t.getMinutes(), t.getSeconds()]).toEqual([0, 0, 0])
  })
})

// ─── 归一化 ───

describe('fromQueueRows（云端归一）', () => {
  it('key 加 cloud- 前缀；正式区在前缓冲区在后', () => {
    const rows = fromQueueRows([queueRow({ id: 7 })], [queueRow({ id: 9, queue_zone: 'buffer' })])
    expect(rows.map(r => r.key)).toEqual(['cloud-7', 'cloud-9'])
    expect(rows.map(r => r.zone)).toEqual(['formal', 'buffer'])
  })
  it('zone 以行自带 queue_zone 为准（自卫：请求区位与行不符时信行）', () => {
    const rows = fromQueueRows([queueRow({ id: 1, queue_zone: 'buffer' })], [])
    expect(rows[0].zone).toBe('buffer')
  })
  it('startDate 缺驼峰时回退 snake_case', () => {
    const rows = fromQueueRows([queueRow({ startDate: null, start_date: '2026-09-08' })], [])
    expect(rows[0].startDate).toBe('2026-09-08')
  })
  it('客户名缺则落 QQ；档位缺则落「定制」；delivered/done 记为已完成', () => {
    const rows = fromQueueRows([
      queueRow({ id: 1, client_name: null, tier_name: null, status: 'delivered' }),
      queueRow({ id: 2, status: 'done' }),
      queueRow({ id: 3, status: 'wip' })
    ], [])
    expect(rows[0].who).toBe('10001')
    expect(rows[0].what).toBe('定制')
    expect(rows.map(r => r.done)).toEqual([true, true, false])
  })
  it('纠形：非数组一律按空数组（826 分页对象误当裸数组致整页炸的教训）', () => {
    const bad = { items: [] } as unknown as QueueRow[]
    expect(fromQueueRows(bad, [])).toEqual([])
    expect(fromQueueRows([], bad)).toEqual([])
  })
})

describe('fromLocalOrders（本地归一 · 拍板②诚实缺席）', () => {
  it('key 加 local- 前缀防撞；zone 一律 formal；startDate/createdAt 一律 null（不拿记账日凑开工日）', () => {
    const rows = fromLocalOrders([localOrder({ id: 4, created_at: '2026-09-01T10:00:00' })])
    expect(rows[0].key).toBe('local-4')
    expect(rows[0].zone).toBe('formal')
    expect(rows[0].startDate).toBeNull()
    expect(rows[0].createdAt).toBeNull()
  })
  it('delivered/paid 记为已完成；draft/in_progress 不是', () => {
    const rows = fromLocalOrders([
      localOrder({ id: 1, status: 'paid' }),
      localOrder({ id: 2, status: 'delivered' }),
      localOrder({ id: 3, status: 'draft' })
    ])
    // 三单均无截稿日 → 排序不改变原顺序，done 逐位可断言
    expect(rows.map(r => r.done)).toEqual([true, true, false])
  })
  it('逾期置顶、无截稿沉底', () => {
    const rows = fromLocalOrders([
      localOrder({ id: 1, client_name: '远期', deadline: iso(10) }),
      localOrder({ id: 2, client_name: '无期', deadline: null }),
      localOrder({ id: 3, client_name: '急单', deadline: iso(-1) })
    ])
    expect(rows.map(r => r.who)).toEqual(['急单', '远期', '无期'])
  })
  it('客户名/内容缺失落诚实兜底文案', () => {
    const rows = fromLocalOrders([localOrder({ client_name: '', title: '' })])
    expect(rows[0].who).toBe('有一单')
    expect(rows[0].what).toBe('未写内容')
  })
})

// ─── 月历 ───

describe('shiftMonth / monthCursor', () => {
  it('游标归一到当月 1 号；平移跨年正确', () => {
    expect(monthCursor(new Date(2026, 8, 17)).getDate()).toBe(1)
    expect(shiftMonth(new Date(2026, 0, 15), -1)).toEqual(new Date(2025, 11, 1))
    expect(shiftMonth(new Date(2026, 11, 15), 1)).toEqual(new Date(2027, 0, 1))
  })
})

describe('buildCalCells（月历格子口径）', () => {
  const now = new Date()

  it('42 格 · 周一开头：首格必是周一，当月 1 号落在第 lead 格', () => {
    const cells = buildCalCells({ cursor: now, orders: [], canAccept: false })
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const lead = (first.getDay() + 6) % 7
    expect(cells).toHaveLength(42)
    expect(cells[0].date.getDay()).toBe(1)
    expect(cells[lead].day).toBe(1)
    expect(cells[lead].inMonth).toBe(true)
    expect(cells[0].inMonth).toBe(lead === 0)
  })

  it('isToday 全表唯一且落在今天', () => {
    const cells = buildCalCells({ cursor: now, orders: [], canAccept: false })
    const todays = cells.filter(c => c.isToday)
    expect(todays).toHaveLength(1)
    expect(todays[0].date.toDateString()).toBe(new Date().toDateString())
  })

  it('free 绿点受名额约束（F11 拍板 C）：canAccept=false 一律不标；已过去的日子不标', () => {
    const on = buildCalCells({ cursor: now, orders: [], canAccept: true })
    const off = buildCalCells({ cursor: now, orders: [], canAccept: false })
    expect(on.some(c => c.free)).toBe(true)
    expect(off.every(c => !c.free)).toBe(true)
    const t = todayStart()
    expect(on.filter(c => c.date < t).every(c => !c.free)).toBe(true)
  })

  it('带区间＝开工日→截稿日，覆盖中间每一天（固定月避免跨月漂移）', () => {
    const o = sched({ startDate: localIso(2026, 9, 10), deadline: localIso(2026, 9, 14) })
    const cells = buildCalCells({ cursor: new Date(2026, 8, 1), orders: [o], canAccept: false })
    const covered = cells.filter(c => c.bands.length > 0).map(c => c.day)
    expect(covered).toEqual([10, 11, 12, 13, 14])
  })

  it('未设截稿 → 画满到可见月末', () => {
    const o = sched({ startDate: localIso(2026, 9, 28), deadline: null })
    const cells = buildCalCells({ cursor: new Date(2026, 8, 1), orders: [o], canAccept: false })
    expect(cells.filter(c => c.bands.length > 0 && c.inMonth).map(c => c.day)).toEqual([28, 29, 30])
  })

  it('本地单按截稿日单点落格（无开工日不铺区间）', () => {
    const rows = fromLocalOrders([localOrder({ deadline: localIso(2026, 9, 12) })])
    const cells = buildCalCells({ cursor: new Date(2026, 8, 1), orders: rows, canAccept: false })
    expect(cells.filter(c => c.bands.length > 0).map(c => c.day)).toEqual([12])
  })

  it('既无开工/下单日又无截稿 → 画不出位置，不渲染', () => {
    const cells = buildCalCells({ cursor: new Date(2026, 8, 1), orders: [sched({})], canAccept: false })
    expect(cells.every(c => c.bands.length === 0)).toBe(true)
  })

  it('与可见月无交集的单不进格子', () => {
    const o = sched({ startDate: localIso(2026, 10, 5), deadline: localIso(2026, 10, 9) })
    const cells = buildCalCells({ cursor: new Date(2026, 8, 1), orders: [o], canAccept: false })
    expect(cells.every(c => c.bands.length === 0)).toBe(true)
  })

  it('格内带排序：逾期最前、已完成沉底（决定截断时露出谁）', () => {
    // 三单共同覆盖「前天」那一天：逾期单区间到昨天为止、在画单到后天、已完成单同区间
    const mid = new Date()
    mid.setDate(mid.getDate() - 2)
    const orders = [
      sched({ id: 1, key: 'a', status: 'delivered', done: true, startDate: iso(-5), deadline: iso(2) }),
      sched({ id: 2, key: 'b', startDate: iso(-5), deadline: iso(2) }),
      sched({ id: 3, key: 'c', startDate: iso(-5), deadline: iso(-1) })
    ]
    // 游标取该日所在月，保证可见月一定包含它（月初跑也不漂）
    const cells = buildCalCells({ cursor: mid, orders, canAccept: false })
    const cell = cells.find(c => c.date.toDateString() === mid.toDateString())
    expect(cell?.bands.map(b => b.tone)).toEqual(['over', 'soon', 'done'])
    expect(cell?.bands.map(b => b.order.key)).toEqual(['c', 'b', 'a'])
  })
})

describe('orderSpan', () => {
  it('开工日缺则回退下单时刻；都缺但有截稿 → 单点', () => {
    const end = new Date(2026, 8, 30)
    expect(orderSpan(sched({ startDate: '2026-09-05T00:00:00', createdAt: '2026-09-01T00:00:00' }), end)?.start.getDate()).toBe(5)
    expect(orderSpan(sched({ createdAt: '2026-09-01T00:00:00' }), end)?.start.getDate()).toBe(1)
    const single = orderSpan(sched({ deadline: '2026-09-12T00:00:00' }), end)
    expect(single?.start.getDate()).toBe(12)
    expect(single?.end.getDate()).toBe(12)
  })
})

// ─── 卷尾摘要签 ───

describe('buildSchedStrip（近 7 天摘要签三条诚实口径）', () => {
  it('7 天且周几文案与日期对齐', () => {
    const days = buildSchedStrip([], true)
    const names = ['日', '一', '二', '三', '四', '五', '六']
    expect(days).toHaveLength(7)
    expect(days.every(d => d.weekday === names[d.date.getDay()])).toBe(true)
    expect(days[0].date.toDateString()).toBe(new Date().toDateString())
  })

  it('空排期：可接单 → 全 free；名额满 → 全 full', () => {
    expect(buildSchedStrip([], true).every(d => d.tone === 'free')).toBe(true)
    expect(buildSchedStrip([], false).every(d => d.tone === 'full')).toBe(true)
  })

  it('本地口径（名额语义不适用）：canAccept 虽为 false，空日也一律素条 free、不冒 full 藤黄', () => {
    // 9/4 收口修正：藤黄在月历图例里是「名额已满/临期」，本地记账根本没名额，
    // 涂藤黄等于对本地画师说假话（施工图 §3.6 与 §五.4 原本自相矛盾，以本条为准）
    expect(buildSchedStrip([], false, false).every(d => d.tone === 'free')).toBe(true)
  })

  it('口径①逾期单只压今天一格（原区间整段在过去也要显朱砂，但不得涂满整周说谎）', () => {
    const days = buildSchedStrip([sched({ startDate: iso(-9), deadline: iso(-2) })], true)
    expect(days.map(d => d.tone)).toEqual(['over', 'free', 'free', 'free', 'free', 'free', 'free'])
  })

  it('逾期单与在画单同日 → 该日走 over（朱砂优先）', () => {
    const days = buildSchedStrip([
      sched({ id: 1, startDate: iso(-9), deadline: iso(-2) }),
      sched({ id: 2, startDate: iso(-1), deadline: iso(3) })
    ], true)
    expect(days.map(d => d.tone)).toEqual(['over', 'busy', 'busy', 'busy', 'free', 'free', 'free'])
  })

  it('口径②已完成单不占未来时间', () => {
    const days = buildSchedStrip([sched({ startDate: iso(0), deadline: iso(3), done: true, status: 'delivered' })], true)
    expect(days.every(d => d.tone === 'free')).toBe(true)
  })

  it('在画区间只覆盖相交日；口径③未设截稿画满到窗口末', () => {
    const spanned = buildSchedStrip([sched({ startDate: iso(1), deadline: iso(2) })], true)
    expect(spanned.map(d => d.tone)).toEqual(['free', 'busy', 'busy', 'free', 'free', 'free', 'free'])
    const open = buildSchedStrip([sched({ startDate: iso(4), deadline: null })], true)
    expect(open.map(d => d.tone)).toEqual(['free', 'free', 'free', 'free', 'busy', 'busy', 'busy'])
  })

  it('count 记该日覆盖单数', () => {
    const days = buildSchedStrip([
      sched({ id: 1, startDate: iso(1), deadline: iso(2) }),
      sched({ id: 2, startDate: iso(1), deadline: iso(5) })
    ], true)
    expect(days[1].count).toBe(2)
    expect(days[0].count).toBe(0)
  })
})

// ─── 名额「能否接单」 ───

describe('computeCanAccept（复刻网页端 F11 拍板 C，只用结构化字段）', () => {
  const base = { status: 'open', batchLimit: null, bufferLimit: null, quotaRemaining: null, formalCount: 0, bufferCount: 0 }

  it('资料未加载（null）→ 保守 true 不误伤', () => {
    expect(computeCanAccept(null)).toBe(true)
  })
  it('休息中/隐藏/接满 → false', () => {
    for (const status of ['break', 'hidden', 'full']) {
      expect(computeCanAccept({ ...base, status })).toBe(false)
    }
    expect(computeCanAccept({ ...base, status: 'open' })).toBe(true)
  })
  it('月度额度耗尽 → false；remaining 为 null（未启用）不约束', () => {
    expect(computeCanAccept({ ...base, quotaRemaining: 0 })).toBe(false)
    expect(computeCanAccept({ ...base, quotaRemaining: -1 })).toBe(false)
    expect(computeCanAccept({ ...base, quotaRemaining: 1 })).toBe(true)
    expect(computeCanAccept({ ...base, quotaRemaining: null })).toBe(true)
  })
  it('席位+候补均满才算真满；候补未满仍能接', () => {
    expect(computeCanAccept({ ...base, batchLimit: 3, bufferLimit: 2, formalCount: 3, bufferCount: 2 })).toBe(false)
    expect(computeCanAccept({ ...base, batchLimit: 3, bufferLimit: 2, formalCount: 3, bufferCount: 1 })).toBe(true)
    expect(computeCanAccept({ ...base, batchLimit: 3, formalCount: 2, bufferCount: 9 })).toBe(true)
  })
  it('bufferLimit 缺省按 0 算（席位满即真满）', () => {
    expect(computeCanAccept({ ...base, batchLimit: 2, formalCount: 2, bufferCount: 0 })).toBe(false)
  })
  it('未启用名额制（batchLimit null）→ 只看状态与额度', () => {
    expect(computeCanAccept({ ...base, batchLimit: null, formalCount: 99, bufferCount: 99 })).toBe(true)
  })
})
