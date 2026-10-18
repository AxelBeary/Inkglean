// 整年在画热力图纯函数测试（tools/heatmap.ts）：墨色分档 / 网格构建 / 月份签 / 未来占位 / 汇总与连击。
// 基准日固定为 2026-10-18（周日），startOfWeek 即当天，便于逐格推算。
import { describe, it, expect } from 'vitest'
import {
  buildHeatmap,
  levelForSecs,
  HEAT_WEEKS,
  WEEKDAY_LABELS,
  type HeatCell
} from '../tools/heatmap'

/** 2026-10-18 是周日：startOfWeek = 当天 */
const TODAY = new Date(2026, 9, 18)

/** 从列墙里按日期捞格 */
function findCell(columns: { cells: HeatCell[] }[], date: string): HeatCell | undefined {
  for (const col of columns) {
    const hit = col.cells.find(c => c.date === date)
    if (hit) return hit
  }
  return undefined
}

describe('levelForSecs 墨色分档（固定小时桶）', () => {
  it('0 秒与负数落空档', () => {
    expect(levelForSecs(0)).toBe(0)
    expect(levelForSecs(-100)).toBe(0)
  })
  it('<1h=1 / 1~3h=2 / 3~6h=3 / ≥6h=4', () => {
    expect(levelForSecs(1800)).toBe(1)   // 0.5h
    expect(levelForSecs(3599)).toBe(1)   // 差 1 秒到 1h
    expect(levelForSecs(3600)).toBe(2)   // 1h
    expect(levelForSecs(7200)).toBe(2)   // 2h
    expect(levelForSecs(10800)).toBe(3)  // 3h
    expect(levelForSecs(18000)).toBe(3)  // 5h
    expect(levelForSecs(21600)).toBe(4)  // 6h
    expect(levelForSecs(36000)).toBe(4)  // 10h
  })
})

describe('buildHeatmap 网格结构', () => {
  it('默认铺 53 列，每列 7 格', () => {
    const { columns } = buildHeatmap(new Map(), TODAY)
    expect(columns).toHaveLength(HEAT_WEEKS)
    expect(HEAT_WEEKS).toBe(53)
    for (const col of columns) expect(col.cells).toHaveLength(7)
  })

  it('weeks 参数可收窄窗口（3 列覆盖 21 天）', () => {
    const { columns } = buildHeatmap(new Map(), TODAY, 3)
    expect(columns).toHaveLength(3)
    // 窗口首日 = 今天所在周周日往前 2 周 = 2026-10-04
    expect(columns[0].cells[0].date).toBe('2026-10-04')
    // 末日 = 2026-10-24
    expect(columns[2].cells[6].date).toBe('2026-10-24')
  })

  it('今天之后的日子标 future 且不上色（secs=0 level=0）', () => {
    const { columns } = buildHeatmap(new Map([['2026-10-20', 99999]]), TODAY, 3)
    const today = findCell(columns, '2026-10-18')!
    const tomorrow = findCell(columns, '2026-10-19')!
    expect(today.future).toBe(false)
    expect(tomorrow.future).toBe(true)
    expect(tomorrow.secs).toBe(0)     // 未来格不取库值
    expect(tomorrow.level).toBe(0)
  })

  it('月份签只打在跨入新月的第一列', () => {
    const { columns } = buildHeatmap(new Map(), TODAY, 3)
    // 窗口全在 10 月：首列打签，其余 null
    expect(columns[0].monthLabel).toBe('10月')
    expect(columns[1].monthLabel).toBeNull()
    expect(columns[2].monthLabel).toBeNull()
  })

  it('月份签防挤：跨月与上一签间隔不足 4 列则跳过（2026-11-01 为周日，11月1号落在第 3 列）', () => {
    const NOV1 = new Date(2026, 10, 1) // 周日
    const { columns } = buildHeatmap(new Map(), NOV1, 3)
    // 窗口 2026-10-18 ~ 11-21：首列 10月；11月1号在第 3 列（w=2），与首签间隔 2 < 4 → 跳过
    expect(columns[0].monthLabel).toBe('10月')
    expect(columns[2].monthLabel).toBeNull()
  })
})

describe('buildHeatmap 汇总与连击', () => {
  it('累计/活跃天/单日最高按窗口内非未来格算', () => {
    const paint = new Map([
      ['2026-10-18', 7200],  // 今天 2h
      ['2026-10-17', 3600],  // 1h
      ['2026-10-16', 1800]   // 0.5h
    ])
    const { summary } = buildHeatmap(paint, TODAY, 3)
    expect(summary.totalSecs).toBe(12600)
    expect(summary.activeDays).toBe(3)
    expect(summary.maxDay).toEqual({ date: '2026-10-18', secs: 7200 })
  })

  it('连续在画天数：最长连击 + 当前连击（今天有画）', () => {
    const paint = new Map([
      ['2026-10-18', 3600],
      ['2026-10-17', 3600],
      ['2026-10-16', 3600]
    ])
    const { summary } = buildHeatmap(paint, TODAY, 3)
    expect(summary.longestStreak).toBe(3)
    expect(summary.currentStreak).toBe(3)
  })

  it('当前连击宽限：今天还没画则从昨天起算', () => {
    const paint = new Map([['2026-10-17', 3600]])
    const { summary } = buildHeatmap(paint, TODAY, 3)
    expect(summary.currentStreak).toBe(1)
    expect(summary.longestStreak).toBe(1)
  })

  it('断档重置连击：最长取历史最长段，当前只算尾部连续段', () => {
    const paint = new Map([
      ['2026-10-10', 3600],
      ['2026-10-11', 3600],
      ['2026-10-12', 3600],  // 一段 3 连
      ['2026-10-17', 3600],
      ['2026-10-18', 3600]   // 尾部 2 连
    ])
    const { summary } = buildHeatmap(paint, TODAY, 3)
    expect(summary.longestStreak).toBe(3)
    expect(summary.currentStreak).toBe(2)
  })

  it('全空数据：maxDay 为 null、各项归零', () => {
    const { summary } = buildHeatmap(new Map(), TODAY, 3)
    expect(summary.totalSecs).toBe(0)
    expect(summary.activeDays).toBe(0)
    expect(summary.maxDay).toBeNull()
    expect(summary.longestStreak).toBe(0)
    expect(summary.currentStreak).toBe(0)
  })
})

describe('WEEKDAY_LABELS 星期行签', () => {
  it('周日=0 起，只显 一/三/五', () => {
    expect(WEEKDAY_LABELS).toEqual([null, '一', null, '三', null, '五', null])
    expect(WEEKDAY_LABELS).toHaveLength(7)
  })
})
