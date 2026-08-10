import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'

// ============================================
// 折扣码服务 - CRUD + 验证 + 应用（v0.31 F3）
// 决策：全局码（v0.32 多画风后再扩展）；先倍率后折扣（REQ-023 已定）
// ============================================

/** 折扣码行 */
export interface DiscountCode {
  id: number
  artist_id: number
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  max_uses: number | null
  used_count: number
  expires_at: string | null
  enabled: number
  created_at: string
}

// ─── 画师端 CRUD ───

/** 获取画师的折扣码列表 */
export function getDiscountCodes(artistId: number): DiscountCode[] {
  return db.prepare(
    'SELECT * FROM discount_codes WHERE artist_id = ? ORDER BY created_at DESC'
  ).all(artistId) as DiscountCode[]
}

interface CreateDiscountCodeInput {
  code: string
  discountType?: 'percent' | 'fixed'
  discountValue: number
  maxUses?: number | null
  expiresAt?: string | null
}

/** 创建折扣码 */
export function createDiscountCode(artistId: number, { code, discountType, discountValue, maxUses, expiresAt }: CreateDiscountCodeInput): DiscountCode {
  const trimmed = code.trim().toUpperCase()
  if (!trimmed || trimmed.length < 2 || trimmed.length > 20) {
    throw new AppError(E.VALIDATION, 400, { field: 'code', message: '折扣码长度 2-20 字符' })
  }
  if (!/^[A-Z0-9]+$/.test(trimmed)) {
    throw new AppError(E.VALIDATION, 400, { field: 'code', message: '折扣码仅限大写字母和数字' })
  }

  const type = discountType || 'percent'
  if (type === 'percent' && (discountValue <= 0 || discountValue > 100)) {
    throw new AppError(E.VALIDATION, 400, { field: 'discountValue', message: '百分比折扣范围 1-100' })
  }
  if (type === 'fixed' && discountValue <= 0) {
    throw new AppError(E.VALIDATION, 400, { field: 'discountValue', message: '固定金额须大于 0' })
  }

  // audit-a P2-4: 服务层兜底校验——路由 schema 之外的调用方（直连/内部脚本）也必须拒绝非法日期，
  // 否则非法 expires_at 会让过期检查 NaN 恒 false（永不过期）
  assertValidExpiresAt(expiresAt)

  // 唯一性校验（同画师下码不重复）
  const existing = db.prepare(
    'SELECT id FROM discount_codes WHERE artist_id = ? AND code = ?'
  ).get(artistId, trimmed)
  if (existing) throw new AppError(E.DISCOUNT_CODE_TAKEN)

  const result = db.prepare(`
    INSERT INTO discount_codes (artist_id, code, discount_type, discount_value, max_uses, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(artistId, trimmed, type, discountValue, maxUses ?? null, expiresAt ?? null)

  return db.prepare('SELECT * FROM discount_codes WHERE id = ?').get(Number(result.lastInsertRowid)) as DiscountCode
}

interface UpdateDiscountCodeFields {
  discountValue?: number
  maxUses?: number | null
  expiresAt?: string | null
  enabled?: boolean
}

/** 更新折扣码（码本身不可改，需删了重建） */
export function updateDiscountCode(artistId: number, codeId: number, fields: UpdateDiscountCodeFields): DiscountCode {
  const code = db.prepare(
    'SELECT * FROM discount_codes WHERE id = ? AND artist_id = ?'
  ).get(codeId, artistId) as DiscountCode | undefined
  if (!code) throw new AppError(E.DISCOUNT_CODE_NOT_FOUND, 404)

  if (fields.discountValue !== undefined) {
    if (code.discount_type === 'percent' && (fields.discountValue <= 0 || fields.discountValue > 100)) {
      throw new AppError(E.VALIDATION, 400, { field: 'discountValue' })
    }
    if (code.discount_type === 'fixed' && fields.discountValue <= 0) {
      throw new AppError(E.VALIDATION, 400, { field: 'discountValue' })
    }
    db.prepare('UPDATE discount_codes SET discount_value = ? WHERE id = ?').run(fields.discountValue, codeId)
  }
  if (fields.maxUses !== undefined) {
    db.prepare('UPDATE discount_codes SET max_uses = ? WHERE id = ?').run(fields.maxUses, codeId)
  }
  if (fields.expiresAt !== undefined) {
    // audit-a P2-4: 更新入口同样兜底校验（与 create 对称）
    assertValidExpiresAt(fields.expiresAt)
    db.prepare('UPDATE discount_codes SET expires_at = ? WHERE id = ?').run(fields.expiresAt, codeId)
  }
  if (fields.enabled !== undefined) {
    db.prepare('UPDATE discount_codes SET enabled = ? WHERE id = ?').run(fields.enabled ? 1 : 0, codeId)
  }

  return db.prepare('SELECT * FROM discount_codes WHERE id = ?').get(codeId) as DiscountCode
}

/** 删除折扣码 */
export function deleteDiscountCode(artistId: number, codeId: number): { deleted: boolean } {
  const code = db.prepare(
    'SELECT * FROM discount_codes WHERE id = ? AND artist_id = ?'
  ).get(codeId, artistId) as DiscountCode | undefined
  if (!code) throw new AppError(E.DISCOUNT_CODE_NOT_FOUND, 404)
  db.prepare('DELETE FROM discount_codes WHERE id = ?').run(codeId)
  return { deleted: true }
}

// ─── 客户端验证 + 应用 ───

/**
 * 验证折扣码有效性（客户端下单时调用）
 * 返回折扣码行（有效）或抛错（无效）
 */
export function validateDiscountCode(artistId: number, codeStr: string): DiscountCode {
  const artist = db.prepare('SELECT discount_enabled FROM artists WHERE id = ?').get(artistId) as { discount_enabled: number } | undefined
  if (!artist?.discount_enabled) throw new AppError(E.DISCOUNT_DISABLED)

  const code = db.prepare(
    'SELECT * FROM discount_codes WHERE artist_id = ? AND code = ? AND enabled = 1'
  ).get(artistId, codeStr.trim().toUpperCase()) as DiscountCode | undefined
  if (!code) throw new AppError(E.DISCOUNT_CODE_INVALID)

  // 过期检查（audit-a P2-4 fail-closed）：存量脏数据 expires_at 不可解析时按已过期处理，
  // 杜绝「非法日期 NaN 恒 false」导致永不过期
  if (code.expires_at && (isNaN(new Date(code.expires_at).getTime()) || new Date(code.expires_at) < new Date())) {
    throw new AppError(E.DISCOUNT_CODE_EXPIRED)
  }

  // 次数检查
  if (code.max_uses != null && code.used_count >= code.max_uses) {
    throw new AppError(E.DISCOUNT_CODE_EXHAUSTED)
  }

  return code
}

/** audit-a P2-4: expiresAt 写入口校验——非 null 且不可解析即拒绝（YYYY-MM-DD 或 ISO 8601） */
function assertValidExpiresAt(expiresAt: string | null | undefined): void {
  if (expiresAt == null) return
  if (isNaN(new Date(expiresAt).getTime())) {
    throw new AppError(E.VALIDATION, 400, { field: 'expiresAt', message: '过期时间格式无效（须为 YYYY-MM-DD 或 ISO 8601）' })
  }
}

/**
 * 计算折扣金额（分）
 * 先倍率后折扣（REQ-023 已定）：折扣基于倍率后的总价
 * percent: 总价 × (discountValue / 100)，向下取整
 * fixed: discountValue 元 → 分，不超过总价
 */
export function computeDiscountCents(code: DiscountCode, totalPriceCents: number): number {
  if (code.discount_type === 'percent') {
    return Math.floor(totalPriceCents * code.discount_value / 100)
  }
  // fixed: 元 → 分
  const fixedCents = Math.round(code.discount_value * 100)
  return Math.min(fixedCents, totalPriceCents)
}

/** 递增使用次数（下单成功后调用） */
export function incrementUsage(codeId: number): void {
  db.prepare('UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?').run(codeId)
}

// ─── 画师偏好：折扣开关 ───

/** 获取折扣开关状态 */
export function getDiscountEnabled(artistId: number): boolean {
  const row = db.prepare('SELECT discount_enabled FROM artists WHERE id = ?').get(artistId) as { discount_enabled: number } | undefined
  return !!row?.discount_enabled
}

/** 设置折扣开关 */
export function setDiscountEnabled(artistId: number, enabled: boolean): void {
  db.prepare('UPDATE artists SET discount_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, artistId)
}
