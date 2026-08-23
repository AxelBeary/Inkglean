import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { isValidArtistCode, RESERVED_SUBDOMAINS } from '../../shared/validate.js'
import { normalizeLinkUrl, assertLinkLengthLimits, MAX_LINK_COUNT } from '../../shared/utils/platform.js'
import { rederivePlatformId } from '../platform/platform.service.js'
import { localMonthStartSqlite } from '../../utils/date.js'
import { sanitizeStoredText, sanitizeStoredHtml } from '../../shared/sanitize.js'
import type { Artist } from '../../types/entities.js'
import sharp from 'sharp'
import { resolve, join } from 'path'

// ============================================
// 画师服务
// ============================================

// F-4（P3-17）: 客户端模板 id 白名单——与 web 侧实际消费枚举一致
// 来源：web/src/views/artist/Settings.vue templates 列表（atelier/classic/gallery/folio）+
//       web/src/views/client/ArtistHome.vue TEMPLATES 映射（同集合）
// 历史遗留值 default/dark-gallery/single-page 仅由前端读取时映射到新 id（ArtistHome.vue LEGACY），
// 写路径一律拒绝旧值（旧值入库会让新前端渲染回退经典模板，属脏数据）
const CLIENT_TEMPLATE_IDS = ['atelier', 'classic', 'gallery', 'folio']

// F-4（P3-17）: Dashboard 默认面板枚举——来源 web/src/views/artist/Preferences.vue
// el-option 列表（822 批补 dashboard：停留仪表盘本身，即默认行为）；null=未设置（同 dashboard）
const DASHBOARD_DEFAULT_PANELS = ['dashboard', 'queue', 'orders', 'manual', 'tiers']

