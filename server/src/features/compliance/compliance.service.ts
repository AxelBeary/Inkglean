import db from '../../db/connection.js'
import * as artistService from '../artist/artist.service.js'
import * as guestbookService from '../guestbook/guestbook.service.js'
import { sanitizeStoredText } from '../../shared/sanitize.js'
import { localDateRangeToUtc } from '../../utils/date.js'
// v86（事件流水幕布步 1）：管理动作同事务双写流水——单点接线，一处覆盖全部 12 类动作
import { recordEvent } from '../activity/activity.service.js'

// ============================================
// 合规与内容安全服务（REQ-042）
// 举报 / 处理留痕 / 内容下架 / 画师封禁
// 全部动作写 admin_actions（created_at 由 DEFAULT 提供，reason 可选）
// v75（P4 后端批）：留痕与举报各补一列取证 IP（admin_ip / report_ip）
// v76（P4 后端批）：主页内容级下架（home_takedown）——处置阶梯的中间格，不碰账号
// ============================================

/**
 * IP 列入库长度上限：IPv6 完整形态最长 45 字符，钳制只为防超长请求头灌库。
 * 取法一律路由层的 request.ip（CF→Caddy 已在反代层换算真实用户 IP，见 docs/OPS.md §12.1
 * 与 tests/cf-real-ip.test.ts）；后端不得自行读裸 CF-Connecting-IP 头，那东西在链路外可任意伪造。
 */
const IP_COLUMN_MAX = 45

/** 举报行 */
export interface ReportRow {
  id: number
  target_type: 'artist_home' | 'artwork' | 'message' | 'other'
  target_id: number | null
  description: string
  contact: string | null
  status: 'pending' | 'resolved'
  resolved_by: number | null
  resolved_at: string | null
  // v75 取证 IP：举报来源（纠纷取证与防恶意举报）。本表只有 /api/admin/reports* 一条读取路径，
  // 天然只在管理端可见——将来新增举报读取口须防回归（tests/compliance.test.ts 逆泄露断言）
  report_ip: string | null
  created_at: string
}

/** 管理动作留痕行 */
export interface AdminActionRow {
  id: number
  admin_id: number
  action: string
  target_type: string | null
  target_id: number | null
  reason: string | null
  // v75 取证 IP：管理员动作来源（REQ-042 §七 验收 4「留痕记录（时间/IP/原因）」的欠账补齐）
  admin_ip: string | null
  created_at: string
}

/**
 * 留痕查询筛选参数（GET /api/admin/admin-actions 与 /export 共用；targetType 与 targetId 须成对才生效）
 *
 * R-2（2026-11-28）：新增 adminId / from / to 三项，导出接口按「管理员 + 时间范围」取数。
 * 列表接口不传这三项时行为与改造前逐字一致（clauses 为空 → 不加 WHERE）。
 */
export interface AdminActionFilters {
  limit?: number
  action?: string | null
  targetType?: string | null
  targetId?: number | null
  /** 管理员 artist.id 精确筛（导出用；列表接口暂不开放该参数） */
  adminId?: number | null
  /** 时间范围下界（含），'YYYY-MM-DD' 本地日 —— 内部换算成 [start, end) UTC 窗口 */
  from?: string | null
  /** 时间范围上界（含），'YYYY-MM-DD' 本地日 */
  to?: string | null
}

