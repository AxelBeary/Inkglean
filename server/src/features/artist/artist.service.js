import db from '../../db/connection.js'

// ============================================
// 画师服务
// ============================================

export function getArtistBySubdomain(subdomain) {
  return db.prepare('SELECT * FROM artists WHERE subdomain = ?').get(subdomain)
}

export function getArtistByQq(qqNumber) {
  return db.prepare('SELECT * FROM artists WHERE qq_number = ?').get(qqNumber)
}

export function getArtistById(id) {
  return db.prepare('SELECT * FROM artists WHERE id = ?').get(id)
}

export function getAllArtists() {
  return db.prepare('SELECT * FROM artists ORDER BY created_at ASC').all()
}

export function createArtist({ qqNumber, name, subdomain, bio }) {
  // 校验子域名格式
  if (!/^[a-z0-9-]{2,20}$/.test(subdomain)) {
    throw new Error('子域名只能包含小写字母、数字和连字符，2-20个字符')
  }

  const result = db.prepare(`
    INSERT INTO artists (qq_number, name, subdomain, bio)
    VALUES (?, ?, ?, ?)
  `).run(qqNumber, name, subdomain, bio || null)

  // 初始化空的约稿须知
  db.prepare('INSERT INTO commission_rules (artist_id, content) VALUES (?, ?)')
    .run(result.lastInsertRowid, '')

  return getArtistById(result.lastInsertRowid)
}

export function updateArtist(id, fields) {
  const allowed = ['name', 'avatar', 'bio', 'status', 'weibo_url', 'bilibili_url', 'notify_enabled']
  const updates = []
  const values = []

  for (const [key, value] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      updates.push(`${key} = ?`)
      values.push(value)
    }
  }

  if (updates.length === 0) return getArtistById(id)

  values.push(id)
  db.prepare(`UPDATE artists SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  return getArtistById(id)
}

export function deleteArtist(id) {
  db.prepare('DELETE FROM artists WHERE id = ?').run(id)
}

// ============================================
// 价格档位
// ============================================

export function getTiers(artistId) {
  return db.prepare('SELECT * FROM price_tiers WHERE artist_id = ? ORDER BY sort_order ASC').all(artistId)
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
  const allowed = ['name', 'price', 'description', 'example_image', 'work_days', 'sort_order']
  const updates = []
  const values = []

  for (const [key, value] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      updates.push(`${key} = ?`)
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
