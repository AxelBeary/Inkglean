import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'

// ============================================
// 多画风服务 - 增项库 / 画风 / 尺寸 / 覆盖 CRUD + 公开配置
// REQ-023 Phase 1
// ============================================

const VALID_CONTROL_TYPES = ['switch', 'quantity', 'radio'] as const
const VALID_PRICING_MODES = ['fixed', 'per_unit', 'per_option'] as const

// ─── 增项库（addon_templates） ───

export interface AddonTemplate {
  id: number
  artist_id: number
  name: string
  control_type: string
  pricing_mode: string
  default_price: number
  options: string | null
  unit_label: string | null
  sort_order: number
  created_at: string
}

/** 获取画师的增项模板列表 */
export function getAddonTemplates(artistId: number): AddonTemplate[] {
  return db.prepare(
    'SELECT * FROM addon_templates WHERE artist_id = ? ORDER BY sort_order ASC'
  ).all(artistId) as AddonTemplate[]
}

/** 获取单个增项模板（含归属校验） */
export function getAddonTemplate(artistId: number, templateId: number): AddonTemplate {
  const tpl = db.prepare(
    'SELECT * FROM addon_templates WHERE id = ? AND artist_id = ?'
  ).get(templateId, artistId) as AddonTemplate | undefined
  if (!tpl) throw new AppError(E.ADDON_TEMPLATE_NOT_FOUND, 404)
  return tpl
}

interface CreateAddonTemplateInput {
  name: string
  control_type?: string
  pricing_mode?: string
  default_price?: number
  options?: string | null
  unit_label?: string | null
}

