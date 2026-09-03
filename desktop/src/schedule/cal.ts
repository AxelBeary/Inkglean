// 月历格子纯函数（9/4 主页重设计落码波1 · 契约层）。
// 口径照 web/src/components/artist/queue/QueueBoardCalendar.vue 的 calCells/bandRange 平移：
// 42 格（6 行）、周一开头、含上月末与下月初、带区间相交判定、「可接单」绿点受总量名额约束（F11 拍板 C）。
// 桌面端差异：①带区间多一条回退——开工日与下单时刻都缺但有截稿时按截稿日单点落格
//   （本地模式记账无开工日，拍板②：缺的诚实缺席，不拿记账日凑区间）；
// ②格内带排序后再交组件截断（原型每格只露 2~3 条 + 「+N」，排序决定露出谁）。
import { bandLabel, bandTone, dateKey, parseDate, todayStart } from './band'
import type { BandTone } from './band'
import type { SchedOrder } from './types'

export interface CalBand {
  order: SchedOrder
  tone: BandTone
  label: string
}

export interface CalCell {
  day: number
  date: Date
  /** 是否本月（上月末/下月初为 false，渲染降透明） */
  inMonth: boolean
  isToday: boolean
  weekend: boolean
  /** 可接单（空日绿点）：canAccept && 当月 && 今天及以后 && 该日无任何带 */
  free: boolean
  /** 全量带；显示截断由组件按 maxBands 做（超出画「+N」） */
  bands: CalBand[]
}

/** 月份游标平移：返回目标月 1 号（本地时区；宿主自持游标，首页与排期页各自独立翻月） */
export function shiftMonth(cursor: Date, delta: number): Date {
  return new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1)
}

/** 游标归一到当月 1 号（宿主传 new Date() 也能得到稳定游标） */
export function monthCursor(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

interface Span { start: Date; end: Date }

/** 订单在月历上占据的区间：开工日 → 下单时刻 → 截稿日（都缺则截稿日单点）；
 *  未设截稿 → 画满到 fallbackEnd（可见月末）。画不出位置返 null（既无起点又无截稿）。 */
export function orderSpan(o: SchedOrder, fallbackEnd: Date): Span | null {
  const deadline = parseDate(o.deadline)
  const start = parseDate(o.startDate) ?? parseDate(o.createdAt) ?? deadline
  if (!start) return null
  return { start, end: deadline ?? fallbackEnd }
}

/** 带露出优先级：急的在前、已完成沉底、无截稿最后（格内只显示前 maxBands 条，排序决定露出谁） */
const TONE_RANK: Record<BandTone, number> = {
  over: 0,
  soon: 1,
  formal: 2,
  buffer: 3,
  done: 4,
  nodeadline: 5
}

function compareBands(a: CalBand, b: CalBand): number {
  const r = TONE_RANK[a.tone] - TONE_RANK[b.tone]
  if (r !== 0) return r
  return (daysLeftOf(a.order.deadline) ?? 9999) - (daysLeftOf(b.order.deadline) ?? 9999)
}

function daysLeftOf(deadline: string | null): number | null {
  const d = parseDate(deadline)
  if (!d) return null
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - todayStart().getTime()) / 86400000)
}

/** 生成 42 格月历（cursor 只需落在目标月内，函数自己归一到 1 号） */
export function buildCalCells(opts: { cursor: Date; orders: SchedOrder[]; canAccept: boolean }): CalCell[] {
  const orders = Array.isArray(opts.orders) ? opts.orders : []
  const first = monthCursor(opts.cursor)
  // 周一开头：getDay() 周日=0 → 偏移 (day+6)%7
  const lead = (first.getDay() + 6) % 7
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - lead)
  const monthEnd = new Date(first.getFullYear(), first.getMonth() + 1, 0)
  const today = todayStart()
  const todayKey = dateKey(new Date())

  // 预计算带区间，剔掉与可见月无交集的（照网页端 visibleBands 口径）
  const spans = orders
    .map(o => ({ o, span: orderSpan(o, monthEnd) }))
    .filter((x): x is { o: SchedOrder; span: Span } => x.span !== null)
    .filter(x => x.span.end >= first && x.span.start <= monthEnd)

  const cells: CalCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
    const bands: CalBand[] = []
    for (const x of spans) {
      // 区间相交：带覆盖该日
      if (x.span.start <= dayEnd && x.span.end >= dayStart) {
        bands.push({ order: x.o, tone: bandTone(x.o), label: bandLabel(x.o) })
      }
    }
    bands.sort(compareBands)
    cells.push({
      day: d.getDate(),
      date: d,
      inMonth: d.getMonth() === first.getMonth(),
      isToday: dateKey(d) === todayKey,
      weekend: d.getDay() === 0 || d.getDay() === 6,
      // 拍板 C（网页端 F11 同源）：名额/额度已满时空日子不再标可接单（按天空闲 ≠ 能接单）
      free: opts.canAccept && d.getMonth() === first.getMonth() && dayStart >= today && bands.length === 0,
      bands
    })
  }
  return cells
}
