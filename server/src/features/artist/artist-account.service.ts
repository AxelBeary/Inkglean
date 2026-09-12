import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { isValidArtistCode, RESERVED_SUBDOMAINS } from '../../shared/validate.js'
import { normalizeLinkUrl, assertLinkLengthLimits, MAX_LINK_COUNT } from '../../shared/utils/platform.js'
import { rederivePlatformId } from '../platform/platform.service.js'
import { sanitizeStoredText } from '../../shared/sanitize.js'
import type { Artist } from '../../types/entities.js'
import { getArtistById } from './artist-lookup.service.js'

// ============================================
// 画师服务 - 账号生命周期（建号 / 资料更新 / 软删与恢复）
// （从 artist.service.ts 拆出，F-09 巨型文件清偿；纯搬移，逻辑零变更）
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

export async function createArtist({ qqNumber, name, subdomain, bio, artistCode }: {
  qqNumber: string
  name: string
  subdomain: string
  bio?: string | null
  artistCode?: string | null
}): Promise<Artist | undefined> {
  // 校验子域名格式（823 规则对齐批：去连字符——身份码由标识大写派生只认字母数字，两规则同形才能根除派生死角）
  if (!/^[a-z0-9]{2,20}$/.test(subdomain)) {
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