/** 新建举报（公开，匿名可提交；contact 可选；reportIp = 路由层 request.ip，v75 取证） */
export function createReport(
  input: {
    targetType: string
    targetId?: number | null
    description: string
    contact?: string | null
    reportIp?: string | null
  }
): ReportRow | undefined {
  const safeContact = sanitizeStoredText(input.contact)
  const result = db.prepare(`
    INSERT INTO reports (target_type, target_id, description, contact, report_ip)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    input.targetType,
    input.targetId ?? null,
    sanitizeStoredText(input.description),
    safeContact.trim() ? safeContact.trim().slice(0, 100) : null,
    // 取不到存 NULL，不写 'unknown' 之类占位串：「没取到」与「取到了什么」在追溯时是两件事
    input.reportIp ? String(input.reportIp).slice(0, IP_COLUMN_MAX) : null
  )
  return db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(result.lastInsertRowid)) as ReportRow | undefined
}

/** 管理员查询举报（status 可选：pending/resolved） */
export function getReports(status?: string): ReportRow[] {
  if (status === 'pending' || status === 'resolved') {
    return db.prepare(
      'SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC, id DESC'
    ).all(status) as ReportRow[]
  }
  return db.prepare('SELECT * FROM reports ORDER BY created_at DESC, id DESC').all() as ReportRow[]
}

/** 标记举报已处理（写留痕；不存在返回 null） */
export function resolveReport(
  reportId: number,
  adminId: number,
  reason?: string | null,
  adminIp?: string | null
): ReportRow | null {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as ReportRow | undefined
  if (!report) return null
  db.transaction(() => {
    db.prepare(`
      UPDATE reports SET status = 'resolved', resolved_by = ?, resolved_at = datetime('now')
      WHERE id = ?
    `).run(adminId, reportId)
    writeAdminAction(adminId, 'report_resolve', 'report', reportId, reason, adminIp)
  })()
  return db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as ReportRow
}

/**
 * 内容下架（type=artwork → v76 置 takedown_at，**行保留可恢复**；
 * type=message → 现有管理员软删除 deleted_by_admin=1）；写留痕
 */
export function removeContent(
  type: 'artwork' | 'message',
  targetId: number,
  adminId: number,
  reason?: string | null,
  adminIp?: string | null
): { success: boolean; already?: boolean } {
  if (type === 'artwork') {
    // v76 语义变更：artworks 已有 takedown_at / takedown_reason 两列（v76 迁移），平台下架改走
    // artistService.takedownArtwork()（写函数归 C 路，本文件只调用不实现）。
    // 旧注释「最小破坏：artworks 无隐藏字段 → 走现有删除」是 v59 时代的权宜判定，现已不成立：
    // 物理删会把标题/描述/点赞数/档位标注连同「可恢复」一起丢掉，与「下架」语义不符
    // （画师自己删作品仍是物理删——那是用户意图，语义不同，见 artist.routes.ts）。
    const artwork = artistService.getArtworkById(targetId)
    if (!artwork) return { success: false }
    // 幂等（与主页下架同口径）：已下架再点一次不重复记账，否则一笔误双击会在留痕里变成两笔处置
    if (artwork.takedown_at != null) return { success: true, already: true }
    // 下架与留痕成对写：留痕缺失的下架等于「平台做过但查不到」，事务保证不留半截账
    db.transaction(() => {
      artistService.takedownArtwork(targetId, reason ?? null)
      writeAdminAction(adminId, 'content_remove', 'artwork', targetId, reason, adminIp)
    })()
    return { success: true }
  }
  // message：复用现有管理员软删除（deleted_by_admin=1），公开端立即不可见
  // F0129: 删除与审计留痕必须同事务——否则特权处置可能删了内容却查不到账（与 artwork 分支同纪律）
  const msg = db.transaction(() => {
    const deleted = guestbookService.adminDeleteMessage(targetId)
    if (deleted) writeAdminAction(adminId, 'content_remove', 'message', targetId, reason, adminIp)
    return deleted
  })()
  if (!msg) return { success: false }
  return { success: true }
}

/**
 * 解除作品下架（v76）：清空 takedown_at / takedown_reason，行回到公开端。
 * 与 removeContent 的 artwork 分支成对，留痕 action = content_restore，target_type = artwork。
 */
export function restoreContent(
  artworkId: number,
  adminId: number,
  reason?: string | null,
  adminIp?: string | null
): { success: boolean; already?: boolean } { // F0130: 幂等命中时多带 already，调用方据此避免重复提示
  const artwork = artistService.getArtworkById(artworkId)
  if (!artwork) return { success: false }
  // F0130: 幂等守卫——已恢复（未处于下架态）再点一次不重复刷审计记录，避免一笔误双击变成两笔处置留痕
  if (artwork.takedown_at == null) return { success: true, already: true }
  db.transaction(() => {
    artistService.restoreArtwork(artworkId)
    writeAdminAction(adminId, 'content_restore', 'artwork', artworkId, reason, adminIp)
  })()
  return { success: true }
}

/**
 * 主页下架（v76，target_type=artist）：只置 artists.home_takedown_at/_reason。
 * 与封禁的分工：不 bump token_version、不动 is_banned/status —— 画师必须能登进来看到原因并整改。
 * 幂等：已是下架态直接返回 already，**不重复写留痕**（否则同一动作会在账本里长出一片重影）。
 */
export function takedownArtistHome(
  artistId: number,
  adminId: number,
  reason?: string | null,
  adminIp?: string | null
): { success: boolean; already?: boolean } {
  const artist = artistService.getArtistById(artistId)
  if (!artist) return { success: false }
  if (artist.home_takedown_at != null) return { success: true, already: true }
  db.transaction(() => {
    artistService.setHomeTakedown(artistId, reason ?? null)
    writeAdminAction(adminId, 'home_takedown', 'artist', artistId, reason, adminIp)
  })()
  return { success: true }
}

/** 解除主页下架（v76）：清空两列，不动 status / is_banned（本就 hidden 的保持 hidden）；写留痕 */
export function restoreArtistHome(
  artistId: number,
  adminId: number,
  reason?: string | null,
  adminIp?: string | null
): { success: boolean } {
  const artist = artistService.getArtistById(artistId)
  if (!artist) return { success: false }
  db.transaction(() => {
    artistService.clearHomeTakedown(artistId)
    writeAdminAction(adminId, 'home_restore', 'artist', artistId, reason, adminIp)
  })()
  return { success: true }
}

/** 封禁/解封（不动 status 三态）；封禁时递增 token_version 强制下线；写留痕 */
export function setArtistBanned(
  artistId: number,
  banned: boolean,
  adminId: number,
  reason?: string | null,
  adminIp?: string | null
): boolean {
  const artist = artistService.getArtistById(artistId)
  if (!artist) return false
  db.transaction(() => {
    db.prepare('UPDATE artists SET is_banned = ? WHERE id = ?').run(banned ? 1 : 0, artistId)
    if (banned) {
      // 封禁即踢下线：旧 token 立即失效（解封后需重新登录）
      artistService.bumpTokenVersion(artistId)
    }
    writeAdminAction(adminId, banned ? 'artist_ban' : 'artist_unban', 'artist', artistId, reason, adminIp)
  })()
  return true
}

/**
 * 写处理留痕（created_at 由表 DEFAULT 提供；adminIp = 路由层 request.ip，v75 取证）
 *
 * v86（事件流水幕布步 1）：**同事务双写** activity_events。
 *   单点接线——全部 12 类管理动作（合规域 7 类 + 账号域 5 类）都经本函数，一处覆盖所有调用点，
 *   不做散弹式逐个路由改造（散弹改造必然漏挂，d2 猎杀那轮就是先例）。
 *   两表语义分工：admin_actions = 法定账本（永久、REQ-042 §七 验收 4）；
 *   activity_events = 展示副本（分级 TTL 滚动，到期丢的只是副本）。
 *   本函数不自开事务：调用点（removeContent / resolveReport / takedownArtistHome / ...
 *   以及 admin-system.routes 的 admin_transfer 事务）都已在外层事务内，
 *   两次 INSERT 因此共享同一回滚单元 —— 要么两表都有，要么都没有，绝不留半截账。
 */
export function writeAdminAction(
  adminId: number,
  action: string,
  targetType: string,
  targetId: number,
  reason?: string | null,
  adminIp?: string | null
): void {
  const safeReason = sanitizeStoredText(reason)
  const storedReason = safeReason.trim() ? safeReason.trim().slice(0, 500) : null
  const storedIp = adminIp ? String(adminIp).slice(0, IP_COLUMN_MAX) : null
  db.prepare(`
    INSERT INTO admin_actions (admin_id, action, target_type, target_id, reason, admin_ip)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(adminId, action, targetType, targetId, storedReason, storedIp)

  // 双写流水（同事务）：action 原样沿用 admin_actions.action，便于两表按 action 对账；
  // 管理员动作一律 actor_kind='admin'（IP 原值，D2=A）。
  recordEvent({
    actorKind: 'admin',
    actorId: adminId,
    ip: adminIp,
    action,
    targetType,
    targetId,
    // reason 只进 meta（排障/追溯用），不额外出现在任何响应体
    meta: storedReason ? { reason: storedReason } : null,
    outcome: 'ok'
  })
}

/**
 * 留痕筛选 WHERE 构造（getAdminActions / countAdminActions 共用，保证列表与 total 同口径，
 * 否则截断与计数会错位——同 guestbook 强删那处「COUNT 与列表同口径过滤」的教训）
 */
function buildActionFilter(opts: AdminActionFilters): { where: string; params: Array<string | number> } {
  const clauses: string[] = []
  const params: Array<string | number> = []
  if (opts.action) {
    clauses.push('action = ?')
    params.push(opts.action)
  }
  if (opts.targetType && opts.targetId != null) {
    // 成对：精确到对象，走复合索引 idx_admin_actions_target
    clauses.push('target_type = ? AND target_id = ?')
    params.push(opts.targetType, opts.targetId)
  } else if (opts.targetType) {
    // issue #49-2：单列就是类型粗筛。成对门槛虽保住了复合索引，却把管理页筛选器变成摆设（筛了等于没筛）
    clauses.push('target_type = ?')
    params.push(opts.targetType)
  }
  if (opts.adminId != null) {
    clauses.push('admin_id = ?')
    params.push(opts.adminId)
  }
  // R-2 导出：时间范围。created_at 是 SQLite datetime('now') 的 UTC 文本，
  // from/to 是**本地日历日**，故换算成 [startUtc, endUtcExclusive) 半开窗口再字符串比较
  //（同一口径见 tools.service.getExportRows；时区换算一律走 utils/date，不在 SQL 里拼时区函数）。
  if (opts.from && opts.to) {
    const { startUtc, endUtcExclusive } = localDateRangeToUtc(opts.from, opts.to)
    clauses.push('created_at >= ? AND created_at < ?')
    params.push(startUtc, endUtcExclusive)
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

/** 留痕条数上限（管理端审计一次别灌全表） */
const ADMIN_ACTIONS_MAX_LIMIT = 500

/**
 * 查询处理留痕（管理端审计/排查用；时间倒序）
 * 向后兼容：既可按老签名 `getAdminActions(limit)` 传数字，也可传筛选对象
 */
export function getAdminActions(options: number | AdminActionFilters = {}): AdminActionRow[] {
  const opts: AdminActionFilters = typeof options === 'number' ? { limit: options } : options
  const rawLimit = Number.isFinite(opts.limit) ? (opts.limit as number) : 100
  const safeLimit = Math.min(Math.max(rawLimit, 1), ADMIN_ACTIONS_MAX_LIMIT)
  const { where, params } = buildActionFilter(opts)
  return db.prepare(
    `SELECT * FROM admin_actions ${where} ORDER BY created_at DESC, id DESC LIMIT ?`
  ).all(...params, safeLimit) as AdminActionRow[]
}

/** 留痕命中总数（同筛选口径、不受 limit 截断；查看入口的 total 用） */
export function countAdminActions(options: AdminActionFilters = {}): number {
  const { where, params } = buildActionFilter(options)
  return (db.prepare(`SELECT COUNT(*) AS c FROM admin_actions ${where}`).get(...params) as { c: number }).c
}

// ─────────────────────────────────────────────────────────────
// R-2（2026-11-28）：留痕导出与留存
// ─────────────────────────────────────────────────────────────

/**
 * 导出单批行数。
 *
 * 为什么分批：留痕表只增不删（本批才加 TTL），命中量可达数十万行。一次性 .all() 会把
 * 整个结果集按对象数组堆进内存——导出是低频操作，但一次就能把常驻内存顶上去。
 * 500 与列表接口 ADMIN_ACTIONS_MAX_LIMIT 同档：既复用既有索引/排序经验的量级，
 * 又不至于让小导出多发几次查询。
 */
export const ADMIN_ACTIONS_EXPORT_BATCH = 500

/**
 * 分批读取留痕（导出专用；按 created_at DESC, id DESC 稳定序）。
 *
 * 为什么用 keyset 而不是 LIMIT/OFFSET：导出期间管理员仍在产生新留痕，OFFSET 翻页在
 * 「前一批插入了新行」时会把同一条记录重复吐一遍（或漏一条）。keyset 以 (created_at, id)
 * 为游标向后走，插入只影响游标之前（更新）的行，已读区间不会漂移。
 *
 * @param filters 与列表接口同口径的筛选（此处 limit 被忽略，由 batchSize 控制）
 * @param cursor 上一批最后一行的 (created_at, id)；首批传 null
 * @param batchSize 单批行数
 */
export function getAdminActionsPage(
  filters: AdminActionFilters,
  cursor: { createdAt: string; id: number } | null,
  batchSize: number = ADMIN_ACTIONS_EXPORT_BATCH
): AdminActionRow[] {
  const { where, params } = buildActionFilter(filters)
  const safeBatch = Math.min(Math.max(Math.floor(batchSize) || 1, 1), ADMIN_ACTIONS_EXPORT_BATCH)
  // 游标条件是 (created_at < ?) OR (created_at = ? AND id < ?)：
  // 同一秒多条留痕靠 id 决胜，不能只比 created_at，否则整秒的行会在批次边界丢/重。
  const cursorClause = cursor ? `${where ? 'AND' : 'WHERE'} (created_at < ? OR (created_at = ? AND id < ?))` : ''
  const cursorParams = cursor ? [cursor.createdAt, cursor.createdAt, cursor.id] : []
  return db.prepare(
    `SELECT * FROM admin_actions ${where} ${cursorClause} ORDER BY created_at DESC, id DESC LIMIT ?`
  ).all(...params, ...cursorParams, safeBatch) as AdminActionRow[]
}

/**
 * 管理审计留存期（天）——**按合规口径长于业务数据，写死为常量，不做 env 可配**。
 *
 * 取值理由（1095 天 = 3 年）：
 * 1) 审计账本的作用是事后追责，窗口必须覆盖「纠纷发现 → 举证」的完整周期。业务数据
 *    （参考图/过程稿）窗口是 3 天，埋点是 180 天；管理动作是"谁在什么时候对谁做了什么"，
 *    一旦删掉就没有第二个来源可还原（admin_actions 是全站唯一的处置记录）。
 * 2) 3 年对齐常见的审计留档口径（一般商业/民事纠纷的追诉时效普遍 ≥3 年），
 *    既覆盖可预见的追溯需求，又不至于让单表无限膨胀（实测写入频率为人工操作级，
 *    3 年量级在万行以内，SQLite 单表无压力）。
 * 3) **刻意不开 env**：TTL 配错在这张表上是不可逆的数据丢失（删掉的历史留痕无法重建）。
 *    运维为"清理磁盘"把窗口从 3 年改成 3 天，事后无法察觉也无法回滚——所以取值权收归代码，
 *    要改必须走代码评审。对照：REFERENCE_UPLOAD_TTL_DAYS 等可配项删的是可再生的中间产物。
 */
export const ADMIN_ACTIONS_TTL_DAYS = 1095

/**
 * 按留存期清理留痕（挂 app.ts 的 gcDatabaseTtl，与其它 TTL 同窗口跑）。
 *
 * @param now 可注入的当前时间（测试用；不传取真实时间）
 * @returns 删除行数
 */
export function pruneAdminActions(now: Date = new Date()): number {
  // 与 events/anon_tokens 同款 SQLite datetime 文本比较：把截止时刻先在 JS 里算成同格式的
  // UTC 字符串再比，而不是在 SQL 里写 datetime('now', ?)——后者无法注入时间，测试只能靠等待。
  // 格式对齐 datetime('now') 的输出：'YYYY-MM-DD HH:MM:SS'（UTC，无毫秒无 Z）。
  const cutoff = new Date(now.getTime() - ADMIN_ACTIONS_TTL_DAYS * 24 * 60 * 60 * 1000)
  const cutoffText = toSqliteUtcText(cutoff)
  return db.prepare('DELETE FROM admin_actions WHERE created_at < ?').run(cutoffText).changes
}

/** Date → SQLite datetime 文本（UTC，'YYYY-MM-DD HH:MM:SS'），与 datetime('now') 同形可直接字符串比较 */
function toSqliteUtcText(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}