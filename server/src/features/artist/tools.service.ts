import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'

// ============================================
// 画师工具服务（REQ-035 批A/批C + REQ-031 A1）
// 客户标记 + 老客召回 + 散单记账 + A1 收入导出
// ============================================

// ─── client_profiles（画师私有客户标记） ───

export interface ClientProfileRow {
  id: number
  clientQq: string
  tags: string[]
  note: string
}

interface ClientProfileDbRow {
  id: number
  client_qq: string
  tags: string
  note: string
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t: unknown): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

function toClientProfile(row: ClientProfileDbRow): ClientProfileRow {
  return { id: row.id, clientQq: row.client_qq, tags: parseTags(row.tags), note: row.note }
}

/** 按 artist + qq 取单条（无则返回 null） */
export function getClientProfile(artistId: number, clientQq: string): ClientProfileRow | null {
  const row = db.prepare(
    'SELECT id, client_qq, tags, note FROM client_profiles WHERE artist_id = ? AND client_qq = ?'
  ).get(artistId, clientQq) as ClientProfileDbRow | undefined
  return row ? toClientProfile(row) : null
}

/** 按 artist 全量列表（qq 可选过滤，包含匹配） */
export function listClientProfiles(artistId: number, qq?: string): ClientProfileRow[] {
  const rows = qq
    ? db.prepare(
        'SELECT id, client_qq, tags, note FROM client_profiles WHERE artist_id = ? AND client_qq LIKE ? ORDER BY updated_at DESC'
      ).all(artistId, `%${qq}%`) as ClientProfileDbRow[]
    : db.prepare(
        'SELECT id, client_qq, tags, note FROM client_profiles WHERE artist_id = ? ORDER BY updated_at DESC'
      ).all(artistId) as ClientProfileDbRow[]
  return rows.map(toClientProfile)
}

/** upsert：存在则更新 tags/note/updated_at，不存在则插入 */
export function upsertClientProfile(artistId: number, clientQq: string, tags: string[], note: string): ClientProfileRow {
  const tagsJson = JSON.stringify(tags)
  db.prepare(`
    INSERT INTO client_profiles (artist_id, client_qq, tags, note)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(artist_id, client_qq) DO UPDATE SET
      tags = excluded.tags,
      note = excluded.note,
      updated_at = datetime('now')
  `).run(artistId, clientQq, tagsJson, note)
  return getClientProfile(artistId, clientQq) as ClientProfileRow
}

/** 删除（标签清空） */
export function deleteClientProfile(artistId: number, clientQq: string): void {
  db.prepare('DELETE FROM client_profiles WHERE artist_id = ? AND client_qq = ?').run(artistId, clientQq)
}

// ─── 客户汇总（老客召回共享） ───

export interface ClientSummary {
  clientQq: string
  totalOrders: number
  totalPaidCents: number
  lastOrderAt: string | null
  lastOrderStatus: string | null
}

/**
 * 按 artist + qq 聚合客户摘要。
 * totalPaidCents 口径：order_payments SUM(amount_cents)（收款正数、退款负数）
 * —— 对照派工「order_payments 正数-负数 口径」；与 getRevenue 不同（getRevenue 走 orders
 * 表完成订单价格聚合），此处语义为「实际已收」，order_payments 是唯一收款流水表。
 * orders 表无 deleted_at 列（派工 SQL 描述有出入），按 artist_id + client_qq 直接过滤。
 */
