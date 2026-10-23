// 本地核心环波6 测试：本地概览句组装与日差纯函数（首页本地变体的口径哨兵）。
import { describe, it, expect, afterEach } from 'vitest'
import { buildLocalDeadlineAlerts, buildLocalGlance, buildLocalDeadlineRows, localDaysLeft } from '../components/home/localGlance'
import type { LocalOrder } from '../stores/localLedger'

function order(p: Partial<LocalOrder>): LocalOrder {
  return {
    id: p.id ?? 1,
    client_name: p.client_name ?? '张三',
    title: p.title ?? '头像',
    price: p.price ?? 100,
    deadline: p.deadline ?? null,
    status: p.status ?? 'draft',
    created_at: '',
    updated_at: p.updated_at ?? ''
  }
}

function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

describe('localDaysLeft', () => {
  it('今天截稿返 0，无效/空返 null', () => {
    expect(localDaysLeft(isoDaysFromNow(0))).toBe(0)
    expect(localDaysLeft(isoDaysFromNow(3))).toBe(3)
    expect(localDaysLeft(isoDaysFromNow(-2))).toBe(-2)
    expect(localDaysLeft(null)).toBeNull()
    expect(localDaysLeft('不是日期')).toBeNull()
  })
})

describe('buildLocalGlance（本地概览句口径）', () => {
  it('0 笔在账退回一句本地口径（不打扰）', () => {
    const parts = buildLocalGlance([], 0)
    expect(parts).toEqual([{ text: '本地模式 · 数据仅存本机', tone: '' }])
  })

  it('在账/进行中/本月已收按序组句', () => {
    const parts = buildLocalGlance(
      [order({ status: 'in_progress' }), order({ id: 2, status: 'paid' })],
      300
    )
    expect(parts[0].text).toBe('2 笔在账')
    expect(parts.some(p => p.text === '1 笔进行中')).toBe(true)
    expect(parts.some(p => p.text === '本月已收 ¥300')).toBe(true)
  })

  it('今天截稿进加重段（od）', () => {
    const parts = buildLocalGlance(
      [order({ client_name: '李四', deadline: isoDaysFromNow(0), status: 'in_progress' })],
      0
    )
    const urgent = parts.find(p => p.tone === 'od')
    expect(urgent?.text).toBe('李四今天截稿')
  })

  it('逾期置顶口径：最急的是逾期单', () => {
    const parts = buildLocalGlance(
      [
        order({ id: 1, client_name: '远期', deadline: isoDaysFromNow(10), status: 'in_progress' }),
        order({ id: 2, client_name: '急单', deadline: isoDaysFromNow(-1), status: 'draft' })
      ],
      0
    )
    expect(parts.find(p => p.tone === 'od')?.text).toBe('急单已逾期 1 天')
  })

  it('已交付/已收款不进截稿提醒', () => {
    const parts = buildLocalGlance(
      [order({ deadline: isoDaysFromNow(0), status: 'paid' })],
      0
    )
    expect(parts.some(p => p.tone === 'od')).toBe(false)
  })
})

describe('buildLocalDeadlineRows（悬浮截稿窗本地数据源，巡检收尾波）', () => {
  it('未完成+有截稿+窗口内；逾期最前；超 limit 截断', () => {
    const rows = buildLocalDeadlineRows(
      [
        order({ id: 1, deadline: isoDaysFromNow(5) }),
        order({ id: 2, client_name: '急单', deadline: isoDaysFromNow(-2) }),
        order({ id: 3, deadline: null }),
        order({ id: 4, deadline: isoDaysFromNow(30) }),
        order({ id: 5, deadline: isoDaysFromNow(0), status: 'paid' }),
        order({ id: 6, deadline: isoDaysFromNow(1) }),
        order({ id: 7, deadline: isoDaysFromNow(2) })
      ],
      14, 3
    )
    // id5 已收款被滤；剩 -2/1/2/5，取前 3 且逾期最前
    expect(rows.map(r => r.daysLeft)).toEqual([-2, 1, 2])
    expect(rows[0].clientName).toBe('急单')
  })

  it('无截稿单返空（悬浮窗走诚实空态）', () => {
    expect(buildLocalDeadlineRows([order({ deadline: null }), order({ deadline: isoDaysFromNow(60) })], 14, 6)).toEqual([])
  })

  it('客户名缺失落内容', () => {
    const rows = buildLocalDeadlineRows([order({ client_name: '', deadline: isoDaysFromNow(1) })], 14, 6)
    expect(rows[0].clientName).toBe('头像') // 落 title
    expect(rows[0].orderNo).toBe('头像')
  })
})

describe('buildLocalDeadlineAlerts（本地截稿提醒条目）', () => {
  it('只收未完成+有截稿+逾期/今天/明天；id 前缀与客户名兜底', () => {
    const alerts = buildLocalDeadlineAlerts([
      order({ id: 1, client_name: '急单', deadline: isoDaysFromNow(-1), status: 'in_progress' }),
      order({ id: 2, client_name: '', deadline: isoDaysFromNow(0), status: 'draft' }),
      order({ id: 3, deadline: isoDaysFromNow(1) }),
      order({ id: 4, deadline: isoDaysFromNow(2) }),
      order({ id: 5, deadline: isoDaysFromNow(0), status: 'paid' }),
      order({ id: 6, deadline: null }),
      order({ id: 7, deadline: '坏日期' })
    ])
    expect(alerts).toEqual([
      { id: 'local-1', who: '急单', daysLeft: -1 },
      { id: 'local-2', who: '有一单', daysLeft: 0 },
      { id: 'local-3', who: '张三', daysLeft: 1 }
    ])
  })
})

// ─── 审计 #23 条目 2：纯日期串按 UTC 零点解析 ⇒ 负时区整体差一天 ───
describe('localDaysLeft 跨时区稳定（#23-2）', () => {
  const ORIGINAL_TZ = process.env.TZ

  /** 用本地分量造 'YYYY-MM-DD'（与画师在日期选择器里看到的形式一致） */
  function localDateStr(offsetDays: number): string {
    const base = new Date()
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  for (const tz of ['UTC', 'America/New_York', 'Pacific/Kiritimati', 'Asia/Shanghai']) {
    it(`${tz} 下今天/明天/前天分别算 0 / +1 / -2`, () => {
      process.env.TZ = tz
      expect(localDaysLeft(localDateStr(0))).toBe(0)
      expect(localDaysLeft(localDateStr(1))).toBe(1)
      expect(localDaysLeft(localDateStr(-2))).toBe(-2)
    })
  }

  it('带时间的串仍按该瞬间所属的本地日参与计算（不改既有行为）', () => {
    expect(localDaysLeft(new Date().toISOString())).toBe(0)
    const base = new Date()
    const tomorrowNoon = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, 12, 0, 0)
    expect(localDaysLeft(tomorrowNoon.toISOString())).toBe(1)
  })

  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ
    else process.env.TZ = ORIGINAL_TZ
  })
})
