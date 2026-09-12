import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { sanitizeStoredText } from '../../shared/sanitize.js'
import sharp from 'sharp'
import { resolve, join } from 'path'
import { isArtistVisibleById } from './artist-lookup.service.js'

// ============================================
// 画师服务 - 作品、档位标注、封面、点赞
// （从 artist.service.ts 拆出，F-09 巨型文件清偿；纯搬移，逻辑零变更）
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
  description: string | null
  width: number | null
  height: number | null
  // F7（v62）: 发布来源交付物 id——普通上传为 NULL，发布为作品时记录，唯一索引兜一图一作品
  source_deliverable_id: number | null
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
