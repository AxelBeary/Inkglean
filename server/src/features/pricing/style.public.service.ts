import db from '../../db/connection.js'
import type { ArtStyle, StyleSize, SizeAddonOverride } from './style.types.js'

// ============================================
// 客户端公开读模型 — 公开画廊（REQ-024 F6）+ 公开画风配置（REQ-023 / REQ-024 F2）
// F-09 巨型文件拆分批·自 style.service.ts 纯搬移（原 705-1041 行），代码体一字未改；
// 本域只读、只引用共用行类型，不被任何内部函数调用，故为依赖图末端叶子。
// ============================================

// ─── 客户端公开配置 ───

// ─── v0.37 (REQ-024 F6): 公开画廊数据（作品档位标注 + 筛选标签） ───

export interface PublicGalleryTag {
  style_size_id: number
  size_name: string
  style_id: number
  style_name: string
}

export interface PublicGalleryArtwork {
  id: number
  image_path: string
  title: string | null
  description: string | null
  like_count: number
  is_cover: number
  width: number | null
  height: number | null
  size_tags: PublicGalleryTag[]
}

export interface PublicGallerySize {
  id: number
  name: string
  style_id: number
  style_name: string
  sort_order: number
}

/**
 * F6 公开画廊数据 — 作品列表（带档位标注+自由描述）+ 筛选标签尺寸列表
 *
 * 可见性规则与 getPublicStyles 一致：multi_style_enabled=0 时只有默认画风
 * （排序最前的启用画风）的尺寸参与标注展示和筛选标签——关闭画风下挂的标注不对外。
 * 删掉的尺寸标注被 CASCADE 自动清理（F6 验收 8）。
 */
export function getPublicGallery(artistId: number): {
  artworks: PublicGalleryArtwork[]
  filterSizes: PublicGallerySize[]
} {
  // 1. 可见画风（同 getPublicStyles 的门控逻辑）
  let styles = db.prepare(
    'SELECT id, name FROM art_styles WHERE artist_id = ? AND is_active = 1 ORDER BY sort_order ASC'
  ).all(artistId) as Array<{ id: number; name: string }>

  const artist = db.prepare(
    'SELECT multi_style_enabled FROM artists WHERE id = ?'
  ).get(artistId) as { multi_style_enabled: number } | undefined
  if (artist && !artist.multi_style_enabled) {
    styles = styles.slice(0, 1)
  }

  // 2. 可见画风下的尺寸 → 筛选标签 + 标注过滤集
  // 815 P-1: N+1 → 按 art_style_id IN (...) 一次预取，内存分组（每组内保持 sort_order 排序）
  const filterSizes: PublicGallerySize[] = []
  const visibleSizeMap = new Map<number, PublicGalleryTag>()
  const sizesByStyle = new Map<number, Array<{ id: number; name: string; sort_order: number }>>()
  const styleIds = styles.map(s => s.id)
  if (styleIds.length > 0) {
    const sizePlaceholders = styleIds.map(() => '?').join(',')
    const sizeRows = db.prepare(
      `SELECT id, name, sort_order, art_style_id FROM style_sizes
       WHERE art_style_id IN (${sizePlaceholders})
       ORDER BY art_style_id ASC, sort_order ASC`
    ).all(...styleIds) as Array<{ id: number; name: string; sort_order: number; art_style_id: number }>
    for (const size of sizeRows) {
      const list = sizesByStyle.get(size.art_style_id) ?? []
      list.push(size)
      sizesByStyle.set(size.art_style_id, list)
    }
  }
  for (const style of styles) {
    for (const size of sizesByStyle.get(style.id) ?? []) {
      filterSizes.push({ id: size.id, name: size.name, style_id: style.id, style_name: style.name, sort_order: size.sort_order })
      visibleSizeMap.set(size.id, {
        style_size_id: size.id, size_name: size.name, style_id: style.id, style_name: style.name
      })
    }
  }

  // 3. 作品列表（含标注——只保留可见尺寸内的标注）
  const rows = db.prepare(`
    SELECT a.id, a.image_path, a.title, a.description, a.like_count, a.is_cover,
           a.width, a.height, a.sort_order, a.cover_order
    FROM artworks a
    WHERE a.artist_id = ?
    ORDER BY a.is_cover DESC, a.cover_order ASC, a.sort_order ASC
  `).all(artistId) as Array<{
    id: number; image_path: string; title: string | null; description: string | null
    like_count: number; is_cover: number; width: number | null; height: number | null
  }>

  // 815 P-1: 标注子查询 → artwork_id IN (...) 一次预取，内存按作品分组
  const tagRowsByArtwork = new Map<number, Array<{ style_size_id: number }>>()
  const artworkIds = rows.map(r => r.id)
  if (artworkIds.length > 0) {
    const tagPlaceholders = artworkIds.map(() => '?').join(',')
    const tagRows = db.prepare(
      `SELECT artwork_id, style_size_id FROM artwork_size_tags
       WHERE artwork_id IN (${tagPlaceholders})
       ORDER BY artwork_id ASC, rowid ASC`
    ).all(...artworkIds) as Array<{ artwork_id: number; style_size_id: number }>
    for (const tag of tagRows) {
      const list = tagRowsByArtwork.get(tag.artwork_id) ?? []
      list.push({ style_size_id: tag.style_size_id })
      tagRowsByArtwork.set(tag.artwork_id, list)
    }
  }
  const artworks: PublicGalleryArtwork[] = rows.map(row => {
    const tagRows = tagRowsByArtwork.get(row.id) ?? []
    const sizeTags = tagRows
      .map(t => visibleSizeMap.get(t.style_size_id))
      .filter((t): t is PublicGalleryTag => !!t)
    return {
      id: row.id,
      image_path: row.image_path,
      title: row.title,
      description: row.description,
      like_count: row.like_count,
      is_cover: row.is_cover,
      width: row.width,
      height: row.height,
      size_tags: sizeTags
    }
  })

  return { artworks, filterSizes }
}

