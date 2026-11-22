import db from '../../db/connection.js'
import { sanitizeStoredHtml } from '../../shared/sanitize.js'
import { isValidLocalDateString } from '../../utils/date.js' // F0121: 公告过期判定复用历法校验，避免 UTC/本地混比
import type { Artist } from '../../types/entities.js'

// ============================================
// 画师服务 - 须知、外链、灵感标签、小公告（主页设置读取侧）
// （从 artist.service.ts 拆出，F-09 巨型文件清偿；纯搬移，逻辑零变更）
// ============================================

/** 约稿须知（entities.ts 未定义，内联） */
interface CommissionRule {
  artist_id: number
  content: string
  updated_at: string
}

// ============================================
// 约稿须知
// ============================================

export function getRules(artistId: number): CommissionRule | undefined {
  return db.prepare('SELECT * FROM commission_rules WHERE artist_id = ?').get(artistId) as CommissionRule | undefined
}

export function updateRules(artistId: number, content: string): CommissionRule | undefined {
  // F-5（P3-18）: 须知入库前清洗——唯一走 v-html/SanitizedRichText 的富文本字段，
  // 走白名单重建（sanitizeStoredHtml，镜像前端渲染层口径，纵深防御）
  const safeContent = sanitizeStoredHtml(content)
  db.prepare('UPDATE commission_rules SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE artist_id = ?')
    .run(safeContent, artistId)
  return getRules(artistId)
}

// ============================================
// REQ-022 F2: 外链列表（custom_links，单一结构 [{platformId, url}]）
// ============================================

/**
 * 读取画师外链列表（后端拼好，前端无脑读）
 * REQ-022 F2: 只读 custom_links 列（旧列 weibo_url/bilibili_url 回退已删除——
 * 上线前无真实数据，不做迁移；列本身保留在 DB，只写路径与读路径全部移除）
 */
export function getCustomLinks(artist: Artist): Array<Record<string, unknown>> {
  if (artist.custom_links == null) return []
  try {
    const parsed = JSON.parse(artist.custom_links)
    if (!Array.isArray(parsed)) return []
    return parsed.map((link: Record<string, unknown>) => ({
      platformId: typeof link?.platformId === 'number' ? link.platformId : null,
      url: String(link?.url || '')
    })).filter(link => link.url)
  } catch {
    return []
  }
}

// ============================================
// 灵感标签（inspiration_tags）
// ============================================

/**
 * 读取画师自定义灵感标签
 * @param {object} artist - 画师行
 * @returns {string[]}
 */
export function getInspirationTags(artist: Artist): string[] {
  if (!artist.inspiration_tags) return []
  try {
    const parsed = JSON.parse(artist.inspiration_tags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ============================================
// F3: 小公告
// ============================================

/**
 * 读取画师公告（过期则返回 null）
 * @param {object} artist - 画师行
 * @returns {{ text: string, expiresAt: string|null }|null}
 */
export function getAnnouncement(artist: Artist): { text: string; expiresAt: string | null } | null {
  if (!artist.announcement) return null
  if (artist.announcement_expires_at) {
    // F0121: 原 `new Date(YYYY-MM-DD)` 按 UTC 解析，与本地零点 todayStart 混比在 UTC+x 时区差一天；
    // 非法日期串 new Date('garbage')→Invalid Date 比较恒 false 导致永不过期。统一走本地零点 + 历法校验。
    const dateStr = artist.announcement_expires_at.slice(0, 10)
    if (!isValidLocalDateString(dateStr)) return null // 非法日期按已过期处理，不留黑洞
    const [y, m, d] = dateStr.split('-').map(Number)
    const expires = new Date(y, m - 1, d) // 本地零点
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    if (expires.getTime() < todayStart.getTime()) return null
  }
  return {
    text: artist.announcement,
    expiresAt: artist.announcement_expires_at || null
  }
}
