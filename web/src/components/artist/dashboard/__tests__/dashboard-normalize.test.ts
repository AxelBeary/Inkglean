// 仪表盘纯逻辑函数示范测试（v0.18 第三批技术债：前端测试基建）
// 覆盖纯逻辑（normalize / tagKey / relativeTime），不测 DOM 渲染
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  normalizeRevenue, prevPeriodLabel,
  normalizeTodo, tagKey, guessTag,
  normalizeActivity, relativeTime
} from '../../../../utils/dashboard-normalize.js'

afterEach(() => { vi.useRealTimers() })

// ─── 收入统计 ───

describe('normalizeRevenue', () => {
  it('对齐后端实际字段（summary.completedCount / changePercent）', () => {
    const raw = {
      period: 'month',
      bars: [
        { label: '1', cents: 50000, count: 1 },
        { label: '2', cents: 0, count: 0 },
        { label: '3', cents: 30000, count: 2 }
      ],
      summary: { totalCents: 80000, completedCount: 3, changePercent: 23 }
    }
    const { bars, summary } = normalizeRevenue(raw, 'month', 'zh-CN')
    expect(bars).toHaveLength(3)
    expect(bars[0]).toEqual({ label: '1', cents: 50000 })
    expect(bars[1].cents).toBe(0) // 无收入日柱子为 0（验收 1.4）
    expect(summary.totalCents).toBe(80000)
    expect(summary.orderCount).toBe(3)
    expect(summary.changePct).toBe(23)
    expect(summary.prevLabel).toBeTruthy() // 前端计算上一周期名称
  })

  it('无上一周期数据时 changePct 为 null（验收 1.7）', () => {
    const raw = { bars: [], summary: { totalCents: 0, completedCount: 0, changePercent: null } }
    const { summary } = normalizeRevenue(raw, 'month', 'zh-CN')
    expect(summary.changePct).toBeNull()
    expect(summary.totalCents).toBe(0)
    expect(summary.orderCount).toBe(0)
  })

  it('空返回不崩溃', () => {
    const { bars, summary } = normalizeRevenue(null, 'year', 'en')
    expect(bars).toEqual([])
    expect(summary.totalCents).toBe(0)
    expect(summary.orderCount).toBeNull()
  })
})

describe('prevPeriodLabel', () => {
  it('月维度返回上一月名称', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15)) // 2026-08
    expect(prevPeriodLabel('month', 'zh-CN')).toBe('七月')
    expect(prevPeriodLabel('month', 'en')).toBe('July')
  })

  it('年维度返回上一年', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1))
    expect(prevPeriodLabel('year', 'zh-CN')).toBe('2025')
  })

  it('季度维度：Q1 时返回上一年 Q4', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 1, 1)) // 2026-02 → Q1
    expect(prevPeriodLabel('quarter', 'zh-CN')).toBe('Q4 2025')
  })
})

// ─── 合并待办列表 ───

describe('tagKey', () => {
  it('后端中文标签映射为英文 i18n 键', () => {
    expect(tagKey('逾期')).toBe('overdue')
    expect(tagKey('截稿')).toBe('dueToday')
    expect(tagKey('新单')).toBe('pending')
    expect(tagKey('修改')).toBe('revision')
    expect(tagKey('进行中')).toBe('inProgress')
  })

  it('英文键直接透传，空值兜底 inProgress', () => {
    expect(tagKey('overdue')).toBe('overdue')
    expect(tagKey(null)).toBe('inProgress')
    expect(tagKey('')).toBe('inProgress')
  })
})

