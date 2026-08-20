// 收入图表数据加工纯函数测试（oimimo 吸纳批四；批二补 mini 柱高）
import { describe, it, expect } from 'vitest'
import { buildCumulative, buildMiniBarHeights, isIncomeEmpty, monthLabels } from '../income-chart'
import type { IncomeMonthLike } from '../income-chart'

function row(month: string, order = 0, standalone = 0): IncomeMonthLike {
  return { month, orderCents: order, standaloneCents: standalone, totalCents: order + standalone }
}

describe('income-chart 数据加工', () => {
  it('buildCumulative 逐月累加（含负数退款回落）', () => {
    const rows = [row('2026-01', 10000), row('2026-02', -2000), row('2026-03', 5000, 1000)]
    expect(buildCumulative(rows)).toEqual([10000, 8000, 14000])
  })

  it('isIncomeEmpty 全 0 才算空（负数抵消为 0 不算空）', () => {
    expect(isIncomeEmpty([row('2026-01'), row('2026-02')])).toBe(true)
    expect(isIncomeEmpty([row('2026-01'), row('2026-02', 0, 100)])).toBe(false)
    expect(isIncomeEmpty([row('2026-01', 100, -100)])).toBe(false)
  })

  it('monthLabels 中文：首月带年份，1 月带年份，其余只月', () => {
    const rows = [row('2025-11'), row('2025-12'), row('2026-01'), row('2026-02')]
    expect(monthLabels(rows, 'zh-CN')).toEqual(['2025/11月', '12月', '2026/1月', '2月'])
  })

  it('monthLabels 英文短月名', () => {
    const rows = [row('2026-07'), row('2026-08')]
    const labels = monthLabels(rows, 'en')
    expect(labels[0]).toMatch(/^2026\//)
    expect(labels[1]).not.toContain('/')
  })
})

describe('buildMiniBarHeights mini 柱高百分比（自定义首页批二）', () => {
  it('以窗口最大正值为 100% 等比换算', () => {
    expect(buildMiniBarHeights([1000, 2000, 500])).toEqual([50, 100, 25])
  })

  it('负数（退款）与非有限值落 0，正值照常', () => {
    expect(buildMiniBarHeights([-500, Number.NaN, 2000])).toEqual([0, 0, 100])
  })

  it('全 0 / 全负 → 全 0（是否空态由调用方用 isIncomeEmpty 判）', () => {
    expect(buildMiniBarHeights([0, 0])).toEqual([0, 0])
    expect(buildMiniBarHeights([-100, -50])).toEqual([0, 0])
  })

  it('空数组原样返空', () => {
    expect(buildMiniBarHeights([])).toEqual([])
  })
})
