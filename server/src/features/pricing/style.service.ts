import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { sanitizeStoredText } from '../../shared/sanitize.js'
import type { ArtStyle, StyleSize, SizeAddonOverride } from './style.types.js'

// ============================================
// 多画风服务 - 增项库 / 画风 / 尺寸 / 覆盖 CRUD + 公开配置
// REQ-023 Phase 1
// ============================================

// ============================================
// F-09 巨型文件拆分批（2026-09-12）：本文件已按域拆出三块，均由此原样再导出——
//   增项库 → style.addon-template.service.ts；公开读模型 → style.public.service.ts；
//   共用行类型 ArtStyle / StyleSize / SizeAddonOverride → style.types.ts。
// 下游（style.routes.ts / pricing.routes.ts / admin.routes.ts / fastify.d.ts / 各测试）
// 的 import 路径与符号名一律不变。
// 留在本文件的是画风 / 尺寸 / 画风增项 / 尺寸覆盖四组 CRUD——它们彼此函数级互调构成同文件闭环，
// 强行再拆会引入跨文件循环 import，资金域不赌，故保留。
// ============================================

export * from './style.addon-template.service.js'
export * from './style.public.service.js'
export * from './style.types.js'

const VALID_DISPLAY_STATUS = ['available', 'showcase', 'closed'] as const

