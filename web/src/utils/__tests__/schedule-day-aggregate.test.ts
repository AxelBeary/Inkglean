/**
 * schedule-day-aggregate 单测（排期块四款式切换 · 子代理 F）
 * 必测三场景：跨日单逐日出现 / 无日期单落位 / 超限折 +N
 */
import { describe, it, expect } from 'vitest'
import type { ScheduleBar } from '../../api/types'
import {
  SCHEDULE_WINDOW_DAYS,
  DAY_ENTRY_LIMIT,
  PTAG_LIMIT,
  buildScheduleWindow,
  localDayKey,
  barTone,
  barDaySpan,
  foldDayEntries,
  aggregateScheduleDays,
  aggregateScheduleTags,
} from '../schedule-day-aggregate'

/** 固定 now：2026-08-21 15:30（本地时区，窗口 = 08-20 〜 08-26） */
const NOW = new Date(2026, 7, 21, 15, 30, 0)

function mkBar(over: Partial<ScheduleBar> = {}): ScheduleBar {
  return {
    id: 1,
    orderNo: '2026-001',
    clientName: '小林',
    status: 'wip',
    startDate: null,
    deadline: null,
    stageName: null,
    styleName: null,
    sizeName: null,
    ...over,
  }
}

describe('buildScheduleWindow', () => {
  it('7 日窗口：今日-1 起、第 2 天为今日', () => {
    const win = buildScheduleWindow(NOW)
    expect(win).toHaveLength(SCHEDULE_WINDOW_DAYS)
    expect(win[0].date.getDate()).toBe(20)
    expect(win[1].date.getDate()).toBe(21) // 今日
    expect(win[6].date.getDate()).toBe(26)
    expect(win[1].index).toBe(1)
    // key 均为本地零点
    for (const d of win) {
      expect(d.key).toBe(new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate()).getTime())
    }
  })
})

describe('barTone 状态色语义', () => {
  it('完成 → 石绿（done/delivered，哪怕逾期也算完成）', () => {
    expect(barTone(mkBar({ status: 'done', deadline: '2026-08-19T18:00:00' }), NOW)).toBe('done')
    expect(barTone(mkBar({ status: 'delivered' }), NOW)).toBe('done')
  })
  it('逾期 → 朱砂；临期（今/明截稿）→ 藤黄', () => {
    expect(barTone(mkBar({ deadline: '2026-08-20T18:00:00' }), NOW)).toBe('overdue')
    expect(barTone(mkBar({ deadline: '2026-08-21T23:59:00' }), NOW)).toBe('soon')
    expect(barTone(mkBar({ deadline: '2026-08-22T12:00:00' }), NOW)).toBe('soon')
    expect(barTone(mkBar({ deadline: '2026-08-23T12:00:00' }), NOW)).toBe('wip')
  })
  it('未开工（pending/confirmed）→ 浅花青；进行中（wip/revision）→ 花青', () => {
    expect(barTone(mkBar({ status: 'pending' }), NOW)).toBe('unstarted')
    expect(barTone(mkBar({ status: 'confirmed', deadline: '2026-08-25T12:00:00' }), NOW)).toBe('unstarted')
    expect(barTone(mkBar({ status: 'wip', deadline: '2026-08-25T12:00:00' }), NOW)).toBe('wip')
    expect(barTone(mkBar({ status: 'revision', deadline: '2026-08-25T12:00:00' }), NOW)).toBe('wip')
  })
})

describe('跨日场景：跨日单出现在其覆盖的每一天', () => {
  it('08-20 开工 〜 08-23 截稿 → 覆盖窗口内 08-20/21/22/23 四天', () => {
    const bar = mkBar({ startDate: '2026-08-20', deadline: '2026-08-23T18:00:00' })
    const days = aggregateScheduleDays([bar], buildScheduleWindow(NOW), NOW)
    const hits = days.filter((d) => d.all.some((e) => e.bar.id === bar.id)).map((d) => d.day.date.getDate())
    expect(hits).toEqual([20, 21, 22, 23])
  })

  it('窗口外的跨度只落在窗口内部分（08-18 开工 〜 08-28 截稿 → 7 天全中）', () => {
    const bar = mkBar({ startDate: '2026-08-18', deadline: '2026-08-28T18:00:00' })
    const days = aggregateScheduleDays([bar], buildScheduleWindow(NOW), NOW)
    expect(days.every((d) => d.all.length === 1)).toBe(true)
  })

  it('完全在窗口外（08-10 〜 08-12）→ 天维度零出现', () => {
    const bar = mkBar({ startDate: '2026-08-10', deadline: '2026-08-12T18:00:00' })
    const days = aggregateScheduleDays([bar], buildScheduleWindow(NOW), NOW)
    expect(days.every((d) => d.all.length === 0)).toBe(true)
  })
})

