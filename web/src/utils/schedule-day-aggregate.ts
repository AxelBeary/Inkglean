/**
 * 排期块天维度聚合（自定义首页批二·子代理 F：排期块四款式切换）
 *
 * 口径（用户拍板）：
 * - 7 日窗口：本地今日-1 〜 今日+6，与后端 /artist/dashboard/schedule 窗口及 ScheduleScroll 一致
 * - 跨日单出现在其覆盖的每一天；无 startDate 按 deadline 落位；两者皆无则不进天维度视图
 * - 天维度每款上限 3 条，超出折 +N（点 +N 跳排期看板，不做就地展开）；纸签款全局限 8 签
 * - 状态色语义：进行中花青 / 未开工浅花青 / 逾期朱砂 / 临期藤黄 / 完成石绿
 *
 * 全部为纯函数（now 显式传入），方便单测。
 */
import type { ScheduleBar } from '../api/types'

/** 排期块四款式 */
export type SchedulePanelKind = 'bars' | 'ledger' | 'ptags' | 'waybill'

/** 状态色语义（对齐拍板口径） */
export type ScheduleTone = 'wip' | 'unstarted' | 'overdue' | 'soon' | 'done'

export const SCHEDULE_WINDOW_DAYS = 7
/** 天维度每天展示上限，超出折 +N */
export const DAY_ENTRY_LIMIT = 3
/** 纸签款全局签数上限，超出折 +N */
export const PTAG_LIMIT = 8

export interface WindowDay {
  /** 本地零点时间戳（与后端 date.ts 本地日口径一致） */
  key: number
  /** 该日零点 Date */
  date: Date
  /** 窗口内索引 0-6（1 = 今日） */
  index: number
}

export interface DayEntry {
  bar: ScheduleBar
  tone: ScheduleTone
}

export interface DaySchedule {
  day: WindowDay
  /** 当天全部条目（已排序） */
  all: DayEntry[]
  /** 折叠后可见条目（≤ DAY_ENTRY_LIMIT） */
  visible: DayEntry[]
  /** 被折叠条数（>0 时渲染 +N 胶囊，点它跳排期看板） */
  hiddenCount: number
}

const DAY_MS = 86400000

/** 本地日历日键（零点时间戳），时区口径与 ScheduleScroll / 后端一致 */
export function localDayKey(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** 7 日窗口：今日-1 〜 今日+6（第 2 天为今日） */
export function buildScheduleWindow(now: Date): WindowDay[] {
  const out: WindowDay[] = []
  for (let i = 0; i < SCHEDULE_WINDOW_DAYS; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1 + i)
    out.push({ key: localDayKey(date), date, index: i })
  }
  return out
}

/**
 * 状态色语义判定（新三款的 tone，bars 款仍走 ScheduleScroll 原画法）：
 * done → 完成石绿；逾期 → 朱砂；临期（截稿在今天或明天）→ 藤黄；
 * 未开工（待确认/已确认）→ 浅花青；其余（制作中/修改中）→ 花青。
 */
export function barTone(bar: ScheduleBar, now: Date): ScheduleTone {
  if (bar.status === 'done' || bar.status === 'delivered') return 'done'
  const todayKey = localDayKey(now)
  if (bar.deadline) {
    const dlKey = localDayKey(new Date(bar.deadline))
    if (dlKey < todayKey) return 'overdue'
    if (dlKey <= todayKey + DAY_MS) return 'soon'
  }
  if (bar.status === 'pending' || bar.status === 'confirmed') return 'unstarted'
  return 'wip'
}

/** 条目覆盖的本地日键区间 [start, end]；两日期皆无返回 null（不进天维度视图） */
export function barDaySpan(bar: ScheduleBar): { start: number; end: number } | null {
  let start: number | null = null
  let end: number | null = null
  if (bar.startDate) start = localDayKey(new Date(`${bar.startDate}T00:00:00`))
  if (bar.deadline) end = localDayKey(new Date(bar.deadline))
  if (start == null && end == null) return null
  // 单端缺失时以另一端为准
  const s = start ?? (end as number)
  const e = end ?? s
  return e >= s ? { start: s, end: e } : { start: e, end: s }
}

/** 排序权重：截稿（或开工）越早越靠前，同序按 id 稳定 */
function sortWeight(bar: ScheduleBar): number {
  if (bar.deadline) return new Date(bar.deadline).getTime()
  if (bar.startDate) return new Date(`${bar.startDate}T00:00:00`).getTime()
  return Number.MAX_SAFE_INTEGER
}

function sortBars(bars: ScheduleBar[]): ScheduleBar[] {
  return [...bars].sort((a, b) => {
    const dw = sortWeight(a) - sortWeight(b)
    return dw !== 0 ? dw : a.id - b.id
  })
}

/** 超限折叠：前 limit 条可见，其余计入 hiddenCount */
export function foldDayEntries(
  entries: DayEntry[],
  limit: number = DAY_ENTRY_LIMIT
): { visible: DayEntry[]; hiddenCount: number } {
  if (entries.length <= limit) return { visible: entries, hiddenCount: 0 }
  return { visible: entries.slice(0, limit), hiddenCount: entries.length - limit }
}

/**
 * bars 按 7 日窗口聚合为每天条目列表：
 * 跨日单出现在其覆盖的每一天；窗口外部分自动裁掉。
 */
export function aggregateScheduleDays(
  bars: ScheduleBar[],
  windowDays: WindowDay[],
  now: Date
): DaySchedule[] {
  const firstKey = windowDays.length ? windowDays[0].key : 0
  const lastKey = windowDays.length ? windowDays[windowDays.length - 1].key : 0
  return windowDays.map((day) => {
    const dayBars: ScheduleBar[] = []
    for (const bar of bars) {
      const span = barDaySpan(bar)
      if (!span) continue
      // 覆盖当日：span.start ≤ 当日 ≤ span.end（窗口外天数已被 span 语义裁切）
      if (span.start <= day.key && day.key <= span.end && day.key >= firstKey && day.key <= lastKey) {
        dayBars.push(bar)
      }
    }
    const all = sortBars(dayBars).map((bar) => ({ bar, tone: barTone(bar, now) }))
    const { visible, hiddenCount } = foldDayEntries(all)
    return { day, all, visible, hiddenCount }
  })
}

/**
 * 纸签款全局列表：一单一签（不重复），先按最早日期升序、无日期单排最后；
 * 全局限 PTAG_LIMIT 签，超出折 +N。
 */
export function aggregateScheduleTags(
  bars: ScheduleBar[],
  now: Date
): { tags: DayEntry[]; hiddenCount: number } {
  const sorted = sortBars(bars)
  const all = sorted.map((bar) => ({ bar, tone: barTone(bar, now) }))
  const { visible, hiddenCount } = foldDayEntries(all, PTAG_LIMIT)
  return { tags: visible, hiddenCount }
}
