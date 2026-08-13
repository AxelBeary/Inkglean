import db from '../../db/connection.js'
import { PRICE_FALLBACK_SQL } from '../../utils/price.js'
import { COMPLETED_ORDER_SQL } from '../../utils/order-status.js'
import { toSqliteDate, localDayStartSqlite, localDayEndSqlite, localDateRangeToUtc, toLocalDateString } from '../../utils/date.js'

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

// ── 时区换算（P2-1 修复）──
// SQLite 的 strftime('localtime') 依赖 CRT 时区：Windows/容器时区设置不同则行为不同
// （TZ='Asia/Shanghai' 时 Windows CRT 不识别 IANA 名 → 退化为 UTC，差一天）。
// 统一改在应用层换算：completed_at 存 UTC（如 '2026-07-07 16:30:00'），
// 显式补 'Z' 按 UTC 解析，再取本地日期分量——与 date.ts 口径一致、环境无关。
/** UTC 存储字符串 → 本地 Date（时区换算在应用层，不依赖 SQLite localtime） */
function toLocalDate(utcStr: string): Date {
  return new Date(utcStr.replace(' ', 'T') + 'Z')
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

    // 查询当月每天的完成收入（P2-1：时区换算在应用层，SQL 取 UTC 原始值）
    // audit-a P3-3: 去掉 GROUP BY completed_at——同秒完成多单价格不同时，GROUP BY 只取任意一行的
    // 非聚合 cents（bare column）导致收入偏低；逐单取行、应用层按本地日累加
    const rows = db.prepare(`
      SELECT o.completed_at,
             ${PRICE_FALLBACK_SQL} as cents
      FROM orders o
      WHERE o.artist_id = ? AND o.${COMPLETED_ORDER_SQL}
        AND o.completed_at >= ? AND o.completed_at < ?
    `).all(artistId, currentStart, nextMonthStart) as Array<{ completed_at: string; cents: number }>

    // 按本地日期分组（date.ts 同款口径：UTC 字符串补 Z 按 UTC 解析，取本地日）
    const dayMap = new Map<number, { cents: number; cnt: number }>()
    for (const r of rows) {
      const day = toLocalDate(r.completed_at).getDate()
      const prev = dayMap.get(day) ?? { cents: 0, cnt: 0 }
      dayMap.set(day, { cents: prev.cents + r.cents, cnt: prev.cnt + 1 })
    }
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

    // 查询当季所有完成订单，按本地日期在 JS 层分周
    // 时区口径（P2-1 修复）：SQL 取 UTC 原始值，JS 用 toLocalDate 转本地日期，
    // 与 month/year 分支一致（存储 UTC、分组展示用本地时区，应用层换算）；
    // 修复前用 new Date(completed_at) 把 UTC 字符串按本地解析，区区时差可能跨天分错周
    const rows = db.prepare(`
      SELECT o.completed_at,
             ${PRICE_FALLBACK_SQL} as cents
      FROM orders o
      WHERE o.artist_id = ? AND o.${COMPLETED_ORDER_SQL}
        AND o.completed_at >= ? AND o.completed_at < ?
    `).all(artistId, currentStart, nextQuarterStart) as Array<{ completed_at: string; cents: number }>

    const weekData = Array.from({ length: 13 }, () => ({ cents: 0, count: 0 }))
    // 季度首日（本地时区），与 toLocalDate 同口径
    const quarterStartDate = new Date(year, quarter * 3, 1)
    for (const row of rows) {
      const d = toLocalDate(row.completed_at)
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

    // audit-a P3-3: 与 month 分支同口径——逐单 SELECT cents，应用层聚合
    const rows = db.prepare(`
      SELECT o.completed_at,
             ${PRICE_FALLBACK_SQL} as cents
      FROM orders o
      WHERE o.artist_id = ? AND o.${COMPLETED_ORDER_SQL}
        AND o.completed_at >= ? AND o.completed_at < ?
    `).all(artistId, currentStart, nextYearStart) as Array<{ completed_at: string; cents: number }>

    // 按本地月份分组（P2-1：应用层换算，不依赖 SQLite localtime）
    const monthMap = new Map<number, { cents: number; cnt: number }>()
    for (const r of rows) {
      const m = toLocalDate(r.completed_at).getMonth() + 1
      const prev = monthMap.get(m) ?? { cents: 0, cnt: 0 }
      monthMap.set(m, { cents: prev.cents + r.cents, cnt: prev.cnt + 1 })
    }
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

// ─── 近 7 日排期 ───

interface ScheduleOrderRow {
  id: number
  order_no: string
  client_name: string | null
  status: string
  start_date: string | null
  deadline: string | null
  stage_name: string | null
}

/**
 * 近 7 日排期条（视觉批备料）
 * 窗口 = [本地今日-1 天, 本地今日+6 天]；
 * start_date（本地日历日 YYYY-MM-DD）或 deadline（UTC 存储）落在窗口内即入选；
 * delivered/cancelled 排除；按 startDate（空则 deadline）升序。
 * 时区铁律：本地日历日换算全部走 date.ts 工具（localDateRangeToUtc），
 * 禁用 SQLite strftime localtime（TZ 分叉事故教训）。
 */
export function getSchedule(artistId: number) {
  const now = new Date()
  const from = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const to = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6))
  const { startUtc, endUtcExclusive } = localDateRangeToUtc(from, to)

  const rows = db.prepare(`
    SELECT o.id, o.order_no, o.client_name, o.status, o.start_date, o.deadline,
           ws.name AS stage_name
    FROM orders o
    LEFT JOIN artist_workflow_stages ws ON ws.id = o.current_stage_id
    WHERE o.artist_id = ?
      AND o.status NOT IN ('delivered', 'cancelled')
      AND (
        -- start_date 为本地日历日字符串，直接按本地日期串比较（含窗口末日）
        (o.start_date IS NOT NULL AND o.start_date >= ? AND o.start_date <= ?)
        OR
        -- deadline 存 UTC，用 localDateRangeToUtc 换算的 UTC 半开窗口 [startUtc, endUtcExclusive)
        (o.deadline IS NOT NULL AND o.deadline >= ? AND o.deadline < ?)
      )
  `).all(artistId, from, to, startUtc, endUtcExclusive) as ScheduleOrderRow[]

  // 排序：按 startDate（空则 deadline）升序
  rows.sort((a, b) =>
    (a.start_date ?? a.deadline ?? '').localeCompare(b.start_date ?? b.deadline ?? '')
  )

  return rows.map(o => ({
    id: o.id,
    orderNo: o.order_no,
    clientName: o.client_name || null,
    status: o.status,
    startDate: o.start_date || null,
    deadline: o.deadline || null,
    stageName: o.stage_name || null
  }))
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

// ════════════════════════════════════════════
// REQ-043 I2: 开张任务卡（新手引导，后端标记）
// 前端不靠 localStorage——「不再提示」与「自然达成」都写 artists 表，
// 换设备/清缓存后依然保持隐藏（用户拍板 2026-08-11）
// ════════════════════════════════════════════

export interface OnboardingTask {
  key: 'artwork' | 'tier' | 'share'
  done: boolean
}

export interface OnboardingState {
  dismissed: boolean
  tasks: OnboardingTask[]
}

/**
 * 开张任务卡状态（GET /api/artist/onboarding）
 * 任务口径：
 *  - artwork = 作品数 > 0（传了第一张作品）
 *  - tier    = 已有画风（当前价格模型 = 画风 + 尺寸；有画风即有定价骨架，视为「设了档位」）
 *  - share   = 恒 false：分享主页发生在浏览器本地动作，后端无可判定的数据信号，
 *              定位为「建议项」（前端不要求勾选，不阻塞自然达成）
 * 自然达成：artwork + tier 两项完成即写 onboarded_at（任务全完成 = 必做项全完成，
 * share 为建议项；若按字面三任务全完成，share 恒 false 将永不达成，与需求意图不符）
 */
export function getOnboarding(artistId: number): OnboardingState {
  const row = db.prepare(
    'SELECT onboarded_at, onboarding_dismissed_at FROM artists WHERE id = ?'
  ).get(artistId) as { onboarded_at: string | null; onboarding_dismissed_at: string | null } | undefined

  const dismissed = !!row?.onboarding_dismissed_at
  const artworkDone = (db.prepare(
    'SELECT COUNT(*) AS c FROM artworks WHERE artist_id = ?'
  ).get(artistId) as { c: number }).c > 0
  const tierDone = (db.prepare(
    'SELECT COUNT(*) AS c FROM art_styles WHERE artist_id = ?'
  ).get(artistId) as { c: number }).c > 0

  // 自然达成：必做项（作品 + 档位）全部完成且未主动关闭时，写 onboarded_at（幂等）
  if (!dismissed && artworkDone && tierDone && !row?.onboarded_at) {
    db.prepare("UPDATE artists SET onboarded_at = datetime('now') WHERE id = ?").run(artistId)
  }

  return {
    dismissed,
    tasks: [
      { key: 'artwork', done: artworkDone },
      { key: 'tier', done: tierDone },
      { key: 'share', done: false }
    ]
  }
}

/**
 * 「不再提示」：写 onboarding_dismissed_at（幂等，已标记不重复覆盖时间）
 * 关闭后前端彻底隐藏；此标记不因任务完成而被清除（与 onboarded_at 独立）
 */
export function dismissOnboarding(artistId: number): { dismissed: boolean } {
  db.prepare(
    "UPDATE artists SET onboarding_dismissed_at = COALESCE(onboarding_dismissed_at, datetime('now')) WHERE id = ?"
  ).run(artistId)
  return { dismissed: true }
}