describe('无日期场景', () => {
  it('无 startDate → 按 deadline 单日落位', () => {
    const bar = mkBar({ deadline: '2026-08-24T18:00:00' })
    const days = aggregateScheduleDays([bar], buildScheduleWindow(NOW), NOW)
    const hits = days.filter((d) => d.all.length > 0)
    expect(hits).toHaveLength(1)
    expect(hits[0].day.date.getDate()).toBe(24)
  })

  it('startDate 与 deadline 皆无 → 不进天维度视图', () => {
    expect(barDaySpan(mkBar())).toBeNull()
    const days = aggregateScheduleDays([mkBar()], buildScheduleWindow(NOW), NOW)
    expect(days.every((d) => d.all.length === 0)).toBe(true)
  })

  it('纸签款仍收录无日期单（排在有日期单之后）', () => {
    const dated = mkBar({ id: 1, deadline: '2026-08-24T18:00:00' })
    const undated = mkBar({ id: 2 })
    const { tags } = aggregateScheduleTags([undated, dated], NOW)
    expect(tags.map((t) => t.bar.id)).toEqual([1, 2])
  })
})

describe('超限折叠：每天上限 3 条折 +N；纸签全局限 8 签', () => {
  it('某天 5 单 → 可见 3、hiddenCount 2', () => {
    const bars = Array.from({ length: 5 }, (_, i) =>
      mkBar({ id: i + 1, deadline: `2026-08-22T1${i}:00:00` })
    )
    const days = aggregateScheduleDays(bars, buildScheduleWindow(NOW), NOW)
    const d22 = days.find((d) => d.day.date.getDate() === 22)!
    expect(d22.all).toHaveLength(5)
    expect(d22.visible).toHaveLength(DAY_ENTRY_LIMIT)
    expect(d22.hiddenCount).toBe(2)
    // 可见条目按截稿升序
    expect(d22.visible.map((e) => e.bar.id)).toEqual([1, 2, 3])
  })

  it('恰好 3 单不折；跨日单同时计入各覆盖日并各自独立折叠', () => {
    const long = mkBar({ id: 10, startDate: '2026-08-22', deadline: '2026-08-23T18:00:00' })
    const bars = [
      long,
      mkBar({ id: 11, deadline: '2026-08-22T10:00:00' }),
      mkBar({ id: 12, deadline: '2026-08-22T11:00:00' }),
      mkBar({ id: 13, deadline: '2026-08-22T12:00:00' }),
    ]
    const days = aggregateScheduleDays(bars, buildScheduleWindow(NOW), NOW)
    const d22 = days.find((d) => d.day.date.getDate() === 22)!
    const d23 = days.find((d) => d.day.date.getDate() === 23)!
    expect(d22.all).toHaveLength(4)
    expect(d22.hiddenCount).toBe(1)
    expect(d23.all).toHaveLength(1) // 跨日单在 23 日单独出现
    expect(d23.hiddenCount).toBe(0)
  })

  it('foldDayEntries 通用折叠', () => {
    const entries = Array.from({ length: 4 }, (_, i) => ({ bar: mkBar({ id: i }), tone: 'wip' as const }))
    expect(foldDayEntries(entries).hiddenCount).toBe(1)
    expect(foldDayEntries(entries.slice(0, 3)).hiddenCount).toBe(0)
  })

  it('纸签款：10 单 → 可见 8 签、hiddenCount 2', () => {
    const bars = Array.from({ length: 10 }, (_, i) =>
      mkBar({ id: i + 1, deadline: `2026-08-2${Math.min(i % 6, 6)}T10:00:00` })
    )
    const { tags, hiddenCount } = aggregateScheduleTags(bars, NOW)
    expect(tags).toHaveLength(PTAG_LIMIT)
    expect(hiddenCount).toBe(2)
  })
})

describe('localDayKey', () => {
  it('同一天不同时刻日键相同，隔日不同', () => {
    const a = localDayKey(new Date(2026, 7, 21, 1, 0))
    const b = localDayKey(new Date(2026, 7, 21, 23, 59))
    const c = localDayKey(new Date(2026, 7, 22, 0, 0))
    expect(a).toBe(b)
    expect(c - a).toBe(86400000)
  })
})
