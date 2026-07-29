import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { isValidArtistCode } from '../../shared/validate.js'

// ============================================
// 画师服务
// ============================================

export function getArtistBySubdomain(subdomain) {
  return db.prepare('SELECT * FROM artists WHERE subdomain = ? AND deleted_at IS NULL').get(subdomain)
}

export function getArtistByQq(qqNumber) {
  return db.prepare('SELECT * FROM artists WHERE qq_number = ? AND deleted_at IS NULL').get(qqNumber)
}

export function getArtistById(id) {
  // 不过滤 deleted_at — 认证中间件需要找到已删除画师以拒绝其 token
  return db.prepare('SELECT * FROM artists WHERE id = ?').get(id)
}

export function getAllArtists() {
  return db.prepare('SELECT * FROM artists WHERE deleted_at IS NULL ORDER BY created_at ASC').all()
}

export async function createArtist({ qqNumber, name, subdomain, bio, artistCode }) {
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
  const existing = db.prepare('SELECT id FROM artists WHERE artist_code = ?').get(code)
  if (existing) {
    throw new AppError(E.CODE_TAKEN, 400, { code })
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
  seedArtistStages(result.lastInsertRowid)

  return getArtistById(result.lastInsertRowid)
}

export function updateArtist(id, fields) {
  // R15: 旧列 weibo_url/bilibili_url 冻结只读，新写入全走 custom_links
  const allowed = ['name', 'avatar', 'bio', 'status', 'custom_links', 'notify_enabled', 'artist_code', 'contact_qq', 'template_id', 'palette_id', 'revision_note', 'dashboard_default_panel']
  const updates = []
  const values = []

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
        const existing = db.prepare('SELECT id FROM artists WHERE artist_code = ? AND id != ?').get(code, id)
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
      } else if (key === 'avatar') {
        // M-1 修复：头像路径校验 — 必须在 images/ 目录下，拒绝路径穿越
        if (value && (String(value).includes('..') || !String(value).startsWith('images/'))) {
          throw new AppError(E.ILLEGAL_PATH)
        }
        updates.push('avatar = ?')
        values.push(value)
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

export function deleteArtist(id) {
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
export function bumpTokenVersion(artistId) {
  db.prepare(
    'UPDATE artists SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?'
  ).run(artistId)
}

// ============================================
// 价格档位
// ============================================

export function getTiers(artistId) {
  return db.prepare('SELECT * FROM price_tiers WHERE artist_id = ? ORDER BY sort_order ASC').all(artistId)
}

export function getTierById(tierId) {
  return db.prepare('SELECT * FROM price_tiers WHERE id = ?').get(tierId)
}

export function createTier(artistId, fields) {
  // H-4 修复：同时接受 camelCase 和 snake_case（对齐 updateTier 的 keyMap 策略）
  const name = fields.name
  const price = fields.price
  const description = fields.description
  const exampleImage = fields.exampleImage ?? fields.example_image
  const workDays = fields.workDays ?? fields.work_days
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM price_tiers WHERE artist_id = ?').get(artistId)
  const sortOrder = (maxOrder?.m ?? 0) + 1

  const result = db.prepare(`
    INSERT INTO price_tiers (artist_id, name, price, description, example_image, work_days, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(artistId, name, price, description || null, exampleImage || null, workDays || null, sortOrder)

  return db.prepare('SELECT * FROM price_tiers WHERE id = ?').get(result.lastInsertRowid)
}

export function updateTier(tierId, fields) {
  // 同时接受 camelCase 和 snake_case（前端统一用 camelCase）
  const keyMap = { workDays: 'work_days', exampleImage: 'example_image' }
  const allowed = ['name', 'price', 'description', 'example_image', 'work_days', 'sort_order']
  const updates = []
  const values = []

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
  return db.prepare('SELECT * FROM price_tiers WHERE id = ?').get(tierId)
}

export function deleteTier(tierId) {
  db.prepare('DELETE FROM price_tiers WHERE id = ?').run(tierId)
}

// ============================================
// 作品
// ============================================

export function getArtworks(artistId) {
  return db.prepare('SELECT * FROM artworks WHERE artist_id = ? ORDER BY sort_order ASC').all(artistId)
}

export function getArtworkById(artworkId) {
  return db.prepare('SELECT * FROM artworks WHERE id = ?').get(artworkId)
}

export function createArtwork(artistId, { imagePath, title }) {
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM artworks WHERE artist_id = ?').get(artistId)
  const sortOrder = (maxOrder?.m ?? 0) + 1

  const result = db.prepare('INSERT INTO artworks (artist_id, image_path, title, sort_order) VALUES (?, ?, ?, ?)')
    .run(artistId, imagePath, title || null, sortOrder)

  return db.prepare('SELECT * FROM artworks WHERE id = ?').get(result.lastInsertRowid)
}

export function deleteArtwork(artworkId) {
  db.prepare('DELETE FROM artworks WHERE id = ?').run(artworkId)
}

// ============================================
// 约稿须知
// ============================================

export function getRules(artistId) {
  return db.prepare('SELECT * FROM commission_rules WHERE artist_id = ?').get(artistId)
}

export function updateRules(artistId, content) {
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
export function getCustomLinks(artist) {
  if (artist.custom_links != null) {
    try {
      const parsed = JSON.parse(artist.custom_links)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  // 回退旧列（老画师 custom_links=NULL 场景）
  const links = []
  if (artist.weibo_url) {
    links.push({ name: '微博', url: artist.weibo_url, icon: 'weibo' })
  }
  if (artist.bilibili_url) {
    links.push({ name: 'Bilibili', url: artist.bilibili_url, icon: 'bilibili' })
  }
  return links
}