// ─── 画风（art_styles） ───

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
  `).run(artistId, sanitizeStoredText(input.name).trim(), sanitizeStoredText(input.description) || null, input.cover_image || null, maxOrder + 1)

  const styleId = Number(result.lastInsertRowid)

  const insAddon = db.prepare(
    'INSERT OR IGNORE INTO style_addons (art_style_id, addon_template_id, is_enabled, price_override) VALUES (?, ?, 1, NULL)'
  )

  // SPEC-PRICE-2：用途/加急是全局计价维度——新建画风无条件自动绑定
  //（画师私有 + 系统预置的 usage/rush 模板全绑，与 importAddons 开关无关）
  const multTemplates = db.prepare(
    "SELECT id FROM addon_templates WHERE (artist_id = ? OR artist_id IS NULL) AND category IN ('usage','rush') ORDER BY sort_order ASC"
  ).all(artistId) as Array<{ id: number }>
  for (const tpl of multTemplates) {
    insAddon.run(styleId, tpl.id)
  }

  // 从增项库一键导入（v49: 只导画师私有普通增项；系统预置模板由画师在「从已有挑选」中主动挂载）
  if (input.importAddons) {
    const templates = db.prepare(
      "SELECT id FROM addon_templates WHERE artist_id = ? AND category = 'add' ORDER BY sort_order ASC"
    ).all(artistId) as Array<{ id: number }>
    for (const tpl of templates) {
      insAddon.run(styleId, tpl.id)
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
  // F-1（P3-20）: 校验与写入同事务——任意后置校验抛错即整体回滚，杜绝先写后校验的半态
  return db.transaction(() => {
    getArtStyle(artistId, styleId) // 归属校验

    if (fields.name !== undefined) {
      if (!fields.name.trim()) throw new AppError(E.STYLE_NAME_EMPTY)
      db.prepare('UPDATE art_styles SET name = ? WHERE id = ?').run(sanitizeStoredText(fields.name).trim(), styleId)
    }
    if (fields.description !== undefined) {
      db.prepare('UPDATE art_styles SET description = ? WHERE id = ?').run(sanitizeStoredText(fields.description) || null, styleId)
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
  })()
}

/** 删除画风（级联删 sizes + style_addons + overrides） */
export function deleteArtStyle(artistId: number, styleId: number): { deleted: boolean } {
  getArtStyle(artistId, styleId) // 归属校验
  // 所有子表有 ON DELETE CASCADE
  db.prepare('DELETE FROM art_styles WHERE id = ?').run(styleId)
  return { deleted: true }
}

// ─── 尺寸（style_sizes） ───

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
  display_status?: string
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
    INSERT INTO style_sizes (art_style_id, name, base_price, sort_order, image, image_artwork_id, description, work_days, display_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    styleId, sanitizeStoredText(input.name).trim(), input.base_price, maxOrder + 1,
    img.image, img.image_artwork_id,
    sanitizeStoredText(input.description) || null, input.work_days ?? null,
    input.display_status && VALID_DISPLAY_STATUS.includes(input.display_status as typeof VALID_DISPLAY_STATUS[number]) ? input.display_status : 'available'
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
  display_status?: string
}

/** 更新尺寸 */
export function updateStyleSize(artistId: number, styleId: number, sizeId: number, fields: UpdateStyleSizeFields): StyleSize {
  // L-10（审计 九#2）: 校验与写入同事务（F-1 模式）——display_status 等后置校验失败
  // 整体回滚，杜绝「name 先落库、后校验失败返回 404」的半态更新
  return db.transaction(() => {
    getStyleSize(artistId, styleId, sizeId) // 归属校验

    if (fields.name !== undefined) {
      if (!fields.name.trim()) throw new AppError(E.STYLE_SIZE_NAME_EMPTY)
      db.prepare('UPDATE style_sizes SET name = ? WHERE id = ?').run(sanitizeStoredText(fields.name).trim(), sizeId)
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
      db.prepare('UPDATE style_sizes SET description = ? WHERE id = ?').run(sanitizeStoredText(fields.description) || null, sizeId)
    }
    if (fields.work_days !== undefined) {
      db.prepare('UPDATE style_sizes SET work_days = ? WHERE id = ?').run(fields.work_days, sizeId)
    }
    if (fields.display_status !== undefined) {
      if (!VALID_DISPLAY_STATUS.includes(fields.display_status as typeof VALID_DISPLAY_STATUS[number])) {
        throw new AppError(E.VALIDATION, 400, { field: 'display_status', hint: 'display_status 只能是 available/showcase/closed' })
      }
      db.prepare('UPDATE style_sizes SET display_status = ? WHERE id = ?').run(fields.display_status, sizeId)
    }

    return db.prepare('SELECT * FROM style_sizes WHERE id = ?').get(sizeId) as StyleSize
  })()
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
  addon_template_id: number | null
  is_enabled: number
  price_override: number | null
  // 嵌套模板信息（快照列兑底：解绑后的独立增项仍可展示/计价）
  template_name: string
  template_control_type: string
  template_price_mode: string
  template_default_price: number
  template_unit_label: string | null
  template_category: string
  template_max_quantity: number | null
  // v49 (REQ-036 C): 已解绑（独立增项，不再跟随库更新）——注释内撇号已省略避免转义
  detached: boolean
}

/** 获取画风下的增项列表（含模板信息）
 * 快照语义（v51）：快照列仅服务解绑行（addon_template_id IS NULL）；绑定行以模板为唯一权威 */
export function getStyleAddons(styleId: number): StyleAddonWithTemplate[] {
  return db.prepare(`
    SELECT sa.*,
           CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_name ELSE at.name END AS template_name,
           CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_control_type ELSE at.control_type END AS template_control_type,
           CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_price_mode ELSE at.price_mode END AS template_price_mode,
           CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_default_price ELSE at.default_price END AS template_default_price,
           CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_unit_label ELSE at.unit_label END AS template_unit_label,
           CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_category ELSE at.category END AS template_category,
           CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_max_quantity ELSE at.max_quantity END AS template_max_quantity,
           (sa.addon_template_id IS NULL) AS detached
    FROM style_addons sa
    LEFT JOIN addon_templates at ON at.id = sa.addon_template_id
    WHERE sa.art_style_id = ?
    ORDER BY (sa.addon_template_id IS NOT NULL) DESC, at.sort_order ASC, sa.id ASC
  `).all(styleId) as StyleAddonWithTemplate[]
}

interface StyleAddonSetItem {
  addon_template_id: number
  is_enabled?: boolean
  price_override?: number | null
}

/** 批量设置画风增项（启用/禁用/改价） */
export function setStyleAddons(artistId: number, styleId: number, items: StyleAddonSetItem[]): StyleAddonWithTemplate[] {
  getArtStyle(artistId, styleId) // 画风归属校验

  const tx = db.transaction(() => {
    for (const item of items) {
      // 验证模板属于该画师
      const tpl = db.prepare(
        'SELECT id FROM addon_templates WHERE id = ? AND (artist_id = ? OR artist_id IS NULL)'
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
        if (updates.length > 0) {
          params.push(existing.id)
          db.prepare(`UPDATE style_addons SET ${updates.join(', ')} WHERE id = ?`).run(...params)
        }
      } else {
        // 新增
        db.prepare(
          'INSERT INTO style_addons (art_style_id, addon_template_id, is_enabled, price_override) VALUES (?, ?, ?, ?)'
        ).run(
          styleId,
          item.addon_template_id,
          item.is_enabled !== undefined ? (item.is_enabled ? 1 : 0) : 1,
          item.price_override ?? null
        )
      }
    }
  })
  tx()

  return getStyleAddons(styleId)
}

/**
 * 移除画风增项（SPEC-PRICE-2：画风内移除 = 解绑，不动增项库）
 * 删除 style_addons 行；尺寸覆盖由外键 ON DELETE CASCADE 自动清
 */
export function removeStyleAddon(artistId: number, styleId: number, styleAddonId: number): { deleted: boolean } {
  getArtStyle(artistId, styleId) // 画风归属校验
  const sa = db.prepare(
    'SELECT id FROM style_addons WHERE id = ? AND art_style_id = ?'
  ).get(styleAddonId, styleId) as { id: number } | undefined
  if (!sa) throw new AppError(E.STYLE_ADDON_NOT_FOUND, 404, { styleAddonId })
  db.prepare('DELETE FROM style_addons WHERE id = ?').run(styleAddonId)
  return { deleted: true }
}

// ─── 尺寸覆盖（size_addon_overrides） ───

interface OverrideSetItem {
  style_addon_id: number
  price_override?: number | null
  is_hidden?: boolean
}

/** 读取尺寸覆盖列表（只读；前端预载用，替代 PUT 空 items 伪装读取） */
export function getSizeOverrides(artistId: number, styleId: number, sizeId: number): SizeAddonOverride[] {
  getStyleSize(artistId, styleId, sizeId) // 尺寸归属校验
  return db.prepare(
    'SELECT * FROM size_addon_overrides WHERE style_size_id = ?'
  ).all(sizeId) as SizeAddonOverride[]
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
