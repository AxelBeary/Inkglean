// queue-band.ts — 排期看板月历/时间条共享的订单带形状与纯函数
// 2026-08-20 二轮回胀拆分自 QueueBoardCalendar.vue（纯搬移零行为变化）：
// 月历视图留在 QueueBoardCalendar，时间条视图拆入 QueueTimelineView，两侧共用本模块。

/** 月历行：宿主组件消费字段的形状声明（兼容队列端点行与时间条轻量行） */
export interface CalOrder {
  id: number
  status: string
  order_no: string
  deadline: string | null
  startDate?: string | null
  created_at?: string | null
  confirmed_at?: string | null
  version?: number
  client_name?: string | null
  client_qq?: string
  tier_name?: string | null
  _zone: string
}

/** 带/时间条函数消费的订单最小形状（结构兼容 CalOrder 与 useQueueTimeline 行内 order） */
export interface BoardOrderLite {
  id: number
  status: string
  deadline?: string | null
  startDate?: string | null
  created_at?: string | null
  confirmed_at?: string | null
  version?: number | null
  order_no?: string | number
  client_name?: string | null
  client_qq?: string | null
  tier_name?: string | null
  _zone?: string
}

/** 解析后端日期字符串为本地 Date（兼容 'YYYY-MM-DD' 与 ISO） */
export function parseDate(str: string | null | undefined): Date | null {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

/** 日期 → 'YYYY-MM-DD' 键（本地时区） */
export function dateKey(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 带内文字：昵称-类型（超长 CSS 截断）；未设截稿日 → 前置 ⚠️（REQ §二 色带标准） */
export function bandLabel(order: BoardOrderLite, t: (key: string) => string) {
  const name = order.client_name || order.client_qq || ''
  const tier = order.tier_name || t('common.custom')
  const base = name ? `${name}-${tier}` : tier
  const noDeadline = !order.deadline && !['delivered', 'done'].includes(order.status)
  return noDeadline ? `⚠️ ${base}` : base
}

/** 带视觉样式（正式实心 / 缓冲半透明虚线 / 未设截稿斜纹 / 逾期朱砂 / 完成石绿）。
 * v0.38: 同时输出 band-doing/band-over/band-done 全局别名——
 * artist-tokens.css 的墨黑主题覆写挂在这组类上（实心带提亮，语义不变）。 */
export function bandClass(order: BoardOrderLite) {
  if (!order.deadline && !['delivered', 'done'].includes(order.status)) {
    return ['cal-band--nodeadline', 'band-nd']
  }
  if (['delivered', 'done'].includes(order.status)) return ['cal-band--done', 'band-done']
  const deadline = parseDate(order.deadline)
  // 围狫 a1-7: 逾期判定按本地日归零比较（parseDate('YYYY-MM-DD') 是 UTC 零点，UTC+8 下今天截稿当天不应显逾期；
  // 同 OrderDetail daysLeft 写法）
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  if (deadline && deadline < todayStart && !['delivered', 'done'].includes(order.status)) {
    return ['cal-band--overdue', 'band-over']
  }
  // oimimo 吸纳批六：临期预警——今天截稿或剩余 ≤3 天 → 藤黄（对标其 DDL 三色阈值的橙档，
  // 拾绘取更保守的 ≤3 天避免满屏预警色；>3 天保持常规花青/缓冲色）
  if (deadline) {
    const daysLeft = Math.round((deadline.getTime() - todayStart.getTime()) / 86_400_000)
    if (daysLeft <= 3) {
      return ['cal-band--soon', 'band-soon']
    }
  }
  const base = order._zone === 'buffer' ? 'cal-band--buffer' : 'cal-band--formal'
  return [base, 'band-doing']
}

/** hover tooltip：订单号 + 截稿日 + 状态 */
export function bandTooltip(order: BoardOrderLite, t: (key: string) => string) {
  const deadline = order.deadline
    ? String(order.deadline).slice(0, 10)
    : t('queue.calNoDeadline')
  return `#${order.order_no} · ${deadline} · ${t(`common.orderStatus.${order.status}`)}`
}
