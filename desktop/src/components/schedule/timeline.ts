// 时间条纯函数（9/4 主页重设计落码波1 · 路A 领地）。
// 三条纯函数供 ScheduleTimeline.vue 消费，无副作用、可单测。
// 窗口口径：今天零点起 N 天（2 周=14 天、1 月=30 天、3 月=90 天）。
// 区间口径：startDate || createdAt → deadline；缺任一端该单不进时间条（诚实缺席）。
import { bandTone, parseDate, todayStart } from '../../schedule/band'
import type { BandTone } from '../../schedule/band'
import type { SchedOrder } from '../../schedule/types'

export type ZoomLevel = '2w' | '1m' | '3m'

/** 缩放天数映射（1月=30天、3月=90天，与排期页工具栏三档一一对应） */
const ZOOM_DAYS: Record<ZoomLevel, number> = { '2w': 14, '1m': 30, '3m': 90 }

export interface TimelineRow {
  key: string
  /** 客户·档位（单行截断由 CSS 负责） */
  name: string
  /** 条内文字（截稿倒计时/逾期天数等简短标注） */
  label: string
  tone: BandTone
  /** 左偏移百分比（0~100） */
  leftPct: number
  /** 宽度百分比（0~100） */
  widthPct: number
}

export interface AxisTick {
  label: string
  pct: number
}

export interface TimelineOpts {
  /** 仅进行中（过滤已完成单） */
  onlyActive?: boolean
}

/** 计算时间窗口：今天零点起 days 天（含今天，不含结束日零点） */
export function timelineWindow(zoom: ZoomLevel): { start: Date; end: Date } {
  const start = todayStart()
  const days = ZOOM_DAYS[zoom]
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days)
  return { start, end }
}

/** 构建时间条行数据。
 *  区间口径：startDate || createdAt → deadline；缺任一端该单不进时间条。
 *  越界裁到窗口；完全在窗口外的单不出现——**例外：逾期未完成的单不许消失**（见下）。
 *  onlyActive=true 时过滤掉已完成单。 */
export function buildTimelineRows(
  orders: SchedOrder[],
  windowStart: Date,
  windowEnd: Date,
  opts?: TimelineOpts
): TimelineRow[] {
  const list = Array.isArray(orders) ? orders : []
  const wStart = windowStart.getTime()
  const wEnd = windowEnd.getTime()
  const totalSpan = wEnd - wStart
  if (totalSpan <= 0) return []

  const rows: TimelineRow[] = []
  for (const o of list) {
    if (opts?.onlyActive && o.done) continue
    const start = parseDate(o.startDate) ?? parseDate(o.createdAt)
    const end = parseDate(o.deadline)
    // 缺任一端 → 不进时间条（诚实缺席）
    if (!start || !end) continue

    // 归一到日起点（只比日期不比时分秒）
    let s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
    let e = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime()

    const tone = bandTone(o)
    // 逾期未完成、且计划区间整段落在窗口左外：不能就此消失（定稿原型把它画在最左、朱砂条标逾期）。
    // 事实上这单还压在画师手上，只是计划已过期；口径＝从窗口左端起、按原计划长度画（裁到右端），
    // 条上文字仍是「逾期N天」——画师一眼知道这不是新排期而是欠账，不会被误读成未来工量。
    if (tone === 'over' && e < wStart) {
      const len = Math.max(e - s, 86400000)
      s = wStart
      e = Math.min(wStart + len, wEnd)
    }

    // 完全在窗口外 → 不出现
    if (e < wStart || s > wEnd) continue

    // 越界裁到窗口
    const clampedStart = Math.max(s, wStart)
    const clampedEnd = Math.min(e, wEnd)
    if (clampedEnd <= clampedStart) continue

    const leftPct = ((clampedStart - wStart) / totalSpan) * 100
    const widthPct = ((clampedEnd - clampedStart) / totalSpan) * 100

    rows.push({
      key: o.key,
      name: `${o.who}·${o.what}`,
      label: buildBarLabel(o, tone),
      tone,
      leftPct: Math.round(leftPct * 100) / 100,
      widthPct: Math.max(1, Math.round(widthPct * 100) / 100) // 最小 1% 保证可见
    })
  }
  return rows
}

/** 条内简短标注（截稿倒计时或状态） */
function buildBarLabel(o: SchedOrder, tone: BandTone): string {
  if (tone === 'done') return '已完成'
  if (tone === 'over') {
    const dl = daysLeftOf(o.deadline)
    return dl !== null ? `逾期${-dl}天` : '逾期'
  }
  if (tone === 'soon') {
    const dl = daysLeftOf(o.deadline)
    if (dl === 0) return '今天截稿'
    if (dl === 1) return '明天截稿'
    return dl !== null ? `剩${dl}天` : '临期'
  }
  if (tone === 'nodeadline') return '未排期'
  if (tone === 'buffer') return '候补'
  return o.what || '进行中'
}

function daysLeftOf(deadline: string | null): number | null {
  const d = parseDate(deadline)
  if (!d) return null
  const now = todayStart()
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - now.getTime()) / 86400000)
}

/** 构建时间轴刻度标签（4~6 个 M/D 标签均匀分布在窗口内） */
export function buildTimelineAxis(windowStart: Date, windowEnd: Date, zoom: ZoomLevel): AxisTick[] {
  const wStart = windowStart.getTime()
  const wEnd = windowEnd.getTime()
  const totalSpan = wEnd - wStart
  if (totalSpan <= 0) return []

  // 刻度数量按缩放档位定：2周=4、1月=5、3月=6
  const count: Record<ZoomLevel, number> = { '2w': 4, '1m': 5, '3m': 6 }
  const n = count[zoom]
  const step = totalSpan / (n - 1)

  const ticks: AxisTick[] = []
  for (let i = 0; i < n; i++) {
    const t = wStart + step * i
    const d = new Date(t)
    ticks.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      pct: Math.round((i / (n - 1)) * 10000) / 100
    })
  }
  return ticks
}

/** 今天线百分比（窗口外夹到边界 0 或 100） */
export function todayPct(windowStart: Date, windowEnd: Date): number {
  const now = todayStart().getTime()
  const wStart = windowStart.getTime()
  const wEnd = windowEnd.getTime()
  const totalSpan = wEnd - wStart
  if (totalSpan <= 0) return 0
  const pct = ((now - wStart) / totalSpan) * 100
  return Math.max(0, Math.min(100, Math.round(pct * 100) / 100))
}

/** 统计未排期单数（缺开工日或缺截稿日，不进时间条的单） */
export function countUnscheduled(orders: SchedOrder[], onlyActive?: boolean): number {
  const list = Array.isArray(orders) ? orders : []
  let n = 0
  for (const o of list) {
    if (onlyActive && o.done) continue
    const start = parseDate(o.startDate) ?? parseDate(o.createdAt)
    const end = parseDate(o.deadline)
    if (!start || !end) n++
  }
  return n
}
