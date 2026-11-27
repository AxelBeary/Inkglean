import db from '../../db/connection.js'

// ============================================
// 管理员事件流水服务（「事件流水幕布」步 1，2026-11-28 立项）
//
// 定位：**展示/排查用统一时间线**，不是任何处置的法定事实源。
//   - 管理动作的法定账本仍是 admin_actions（REQ-042 §七 验收 4），本表由
//     compliance.service.writeAdminAction 在**同一事务内**双写一份展示副本；
//     admin_actions 永久保留，本表按分级 TTL 滚动 —— TTL 到期只丢副本，不丢证据。
//   - 认证事件此前「成功=覆盖写 artists.last_login_at/_ip、失败=只有 pino 日志」
//     （容器 json-file 10MB×3 轮转，几天即滚掉），本表是它们唯一的可查询面。
//
// 隐私口径（用户 2026-11-28 拍板；SPEC §5 决策台账）：
//   D1=B 只收「有后果的动作」：认证 / 管理动作 / 交易与上传。**不采集访客浏览**（无 access 类）。
//   D2=A 管理员动作与认证事件记 **IP 原值**（45 字符上限，与 admin_actions.admin_ip /
//        reports.report_ip / artists.last_login_ip 完全同口径）。因 D1=B 无访问类事件，
//        故不存在需要脱敏的档位。
//   D3=B **不记录未登录访客的浏览**。actor_kind='anon' 仅承载「匿名但有后果」的动作
//        （匿名举报、匿名留言），不承载任何浏览行为。
//
// 写入门槛（保密纪律）：
//   - meta_json 里可以放 reason/orderNo 这类排障字段，但**绝不出响应体**——
//     登录失败 reason 的对外口径见 auth.routes.ts logLoginDeny 的 GHSA-6pf3-854w P1 注释。
//   - action 走白名单常量（ACTIONS），脏值在写入层拦下，不让它进查询面。
// ============================================

/** IP 列入库长度上限：IPv6 完整形态最长 45 字符（与 compliance.service IP_COLUMN_MAX 同口径） */
export const IP_COLUMN_MAX = 45

/** meta_json 字节上限：沿 tracking.service MAX_EVENT_PAYLOAD_BYTES 口径（2KB） */
export const META_JSON_MAX_BYTES = 2048

/** 事件大类：actor_kind 四态（库层 CHECK 同款） */
export type ActorKind = 'admin' | 'artist' | 'client' | 'anon'

/** 事件结果两态（库层 CHECK 同款） */
export type EventOutcome = 'ok' | 'fail'

/**
 * action 白名单（写入层唯一入口）。
 * 新增事件必须先在白名单登记：既防脏值污染查询面，也让「这批到底接了哪些事件」可枚举。
 */
export const ACTIONS = {
  /** 认证线：四种登录方式共用 action，方式记 meta.method */
  loginSuccess: 'login_success',
  loginFail: 'login_fail',
  stepupFail: 'stepup_fail',
  /** 管理动作线：action 原样沿用 admin_actions.action（12 类），便于两表对账 */
  adminActionPrefix: 'admin:',
  /** 交易与上传线 */
  orderCreate: 'order_create',
  referenceUpload: 'reference_upload',
  reportSubmit: 'report_submit',
  guestbookPost: 'guestbook_post'
} as const

/** 认证线方法枚举（meta.method） */
export type LoginMethod = 'totp' | 'passkey' | 'desktop' | 'invite'

/** 记录事件入参（所有字段都显式，避免调用点各拼一份对象） */
export interface RecordEventInput {
  actorKind: ActorKind
  actorId?: number | null
  /** 来源 IP 原值；取不到传 null（不写 'unknown' 占位串） */
  ip?: string | null
  action: string
  targetType?: string | null
  targetId?: number | null
  /** 排障差异字段；只进本表，绝不出响应体 */
  meta?: Record<string, unknown> | null
  outcome?: EventOutcome
  /** 事件时间（毫秒）；缺省 now。测试与双写复用可显式传 */
  at?: number
}

