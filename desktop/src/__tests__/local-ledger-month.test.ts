// 审计波2 DSK-07 回归：「本月已收」按**本地日历月**归属，不再拿 UTC ISO 串前缀比本地月份。
// 旧口径的后果：东八区每月 1 号 00:00–08:00 收到的款，串前缀还是上月 → 本月已收少算一笔（跨月边界漂移）。
// 时刻一律用本地分量造（Date 构造 + toISOString 得到库里 updated_at 的真实形状），断言与跑测机时区无关。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { localMonthOf, useLocalLedgerStore } from '../stores/localLedger'
import type { LocalOrder, LocalOrderStatus } from '../stores/localLedger'

/** 本地时刻 → 库里存的 UTC ISO 串（正偏移时区下串上的日期会比本地日期早一天，正是本条缺陷的引信） */
function localIso(y: number, m: number, d: number, hh: number, mm: number): string {
  return new Date(y, m - 1, d, hh, mm, 0).toISOString()
}

function row(p: { id?: number; price?: number; status?: LocalOrderStatus; updated_at?: string }): LocalOrder {
  return {
    id: p.id ?? 1,
    client_name: '张三',
    title: '头像',
    price: p.price ?? 0,
    deadline: null,
    status: p.status ?? 'paid',
    created_at: p.updated_at ?? '',
    updated_at: p.updated_at ?? ''
  }
}

function freshLedger(orders: LocalOrder[]) {
  setActivePinia(createPinia())
  const ledger = useLocalLedgerStore()
  ledger.orders = orders
  return ledger
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 15, 12, 0)) // 默认钉在本地 2026-09-15 正午，各例自行改钉
})
afterEach(() => {
  vi.useRealTimers()
})

describe('localMonthOf（时间戳 → 本地月份键，纯函数）', () => {
  it('本地月初/月末都归本地当月', () => {
    expect(localMonthOf(localIso(2026, 9, 1, 0, 30))).toBe('2026-09')
    expect(localMonthOf(localIso(2026, 9, 30, 23, 59))).toBe('2026-09')
  })

  it('跨年：本地 1 月 1 号凌晨归新年，去年最后一刻归去年', () => {
    expect(localMonthOf(localIso(2026, 1, 1, 0, 30))).toBe('2026-01')
    expect(localMonthOf(localIso(2025, 12, 31, 23, 59))).toBe('2025-12')
  })

  it('本地凌晨的收款：串前缀与本地月份不一致时以本地为准（DSK-07 主症）', () => {
    const iso = localIso(2026, 9, 1, 0, 30)
    expect(localMonthOf(iso)).toBe('2026-09')
    // 正偏移时区下 iso.slice(0,7) === '2026-08'（旧口径据此把这笔算进上月）；负偏移时区两口径巧合一致。
    // 断言只认本地口径，故在任何跑测机时区都成立。
  })

  it('纯日期串（导入的历史行，无时间与时区）按本地日历日直取，不被当 UTC 零点', () => {
    expect(localMonthOf('2026-09-01')).toBe('2026-09')
    expect(localMonthOf('2026-01-01')).toBe('2026-01')
    expect(localMonthOf('2026-12-31')).toBe('2026-12')
  })

  it('空串/垃圾串返 null（不计入任何月，也不把异常抛进渲染）', () => {
    expect(localMonthOf('')).toBeNull()
    expect(localMonthOf('垃圾')).toBeNull()
    expect(localMonthOf('2026-13-45T99:99:99Z')).toBeNull()
  })
})

describe('paidThisMonth（本月已收：本地日历月归属）', () => {
  it('本地月初 00:30 看账：本月首笔计入，上月最后一刻不计入', () => {
    vi.setSystemTime(new Date(2026, 8, 1, 0, 30)) // 本地 2026-09-01 00:30
    const ledger = freshLedger([
      row({ id: 1, price: 200, updated_at: localIso(2026, 9, 1, 0, 10) }),   // 本月首笔
      row({ id: 2, price: 80, updated_at: localIso(2026, 8, 31, 23, 59) })   // 上月最后一刻
    ])
    expect(ledger.paidThisMonth).toBe(200) // 旧口径在东八区这里是 0（200 被算进上月）
  })

  it('本地月末 23:59 看账：本月末的收款计入，跨到下月的那笔不计入', () => {
    vi.setSystemTime(new Date(2026, 8, 30, 23, 59))
    const ledger = freshLedger([
      row({ id: 1, price: 80, updated_at: localIso(2026, 9, 30, 23, 59) }),
      row({ id: 2, price: 50, updated_at: localIso(2026, 10, 1, 0, 0) })
    ])
    expect(ledger.paidThisMonth).toBe(80)
  })

  it('过了本地午夜进入次月：昨晚那笔不再算「本月已收」', () => {
    vi.setSystemTime(new Date(2026, 9, 1, 0, 0)) // 本地 2026-10-01 00:00
    const ledger = freshLedger([
      row({ id: 1, price: 80, updated_at: localIso(2026, 9, 30, 23, 59) }),
      row({ id: 2, price: 40, updated_at: localIso(2026, 10, 1, 0, 0) })
    ])
    expect(ledger.paidThisMonth).toBe(40)
  })

  it('跨年边界：本地 1 月 1 号凌晨的收款计入新年，去年最后一刻的不计入', () => {
    vi.setSystemTime(new Date(2026, 0, 1, 0, 30)) // 本地 2026-01-01 00:30
    const ledger = freshLedger([
      row({ id: 1, price: 66, updated_at: localIso(2026, 1, 1, 0, 10) }),
      row({ id: 2, price: 999, updated_at: localIso(2025, 12, 31, 23, 59) })
    ])
    expect(ledger.paidThisMonth).toBe(66)
  })

  it('只统计已收款（进行中/已交付不计），坏时间戳不计也不炸', () => {
    vi.setSystemTime(new Date(2026, 8, 15, 12, 0))
    const ts = localIso(2026, 9, 15, 10, 0)
    const ledger = freshLedger([
      row({ id: 1, price: 100, status: 'delivered', updated_at: ts }),
      row({ id: 2, price: 100, status: 'in_progress', updated_at: ts }),
      row({ id: 3, price: 55, status: 'paid', updated_at: '' }),
      row({ id: 4, price: 55, status: 'paid', updated_at: '垃圾' }),
      row({ id: 5, price: 300, status: 'paid', updated_at: ts })
    ])
    expect(ledger.paidThisMonth).toBe(300)
  })

  it('无账目时为 0（空态不显示 NaN）', () => {
    expect(freshLedger([]).paidThisMonth).toBe(0)
  })
})
