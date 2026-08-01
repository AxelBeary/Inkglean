import db from '../../db/connection.js'
import { PRICE_FALLBACK_SQL } from '../../utils/price.js'
import { COMPLETED_ORDER_SQL } from '../../utils/order-status.js'
import { toSqliteDate, localDayStartSqlite, localDayEndSqlite } from '../../utils/date.js'

// ============================================
// 仪表盘服务（v0.18 第二批）
// 收入统计 + 合并待办列表 + 活动流
// 纯读操作，无写操作
// ============================================

// ─── 收入统计 ───

/**
 * 获取本地时区某月一号零点的 SQLite 格式
 */
function localMonthStart(year: number, month: number): string {
  return toSqliteDate(new Date(year, month, 1))
}

/**
 * 获取本地时区某季度第一天零点的 SQLite 格式
 */
function localQuarterStart(year: number, quarter: number): string {
  return toSqliteDate(new Date(year, quarter * 3, 1))
}

/**
 * 获取本地时区某年第一天零点的 SQLite 格式
 */
function localYearStart(year: number): string {
  return toSqliteDate(new Date(year, 0, 1))
}

interface RevenueBar {
  label: string
  cents: number
  count: number
}

/**
 * 收入统计 API
 * period: 'month' | 'quarter' | 'year'
 * 返回：{ bars: [{label, cents}], summary: { totalCents, completedCount, changePercent } }
 */
export function getRevenue(artistId: number, period: string = 'month') {
  const now = new Date()
  const year = now.getFullYear()

  let bars: RevenueBar[]
  let currentStart: string, prevStart: string, prevEnd: string

  if (period === 'month') {
    // 按月内每天聚合（1~31）
    const month = now.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    currentStart = localMonthStart(year, month)
    const nextMonthStart = localMonthStart(year, month + 1)
    prevStart = localMonthStart(year, month - 1)
    prevEnd = currentStart

    // 查询当月每天的完成收入
    const rows = db.prepare(`
      SELECT CAST(strftime('%d', o.completed_at, 'localtime') AS INTEGER) as day,
             SUM(${PRICE_FALLBACK_SQL}) as cents,
             COUNT(*) as cnt
      FROM orders o
      WHERE o.artist_id = ? AND o.${COMPLETED_ORDER_SQL}
        AND o.completed_at >= ? AND o.completed_at < ?
      GROUP BY day
    `).all(artistId, currentStart, nextMonthStart) as Array<{ day: number; cents: number; cnt: number }>

    const dayMap = new Map(rows.map(r => [r.day, r]))
    bars = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1
      const row = dayMap.get(day)
      return { label: String(day), cents: row?.cents ?? 0, count: row?.cnt ?? 0 }
    })

  } else if (period === 'quarter') {
    // 按季度内每周聚合（第 1~13 周）
    const quarter = Math.floor(now.getMonth() / 3)
    currentStart = localQuarterStart(year, quarter)
    const nextQuarterStart = quarter + 1 > 3
      ? localQuarterStart(year + 1, 0)
      : localQuarterStart(year, quarter + 1)
    prevStart = localQuarterStart(quarter === 0 ? year - 1 : year, quarter === 0 ? 3 : quarter - 1)
    prevEnd = currentStart

    // 查询当季所有完成订单，在 JS 层按周分组
    const rows = db.prepare(`
      SELECT o.completed_at, ${PRICE_FALLBACK_SQL} as cents
      FROM orders o
      WHERE o.artist_id = ? AND o.${COMPLETED_ORDER_SQL}
        AND o.completed_at >= ? AND o.completed_at < ?
    `).all(artistId, currentStart, nextQuarterStart) as Array<{ completed_at: string; cents: number }>

    const weekData = Array.from({ length: 13 }, () => ({ cents: 0, count: 0 }))
    const quarterStartDate = new Date(currentStart.replace(' ', 'T'))
    for (const row of rows) {
      const d = new Date(row.completed_at.replace(' ', 'T'))
      const diffDays = Math.floor((d.getTime() - quarterStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
      const week = Math.min(Math.max(diffDays, 0), 12)
      weekData[week].cents += row.cents
      weekData[week].count++
    }
    bars = weekData.map((w, i) => ({ label: `W${i + 1}`, cents: w.cents, count: w.count }))

  } else {
    // 按年内每月聚合（1~12）
    currentStart = localYearStart(year)
    const nextYearStart = localYearStart(year + 1)
    prevStart = localYearStart(year - 1)
    prevEnd = currentStart

    const rows = db.prepare(`
      SELECT CAST(strftime('%m', o.completed_at, 'localtime') AS INTEGER) as month,
             SUM(${PRICE_FALLBACK_SQL}) as cents,
             COUNT(*) as cnt
      FROM orders o
      WHERE o.artist_id = ? AND o.${COMPLETED_ORDER_SQL}
        AND o.completed_at >= ? AND o.completed_at < ?
      GROUP BY month
    `).all(artistId, currentStart, nextYearStart) as Array<{ month: number; cents: number; cnt: number }>

    const monthMap = new Map(rows.map(r => [r.month, r]))
    bars = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const row = monthMap.get(m)
      return { label: String(m), cents: row?.cents ?? 0, count: row?.cnt ?? 0 }
    })
  }

  // 汇总
  const totalCents = bars.reduce((s, b) => s + b.cents, 0)
  const completedCount = bars.reduce((s, b) => s + b.count, 0)

  // 环比：上一周期同长度收入
  let changePercent: number | null = null
  if (prevStart && prevEnd) {
    const prevRow = db.prepare(`
      SELECT COALESCE(SUM(${PRICE_FALLBACK_SQL}), 0) as cents
      FROM orders o
      WHERE o.artist_id = ? AND o.${COMPLETED_ORDER_SQL}
        AND o.completed_at >= ? AND o.completed_at < ?
    `).get(artistId, prevStart, prevEnd) as { cents: number }
    const prevCents = prevRow.cents
    if (prevCents > 0) {
      changePercent = Math.round((totalCents - prevCents) / prevCents * 100)
    }
  }

  return {
    period,
    bars,
    summary: { totalCents, completedCount, changePercent }
  }
}