/** 流水行（管理端查询面；字段名与列一一对应，无派生） */
export interface ActivityEventRow {
  id: number
  at: number
  actor_kind: ActorKind
  actor_id: number | null
  ip: string | null
  action: string
  target_type: string | null
  target_id: number | null
  meta_json: string
  outcome: EventOutcome
}

/** meta 序列化：超 2KB 退化为截断后的安全形状（不抛——留痕宁可丢细节也不能阻断业务事务） */
function serializeMeta(meta: Record<string, unknown> | null | undefined): string {
  if (!meta) return '{}'
  let json: string
  try {
    json = JSON.stringify(meta)
  } catch {
    // 循环引用等不可序列化情形：留一条可读标记，不阻断业务写
    return '{"metaUnserializable":true}'
  }
  if (Buffer.byteLength(json, 'utf8') <= META_JSON_MAX_BYTES) return json
  // 超限：只留字节安全的前缀 + 截断标记（JSON 结构会被破坏，故整体改写成单字段对象）
  return JSON.stringify({ truncated: true, bytes: Buffer.byteLength(json, 'utf8') })
}

/** IP 归一：取不到存 NULL，取到则钳制 45 字符（不脱敏——D2=A 口径） */
function normalizeIp(ip: string | null | undefined): string | null {
  if (ip == null) return null
  const s = String(ip).trim()
  return s ? s.slice(0, IP_COLUMN_MAX) : null
}

/**
 * 写一条流水。
 *
 * ⚠️ 事务纪律（SPEC 风险 R6）：**本函数不自己开事务**——
 *   - 业务路径（管理动作/下单/留言/上传）必须挂在调用方已有的事务内，与业务写同成同败；
 *   - 认证线是「先判后写」的单语句场景，自身即原子，无需外层事务。
 * 好处是双写与业务写共享同一个回滚单元，不会留半截账。
 */