describe('guessTag（后端未返回 tag 时的兜底推断）', () => {
  it('pending → pending，revision → revision', () => {
    expect(guessTag({ status: 'pending' })).toBe('pending')
    expect(guessTag({ status: 'revision' })).toBe('revision')
  })

  it('逾期 deadline → overdue，今日 deadline → dueToday', () => {
    // 用本地日期构造（guessTag 按本地时区比较），避免 UTC 偏移导致跨日
    const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const yesterday = local(new Date(Date.now() - 86400000))
    const today = local(new Date())
    expect(guessTag({ status: 'wip', deadline: yesterday })).toBe('overdue')
    expect(guessTag({ status: 'wip', deadline: today })).toBe('dueToday')
  })

  it('无 deadline 的进行中订单 → inProgress', () => {
    expect(guessTag({ status: 'wip', deadline: null })).toBe('inProgress')
  })
})

describe('normalizeTodo', () => {
  it('对齐后端实际返回（camelCase + 中文标签）', () => {
    const raw = {
      items: [
        { id: 1, orderNo: 'A-001', clientName: '张三', status: 'wip', deadline: '2026-07-30', tag: '逾期' },
        { id: 2, orderNo: 'A-002', clientName: null, status: 'pending', deadline: null, tag: '新单' }
      ]
    }
    const items = normalizeTodo(raw)
    expect(items[0].order_no).toBe('A-001')
    expect(items[0].client_name).toBe('张三')
    expect(items[0].tag).toBe('overdue')
    expect(items[1].client_name).toBe('') // null → 空串
    expect(items[1].tag).toBe('pending')
    // tag 不含中文（CSS class 安全）
    items.forEach(i => expect(i.tag).not.toMatch(/[\u4e00-\u9fff]/))
  })

  it('无 tag 时走 guessTag 兜底', () => {
    const items = normalizeTodo({ items: [{ id: 1, orderNo: 'A-003', status: 'pending', deadline: null }] })
    expect(items[0].tag).toBe('pending')
  })
})

// ─── 最近活动流 ───

describe('normalizeActivity', () => {
  it('对齐后端实际返回（content 字段）', () => {
    const raw = {
      items: [
        { id: 1, orderId: 10, orderNo: 'A-001', content: '状态变更为 线稿确认', createdAt: '2026-08-01 10:30:00' }
      ]
    }
    const items = normalizeActivity(raw)
    expect(items[0].description).toBe('状态变更为 线稿确认')
    expect(items[0].orderId).toBe(10)
    expect(items[0].orderNo).toBe('A-001')
  })

  it('超过 10 条截断（C54）', () => {
    const raw = { items: Array.from({ length: 15 }, (_, i) => ({ id: i, content: `e${i}` })) }
    expect(normalizeActivity(raw)).toHaveLength(10)
  })
})

// ─── 相对时间 ───

describe('relativeTime', () => {
  // 惰性求值：timeJustNow 无 params，模板字符串不能提前展开
  const t = (key: string, params?: Record<string, number>) => {
    const map: Record<string, () => string> = {
      'dashboard.timeJustNow': () => '刚刚',
      'dashboard.timeMinutesAgo': () => `${params!.n} 分钟前`,
      'dashboard.timeHoursAgo': () => `${params!.n} 小时前`,
      'dashboard.timeDaysAgo': () => `${params!.n} 天前`
    }
    const fn = map[key]
    return fn ? fn() : key
  }

  it('各时间档位格式化', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T12:00:00'))
    expect(relativeTime('2026-08-01T11:59:30', t, 'zh-CN')).toBe('刚刚')
    expect(relativeTime('2026-08-01T11:30:00', t, 'zh-CN')).toBe('30 分钟前')
    expect(relativeTime('2026-08-01T09:00:00', t, 'zh-CN')).toBe('3 小时前')
    expect(relativeTime('2026-07-30T12:00:00', t, 'zh-CN')).toBe('2 天前')
  })

  it('空值返回空串，超 30 天显示日期', () => {
    expect(relativeTime(null as unknown as string, t, 'zh-CN')).toBe('')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T12:00:00'))
    const result = relativeTime('2026-05-01T12:00:00', t, 'zh-CN')
    expect(result).not.toContain('天前') // 超 30 天走日期格式
    expect(result).toBeTruthy()
  })
})
