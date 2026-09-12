import db from '../../db/connection.js'
import { localMonthStartSqlite } from '../../utils/date.js'
import type { Artist } from '../../types/entities.js'

// ============================================
// 画师服务 - SPEC-004 名额与缓冲系统、S5 月度额度池
// （从 artist.service.ts 拆出，F-09 巨型文件清偿；纯搬移，逻辑零变更）
// ============================================

/**
 * 获取画师正式区/缓冲区在途订单数
 */
export function getZoneCounts(artistId: number): { formal: number; buffer: number } {
  const formal = (db.prepare(`
    SELECT COUNT(*) as c FROM orders
    WHERE artist_id = ? AND queue_zone = 'formal' AND status NOT IN ('delivered', 'cancelled')
  `).get(artistId) as { c: number }).c
  const buffer = (db.prepare(`
    SELECT COUNT(*) as c FROM orders
    WHERE artist_id = ? AND queue_zone = 'buffer' AND status NOT IN ('delivered', 'cancelled')
  `).get(artistId) as { c: number }).c
  return { formal, buffer }
}

/**
 * S5: 获取画师本月已用额度（本月创建的未取消订单数）
 * @returns {{ used: number, quota: number|null, remaining: number|null }}
 */
export function getMonthlyUsage(artistId: number, monthlyQuota: number | null): { used: number; quota: number | null; remaining: number | null } {
  if (monthlyQuota == null) return { used: 0, quota: null, remaining: null }
  // #16 修复：用本地时区月初（复用 date.ts 的 localMonthStartSqlite），避免 UTC+8 月初 08:00 才重置
  const monthStart = localMonthStartSqlite()
  const used = (db.prepare(`
    SELECT COUNT(*) as c FROM orders
    WHERE artist_id = ? AND status != 'cancelled' AND created_at >= ?
  `).get(artistId, monthStart) as { c: number }).c
  return { used, quota: monthlyQuota, remaining: Math.max(0, monthlyQuota - used) }
}

/**
 * 计算客户主页名额显示文案（SPEC-004 §3 + S5 额度池）
 * batch_limit=NULL 且 monthly_quota=NULL → null（不启用名额/额度系统）
 */
export function computeSlotDisplay(artist: Artist): string | null {
  const hasBatchLimit = artist.batch_limit != null
  const hasQuota = artist.monthly_quota != null
  if (!hasBatchLimit && !hasQuota) return null

  if (artist.status === 'break') return '休息中'
  if (artist.status === 'hidden') return null

  if (artist.status === 'full') {
    const { formal } = getZoneCounts(artist.id)
    return formal > 0 ? '已接满' : '暂停接单'
  }

  // S5: 月度额度检查（优先于名额——额度耗尽即约满，无论名额剩余）
  const quota = hasQuota ? getMonthlyUsage(artist.id, artist.monthly_quota) : null
  // P1 strictNullChecks: hasQuota=true 时 monthly_quota 必非 null，getMonthlyUsage 返回 remaining 必非 null（断言仅类型层，不改变运行时）
  if (quota && quota.remaining! <= 0) return '本月已约满'

  // status = open
  if (hasBatchLimit) {
    // P1 strictNullChecks: hasBatchLimit=true 即 batch_limit != null（断言仅类型层）
    const N = artist.batch_limit!
    const M = artist.buffer_limit ?? 0
    const { formal, buffer } = getZoneCounts(artist.id)
    if (formal < N) {
      const remaining = N - formal
      return `开放中 · 剩 ${remaining} 席`
    }
    if (buffer < M) return '可候补'
    return '已接满'
  }

  // 仅额度池（无名额限制）——走到此处说明 hasQuota=true，quota 必非 null（断言仅类型层）
  return `开放中 · 本月剩 ${quota!.remaining} 单`
}
