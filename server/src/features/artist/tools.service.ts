import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { parseSqliteUtcDate, localDateRangeToUtc, toLocalDateString, assertLocalDateString } from '../../utils/date.js'

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

/**
 * audit-a P3-8: LIKE 通配符转义——用户输入中的 %/_/\ 按字面匹配，
 * 防止 qq='%' 一次匹配全部客户（ESCAPE '\'）
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, ch => '\\' + ch)
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
        "SELECT id, client_qq, tags, note FROM client_profiles WHERE artist_id = ? AND client_qq LIKE ? ESCAPE '\\' ORDER BY updated_at DESC"
      ).all(artistId, `%${escapeLike(qq)}%`) as ClientProfileDbRow[]
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

  // 本地日期（lastOrderAt 转本地日历日在 JS 层完成，与 todayStr 同源；
  // 不用 SQLite strftime localtime——C 运行时 TZ 与 JS TZ 在 Windows/容器间会分叉）
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const result: ReturningClientRow[] = []
  for (const row of rows) {
    if (!row.last_order_at) continue
    // created_at 为 UTC（CURRENT_TIMESTAMP），转本地日期再算天数（与散单 income_date 同为本地口径）
    const lastDateStr = toLocalDateString(parseSqliteUtcDate(row.last_order_at))
    const daysSinceLastOrder = daysBetween(todayStr, lastDateStr)
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

/**
 * P2-11: 散单单笔金额上限（单位分）。
 * 100_000_000_00 分 = 1e8 元（1 亿元）——防 1e15 量级金额逼近 MAX_SAFE_INTEGER
 * 污染收入统计；量级与订单金额上限（99999999 分）同档。
 */
export const MAX_STANDALONE_INCOME_CENTS = 100_000_000_00

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

/** 校验 incomeDate 格式 + 真实日期（UTC 严格校验，避免本地时区偏移误判） */
function assertIncomeDate(incomeDate: string): void {
  assertLocalDateString(incomeDate, 'incomeDate')
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
  // P2-11 兜底：schema 已有 maximum，但未来直连 service 的调用方可能绕过——超限即拒
  if (input.amountCents > MAX_STANDALONE_INCOME_CENTS) {
    throw new AppError(E.VALIDATION, 400, { field: 'amountCents', message: '散单金额超出上限' })
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
 * 订单日期口径：order_payments.created_at 为 UTC，本地日历日换算在 JS 层完成
 * （与散单 income_date 本地口径一致；不用 SQLite localtime，避免 C 运行时 TZ 分叉）。
 * type：订单流水 'order'（含退款负数）；散单 'standalone'。
 */
export function getExportRows(artistId: number, from: string, to: string): ExportRow[] {
  assertIncomeDate(from)
  assertIncomeDate(to)
  // 本地日区间 → UTC 半开窗口，created_at 字符串比较即可（无需 SQLite 时区函数）
  const { startUtc, endUtcExclusive } = localDateRangeToUtc(from, to)
  const rows = db.prepare(`
    SELECT
      p.created_at AS raw_date,
      o.client_qq AS client,
      p.amount_cents AS amount_cents,
      'order' AS type,
      p.order_id AS order_id
    FROM order_payments p
    JOIN orders o ON p.order_id = o.id
    WHERE o.artist_id = ? AND p.created_at >= ? AND p.created_at < ?
    UNION ALL
    SELECT
      income_date AS raw_date,
      client_name AS client,
      amount_cents AS amount_cents,
      'standalone' AS type,
      NULL AS order_id
    FROM standalone_incomes
    WHERE artist_id = ? AND income_date BETWEEN ? AND ?
  `).all(artistId, startUtc, endUtcExclusive, artistId, from, to) as Array<{
    raw_date: string
    client: string
    amount_cents: number
    type: 'order' | 'standalone'
    order_id: number | null
  }>

  return rows
    .map(r => ({
      // order 行 raw_date 为 UTC datetime → 本地日历日；standalone 行本就是本地日期串
      date: r.type === 'order' ? toLocalDateString(parseSqliteUtcDate(r.raw_date)) : r.raw_date.slice(0, 10),
      client: r.client,
      amountCents: r.amount_cents,
      type: r.type,
      orderId: r.order_id
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
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
 * 时间口径说明：order_payments.created_at 为 UTC datetime，按本地日历日过滤——
 * 本地日区间转 UTC 半开窗口后字符串比较（不用 SQLite strftime localtime，
 * 避免 C 运行时 TZ 与 JS TZ 分叉）；与 getExportRows 导出口径一致。
 * 散单 standalone_incomes.income_date 本身为本地日期字符串，两条数据源按本地日期对齐。
 */
export function getIncomeSummary(artistId: number, from: string, to: string): IncomeSummary {
  const { startUtc, endUtcExclusive } = localDateRangeToUtc(from, to)
  const orderRow = db.prepare(`
    SELECT COALESCE(SUM(p.amount_cents), 0) AS s
    FROM order_payments p
    JOIN orders o ON p.order_id = o.id
    WHERE o.artist_id = ? AND p.created_at >= ? AND p.created_at < ?
  `).get(artistId, startUtc, endUtcExclusive) as { s: number }
  const standaloneRow = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS s
    FROM standalone_incomes
    WHERE artist_id = ? AND income_date BETWEEN ? AND ?
  `).get(artistId, from, to) as { s: number }
  const orderIncomeCents = orderRow.s
  const standaloneIncomeCents = standaloneRow.s
  return { orderIncomeCents, standaloneIncomeCents, totalCents: orderIncomeCents + standaloneIncomeCents, from, to }
}