export function getClientSummary(artistId: number, clientQq: string): ClientSummary | null {
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM orders WHERE artist_id = ? AND client_qq = ?) AS total_orders,
      (SELECT COALESCE(SUM(p.amount_cents), 0) FROM order_payments p
         JOIN orders o ON p.order_id = o.id
       WHERE o.artist_id = ? AND o.client_qq = ?) AS total_paid_cents,
      (SELECT created_at FROM orders WHERE artist_id = ? AND client_qq = ? ORDER BY created_at DESC LIMIT 1) AS last_order_at,
      (SELECT status FROM orders WHERE artist_id = ? AND client_qq = ? ORDER BY created_at DESC LIMIT 1) AS last_order_status
  `).get(artistId, clientQq, artistId, clientQq, artistId, clientQq, artistId, clientQq) as {
    total_orders: number
    total_paid_cents: number
    last_order_at: string | null
    last_order_status: string | null
  } | undefined

  if (!row || row.total_orders === 0) return null
  return {
    clientQq,
    totalOrders: row.total_orders,
    totalPaidCents: row.total_paid_cents,
    lastOrderAt: row.last_order_at,
    lastOrderStatus: row.last_order_status
  }
}

// ─── 老客召回列表（REQ-035 §七） ───

export interface ReturningClientRow extends ClientSummary {
  daysSinceLastOrder: number
}

/** 今天 - lastOrderAt 的天数（本地日期差） */
function daysBetween(todayStr: string, lastDateStr: string): number {
  const diffMs = Date.parse(todayStr) - Date.parse(lastDateStr)
  return Math.round(diffMs / 86_400_000)
}

/**
 * 老客列表：按 artist 聚合所有 client_qq 的摘要，过滤 lastOrderAt 非空，
 * 按 daysSinceLastOrder 倒序。days 参数 = 筛选阈值（>days 未下单才列出）。
 */
export function listReturningClients(artistId: number, days: number): ReturningClientRow[] {
  const rows = db.prepare(`
    SELECT
      o.client_qq,
      COUNT(*) AS total_orders,
      (SELECT COALESCE(SUM(p.amount_cents), 0) FROM order_payments p
         JOIN orders op ON p.order_id = op.id
       WHERE op.artist_id = o.artist_id AND op.client_qq = o.client_qq) AS total_paid_cents,
      MAX(o.created_at) AS last_order_at,
      (SELECT status FROM orders o2
        WHERE o2.artist_id = o.artist_id AND o2.client_qq = o.client_qq
        ORDER BY o2.created_at DESC LIMIT 1) AS last_order_status
    FROM orders o
    WHERE o.artist_id = ?
    GROUP BY o.client_qq
  `).all(artistId) as Array<{
    client_qq: string
    total_orders: number
    total_paid_cents: number
    last_order_at: string | null
    last_order_status: string | null
  }>

  // 本地日期（与 lastOrderAt 的 localtime 口径一致；toSqliteDate 是 UTC 会差一天）
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const result: ReturningClientRow[] = []
  for (const row of rows) {
    if (!row.last_order_at) continue
    // created_at 为 UTC（CURRENT_TIMESTAMP），转本地日期再算天数（与散单 income_date 同为本地口径）
    const lastDateStr = db.prepare(
      "SELECT strftime('%Y-%m-%d', ?, 'localtime') AS d"
    ).get(row.last_order_at) as { d: string }
    const daysSinceLastOrder = daysBetween(todayStr, lastDateStr.d)
    if (daysSinceLastOrder <= days) continue
    result.push({
      clientQq: row.client_qq,
      totalOrders: row.total_orders,
      totalPaidCents: row.total_paid_cents,
      lastOrderAt: row.last_order_at,
      lastOrderStatus: row.last_order_status,
      daysSinceLastOrder
    })
  }
  result.sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder)
  return result
}

// ─── standalone_incomes（散单记账） ───

export interface StandaloneIncomeRow {
  id: number
  amountCents: number
  clientName: string
  note: string
  incomeDate: string
}

interface StandaloneIncomeDbRow {
  id: number
  amount_cents: number
  client_name: string
  note: string
  income_date: string
}

function toStandaloneIncome(row: StandaloneIncomeDbRow): StandaloneIncomeRow {
  return { id: row.id, amountCents: row.amount_cents, clientName: row.client_name, note: row.note, incomeDate: row.income_date }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 校验 incomeDate 格式 + 真实日期（UTC 严格校验，避免本地时区偏移误判） */
function assertIncomeDate(incomeDate: string): void {
  if (!DATE_RE.test(incomeDate)) {
    throw new AppError(E.VALIDATION, 400, { field: 'incomeDate', message: '日期格式须为 YYYY-MM-DD' })
  }
  const [y, m, d] = incomeDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new AppError(E.VALIDATION, 400, { field: 'incomeDate', message: '日期无效' })
  }
}

/** 列表（按 income_date 倒序；可选 from/to 时间段过滤） */
export function listStandaloneIncomes(artistId: number, from?: string, to?: string): StandaloneIncomeRow[] {
  if (from) assertIncomeDate(from)
  if (to) assertIncomeDate(to)
  const rows = from && to
    ? db.prepare(
        'SELECT id, amount_cents, client_name, note, income_date FROM standalone_incomes WHERE artist_id = ? AND income_date BETWEEN ? AND ? ORDER BY income_date DESC, id DESC'
      ).all(artistId, from, to) as StandaloneIncomeDbRow[]
    : db.prepare(
        'SELECT id, amount_cents, client_name, note, income_date FROM standalone_incomes WHERE artist_id = ? ORDER BY income_date DESC, id DESC'
      ).all(artistId) as StandaloneIncomeDbRow[]
  return rows.map(toStandaloneIncome)
}

/** 新增（校验 amountCents>0 + incomeDate 格式） */
export function createStandaloneIncome(
  artistId: number,
  input: { amountCents: number; clientName: string; note: string; incomeDate: string }
): StandaloneIncomeRow {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new AppError(E.INVALID_PRICE, 400, { value: input.amountCents })
  }
  assertIncomeDate(input.incomeDate)
  const result = db.prepare(
    'INSERT INTO standalone_incomes (artist_id, amount_cents, client_name, note, income_date) VALUES (?, ?, ?, ?, ?)'
  ).run(artistId, input.amountCents, input.clientName ?? '', input.note ?? '', input.incomeDate)
  const row = db.prepare(
    'SELECT id, amount_cents, client_name, note, income_date FROM standalone_incomes WHERE id = ?'
  ).get(result.lastInsertRowid) as StandaloneIncomeDbRow
  return toStandaloneIncome(row)
}

/** 删除（仅本人 artist_id；命中返回 true） */
export function deleteStandaloneIncome(artistId: number, id: number): boolean {
  const result = db.prepare('DELETE FROM standalone_incomes WHERE id = ? AND artist_id = ?').run(id, artistId)
  return result.changes > 0
}

// ─── A1 导出合并流水 ───

export interface ExportRow {
  date: string
  client: string
  amountCents: number
  type: 'order' | 'standalone'
  orderId: number | null
}

/**
 * 时间段内合并：order_payments（join orders 取 artist_id + client_qq）+ standalone_incomes，按 date 升序。
 * 订单日期口径：order_payments.created_at 为 UTC，转本地日期（与散单 income_date 本地口径一致）。
 * type：订单流水 'order'（含退款负数）；散单 'standalone'。
 */
export function getExportRows(artistId: number, from: string, to: string): ExportRow[] {
  assertIncomeDate(from)
  assertIncomeDate(to)
  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m-%d', p.created_at, 'localtime') AS date,
      o.client_qq AS client,
      p.amount_cents AS amount_cents,
      'order' AS type,
      p.order_id AS order_id
    FROM order_payments p
    JOIN orders o ON p.order_id = o.id
    WHERE o.artist_id = ? AND strftime('%Y-%m-%d', p.created_at, 'localtime') BETWEEN ? AND ?
    UNION ALL
    SELECT
      income_date AS date,
      client_name AS client,
      amount_cents AS amount_cents,
      'standalone' AS type,
      NULL AS order_id
    FROM standalone_incomes
    WHERE artist_id = ? AND income_date BETWEEN ? AND ?
    ORDER BY date ASC
  `).all(artistId, from, to, artistId, from, to) as Array<{
    date: string
    client: string
    amount_cents: number
    type: 'order' | 'standalone'
    order_id: number | null
  }>

  return rows.map(r => ({
    date: r.date,
    client: r.client,
    amountCents: r.amount_cents,
    type: r.type,
    orderId: r.order_id
  }))
}