/**
 * 批量解析作品引用图路径（v0.37 F1：image_artwork_id → artworks.image_path 实时引用）
 * 815 P-1: 逐尺寸单查 → 一次 IN 预取，内存 Map 回查
 */
function resolveArtworkImagePaths(artworkIds: Array<number | null>): Map<number, string> {
  const ids = [...new Set(artworkIds.filter((id): id is number => id != null))]
  const map = new Map<number, string>()
  if (ids.length === 0) return map
  const placeholders = ids.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT id, image_path FROM artworks WHERE id IN (${placeholders})`
  ).all(...ids) as Array<{ id: number; image_path: string }>
  for (const row of rows) map.set(row.id, row.image_path)
  return map
}

export interface PublicStyleAddon {
  id: number
  addon_template_id: number | null
  name: string
  control_type: string
  price_mode: string
  price: number
  unit_label: string | null
  is_enabled: boolean
  category: string
  max_quantity: number | null
}

export interface PublicStyleSize {
  id: number
  name: string
  base_price: number
  sort_order: number
  // v0.37 (REQ-024 F1): 尺寸带图/描述/天数
  // 渲染优先级（F1/F3 约定）：image_artwork_id 有值 → 用 artwork_image_path（实时引用），否则用 image
  image: string | null
  image_artwork_id: number | null
  artwork_image_path: string | null
  description: string | null
  work_days: number | null
  display_status: string
  addons: PublicStyleAddon[]
}

export interface PublicArtStyle {
  id: number
  name: string
  description: string | null
  cover_image: string | null
  sort_order: number
  sizes: PublicStyleSize[]
}

/**
 * 获取画师画风+尺寸+增项完整配置（客户端三步走用）
 * 只返回 is_active=1 的画风
 * v0.37 (REQ-024 F2): 多画风开关 multi_style_enabled=0 时只返回默认画风
 *   （默认画风 = 排序最前的启用画风，动态顺延）
 * 增项价格：尺寸覆盖 > 画风覆盖 > 模板默认价
 * 排除 is_hidden=1 的增项
 */
export function getPublicStyles(artistId: number): PublicArtStyle[] {
  let styles = db.prepare(
    'SELECT * FROM art_styles WHERE artist_id = ? AND is_active = 1 ORDER BY sort_order ASC'
  ).all(artistId) as ArtStyle[]

  // v0.37 F2: 多画风开关关闭 → 只返回默认画风（排序最前的启用画风，上面已按 sort_order 排序）
  const artist = db.prepare(
    'SELECT multi_style_enabled FROM artists WHERE id = ?'
  ).get(artistId) as { multi_style_enabled: number } | undefined
  if (artist && !artist.multi_style_enabled) {
    styles = styles.slice(0, 1)
  }

  // 815 P-1: N+1 → 尺寸/增项/覆盖/引用图路径全部 IN 批量预取，内存分组组装
  const styleIds = styles.map(s => s.id)
  const sizesByStyle = new Map<number, StyleSize[]>()
  const styleAddonsByStyle = new Map<number, Array<{
    id: number; addon_template_id: number | null; price_override: number | null
    tpl_name: string; tpl_control_type: string; tpl_price_mode: string
    tpl_default_price: number; tpl_unit_label: string | null
    tpl_category: string; tpl_max_quantity: number | null
  }>>()
  const overridesBySize = new Map<number, SizeAddonOverride[]>()
  const allSizeRows: StyleSize[] = []

  if (styleIds.length > 0) {
    const stylePlaceholders = styleIds.map(() => '?').join(',')

    // v49 (REQ-036): 三态——closed 完全隐藏不返回；showcase 返回（带状态，前端禁「去约稿」）
    const sizeRows = db.prepare(
      `SELECT * FROM style_sizes
       WHERE art_style_id IN (${stylePlaceholders}) AND display_status != 'closed'
       ORDER BY art_style_id ASC, sort_order ASC`
    ).all(...styleIds) as StyleSize[]
    allSizeRows.push(...sizeRows)
    for (const size of sizeRows) {
      const list = sizesByStyle.get(size.art_style_id) ?? []
      list.push(size)
      sizesByStyle.set(size.art_style_id, list)
    }

    // 画风级增项（启用的；SPEC-PRICE-2 新维度；快照语义 v51：仅解绑行生效，绑定行以模板为权威）
    const addonRows = db.prepare(`
      SELECT sa.*,
             CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_name ELSE at.name END AS tpl_name,
             CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_control_type ELSE at.control_type END AS tpl_control_type,
             CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_price_mode ELSE at.price_mode END AS tpl_price_mode,
             CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_default_price ELSE at.default_price END AS tpl_default_price,
             CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_unit_label ELSE at.unit_label END AS tpl_unit_label,
             CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_category ELSE at.category END AS tpl_category,
             CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_max_quantity ELSE at.max_quantity END AS tpl_max_quantity
      FROM style_addons sa
      LEFT JOIN addon_templates at ON at.id = sa.addon_template_id
      WHERE sa.art_style_id IN (${stylePlaceholders}) AND sa.is_enabled = 1
      ORDER BY sa.art_style_id ASC, (sa.addon_template_id IS NOT NULL) DESC, at.sort_order ASC, sa.id ASC
    `).all(...styleIds) as Array<{
      id: number; art_style_id: number; addon_template_id: number | null; price_override: number | null
      tpl_name: string; tpl_control_type: string; tpl_price_mode: string
      tpl_default_price: number; tpl_unit_label: string | null
      tpl_category: string; tpl_max_quantity: number | null
    }>
    for (const addon of addonRows) {
      const list = styleAddonsByStyle.get(addon.art_style_id) ?? []
      list.push(addon)
      styleAddonsByStyle.set(addon.art_style_id, list)
    }
  }

  const allSizeIds = allSizeRows.map(s => s.id)
  if (allSizeIds.length > 0) {
    const sizePlaceholders = allSizeIds.map(() => '?').join(',')
    const overrideRows = db.prepare(
      `SELECT * FROM size_addon_overrides
       WHERE style_size_id IN (${sizePlaceholders})
       ORDER BY style_size_id ASC, id ASC`
    ).all(...allSizeIds) as SizeAddonOverride[]
    for (const override of overrideRows) {
      const list = overridesBySize.get(override.style_size_id) ?? []
      list.push(override)
      overridesBySize.set(override.style_size_id, list)
    }
  }

  const artworkPathMap = resolveArtworkImagePaths(allSizeRows.map(s => s.image_artwork_id))

  return styles.map(style => {
    const sizes = sizesByStyle.get(style.id) ?? []
    const styleAddons = styleAddonsByStyle.get(style.id) ?? []

    const publicSizes: PublicStyleSize[] = sizes.map(size => {
      // 该尺寸下的覆盖
      const overrides = overridesBySize.get(size.id) ?? []
      const overrideMap = new Map(overrides.map(o => [o.style_addon_id, o]))

      const addons: PublicStyleAddon[] = styleAddons
        .filter(sa => {
          const ov = overrideMap.get(sa.id)
          return !ov || !ov.is_hidden // 排除隐藏的
        })
        .map(sa => {
          const ov = overrideMap.get(sa.id)
          // 价格优先级：尺寸覆盖 > 画风覆盖 > 模板默认价
          const price = ov?.price_override ?? sa.price_override ?? sa.tpl_default_price

          return {
            id: sa.id,
            addon_template_id: sa.addon_template_id,
            name: sa.tpl_name,
            control_type: sa.tpl_control_type,
            price_mode: sa.tpl_price_mode,
            price,
            unit_label: sa.tpl_unit_label,
            is_enabled: true,
            category: sa.tpl_category,
            max_quantity: sa.tpl_max_quantity
          }
        })

      return {
        id: size.id,
        name: size.name,
        base_price: size.base_price,
        sort_order: size.sort_order,
        // v0.37 F1: 尺寸图（image_artwork_id 有值时解析出作品图路径——实时引用，作品删了字段自动置空）
        image: size.image,
        image_artwork_id: size.image_artwork_id,
        artwork_image_path: size.image_artwork_id != null ? (artworkPathMap.get(size.image_artwork_id) ?? null) : null,
        description: size.description,
        work_days: size.work_days,
        display_status: size.display_status,
        addons
      }
    })

    return {
      id: style.id,
      name: style.name,
      description: style.description,
      cover_image: style.cover_image,
      sort_order: style.sort_order,
      sizes: publicSizes
    }
  })
}