/** 作品（entities.ts 未定义，内联） */
interface Artwork {
  id: number
  artist_id: number
  image_path: string
  title: string | null
  sort_order: number
  like_count: number
  is_cover: number
  description: string | null
  width: number | null
  height: number | null
  // F7（v62）: 发布来源交付物 id——普通上传为 NULL，发布为作品时记录，唯一索引兜一图一作品
  source_deliverable_id: number | null
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

/**
 * BUG-3 修复：公开路由可见画师守卫
 * hidden/封禁画师 → 抛 ARTIST_NOT_FOUND 404（对照 artist.routes.ts 公开路由范式）
 * 供 /api/public/* 端点统一使用，防止 hidden 画师未完全隐身
 */
export function requireVisibleArtist(subdomain: string): Artist {
  const artist = getArtistBySubdomain(subdomain)
  if (!artist || (artist as Artist).status === 'hidden' || artist.is_banned) {
    throw new AppError(E.ARTIST_NOT_FOUND, 404)
  }
  return artist
}

export function getArtistByQq(qqNumber: string): Artist | undefined {
  return db.prepare('SELECT * FROM artists WHERE qq_number = ? AND deleted_at IS NULL').get(qqNumber) as Artist | undefined
}

export function getArtistById(id: number): Artist | undefined {
  // 不过滤 deleted_at — 认证中间件需要找到已删除画师以拒绝其 token
  return db.prepare('SELECT * FROM artists WHERE id = ?').get(id) as Artist | undefined
}

export function getAllArtists(): Artist[] {
  // 安全加固批 F1: 显式列——剔除 totp_secret/totp_failed_attempts/totp_locked_until（密钥体系）、
  // token_version/deleted_at（内部）、weibo_url/bilibili_url/platform_urls（历史遗留零引用）。
  // 保留 totp_verified：管理后台画师列表据此显示「绑定/重绑」按钮（ArtistManage.vue）。
  // 保留 quick_actions：画师 profile 消费（Preferences.vue/QuickActions.vue）。
  return db.prepare(`
    SELECT id, qq_number, name, subdomain, avatar, bio, status, contact_qq, notify_enabled, guestbook_enabled,
           created_at, artist_code, template_id, custom_page_path, palette_id,
           dashboard_default_panel, revision_note, custom_links, accent_color,
           order_template_id, inspiration_tags, batch_limit, buffer_limit, auto_promote,
           hide_queue_position, hide_promote_notify, buffer_short_form, announcement,
           announcement_expires_at, monthly_quota, quick_actions, discount_enabled,
           multi_style_enabled, totp_verified, is_banned, last_login_at, last_login_ip
    FROM artists WHERE deleted_at IS NULL AND subdomain != 'system' ORDER BY created_at ASC
  `).all() as Artist[]
}

/**
 * 登录留痕批（v72）：刷新画师上次登录时间 + 来源 IP（每次登录覆盖旧值）。
 * 三个登录口成功后调用：TOTP 登录 / Passkey 登录 / 邀请码首绑确认。
 * 字段仅管理后台展示（publicArtistDTO 默认剔除，不经 /api/auth/me 等口外泄）。
 */
export function recordLastLogin(artistId: number, ip: string): void {
  db.prepare('UPDATE artists SET last_login_at = ?, last_login_ip = ? WHERE id = ?')
    .run(new Date().toISOString(), ip, artistId)
}

/**
 * 开业就绪判定（方案 A，2026-08-21 用户拍板）：
 *  ① 至少 1 张作品（artworks）
 *  ② 至少 1 个启用画风且其下至少 1 个尺寸（art_styles.is_active=1 + style_sizes）
 * 未达标 → 小店不上平台首页目录（GET /api/artists）；直接访问 /artist/:subdomain 不受影响。
 * 目录口径为两条 DISTINCT 聚合取交集，避免逐画师 N+1。
 */
export function getReadyArtistIds(): Set<number> {
  const artworkRows = db.prepare(
    'SELECT DISTINCT artist_id FROM artworks'
  ).all() as Array<{ artist_id: number }>
  const priceRows = db.prepare(`
    SELECT DISTINCT s.artist_id AS artist_id
    FROM art_styles s
    JOIN style_sizes z ON z.art_style_id = s.id
    WHERE s.is_active = 1
  `).all() as Array<{ artist_id: number }>
  const priceSet = new Set(priceRows.map(r => r.artist_id))
  return new Set(artworkRows.map(r => r.artist_id).filter(id => priceSet.has(id)))
}

/** 单画师就绪判定（与开张任务卡 tier 口径共用，防两处漂移） */
export function isArtistReady(artistId: number): boolean {
  const hasArtwork = db.prepare(
    'SELECT id FROM artworks WHERE artist_id = ? LIMIT 1'
  ).get(artistId) !== undefined
  if (!hasArtwork) return false
  return db.prepare(`
    SELECT s.id
    FROM art_styles s
    JOIN style_sizes z ON z.art_style_id = s.id
    WHERE s.artist_id = ? AND s.is_active = 1
    LIMIT 1
  `).get(artistId) !== undefined
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
  // d2 P2: 服务层兜底保留词（路由黑名单可能被未来新调用方绕过；与 getAllArtists
  // 的 subdomain != 'system' 隐身排除同语义，防抢注系统保留标识）
  if (RESERVED_SUBDOMAINS.includes(subdomain as (typeof RESERVED_SUBDOMAINS)[number])) {
    throw new AppError(E.SUBDOMAIN_FORMAT, 400, { hint: `主页标识「${subdomain}」为系统保留词，请换一个` })
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

  // audit-a P2-5: 三步写入（artists + commission_rules + seedArtistStages）包进同一事务，
  // 任一步失败整体回滚，杜绝半建画师（有主行无须知/无流程）；唯一性预检保留在事务外（错误码语义不变）
  const { seedArtistStages } = await import('./workflow.service.js')
  // d2 P2: createArtist 与 updateArtist 的 bio 写入口消毒口径对齐（纵深防御）
  const safeBio = bio ? sanitizeStoredText(String(bio)) : null
  const createTx = db.transaction((): number => {
    // 方案 A（2026-08-21 拍板）：管理员建号默认 hidden，与邀请注册/初始化向导同口径——
    // 画师备好作品与价格后自行在「设置 → 主页展示」开关开业，杜绝空店对外可见
    const result = db.prepare(`
      INSERT INTO artists (qq_number, name, subdomain, artist_code, bio, status)
      VALUES (?, ?, ?, ?, ?, 'hidden')
    `).run(qqNumber, name, subdomain, code, safeBio)
    const artistId = Number(result.lastInsertRowid)

    // 初始化空的约稿须知
    db.prepare('INSERT INTO commission_rules (artist_id, content) VALUES (?, ?)')
      .run(artistId, '')

    // 初始化流程与比例（从默认模板复制）
    seedArtistStages(artistId)
    return artistId
  })
  const artistId = createTx()

  return getArtistById(artistId)
}

export function updateArtist(id: number, fields: Record<string, unknown>): Artist | undefined {
  // R15: 旧列 weibo_url/bilibili_url 冻结只读，新写入全走 custom_links
  // REQ-022 F2: platform_urls 写入分支已删除（列弃用，读路径全部移除）
  const allowed = ['name', 'avatar', 'bio', 'status', 'custom_links', 'notify_enabled', 'guestbook_enabled', 'artist_code', 'contact_qq', 'template_id', 'palette_id', 'revision_note', 'dashboard_default_panel', 'accent_color', 'order_template_id', 'inspiration_tags', 'batch_limit', 'buffer_limit', 'auto_promote', 'hide_queue_position', 'hide_promote_notify', 'buffer_short_form', 'announcement', 'announcement_expires_at', 'monthly_quota', 'quick_actions', 'multi_style_enabled', 'dashboard_modules']
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
      } else if (key === 'notify_enabled' || key === 'guestbook_enabled') {
        // P1-D: 强制转整数，防止字符串被 SQLite 类型亲和性吞掉（notify 与 guestbook 同口径布尔列）
        updates.push(`${key} = ?`)
        values.push(value ? 1 : 0)
      } else if (key === 'custom_links') {
        // REQ-022 F2: 外链列表重做 — 单一结构 [{platformId, url}]
        // 硬校验：条数 ≤8 / 仅 http(s)（裸链补 https）/ 域名≤253 / 路径+查询≤1500 / 总长≤1800
        // platformId 一律后端按 URL 重推导，忽略前端传值（防投毒核心）
        const links = Array.isArray(value) ? value : []
        if (links.length > MAX_LINK_COUNT) {
          throw new AppError(E.LINKS_TOO_MANY)
        }
        const normalized: Array<{ platformId: number | null; url: string }> = []
        for (const link of links) {
          const url = normalizeLinkUrl((link as { url?: unknown })?.url)
          assertLinkLengthLimits(url)
          normalized.push({ platformId: rederivePlatformId(url), url })
        }
        updates.push('custom_links = ?')
        values.push(JSON.stringify(normalized))
      } else if (key === 'palette_id') {
        // 配色白名单校验 — 非法值回退到默认，避免脏数据
        const palette = String(value || 'paper')
        updates.push('palette_id = ?')
        values.push(['paper', 'ink', 'dusk', 'moss'].includes(palette) ? palette : 'paper')
      } else if (key === 'template_id') {
        // F-4（P3-17）: 客户端模板白名单校验（来源注释见文件顶部 CLIENT_TEMPLATE_IDS）
        const tpl = String(value || '')
        if (!CLIENT_TEMPLATE_IDS.includes(tpl)) {
          throw new AppError(E.VALIDATION, 400, { field: 'template_id', hint: `template_id 只能是 ${CLIENT_TEMPLATE_IDS.join('/')}` })
        }
        updates.push('template_id = ?')
        values.push(tpl)
      } else if (key === 'dashboard_default_panel') {
        // F-4（P3-17）: Dashboard 面板白名单校验（来源注释见文件顶部 DASHBOARD_DEFAULT_PANELS）
        if (value !== null && !DASHBOARD_DEFAULT_PANELS.includes(String(value))) {
          throw new AppError(E.VALIDATION, 400, { field: 'dashboard_default_panel', hint: `dashboard_default_panel 只能是 ${DASHBOARD_DEFAULT_PANELS.join('/')} 或 null` })
        }
        updates.push('dashboard_default_panel = ?')
        values.push(value || null)
      } else if (key === 'bio' || key === 'announcement') {
        // F-5（P3-18）: 简介/公告入库前最小清洗（纵深防御）
        updates.push(`${key} = ?`)
        values.push(value ? sanitizeStoredText(String(value)) : null)
      } else if (key === 'accent_color') {
        // R49: 强调色白名单校验 — 仅允许 5 色预设 + null（清除）
        // 色值来源：web/src/styles/theme.css data-accent 1-5 的 --color-primary
        const ACCENT_COLORS = ['#356b69', '#3f5e80', '#5e5494', '#346edb', '#3445db']
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
      } else if (key === 'dashboard_modules') {
        // 视觉批 P2：看板模块开关——JSON 对象存储（null=全部显示）；键白名单+布尔值硬校验
        if (value === null) {
          updates.push('dashboard_modules = ?')
          values.push(null)
        } else {
          const MODULE_KEYS = ['schedule', 'guestbook', 'activity', 'onboarding']
          let obj = value
          if (typeof obj === 'string') { try { obj = JSON.parse(obj) } catch { obj = {} } }
          const clean: Record<string, boolean> = {}
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            for (const k of MODULE_KEYS) {
              if (typeof (obj as Record<string, unknown>)[k] === 'boolean') clean[k] = (obj as Record<string, boolean>)[k]
            }
          }
          updates.push('dashboard_modules = ?')
          values.push(JSON.stringify(clean))
        }
      } else if (['auto_promote', 'hide_queue_position', 'hide_promote_notify', 'buffer_short_form', 'multi_style_enabled'].includes(key)) {
        // SPEC-004: 布尔开关 — 强制转整数（v0.37: 多画风开关同组）
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
 * 已移除画师清单（deleted_at 非空），按移除时间倒序。
 * 0817 用户拍板：删除是软删，但此前无任何入口可见/可恢复——补清单+恢复闭环
 */
export function getDeletedArtists(): Artist[] {
  return db.prepare(
    "SELECT * FROM artists WHERE deleted_at IS NOT NULL AND subdomain != 'system' ORDER BY deleted_at DESC"
  ).all() as Artist[]
}

/**
 * 恢复已移除画师：清空 deleted_at 回到在册。
 * 安全口径与移除对称：token_version 不回退（移除时已递增），恢复后需重新登录；
 * 若子域名/QQ 已被在册画师占用（UNIQUE 约束）则拒绝恢复，防 500 冲突
 * @returns 恢复后的画师行；不存在或未处于移除态返回 undefined
 */
export function restoreArtist(id: number): Artist | undefined {
  const artist = getArtistById(id)
  if (!artist || !artist.deleted_at) return undefined
  const subdomainTaken = db.prepare(
    'SELECT id FROM artists WHERE subdomain = ? AND deleted_at IS NULL AND id != ?'
  ).get(artist.subdomain, id)
  if (subdomainTaken) throw new AppError(E.SUBDOMAIN_TAKEN)
  const qqTaken = db.prepare(
    'SELECT id FROM artists WHERE qq_number = ? AND deleted_at IS NULL AND id != ?'
  ).get(artist.qq_number, id)
  if (qqTaken) throw new AppError(E.QQ_TAKEN)
  db.prepare('UPDATE artists SET deleted_at = NULL WHERE id = ?').run(id)
  return getArtistById(id)
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
// 价格档位（SPEC-PRICE-2 v50：price_tiers 表已 DROP，档位 CRUD 全部清退；
// 画师价格统一走画风/尺寸/增项模型，见 features/pricing/style.service.ts）
// ============================================

// ============================================
// 作品
// ============================================

export function getArtworks(artistId: number): Artwork[] {
  // v0.25 #5: 封面排第一，其余按 sort_order 排序（无封面时行为不变）
  // v0.31: 封面内部按 cover_order 排序（多封面轮播顺序）
  return db.prepare('SELECT * FROM artworks WHERE artist_id = ? ORDER BY is_cover DESC, cover_order ASC, sort_order ASC').all(artistId) as Artwork[]
}

/** 画师端作品分页（画师自己管理用，20/页；封面置顶不动）
 * 排序与 getArtworks 一致：is_cover DESC, cover_order ASC, sort_order ASC
 */
export interface PagedArtworks {
  items: Artwork[]
  total: number
  hasMore: boolean
}

export function getArtworksPaged(artistId: number, page: number, pageSize: number): PagedArtworks {
  const offset = (page - 1) * pageSize
  const total = (db.prepare('SELECT COUNT(*) AS c FROM artworks WHERE artist_id = ?').get(artistId) as { c: number }).c
  const items = db.prepare(`
    SELECT * FROM artworks WHERE artist_id = ?
    ORDER BY is_cover DESC, cover_order ASC, sort_order ASC
    LIMIT ? OFFSET ?
  `).all(artistId, pageSize, offset) as Artwork[]
  return { items, total, hasMore: offset + items.length < total }
}

/** 公开端作品分页（访客看画师主页用，10/页 + 加载更多）；hidden 画师由路由层拦截 */
export function getPublicArtworksPaged(artistId: number, page: number, pageSize: number): PagedArtworks {
  return getArtworksPaged(artistId, page, pageSize)
}
export function getArtworkById(artworkId: number): Artwork | undefined {
  return db.prepare('SELECT * FROM artworks WHERE id = ?').get(artworkId) as Artwork | undefined
}

export async function createArtwork(artistId: number, { imagePath, title, description, sourceDeliverableId }: {
  imagePath: string
  title?: string | null
  description?: string | null
  sourceDeliverableId?: number | null
}): Promise<Artwork | undefined> {
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

  // REQ-022 F1: description 入列（发布为作品携带自由描述；旧调用不传 → null）
  // F-5（P3-18）: 作品描述入库前最小清洗（纵深防御）
  // d2 P2: title 与 description 同口径清洗（此前仅 description 消毒，写入口不对称）
  // F7: sourceDeliverableId 可选——发布为作品时写入发布源，普通上传不传 → NULL（不受唯一索引约束）
  const result = db.prepare(
    'INSERT INTO artworks (artist_id, image_path, title, description, sort_order, width, height, source_deliverable_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(artistId, imagePath, title ? sanitizeStoredText(String(title)) : null, description ? sanitizeStoredText(String(description)) : null, sortOrder, width, height, sourceDeliverableId ?? null)

  return db.prepare('SELECT * FROM artworks WHERE id = ?').get(Number(result.lastInsertRowid)) as Artwork | undefined
}

export function deleteArtwork(artworkId: number): void {
  db.prepare('DELETE FROM artworks WHERE id = ?').run(artworkId)
}

// ============================================
// v0.37 (REQ-024 F6): 作品编辑 + 档位标注
// ============================================

/** 更新作品（标题/自由描述）— 归属校验在路由层 */
export function updateArtwork(artworkId: number, fields: { title?: string | null; description?: string | null }): Artwork | undefined {
  if (fields.title !== undefined) {
    // d2 P2: title 与 description 同口径清洗（纵深防御，避免公开画廊原样出站脏数据）
    db.prepare('UPDATE artworks SET title = ? WHERE id = ?').run(fields.title ? sanitizeStoredText(String(fields.title)) : null, artworkId)
  }
  if (fields.description !== undefined) {
    // F-5（P3-18）: 作品描述入库前最小清洗（纵深防御）
    db.prepare('UPDATE artworks SET description = ? WHERE id = ?').run(fields.description ? sanitizeStoredText(String(fields.description)) : null, artworkId)
  }
  return getArtworkById(artworkId)
}

/** 获取作品已标注的尺寸 id 列表 */
export function getArtworkSizeTagIds(artworkId: number): number[] {
  const rows = db.prepare(
    'SELECT style_size_id FROM artwork_size_tags WHERE artwork_id = ? ORDER BY style_size_id ASC'
  ).all(artworkId) as Array<{ style_size_id: number }>
  return rows.map(r => r.style_size_id)
}

/**
 * 批量设置作品档位标注（多选替换语义）
 * 校验：每个尺寸必须属于该画师的画风（跨画师标注 → 404）
 */
export function setArtworkSizeTags(artistId: number, artworkId: number, sizeIds: number[]): number[] {
  db.transaction(() => {
    db.prepare('DELETE FROM artwork_size_tags WHERE artwork_id = ?').run(artworkId)
    const insert = db.prepare('INSERT INTO artwork_size_tags (artwork_id, style_size_id) VALUES (?, ?)')
    for (const sizeId of sizeIds) {
      // 尺寸归属：style_sizes → art_styles.artist_id
      const own = db.prepare(`
        SELECT ss.id FROM style_sizes ss
        JOIN art_styles s ON s.id = ss.art_style_id
        WHERE ss.id = ? AND s.artist_id = ?
      `).get(sizeId, artistId)
      if (!own) throw new AppError(E.STYLE_SIZE_NOT_FOUND, 404, { styleSizeId: sizeId })
      insert.run(artworkId, sizeId)
    }
  })()
  return getArtworkSizeTagIds(artworkId)
}

// ============================================
// v0.25 #5: 封面图
// ============================================

/**
 * 设为封面（多张共存，用户原声 REQ-013 #5："多张来回滚动"）
 * 不取消其他封面——画师可设多张，客户端自动轮播
 * v0.31: 自动分配 cover_order（追加到末尾）
 * T8: 封面上限 COVER_LIMIT 张（用户 2026-08-06 拍板：第 7 张拦截并提示）
 */
export const COVER_LIMIT = 6

export function setCover(artistId: number, artworkId: number): Artwork | undefined {
  const current = getArtworkById(artworkId)
  // 已是封面：幂等放行（不重新计数，避免已达上限时重复设置误报）
  if (current && current.is_cover === 1) return current
  // T8: 封面上限校验（不含当前作品）
  const coverCount = db.prepare(
    'SELECT COUNT(*) AS c FROM artworks WHERE artist_id = ? AND is_cover = 1 AND id != ?'
  ).get(artistId, artworkId) as { c: number }
  if (coverCount.c >= COVER_LIMIT) {
    throw new AppError(E.COVER_LIMIT_REACHED, 400)
  }
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
    // #8（拍板 2026-08-15）: 按日比较——到期日当天仍有效，过今天才算过期（零点数值比较，勿用日期字符串比大小）
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    if (expires.getTime() < todayStart.getTime()) return null
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

/** 点赞 +1（上限保护）。BUG-3 修复：hidden/封禁画师的作品拒绝点赞 */
export function likeArtwork(artworkId: number): Artwork | null {
  const artwork = getArtworkById(artworkId)
  if (!artwork || !isArtistVisibleById(artwork.artist_id)) return null
  const newCount = Math.min((artwork.like_count || 0) + 1, LIKE_MAX)
  db.prepare('UPDATE artworks SET like_count = ? WHERE id = ?').run(newCount, artworkId)
  return getArtworkById(artworkId) ?? null
}

/** 取消点赞 -1（不低于 0）。BUG-3 修复：hidden/封禁画师的作品拒绝取消点赞 */
export function unlikeArtwork(artworkId: number): Artwork | null {
  const artwork = getArtworkById(artworkId)
  if (!artwork || !isArtistVisibleById(artwork.artist_id)) return null
  const newCount = Math.max((artwork.like_count || 0) - 1, 0)
  db.prepare('UPDATE artworks SET like_count = ? WHERE id = ?').run(newCount, artworkId)
  return getArtworkById(artworkId) ?? null
}

/**
 * BUG-3 修复：按 artist_id 判断画师是否对公开端点可见
 * hidden/封禁/已删除 → 不可见（对照 requireVisibleArtist 语义）
 * audit-a P2-7: 导出供订单公开路由（track）复用，避免复制隐藏逻辑
 */
export function isArtistVisibleById(artistId: number): boolean {
  const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId) as Artist | undefined
  if (!artist || artist.deleted_at) return false
  if (artist.status === 'hidden') return false
  if (artist.is_banned) return false
  return true
}