/**
 * 画师收入汇总（订单收款 + 散单，按收入日期区间）
 * from/to 必填，YYYY-MM-DD；无区间数据返回 0 而非 null
 */
export interface IncomeSummary {
  /** 订单收款合计（order_payments SUM，正数收款 - 负数退款） */
  orderIncomeCents: number
  /** 散单收入合计（standalone_incomes SUM） */
  standaloneIncomeCents: number
  /** 合计 */
  totalCents: number
  /** 区间起始/结束（与请求一致） */
  from: string
  to: string
}

/**
 * 画师收入汇总查询。
 * 时间口径说明：order_payments.created_at 为 UTC datetime，date(p.created_at) 取 UTC 日期；
 * standalone_incomes.income_date 为本地日期字符串。两口径可能差一天，保持各自口径
 * （散单页已用 income_date 本地日期；如需严格对齐可后续排期，本批不扩复杂度）。
 */
export function getIncomeSummary(artistId: number, from: string, to: string): IncomeSummary {
  // order_payments 按 p.created_at（datetime）date() 与订单关联过滤 artist
  const orderRow = db.prepare(`
    SELECT COALESCE(SUM(p.amount_cents), 0) AS s
    FROM order_payments p
    JOIN orders o ON p.order_id = o.id
    WHERE o.artist_id = ? AND date(p.created_at) BETWEEN ? AND ?
  `).get(artistId, from, to) as { s: number }
  const standaloneRow = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS s
    FROM standalone_incomes
    WHERE artist_id = ? AND income_date BETWEEN ? AND ?
  `).get(artistId, from, to) as { s: number }
  const orderIncomeCents = orderRow.s
  const standaloneIncomeCents = standaloneRow.s
  return { orderIncomeCents, standaloneIncomeCents, totalCents: orderIncomeCents + standaloneIncomeCents, from, to }
}
