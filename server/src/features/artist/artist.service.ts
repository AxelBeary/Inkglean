import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { isValidArtistCode } from '../../shared/validate.js'
import { identifyPlatform, KNOWN_PLATFORMS, parsePlatformUrls } from '../../utils/platform.js'
import { localMonthStartSqlite } from '../../utils/date.js'
import type { Artist, Tier } from '../../types/entities.js'
import sharp from 'sharp'
import { resolve, join } from 'path'

// ============================================
// 画师服务
// ============================================

/** 作品（entities.ts 未定义，内联） */
interface Artwork {
  id: number
  artist_id: number
  image_path: string
  title: string | null
  sort_order: number
  like_count: number
  is_cover: number
  width: number | null
  height: number | null
}

/** 约稿须知（entities.ts 未定义，内联） */
interface CommissionRule {
  artist_id: number
  content: string
  updated_at: string
}

export function getArtistBySubdomain(subdomain: string): Artist | undefined {
  return db.prepare('SELECT * FROM artists WHERE subdomain = ? AND deleted_at IS NULL').get(subdomain) as Artist | undefined
}

export function getArtistByQq(qqNumber: string): Artist | undefined {
  return db.prepare('SELECT * FROM artists WHERE qq_number = ? AND deleted_at IS NULL').get(qqNumber) as Artist | undefined
}

export function getArtistById(id: number): Artist | undefined {
  // 不过滤 deleted_at — 认证中间件需要找到已删除画师以拒绝其 token
  return db.prepare('SELECT * FROM artists WHERE id = ?').get(id) as Artist | undefined
}

export function getAllArtists(): Artist[] {
  return db.prepare('SELECT * FROM artists WHERE deleted_at IS NULL ORDER BY created_at ASC').all() as Artist[]
}

export async function createArtist({ qqNumber, name, subdomain, bio, artistCode }: {
  qqNumber: string
  name: string
  subdomain: string
  bio?: string | null
  artistCode?: string | null
}): Promise<Artist | undefined> {
  // 校验子域名格式
  if (!/^[a-z0-9-]{2,20}$/.test(subdomain)) {
    throw new AppError(E.SUBDOMAIN_FORMAT)
  }

  // 身份码：默认用子域名大写，可自定义
  const code = (artistCode || subdomain.toUpperCase()).toUpperCase()
  if (!isValidArtistCode(code)) {
    throw new AppError(E.CODE_FORMAT)
  }

  // 检查身份码唯一性
  const existing = db.prepare('SELECT id FROM artists WHERE artist_code = ?').get(code) as { id: number } | undefined
  if (existing) {
    throw new AppError(E.CODE_TAKEN, 400, { code })
  }

  // P1-6: 检查 qq_number 和 subdomain 唯一性（避免 UNIQUE 约束 500）
  const existingQq = db.prepare('SELECT id FROM artists WHERE qq_number = ?').get(qqNumber) as { id: number } | undefined
  if (existingQq) {
    throw new AppError(E.QQ_TAKEN, 400, { qqNumber })
  }
  const existingSub = db.prepare('SELECT id FROM artists WHERE subdomain = ?').get(subdomain) as { id: number } | undefined
  if (existingSub) {
    throw new AppError(E.SUBDOMAIN_TAKEN, 400, { subdomain })
  }

  const result = db.prepare(`
    INSERT INTO artists (qq_number, name, subdomain, artist_code, bio)
    VALUES (?, ?, ?, ?, ?)
  `).run(qqNumber, name, subdomain, code, bio || null)

  // 初始化空的约稿须知
  db.prepare('INSERT INTO commission_rules (artist_id, content) VALUES (?, ?)')
    .run(result.lastInsertRowid, '')

  // 初始化流程与比例（从默认模板复制）
  const { seedArtistStages } = await import('./workflow.service.js')
  seedArtistStages(Number(result.lastInsertRowid))

  return getArtistById(Number(result.lastInsertRowid))
}