// ─── 合并待办列表 ───

interface TodoOrder {
  id: number
  order_no: string
  client_name: string | null
  status: string
  deadline: string | null
  created_at: string
  updated_at: string
}

/**
 * "现在要干什么"合并列表
 * 6 级排序：逾期 → 今日截稿 → pending → revision → confirmed/wip 有 deadline → 无 deadline
 * done 不算终态（done 后还有交付流程）
 */
export function getTodoList(artistId: number) {
  const now = new Date()
  const todayStart = localDayStartSqlite(now)
  const todayEnd = localDayEndSqlite(now)

  // 一次查出所有非终态订单（done 不算终态，仍有交付待办）
  const orders = db.prepare(`
    SELECT o.id, o.order_no, o.client_name, o.status, o.deadline,
           o.created_at, o.updated_at
    FROM orders o
    WHERE o.artist_id = ?
      AND o.status NOT IN ('delivered', 'cancelled')
    ORDER BY o.created_at DESC
  `).all(artistId) as TodoOrder[]

  // 分类 + 排序
  const overdue: TodoOrder[] = []     // 逾期：deadline < 今天零点
  const dueToday: TodoOrder[] = []    // 今日截稿：deadline >= 今天零点 AND < 明天零点
  const pending: TodoOrder[] = []     // pending 新单
  const revision: TodoOrder[] = []    // revision 修改中
  const withDeadline: TodoOrder[] = [] // confirmed/wip 有 deadline
  const noDeadline: TodoOrder[] = []   // confirmed/wip 无 deadline（含 done）

  for (const o of orders) {
    if (o.deadline && o.deadline < todayStart) {
      overdue.push(o)
    } else if (o.deadline && o.deadline >= todayStart && o.deadline < todayEnd) {
      dueToday.push(o)
    } else if (o.status === 'pending') {
      pending.push(o)
    } else if (o.status === 'revision') {
      revision.push(o)
    } else if (o.deadline) {
      withDeadline.push(o)
    } else {
      noDeadline.push(o)
    }
  }

  // 各组内排序
  overdue.sort((a, b) => a.deadline!.localeCompare(b.deadline!))
  dueToday.sort((a, b) => a.deadline!.localeCompare(b.deadline!))
  pending.sort((a, b) => b.created_at.localeCompare(a.created_at))
  revision.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  withDeadline.sort((a, b) => a.deadline!.localeCompare(b.deadline!))

  const sorted = [...overdue, ...dueToday, ...pending, ...revision, ...withDeadline, ...noDeadline]

  // 映射标签
  const TAG_MAP: Record<string, string> = {
    overdue: '逾期',
    dueToday: '截稿',
    pending: '新单',
    revision: '修改',
    active: '进行中'
  }

  return sorted.map(o => {
    let tag: string
    if (overdue.includes(o)) tag = TAG_MAP.overdue
    else if (dueToday.includes(o)) tag = TAG_MAP.dueToday
    else if (o.status === 'pending') tag = TAG_MAP.pending
    else if (o.status === 'revision') tag = TAG_MAP.revision
    else tag = TAG_MAP.active

    return {
      id: o.id,
      orderNo: o.order_no,
      clientName: o.client_name || null,
      status: o.status,
      deadline: o.deadline || null,
      tag
    }
  })
}

// ─── 活动流 ───

/**
 * 最近活动流（复用 order_notes 表）
 * 按 created_at DESC 取前 10 条
 * 返回：[{ id, orderNo, content, createdAt }]
 */
export function getActivity(artistId: number, limit: number = 10) {
  const rows = db.prepare(`
    SELECT n.id, n.order_id, n.content, n.created_at, o.order_no
    FROM order_notes n
    JOIN orders o ON n.order_id = o.id
    WHERE o.artist_id = ?
    ORDER BY n.created_at DESC
    LIMIT ?
  `).all(artistId, limit) as Array<{ id: number; order_id: number; content: string; created_at: string; order_no: string }>

  return rows.map(n => ({
    id: n.id,
    orderId: n.order_id,
    orderNo: n.order_no,
    content: n.content,
    createdAt: n.created_at
  }))
}