export function recordEvent(input: RecordEventInput): void {
  db.prepare(`
    INSERT INTO activity_events (at, actor_kind, actor_id, ip, action, target_type, target_id, meta_json, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.at ?? Date.now(),
    input.actorKind,
    input.actorId ?? null,
    normalizeIp(input.ip),
    input.action,
    input.targetType ?? null,
    input.targetId ?? null,
    serializeMeta(input.meta),
    input.outcome ?? 'ok'
  )
}

// ============================================
// 查询面（GET /api/admin/activity-events）
// ============================================

/** 查询筛选：全部可选，服务端一律钳制 */
export interface ActivityEventFilters {
  action?: string | null
  actorKind?: ActorKind | null
  actorId?: number | null
  /** 时间范围（毫秒，闭区间；任一缺省即该侧不限） */
  from?: number | null
  to?: number | null
  /**
   * 游标：只取排序位置上「在上一条之后」的行（配合 ORDER BY at DESC, id DESC 分页）。
   * 对外只有一个参数，内部按复合游标 (at, id) 比较——见 queryEvents 的说明。
   */
  beforeId?: number | null
  limit?: number | null
}

/** 服务端分页钳制：1–200（与任务书口径一致；上限防一次灌全表） */
export const ACTIVITY_LIMIT_MAX = 200
export const ACTIVITY_LIMIT_DEFAULT = 50

/** 查询响应契约（前端步 2 依赖此形状） */
export interface ActivityEventPage {
  rows: ActivityEventRow[]
  /** 下一页游标：本页最后一条的 id；无更多数据时为 null */
  nextBeforeId: number | null
  /** 是否还有更多（服务端多取一条判定，无需客户端猜） */
  hasMore: boolean
}

/** 单行出站形状：**不含 meta_json 原文以外的任何其他方敏感字段**；meta 解析后回传（管理端可见） */
export interface ActivityEventDTO {
  id: number
  at: number
  actorKind: ActorKind
  actorId: number | null
  ip: string | null
  action: string
  targetType: string | null
  targetId: number | null
  outcome: EventOutcome
  meta: Record<string, unknown>
}

/** meta_json 安全解析（历史脏值不炸查询） */
function parseMeta(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

/** 行 → 出站 DTO（显式逐字段列举：新增列不会被意外平铺出去） */
export function toActivityEventDTO(row: ActivityEventRow): ActivityEventDTO {
  return {
    id: row.id,
    at: row.at,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    ip: row.ip,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    outcome: row.outcome,
    meta: parseMeta(row.meta_json)
  }
}

/** WHERE 构造（列表与计数同口径，防截断与计数错位） */
export function buildFilter(opts: ActivityEventFilters): { where: string; params: Array<string | number> } {
  const clauses: string[] = []
  const params: Array<string | number> = []
  if (opts.action) {
    clauses.push('action = ?')
    params.push(opts.action)
  }
  if (opts.actorKind) {
    clauses.push('actor_kind = ?')
    params.push(opts.actorKind)
  }
  if (opts.actorId != null) {
    clauses.push('actor_id = ?')
    params.push(opts.actorId)
  }
  if (opts.from != null) {
    clauses.push('at >= ?')
    params.push(opts.from)
  }
  if (opts.to != null) {
    clauses.push('at <= ?')
    params.push(opts.to)
  }
  // beforeId 的复合游标条件由 queryEvents 单独拼（需要先按 id 反查游标行的 at），此处不处理
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

/** limit 钳制（非数字/≤0 回默认；超上限钳到上限） */
export function clampLimit(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return ACTIVITY_LIMIT_DEFAULT
  return Math.min(Math.floor(n), ACTIVITY_LIMIT_MAX)
}

/**
 * 查流水（时间倒序 + id 倒序；同毫秒多事件靠 id 稳定排序，避免翻页跳行）。
 * 服务端多取 1 条判定 hasMore，nextBeforeId 取本页最后一条 id（无更多时 null）。
 *
 * 🔴 游标必须是**复合游标** (at, id)，不能只用 id：
 *   ORDER BY at DESC, id DESC 下 id 与 at 并不保证同向（同毫秒多条、事后补写历史事件、
 *   时钟回拨都会让「id 更大但 at 更早」出现）。只用 id < ? 会漏行——本批 TC-AE-16 实测踩到过。
 *   对外仍只暴露 beforeId 一个参数（前端契约简单），cursorAt 由服务端按 id 反查。
 */
export function queryEvents(opts: ActivityEventFilters = {}): ActivityEventPage {
  const limit = clampLimit(opts.limit)
  const { where, params } = buildFilter(opts)

  // 复合游标：at < cursorAt OR (at = cursorAt AND id < cursorId)
  let cursorClause = ''
  const cursorParams: number[] = []
  if (opts.beforeId != null) {
    const cursor = db.prepare('SELECT at FROM activity_events WHERE id = ?').get(opts.beforeId) as { at: number } | undefined
    if (cursor) {
      cursorClause = where ? 'AND (at < ? OR (at = ? AND id < ?))' : 'WHERE (at < ? OR (at = ? AND id < ?))'
      cursorParams.push(cursor.at, cursor.at, opts.beforeId)
    } else {
      // 游标行已被 TTL 清掉：退化为 id < ? 保守兜底（宁可多翻一页也不漏行）
      cursorClause = where ? 'AND id < ?' : 'WHERE id < ?'
      cursorParams.push(opts.beforeId)
    }
  }
  const fullWhere = [where, cursorClause].filter(Boolean).join(' ')

  // ORDER BY at DESC, id DESC —— 走 idx_activity_events_at(at DESC)
  const rows = db.prepare(
    `SELECT * FROM activity_events ${fullWhere} ORDER BY at DESC, id DESC LIMIT ?`
  ).all(...params, ...cursorParams, limit + 1) as ActivityEventRow[]

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  return {
    rows: page,
    nextBeforeId: hasMore ? page[page.length - 1].id : null,
    hasMore
  }
}

/** 计数（同筛选口径、不受 limit 截断） */
export function countEvents(opts: ActivityEventFilters = {}): number {
  const { where, params } = buildFilter(opts)
  return (db.prepare(`SELECT COUNT(*) AS c FROM activity_events ${where}`).get(...params) as { c: number }).c
}
