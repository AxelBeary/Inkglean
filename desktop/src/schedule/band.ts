// 排期六态色带与日期口径（9/4 主页重设计落码波1 · 契约层）。
// 判定顺序照 web/src/components/artist/queue/queue-band.ts 原样平移，不许改序：
// 未设截稿 → 已完成 → 逾期 → 临期（≤3 天）→ 缓冲 → 正式在画。
// 桌面端差异只有两处：①类名走定稿原型的 .band.<tone>；②daysLeft 独立一份——
// 口径与 components/home/localGlance.ts 的 localDaysLeft 完全相同（本地零点差），
// 独立是为了不让 schedule 域反向依赖 components/home（层次倒置）。
import type { SchedOrder } from './types'

/** 六态：与 CSS 类名一一对应（.band.formal / .buffer / .soon / .over / .done / .nodeadline） */
export type BandTone = 'nodeadline' | 'done' | 'over' | 'soon' | 'buffer' | 'formal'

/** 解析后端日期串为本地 Date（兼容 YYYY-MM-DD 与 ISO）；空/非法返 null */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Date 转 YYYY-MM-DD 键（本地时区） */
export function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 今天本地零点（一切日级比较的基准；用 UTC 直接比会差一天，网页端围剿 a1-7 同源教训） */
export function todayStart(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

/** 截稿日与今天零点差几天（负数=已逾期）；空/非法返 null */
export function daysLeft(deadline: string | null): number | null {
  const d = parseDate(deadline)
  if (!d) return null
  const a = todayStart().getTime()
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((b - a) / 86400000)
}

/** 六态判定（顺序即优先级，照网页端 bandClass 原样） */
export function bandTone(o: SchedOrder): BandTone {
  if (!o.deadline && !o.done) return 'nodeadline'
  if (o.done) return 'done'
  const dl = daysLeft(o.deadline)
  if (dl !== null && dl < 0) return 'over'
  if (dl !== null && dl <= 3) return 'soon'
  return o.zone === 'buffer' ? 'buffer' : 'formal'
}

/** 带内文字：客户-档位（超长由 CSS 截断）；未设截稿且未完成前置警示符（REQ 色带标准） */
export function bandLabel(o: SchedOrder): string {
  const base = o.who ? `${o.who}-${o.what}` : o.what
  return !o.deadline && !o.done ? `⚠ ${base}` : base
}