export function updateArtist(id: number, fields: Record<string, unknown>): Artist | undefined {
  // R15: 旧列 weibo_url/bilibili_url 冻结只读，新写入全走 custom_links
  const allowed = ['name', 'avatar', 'bio', 'status', 'custom_links', 'notify_enabled', 'artist_code', 'contact_qq', 'template_id', 'palette_id', 'revision_note', 'dashboard_default_panel', 'accent_color', 'order_template_id', 'platform_urls', 'inspiration_tags', 'batch_limit', 'buffer_limit', 'auto_promote', 'hide_queue_position', 'hide_promote_notify', 'buffer_short_form', 'announcement', 'announcement_expires_at', 'monthly_quota', 'quick_actions']
  const updates: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      // 身份码需要额外校验
      if (key === 'artist_code') {
        const code = String(value || '').toUpperCase().trim()
        // 输入校验：空值跳过（允许只改昵称不动身份码）
        if (!code) continue
        if (!isValidArtistCode(code)) {
          throw new AppError(E.CODE_FORMAT)
        }
        const existing = db.prepare('SELECT id FROM artists WHERE artist_code = ? AND id != ?').get(code, id) as { id: number } | undefined
        if (existing) {
          throw new AppError(E.CODE_TAKEN, 400, { code })
        }
        updates.push('artist_code = ?')
        values.push(code)
      } else if (key === 'status') {
        // P1-D: 白名单校验 — 非法值提前拒绝，避免 SQLite CHECK 抛原始错误
        if (!['open', 'full', 'break', 'hidden'].includes(String(value))) {
          throw new AppError(E.INVALID_STATUS)
        }
        updates.push('status = ?')
        values.push(value)
      } else if (key === 'notify_enabled') {
        // P1-D: 强制转整数，防止字符串被 SQLite 类型亲和性吞掉
        updates.push('notify_enabled = ?')
        values.push(value ? 1 : 0)
      } else if (key === 'custom_links') {
        // R15: 外链列表 — JSON 数组存储，service 层做业务校验（数量 ≤6 + url 协议）
        const links = Array.isArray(value) ? value : []
        if (links.length > 6) {
          throw new AppError(E.LINKS_TOO_MANY)
        }
        for (const link of links) {
          if (link.url && !/^https?:\/\//i.test(String(link.url))) {
            throw new AppError(E.LINK_URL_INVALID)
          }
        }
        updates.push('custom_links = ?')
        values.push(JSON.stringify(links))
      } else if (key === 'palette_id') {
        // 配色白名单校验 — 非法值回退到默认，避免脏数据
        const palette = String(value || 'paper')
        updates.push('palette_id = ?')
        values.push(['paper', 'ink', 'dusk', 'moss'].includes(palette) ? palette : 'paper')
      } else if (key === 'accent_color') {
        // R49: 强调色白名单校验 — 仅允许 5 色预设 + null（清除）
        // 色值来源：web/src/styles/theme.css data-accent 1-5 的 --color-primary
        const ACCENT_COLORS = ['#34dbcb', '#34c2db', '#3498db', '#346edb', '#3445db']
        if (value !== null && !ACCENT_COLORS.includes(String(value).toLowerCase())) {
          throw new AppError(E.INVALID_ACCENT_COLOR, 400, { value })
        }
        updates.push('accent_color = ?')
        values.push(value ? String(value).toLowerCase() : null)
      } else if (key === 'order_template_id') {
        // R58-7: 下单页模板白名单校验 — 当前仅 'default'，后续扩展时在此数组追加
        const ORDER_TEMPLATES = ['default']
        const tpl = String(value || 'default')
        if (!ORDER_TEMPLATES.includes(tpl)) {
          throw new AppError(E.INVALID_ORDER_TEMPLATE, 400, { value: tpl })
        }
        updates.push('order_template_id = ?')
        values.push(tpl)
      } else if (key === 'platform_urls') {
        // R58-8: 平台链接 — JSON 数组 [{url, platform?}]，service 层做业务校验
        const links = Array.isArray(value) ? value : []
        if (links.length > 10) {
          throw new AppError(E.PLATFORM_URLS_TOO_MANY)
        }
        const normalized: Array<{ url: string; platform: string }> = []
        for (const link of links) {
          const url = String(link.url || '').trim()
          if (!url) continue
          if (!/^https?:\/\//i.test(url)) {
            throw new AppError(E.PLATFORM_URL_INVALID)
          }
          // 自动识别 + 手动选择后备：有合法 platform 用手动值，否则自动识别
          const platform = (link.platform && KNOWN_PLATFORMS.includes(link.platform))
            ? link.platform
            : identifyPlatform(url)
          normalized.push({ url, platform })
        }
        updates.push('platform_urls = ?')
        values.push(JSON.stringify(normalized))
      } else if (key === 'inspiration_tags') {
        // 灵感标签自定义 — JSON 字符串数组，去重 + 去空 + 截断
        const tags = Array.isArray(value) ? value : []
        if (tags.length > 20) {
          throw new AppError(E.TAGS_TOO_MANY)
        }
        const cleaned = [...new Set(tags.map((t: unknown) => String(t).trim()).filter(Boolean))].slice(0, 20)
        updates.push('inspiration_tags = ?')
        values.push(JSON.stringify(cleaned))
      } else if (key === 'batch_limit') {
        // SPEC-004: 正式位 N — null=不限制，0=申请制，>0=限额
        if (value !== null && (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 999)) {
          throw new AppError(E.INVALID_BATCH_LIMIT, 400, { value })
        }
        updates.push('batch_limit = ?')
        values.push(value === null ? null : value)
      } else if (key === 'buffer_limit') {
        // SPEC-004: 缓冲位 M — 0~999
        const bl = Number.isInteger(value) ? (value as number) : 0
        if (bl < 0 || bl > 999) {
          throw new AppError(E.INVALID_BATCH_LIMIT, 400, { value })
        }
        updates.push('buffer_limit = ?')
        values.push(bl)
      } else if (key === 'quick_actions') {
        // v0.25 C: 快捷按钮 — JSON 字符串数组存储（null=清除）
        if (value === null) {
          updates.push('quick_actions = ?')
          values.push(null)
        } else {
          // 兼容两种输入：数组（路由层）或 JSON 字符串（旧调用方）
          let arr = value
          if (typeof arr === 'string') { try { arr = JSON.parse(arr) } catch { arr = [] } }
          const keys = Array.isArray(arr) ? arr.map((k: unknown) => typeof k === 'string' ? k.trim() : JSON.stringify(k)).filter(Boolean).slice(0, 9) : []
          updates.push('quick_actions = ?')
          values.push(JSON.stringify(keys))
        }
      } else if (['auto_promote', 'hide_queue_position', 'hide_promote_notify', 'buffer_short_form'].includes(key)) {
        // SPEC-004: 布尔开关 — 强制转整数
        updates.push(`${key} = ?`)
        values.push(value ? 1 : 0)
      } else if (key === 'avatar') {
        // M-1 修复：头像路径校验 — 必须在 images/ 目录下，拒绝路径穿越
        if (value && (String(value).includes('..') || !String(value).startsWith('images/'))) {
          throw new AppError(E.ILLEGAL_PATH)
        }
        updates.push('avatar = ?')
        values.push(value)
      } else if (key === 'announcement_expires_at') {
        // #36: 公告过期日不得早于今天（否则公告立即不可见，等于"倒设"）
        if (value !== null && value !== '') {
          const d = new Date(String(value))
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          if (isNaN(d.getTime()) || d.getTime() < today.getTime()) {
            throw new AppError(E.INVALID_ANNOUNCEMENT_DATE, 400, { value })
          }
        }
        updates.push('announcement_expires_at = ?')
        values.push(value || null)
      } else {
        // 输入校验：name 空值保护
        if (key === 'name' && !String(value || '').trim()) {
          throw new AppError(E.NAME_EMPTY)
        }
        updates.push(`${key} = ?`)
        values.push(value)
      }
    }
  }

  if (updates.length === 0) return getArtistById(id)

  values.push(id)
  db.prepare(`UPDATE artists SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  return getArtistById(id)
}

export function deleteArtist(id: number): void {
  // 软删除：标记 deleted_at，保留历史数据可恢复
  // 安全：同时递增 token_version，使已删除画师的所有现有 token 立即失效
  db.prepare(
    'UPDATE artists SET deleted_at = CURRENT_TIMESTAMP, token_version = COALESCE(token_version, 1) + 1 WHERE id = ?'
  ).run(id)
}

/**
 * 递增 token_version，使该画师所有已签发的 token 失效
 * 用于：登出、权限变更、管理员强制下线
 */
export function bumpTokenVersion(artistId: number): void {
  db.prepare(
    'UPDATE artists SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?'
  ).run(artistId)
}

// ============================================
// 价格档位
// ============================================

export function getTiers(artistId: number): Tier[] {
  return db.prepare('SELECT * FROM price_tiers WHERE artist_id = ? ORDER BY sort_order ASC').all(artistId) as Tier[]
}

export function getTierById(tierId: number): Tier | undefined {
  return db.prepare('SELECT * FROM price_tiers WHERE id = ?').get(tierId) as Tier | undefined
}

export function createTier(artistId: number, fields: Record<string, unknown>): Tier | undefined {
  // H-4 修复：同时接受 camelCase 和 snake_case（对齐 updateTier 的 keyMap 策略）
  const name = fields.name
  const price = fields.price
  const description = fields.description
  const exampleImage = fields.exampleImage ?? fields.example_image
  const workDays = fields.workDays ?? fields.work_days
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM price_tiers WHERE artist_id = ?').get(artistId) as { m: number | null } | undefined
  const sortOrder = (maxOrder?.m ?? 0) + 1

  const result = db.prepare(`
    INSERT INTO price_tiers (artist_id, name, price, description, example_image, work_days, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(artistId, name, price, description || null, exampleImage || null, workDays || null, sortOrder)

  return db.prepare('SELECT * FROM price_tiers WHERE id = ?').get(Number(result.lastInsertRowid)) as Tier | undefined
}

export function updateTier(tierId: number, fields: Record<string, unknown>): Tier | undefined | null {
  // 同时接受 camelCase 和 snake_case（前端统一用 camelCase）
  const keyMap: Record<string, string> = { workDays: 'work_days', exampleImage: 'example_image' }
  const allowed = ['name', 'price', 'description', 'example_image', 'work_days', 'sort_order', 'visibility']
  const updates: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(fields)) {
    const dbKey = keyMap[key] || key
    if (allowed.includes(dbKey)) {
      updates.push(`${dbKey} = ?`)
      values.push(value)
    }
  }

  if (updates.length === 0) return null
  values.push(tierId)
  db.prepare(`UPDATE price_tiers SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  return db.prepare('SELECT * FROM price_tiers WHERE id = ?').get(tierId) as Tier | undefined
}

export function deleteTier(tierId: number): void {
  db.prepare('DELETE FROM price_tiers WHERE id = ?').run(tierId)
}

/**
 * v0.26 A: 档位拖拽排序（事务内逐个 UPDATE sort_order）
 * ids 按目标顺序排列，所有 id 必须属于该画师
 */
export function reorderTiers(artistId: number, ids: number[]): Tier[] {
  return db.transaction(() => {
    const existing = getTiers(artistId)
    const existingIds = new Set(existing.map(t => t.id))
    // 校验：长度一致 + 全部归属
    if (ids.length !== existing.length) throw new AppError(E.REORDER_LENGTH)
    for (const id of ids) {
      if (!existingIds.has(id)) throw new AppError(E.REORDER_INVALID)
    }
    if (new Set(ids).size !== ids.length) throw new AppError(E.REORDER_DUPLICATE)
    // 逐个写入 sort_order
    ids.forEach((id, i) => {
      db.prepare('UPDATE price_tiers SET sort_order = ? WHERE id = ? AND artist_id = ?')
        .run(i + 1, id, artistId)
    })
    return getTiers(artistId)
  })()
}

// ============================================
// 作品
// ============================================

export function getArtworks(artistId: number): Artwork[] {
  // v0.25 #5: 封面排第一，其余按 sort_order 排序（无封面时行为不变）
  // v0.31: 封面内部按 cover_order 排序（多封面轮播顺序）
  return db.prepare('SELECT * FROM artworks WHERE artist_id = ? ORDER BY is_cover DESC, cover_order ASC, sort_order ASC').all(artistId) as Artwork[]
}

export function getArtworkById(artworkId: number): Artwork | undefined {
  return db.prepare('SELECT * FROM artworks WHERE id = ?').get(artworkId) as Artwork | undefined
}

export async function createArtwork(artistId: number, { imagePath, title }: { imagePath: string; title?: string | null }): Promise<Artwork | undefined> {
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM artworks WHERE artist_id = ?').get(artistId) as { m: number | null } | undefined
  const sortOrder = (maxOrder?.m ?? 0) + 1

  // #15: sharp 读取图片宽高（瀑布流零跳动——前端需预知比例）
  let width: number | null = null
  let height: number | null = null
  try {
    const uploadDir = resolve(process.env.UPLOAD_DIR || './uploads')
    const absPath = join(uploadDir, imagePath)
    const meta = await sharp(absPath).metadata()
    if (meta.width && meta.height) {
      width = meta.width
      height = meta.height
    }
  } catch { /* 读取失败不阻塞创建，width/height 留 null */ }

  const result = db.prepare('INSERT INTO artworks (artist_id, image_path, title, sort_order, width, height) VALUES (?, ?, ?, ?, ?, ?)')
    .run(artistId, imagePath, title || null, sortOrder, width, height)

  return db.prepare('SELECT * FROM artworks WHERE id = ?').get(Number(result.lastInsertRowid)) as Artwork | undefined
}

export function deleteArtwork(artworkId: number): void {
  db.prepare('DELETE FROM artworks WHERE id = ?').run(artworkId)
}

// ============================================
// v0.25 #5: 封面图
// ============================================

/**
 * 设为封面（多张共存，用户原声 REQ-013 #5："多张来回滚动"）
 * 不取消其他封面——画师可设多张，客户端自动轮播
 * v0.31: 自动分配 cover_order（追加到末尾）
 */
export function setCover(artistId: number, artworkId: number): Artwork | undefined {
  const maxOrder = db.prepare(
    'SELECT MAX(cover_order) as m FROM artworks WHERE artist_id = ? AND is_cover = 1'
  ).get(artistId) as { m: number | null } | undefined
  const nextOrder = (maxOrder?.m ?? 0) + 1
  db.prepare('UPDATE artworks SET is_cover = 1, cover_order = ? WHERE id = ? AND artist_id = ?').run(nextOrder, artworkId, artistId)
  return getArtworkById(artworkId)
}

/** 取消封面（v0.31: 同时重置 cover_order） */
export function clearCover(artistId: number, artworkId: number): Artwork | undefined {
  db.prepare('UPDATE artworks SET is_cover = 0, cover_order = 0 WHERE id = ? AND artist_id = ?').run(artworkId, artistId)
  return getArtworkById(artworkId)
}

/**
 * v0.31: 封面排序（接收完整有序 ID 数组，仅含 is_cover=1 的作品）
 * 校验：所有 ID 必须属于该画师且为封面
 */
export function reorderCovers(artistId: number, orderedIds: number[]): Artwork[] {
  db.transaction(() => {
    orderedIds.forEach((id, index) => {
      const art = db.prepare('SELECT * FROM artworks WHERE id = ? AND artist_id = ? AND is_cover = 1').get(id, artistId)
      if (!art) throw new AppError(E.NOT_FOUND, 404, { id })
      db.prepare('UPDATE artworks SET cover_order = ? WHERE id = ?').run(index + 1, id)
    })
  })()
  return getArtworks(artistId)
}

// ============================================
// 约稿须知
// ============================================

export function getRules(artistId: number): CommissionRule | undefined {
  return db.prepare('SELECT * FROM commission_rules WHERE artist_id = ?').get(artistId) as CommissionRule | undefined
}

export function updateRules(artistId: number, content: string): CommissionRule | undefined {
  db.prepare('UPDATE commission_rules SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE artist_id = ?')
    .run(content, artistId)
  return getRules(artistId)
}

// ============================================
// R15: 外链列表（custom_links）
// ============================================

/**
 * 读取画师外链列表（后端拼好，前端无脑读）
 * 优先读 custom_links 列；为 NULL 时回退旧列 weibo_url/bilibili_url
 * custom_links 已设置（哪怕空数组）→ 以新列为准，不回退
 */
export function getCustomLinks(artist: Artist): Array<Record<string, unknown>> {
  if (artist.custom_links != null) {
    try {
      const parsed = JSON.parse(artist.custom_links)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  // 回退旧列（老画师 custom_links=NULL 场景）
  const links: Array<Record<string, unknown>> = []
  if (artist.weibo_url) {
    links.push({ name: '微博', url: artist.weibo_url, icon: 'weibo' })
  }
  if (artist.bilibili_url) {
    links.push({ name: 'Bilibili', url: artist.bilibili_url, icon: 'bilibili' })
  }
  return links
}

// ============================================
// R58-8: 平台链接（platform_urls）
// ============================================

/**
 * 读取画师平台链接列表（含识别后的平台名 + 原始 URL）
 * @param {object} artist - 画师行
 * @returns {Array<{url: string, platform: string, label: string}>}
 */
export function getPlatformUrls(artist: Artist): Array<{ url: string; platform: string; label: string }> {
  return parsePlatformUrls(artist.platform_urls)
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
// SPEC-004: 名额与缓冲系统
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
  if (quota && quota.remaining <= 0) return '本月已约满'

  // status = open
  if (hasBatchLimit) {
    const N = artist.batch_limit
    const M = artist.buffer_limit ?? 0
    const { formal, buffer } = getZoneCounts(artist.id)
    if (formal < N) {
      const remaining = N - formal
      return `开放中 · 剩 ${remaining} 席`
    }
    if (buffer < M) return '可候补'
    return '已接满'
  }

  // 仅额度池（无名额限制）
  return `开放中 · 本月剩 ${quota.remaining} 单`
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
    const expires = new Date(artist.announcement_expires_at)
    if (expires.getTime() <= Date.now()) return null
  }
  return {
    text: artist.announcement,
    expiresAt: artist.announcement_expires_at || null
  }
}

// ============================================
// F1: 作品点赞
// ============================================

const LIKE_MAX = 99999

/** 点赞 +1（上限保护） */
export function likeArtwork(artworkId: number): Artwork | null {
  const artwork = getArtworkById(artworkId)
  if (!artwork) return null
  const newCount = Math.min((artwork.like_count || 0) + 1, LIKE_MAX)
  db.prepare('UPDATE artworks SET like_count = ? WHERE id = ?').run(newCount, artworkId)
  return getArtworkById(artworkId) ?? null
}

/** 取消点赞 -1（不低于 0） */
export function unlikeArtwork(artworkId: number): Artwork | null {
  const artwork = getArtworkById(artworkId)
  if (!artwork) return null
  const newCount = Math.max((artwork.like_count || 0) - 1, 0)
  db.prepare('UPDATE artworks SET like_count = ? WHERE id = ?').run(newCount, artworkId)
  return getArtworkById(artworkId) ?? null
}