/** 创建增项模板 */
export function createAddonTemplate(artistId: number, input: CreateAddonTemplateInput): AddonTemplate {
  if (!input.name || !input.name.trim()) throw new AppError(E.ADDON_TEMPLATE_NAME_EMPTY)
  const controlType = input.control_type || 'switch'
  if (!VALID_CONTROL_TYPES.includes(controlType as typeof VALID_CONTROL_TYPES[number])) {
    throw new AppError(E.ADDON_TEMPLATE_INVALID_CONTROL)
  }
  const pricingMode = input.pricing_mode || 'fixed'
  if (!VALID_PRICING_MODES.includes(pricingMode as typeof VALID_PRICING_MODES[number])) {
    throw new AppError(E.ADDON_TEMPLATE_INVALID_PRICING)
  }
  const defaultPrice = input.default_price ?? 0
  if (defaultPrice < 0) throw new AppError(E.ADDON_TEMPLATE_INVALID_PRICE)

  // radio 类型必须有 options
  if (controlType === 'radio' && !input.options) {
    throw new AppError(E.VALIDATION, 400, { field: 'options', hint: 'radio 类型必须提供选项列表' })
  }

  const maxOrder = (db.prepare(
    'SELECT MAX(sort_order) AS m FROM addon_templates WHERE artist_id = ?'
  ).get(artistId) as { m: number | null }).m ?? -1

  const result = db.prepare(`
    INSERT INTO addon_templates (artist_id, name, control_type, pricing_mode, default_price, options, unit_label, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    artistId,
    input.name.trim(),
    controlType,
    pricingMode,
    defaultPrice,
    input.options || null,
    input.unit_label || null,
    maxOrder + 1
  )

  return getAddonTemplate(artistId, Number(result.lastInsertRowid))
}

interface UpdateAddonTemplateFields {
  name?: string
  control_type?: string
  pricing_mode?: string
  default_price?: number
  options?: string | null
  unit_label?: string | null
}

/** 更新增项模板 */
export function updateAddonTemplate(artistId: number, templateId: number, fields: UpdateAddonTemplateFields): AddonTemplate {
  getAddonTemplate(artistId, templateId) // 归属校验

  if (fields.name !== undefined) {
    if (!fields.name.trim()) throw new AppError(E.ADDON_TEMPLATE_NAME_EMPTY)
    db.prepare('UPDATE addon_templates SET name = ? WHERE id = ?').run(fields.name.trim(), templateId)
  }
  if (fields.control_type !== undefined) {
    if (!VALID_CONTROL_TYPES.includes(fields.control_type as typeof VALID_CONTROL_TYPES[number])) {
      throw new AppError(E.ADDON_TEMPLATE_INVALID_CONTROL)
    }
    db.prepare('UPDATE addon_templates SET control_type = ? WHERE id = ?').run(fields.control_type, templateId)
  }
  if (fields.pricing_mode !== undefined) {
    if (!VALID_PRICING_MODES.includes(fields.pricing_mode as typeof VALID_PRICING_MODES[number])) {
      throw new AppError(E.ADDON_TEMPLATE_INVALID_PRICING)
    }
    db.prepare('UPDATE addon_templates SET pricing_mode = ? WHERE id = ?').run(fields.pricing_mode, templateId)
  }
  if (fields.default_price !== undefined) {
    if (fields.default_price < 0) throw new AppError(E.ADDON_TEMPLATE_INVALID_PRICE)
    db.prepare('UPDATE addon_templates SET default_price = ? WHERE id = ?').run(fields.default_price, templateId)
  }
  if (fields.options !== undefined) {
    db.prepare('UPDATE addon_templates SET options = ? WHERE id = ?').run(fields.options || null, templateId)
  }
  if (fields.unit_label !== undefined) {
    db.prepare('UPDATE addon_templates SET unit_label = ? WHERE id = ?').run(fields.unit_label || null, templateId)
  }

  return getAddonTemplate(artistId, templateId)
}

/** 删除增项模板（级联删 style_addons 引用） */
export function deleteAddonTemplate(artistId: number, templateId: number): { deleted: boolean } {
  getAddonTemplate(artistId, templateId) // 归属校验
  // style_addons 有 ON DELETE CASCADE，直接删模板即可
  db.prepare('DELETE FROM addon_templates WHERE id = ?').run(templateId)
  return { deleted: true }
}

// ─── 画风（art_styles） ───

export interface ArtStyle {
  id: number
  artist_id: number
  name: string
  description: string | null
  cover_image: string | null
  sort_order: number
  is_active: number
  created_at: string
}

export interface ArtStyleWithDetails extends ArtStyle {
  sizes: StyleSize[]
  addons: StyleAddonWithTemplate[]
}

/** 获取画师的画风列表（含 sizes + addons 嵌套） */
export function getArtStyles(artistId: number): ArtStyleWithDetails[] {
  const styles = db.prepare(
    'SELECT * FROM art_styles WHERE artist_id = ? ORDER BY sort_order ASC'
  ).all(artistId) as ArtStyle[]

  return styles.map(style => ({
    ...style,
    sizes: getStyleSizes(style.id),
    addons: getStyleAddons(style.id)
  }))
}

/** 获取单个画风（含归属校验） */
export function getArtStyle(artistId: number, styleId: number): ArtStyle {
  const style = db.prepare(
    'SELECT * FROM art_styles WHERE id = ? AND artist_id = ?'
  ).get(styleId, artistId) as ArtStyle | undefined
  if (!style) throw new AppError(E.STYLE_NOT_FOUND, 404)
  return style
}

interface CreateArtStyleInput {
  name: string
  description?: string | null
  cover_image?: string | null
  importAddons?: boolean
}

/** 新建画风（可选从增项库一键导入） */
export function createArtStyle(artistId: number, input: CreateArtStyleInput): ArtStyleWithDetails {
  if (!input.name || !input.name.trim()) throw new AppError(E.STYLE_NAME_EMPTY)
  // M1 修复：封面图路径校验（对照 avatar 写法）— 必须在 images/ 目录下，拒绝路径穿越
  if (input.cover_image && (String(input.cover_image).includes('..') || !String(input.cover_image).startsWith('images/'))) {
    throw new AppError(E.ILLEGAL_PATH)
  }

  const maxOrder = (db.prepare(
    'SELECT MAX(sort_order) AS m FROM art_styles WHERE artist_id = ?'
  ).get(artistId) as { m: number | null }).m ?? -1

  const result = db.prepare(`
    INSERT INTO art_styles (artist_id, name, description, cover_image, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(artistId, input.name.trim(), input.description || null, input.cover_image || null, maxOrder + 1)

  const styleId = Number(result.lastInsertRowid)

  // 从增项库一键导入
  if (input.importAddons) {
    const templates = db.prepare(
      'SELECT id FROM addon_templates WHERE artist_id = ? ORDER BY sort_order ASC'
    ).all(artistId) as Array<{ id: number }>
    const ins = db.prepare(
      'INSERT OR IGNORE INTO style_addons (art_style_id, addon_template_id, is_enabled, price_override) VALUES (?, ?, 1, NULL)'
    )
    for (const tpl of templates) {
      ins.run(styleId, tpl.id)
    }
  }

  return getArtStyleWithDetails(artistId, styleId)
}

/** 获取画风完整详情（含 sizes + addons） */
function getArtStyleWithDetails(artistId: number, styleId: number): ArtStyleWithDetails {
  const style = getArtStyle(artistId, styleId)
  return {
    ...style,
    sizes: getStyleSizes(styleId),
    addons: getStyleAddons(styleId)
  }
}

interface UpdateArtStyleFields {
  name?: string
  description?: string | null
  cover_image?: string | null
  sort_order?: number
  is_active?: boolean
}

/** 更新画风 */
export function updateArtStyle(artistId: number, styleId: number, fields: UpdateArtStyleFields): ArtStyleWithDetails {
  getArtStyle(artistId, styleId) // 归属校验

  if (fields.name !== undefined) {
    if (!fields.name.trim()) throw new AppError(E.STYLE_NAME_EMPTY)
    db.prepare('UPDATE art_styles SET name = ? WHERE id = ?').run(fields.name.trim(), styleId)
  }
  if (fields.description !== undefined) {
    db.prepare('UPDATE art_styles SET description = ? WHERE id = ?').run(fields.description || null, styleId)
  }
  if (fields.cover_image !== undefined) {
    // M1 修复：封面图路径校验（对照 avatar 写法）— 必须在 images/ 目录下，拒绝路径穿越
    if (fields.cover_image && (String(fields.cover_image).includes('..') || !String(fields.cover_image).startsWith('images/'))) {
      throw new AppError(E.ILLEGAL_PATH)
    }
    db.prepare('UPDATE art_styles SET cover_image = ? WHERE id = ?').run(fields.cover_image || null, styleId)
  }
  if (fields.sort_order !== undefined) {
    db.prepare('UPDATE art_styles SET sort_order = ? WHERE id = ?').run(fields.sort_order, styleId)
  }
  if (fields.is_active !== undefined) {
    db.prepare('UPDATE art_styles SET is_active = ? WHERE id = ?').run(fields.is_active ? 1 : 0, styleId)
  }

  return getArtStyleWithDetails(artistId, styleId)
}

/** 删除画风（级联删 sizes + style_addons + overrides） */
export function deleteArtStyle(artistId: number, styleId: number): { deleted: boolean } {
  getArtStyle(artistId, styleId) // 归属校验
  // 所有子表有 ON DELETE CASCADE
  db.prepare('DELETE FROM art_styles WHERE id = ?').run(styleId)
  return { deleted: true }
}

// ─── 尺寸（style_sizes） ───

export interface StyleSize {
  id: number
  art_style_id: number
  name: string
  base_price: number
  sort_order: number
  // v0.37 (REQ-024 F1): 尺寸带图/描述/天数
  image: string | null
  image_artwork_id: number | null
  description: string | null
  work_days: number | null
}

/** 获取画风下的尺寸列表 */
export function getStyleSizes(styleId: number): StyleSize[] {
  return db.prepare(
    'SELECT * FROM style_sizes WHERE art_style_id = ? ORDER BY sort_order ASC'
  ).all(styleId) as StyleSize[]
}

/** 获取单个尺寸（含画风归属校验） */
function getStyleSize(artistId: number, styleId: number, sizeId: number): StyleSize {
  getArtStyle(artistId, styleId) // 画风归属校验
  const size = db.prepare(
    'SELECT * FROM style_sizes WHERE id = ? AND art_style_id = ?'
  ).get(sizeId, styleId) as StyleSize | undefined
  if (!size) throw new AppError(E.STYLE_SIZE_NOT_FOUND, 404)
  return size
}

interface CreateStyleSizeInput {
  name: string
  base_price: number
  image?: string | null
  image_artwork_id?: number | null
  description?: string | null
  work_days?: number | null
}

/**
 * 尺寸图片字段校验（v0.37 F1）
 * - image: 独立上传路径，必须在 images/{artistId}/ 下（防路径穿越）
 * - image_artwork_id: 从作品集挑，必须属于该画师
 * 两字段互斥：一个有值时另一个清 null（渲染优先级由前端按 image_artwork_id 判断）
 */
function validateSizeImageFields(
  artistId: number,
  fields: { image?: string | null; image_artwork_id?: number | null }
): { image: string | null; image_artwork_id: number | null } {
  let image: string | null = null
  let imageArtworkId: number | null = null

  if (fields.image_artwork_id != null) {
    const artwork = db.prepare(
      'SELECT id FROM artworks WHERE id = ? AND artist_id = ?'
    ).get(fields.image_artwork_id, artistId)
    if (!artwork) throw new AppError(E.ARTWORK_NOT_FOUND, 404)
    imageArtworkId = fields.image_artwork_id
  } else if (fields.image != null) {
    if (fields.image && (String(fields.image).includes('..') || !String(fields.image).startsWith(`images/${artistId}/`))) {
      throw new AppError(E.ILLEGAL_PATH)
    }
    image = fields.image || null
  }

  return { image, image_artwork_id: imageArtworkId }
}

/** 添加尺寸 */
export function createStyleSize(artistId: number, styleId: number, input: CreateStyleSizeInput): StyleSize {
  getArtStyle(artistId, styleId) // 画风归属校验
  if (!input.name || !input.name.trim()) throw new AppError(E.STYLE_SIZE_NAME_EMPTY)
  if (input.base_price == null || input.base_price < 0) throw new AppError(E.STYLE_SIZE_INVALID_PRICE)

  // v0.37 F1: 图片字段（image_artwork_id 优先于 image）
  const hasImageInput = input.image !== undefined || input.image_artwork_id !== undefined
  const img = hasImageInput
    ? validateSizeImageFields(artistId, {
        image_artwork_id: input.image_artwork_id ?? undefined,
        image: input.image ?? undefined
      })
    : { image: null, image_artwork_id: null }

  const maxOrder = (db.prepare(
    'SELECT MAX(sort_order) AS m FROM style_sizes WHERE art_style_id = ?'
  ).get(styleId) as { m: number | null }).m ?? -1

  const result = db.prepare(`
    INSERT INTO style_sizes (art_style_id, name, base_price, sort_order, image, image_artwork_id, description, work_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    styleId, input.name.trim(), input.base_price, maxOrder + 1,
    img.image, img.image_artwork_id,
    input.description || null, input.work_days ?? null
  )

  return db.prepare('SELECT * FROM style_sizes WHERE id = ?').get(Number(result.lastInsertRowid)) as StyleSize
}

interface UpdateStyleSizeFields {
  name?: string
  base_price?: number
  sort_order?: number
  image?: string | null
  image_artwork_id?: number | null
  description?: string | null
  work_days?: number | null
}

/** 更新尺寸 */
export function updateStyleSize(artistId: number, styleId: number, sizeId: number, fields: UpdateStyleSizeFields): StyleSize {
  getStyleSize(artistId, styleId, sizeId) // 归属校验

  if (fields.name !== undefined) {
    if (!fields.name.trim()) throw new AppError(E.STYLE_SIZE_NAME_EMPTY)
    db.prepare('UPDATE style_sizes SET name = ? WHERE id = ?').run(fields.name.trim(), sizeId)
  }
  if (fields.base_price !== undefined) {
    if (fields.base_price < 0) throw new AppError(E.STYLE_SIZE_INVALID_PRICE)
    db.prepare('UPDATE style_sizes SET base_price = ? WHERE id = ?').run(fields.base_price, sizeId)
  }
  if (fields.sort_order !== undefined) {
    db.prepare('UPDATE style_sizes SET sort_order = ? WHERE id = ?').run(fields.sort_order, sizeId)
  }
  // v0.37 F1: 图片字段 — 任一传入即整组重算（image_artwork_id 优先，另一个清空）
  if (fields.image !== undefined || fields.image_artwork_id !== undefined) {
    const img = validateSizeImageFields(artistId, {
      image_artwork_id: fields.image_artwork_id ?? undefined,
      image: fields.image ?? undefined
    })
    db.prepare('UPDATE style_sizes SET image = ?, image_artwork_id = ? WHERE id = ?')
      .run(img.image, img.image_artwork_id, sizeId)
  }
  if (fields.description !== undefined) {
    db.prepare('UPDATE style_sizes SET description = ? WHERE id = ?').run(fields.description || null, sizeId)
  }
  if (fields.work_days !== undefined) {
    db.prepare('UPDATE style_sizes SET work_days = ? WHERE id = ?').run(fields.work_days, sizeId)
  }

  return db.prepare('SELECT * FROM style_sizes WHERE id = ?').get(sizeId) as StyleSize
}

/** 删除尺寸（级联删 size_addon_overrides） */
export function deleteStyleSize(artistId: number, styleId: number, sizeId: number): { deleted: boolean } {
  getStyleSize(artistId, styleId, sizeId) // 归属校验
  db.prepare('DELETE FROM style_sizes WHERE id = ?').run(sizeId)
  return { deleted: true }
}

// ─── 画风增项（style_addons） ───

export interface StyleAddonWithTemplate {
  id: number
  art_style_id: number
  addon_template_id: number
  is_enabled: number
  price_override: number | null
  options_override: string | null
  // 嵌套模板信息
  template_name: string
  template_control_type: string
  template_pricing_mode: string
  template_default_price: number
  template_options: string | null
  template_unit_label: string | null
}

/** 获取画风下的增项列表（含模板信息） */
export function getStyleAddons(styleId: number): StyleAddonWithTemplate[] {
  return db.prepare(`
    SELECT sa.*, at.name AS template_name, at.control_type AS template_control_type,
           at.pricing_mode AS template_pricing_mode, at.default_price AS template_default_price,
           at.options AS template_options, at.unit_label AS template_unit_label
    FROM style_addons sa
    JOIN addon_templates at ON at.id = sa.addon_template_id
    WHERE sa.art_style_id = ?
    ORDER BY at.sort_order ASC
  `).all(styleId) as StyleAddonWithTemplate[]
}

interface StyleAddonSetItem {
  addon_template_id: number
  is_enabled?: boolean
  price_override?: number | null
  options_override?: string | null
}

/** 批量设置画风增项（启用/禁用/改价） */
export function setStyleAddons(artistId: number, styleId: number, items: StyleAddonSetItem[]): StyleAddonWithTemplate[] {
  getArtStyle(artistId, styleId) // 画风归属校验

  const tx = db.transaction(() => {
    for (const item of items) {
      // 验证模板属于该画师
      const tpl = db.prepare(
        'SELECT id FROM addon_templates WHERE id = ? AND artist_id = ?'
      ).get(item.addon_template_id, artistId)
      if (!tpl) throw new AppError(E.ADDON_TEMPLATE_NOT_FOUND, 404, { templateId: item.addon_template_id })

      const existing = db.prepare(
        'SELECT id FROM style_addons WHERE art_style_id = ? AND addon_template_id = ?'
      ).get(styleId, item.addon_template_id) as { id: number } | undefined

      if (existing) {
        // 更新
        const updates: string[] = []
        const params: unknown[] = []
        if (item.is_enabled !== undefined) { updates.push('is_enabled = ?'); params.push(item.is_enabled ? 1 : 0) }
        if (item.price_override !== undefined) { updates.push('price_override = ?'); params.push(item.price_override) }
        if (item.options_override !== undefined) { updates.push('options_override = ?'); params.push(item.options_override) }
        if (updates.length > 0) {
          params.push(existing.id)
          db.prepare(`UPDATE style_addons SET ${updates.join(', ')} WHERE id = ?`).run(...params)
        }
      } else {
        // 新增
        db.prepare(
          'INSERT INTO style_addons (art_style_id, addon_template_id, is_enabled, price_override, options_override) VALUES (?, ?, ?, ?, ?)'
        ).run(
          styleId,
          item.addon_template_id,
          item.is_enabled !== undefined ? (item.is_enabled ? 1 : 0) : 1,
          item.price_override ?? null,
          item.options_override ?? null
        )
      }
    }
  })
  tx()

  return getStyleAddons(styleId)
}

// ─── 尺寸覆盖（size_addon_overrides） ───

export interface SizeAddonOverride {
  id: number
  style_size_id: number
  style_addon_id: number
  price_override: number | null
  is_hidden: number
}

interface OverrideSetItem {
  style_addon_id: number
  price_override?: number | null
  is_hidden?: boolean
}

/** 设置尺寸覆盖（price_override / is_hidden） */
export function setSizeOverrides(artistId: number, styleId: number, sizeId: number, items: OverrideSetItem[]): SizeAddonOverride[] {
  getStyleSize(artistId, styleId, sizeId) // 尺寸归属校验

  const tx = db.transaction(() => {
    for (const item of items) {
      // 验证 style_addon 属于该画风
      const sa = db.prepare(
        'SELECT id FROM style_addons WHERE id = ? AND art_style_id = ?'
      ).get(item.style_addon_id, styleId)
      if (!sa) throw new AppError(E.STYLE_ADDON_NOT_FOUND, 404, { styleAddonId: item.style_addon_id })

      const existing = db.prepare(
        'SELECT id FROM size_addon_overrides WHERE style_size_id = ? AND style_addon_id = ?'
      ).get(sizeId, item.style_addon_id) as { id: number } | undefined

      if (existing) {
        const updates: string[] = []
        const params: unknown[] = []
        if (item.price_override !== undefined) { updates.push('price_override = ?'); params.push(item.price_override) }
        if (item.is_hidden !== undefined) { updates.push('is_hidden = ?'); params.push(item.is_hidden ? 1 : 0) }
        if (updates.length > 0) {
          params.push(existing.id)
          db.prepare(`UPDATE size_addon_overrides SET ${updates.join(', ')} WHERE id = ?`).run(...params)
        }
      } else {
        db.prepare(
          'INSERT INTO size_addon_overrides (style_size_id, style_addon_id, price_override, is_hidden) VALUES (?, ?, ?, ?)'
        ).run(
          sizeId,
          item.style_addon_id,
          item.price_override ?? null,
          item.is_hidden ? 1 : 0
        )
      }
    }
  })
  tx()

  return db.prepare(
    'SELECT * FROM size_addon_overrides WHERE style_size_id = ?'
  ).all(sizeId) as SizeAddonOverride[]
}

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
  const filterSizes: PublicGallerySize[] = []
  const visibleSizeMap = new Map<number, PublicGalleryTag>()
  for (const style of styles) {
    const sizes = db.prepare(
      'SELECT id, name, sort_order FROM style_sizes WHERE art_style_id = ? ORDER BY sort_order ASC'
    ).all(style.id) as Array<{ id: number; name: string; sort_order: number }>
    for (const size of sizes) {
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

  const tagStmt = db.prepare(
    'SELECT style_size_id FROM artwork_size_tags WHERE artwork_id = ?'
  )
  const artworks: PublicGalleryArtwork[] = rows.map(row => {
    const tagRows = tagStmt.all(row.id) as Array<{ style_size_id: number }>
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

/** 解析作品引用图路径（v0.37 F1：image_artwork_id → artworks.image_path 实时引用） */
function resolveArtworkImagePath(artworkId: number | null): string | null {
  if (artworkId == null) return null
  const row = db.prepare('SELECT image_path FROM artworks WHERE id = ?').get(artworkId) as { image_path: string } | undefined
  return row?.image_path ?? null
}

export interface PublicStyleAddon {
  id: number
  addon_template_id: number
  name: string
  control_type: string
  pricing_mode: string
  price: number
  options: string | null
  unit_label: string | null
  is_enabled: boolean
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

  return styles.map(style => {
    const sizes = db.prepare(
      'SELECT * FROM style_sizes WHERE art_style_id = ? ORDER BY sort_order ASC'
    ).all(style.id) as StyleSize[]

    // 画风级增项（启用的）
    const styleAddons = db.prepare(`
      SELECT sa.*, at.name AS tpl_name, at.control_type AS tpl_control_type,
             at.pricing_mode AS tpl_pricing_mode, at.default_price AS tpl_default_price,
             at.options AS tpl_options, at.unit_label AS tpl_unit_label
      FROM style_addons sa
      JOIN addon_templates at ON at.id = sa.addon_template_id
      WHERE sa.art_style_id = ? AND sa.is_enabled = 1
      ORDER BY at.sort_order ASC
    `).all(style.id) as Array<{
      id: number; addon_template_id: number; price_override: number | null; options_override: string | null
      tpl_name: string; tpl_control_type: string; tpl_pricing_mode: string
      tpl_default_price: number; tpl_options: string | null; tpl_unit_label: string | null
    }>

    const publicSizes: PublicStyleSize[] = sizes.map(size => {
      // 该尺寸下的覆盖
      const overrides = db.prepare(
        'SELECT * FROM size_addon_overrides WHERE style_size_id = ?'
      ).all(size.id) as SizeAddonOverride[]
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
          // 选项：画风覆盖 > 模板默认
          const options = sa.options_override ?? sa.tpl_options

          return {
            id: sa.id,
            addon_template_id: sa.addon_template_id,
            name: sa.tpl_name,
            control_type: sa.tpl_control_type,
            pricing_mode: sa.tpl_pricing_mode,
            price,
            options,
            unit_label: sa.tpl_unit_label,
            is_enabled: true
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
        artwork_image_path: resolveArtworkImagePath(size.image_artwork_id),
        description: size.description,
        work_days: size.work_days,
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
