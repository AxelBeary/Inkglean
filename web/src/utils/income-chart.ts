/**
 * 收入图表数据加工（oimimo 吸纳批四）——纯函数抽离，单测不碰 canvas/Chart.js
 * 口径说明：数据源为 /api/artist/tools/income-monthly（订单收款流水 + 散单记账，
 * 与统计导出 CSV 对账口径同源），月份归属按本地时区到账日（现金口径）
 */

/** 月度收入行最小形状（与 api/types.js IncomeMonthRow 结构兼容） */
export interface IncomeMonthLike {
  month: string
  orderCents: number
  standaloneCents: number
  totalCents: number
}

/** 逐月累计序列（折线图用；跨年的 12 月窗口照常累计，图随窗口走） */
export function buildCumulative(rows: IncomeMonthLike[]): number[] {
  let acc = 0
  return rows.map(r => {
    acc += r.totalCents
    return acc
  })
}

/** 全部月份合计为 0 → 空数据（不画图，展示空态） */
export function isIncomeEmpty(rows: IncomeMonthLike[]): boolean {
  return rows.every(r => r.totalCents === 0 && r.orderCents === 0 && r.standaloneCents === 0)
}

/**
 * 首页收入趋势 mini 柱状图柱高（百分比 0~100，相对窗口最大正值）：
 * 负数（退款）与非有限值落 0；窗口无正值时全 0（是否空态由调用方用 isIncomeEmpty 判）
 */
export function buildMiniBarHeights(totalCentsList: readonly number[]): number[] {
  const vals = totalCentsList.map(c => (Number.isFinite(c) && c > 0 ? c : 0))
  let max = 0
  for (const v of vals) {
    if (v > max) max = v
  }
  if (max === 0) return vals.map(() => 0)
  return vals.map(v => Math.round((v / max) * 100))
}

/**
 * 月份显示标签：'2026-08' → 中文 '8月' / 英文 'Aug'；
 * 序列首月与每年 1 月带年份（跨年窗口不歧义）
 */
export function monthLabels(rows: IncomeMonthLike[], locale: string): string[] {
  return rows.map((r, i) => {
    const [y, m] = r.month.split('-').map(Number)
    const base = locale === 'zh-CN'
      ? `${m}月`
      : new Date(y, m - 1, 1).toLocaleDateString('en', { month: 'short' })
    return (i === 0 || m === 1) ? `${y}/${base}` : base
  })
}
