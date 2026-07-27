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
  const allowed = ['name', 'avatar', 'bio', 'status', 'weibo_url', 'bilibili_url', 'notify_enabled', 'artist_code', 'contact_qq']
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
        if (!['open', 'full', 'break'].includes(String(value))) {
          throw new AppError(E.INVALID_STATUS)
        }
        updates.push('status = ?')
        values.push(value)
      } else if (key === 'notify_enabled') {
        // P1-D: 强制转整数，防止字符串被 SQLite 类型亲和性吞掉
        updates.push('notify_enabled = ?')
        values.push(value ? 1 : 0)
      } else if (key === 'weibo_url' || key === 'bilibili_url') {
        // 安全：外链协议校验 — 仅允许 http/https
        if (value && !/^https?:\/\//i.test(String(value))) {
          throw new AppError(E.INVALID_URL)
        }
        updates.push(`${key} = ?`)
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

export function createTier(artistId, { name, price, description, exampleImage, workDays }) {
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
