import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { sanitizeStoredText } from '../../shared/sanitize.js'

// ============================================
// 多画风服务 - 增项库 / 画风 / 尺寸 / 覆盖 CRUD + 公开配置
// REQ-023 Phase 1
// ============================================

// SPEC-PRICE-2（v50）：增项两类控件 × 两种计价 × 三类别；radio/options 退役
const VALID_CONTROL_TYPES = ['switch', 'quantity'] as const
const VALID_PRICE_MODES = ['fixed', 'percent'] as const
const VALID_CATEGORIES = ['add', 'usage', 'rush'] as const
const VALID_DISPLAY_STATUS = ['available', 'showcase', 'closed'] as const

// ─── 增项库（addon_templates） ───

export interface AddonTemplate {
  id: number
  artist_id: number | null
  name: string
  control_type: string
  price_mode: string
  default_price: number
  unit_label: string | null
  sort_order: number
  // SPEC-PRICE-2：category add/usage/rush；max_quantity 数量型上限
  category: string
  max_quantity: number | null
  created_at: string
}

/** 获取画师的增项模板列表 */
export function getAddonTemplates(artistId: number): AddonTemplate[] {
  return db.prepare(
    'SELECT * FROM addon_templates WHERE artist_id = ? OR artist_id IS NULL ORDER BY sort_order ASC, id ASC'
  ).all(artistId) as AddonTemplate[]
}

/** 获取单个增项模板（含归属校验） */
export function getAddonTemplate(artistId: number, templateId: number): AddonTemplate {
  const tpl = db.prepare(
    'SELECT * FROM addon_templates WHERE id = ? AND (artist_id = ? OR artist_id IS NULL)'
  ).get(templateId, artistId) as AddonTemplate | undefined
  if (!tpl) throw new AppError(E.ADDON_TEMPLATE_NOT_FOUND, 404)
  return tpl
}

interface CreateAddonTemplateInput {
  name: string
  control_type?: string
  price_mode?: string
  default_price?: number
  unit_label?: string | null
  category?: string
  max_quantity?: number | null
}

/** 创建增项模板 */
export function createAddonTemplate(artistId: number, input: CreateAddonTemplateInput): AddonTemplate {
  if (!input.name || !input.name.trim()) throw new AppError(E.ADDON_TEMPLATE_NAME_EMPTY)
  const controlType = input.control_type || 'switch'
  if (!VALID_CONTROL_TYPES.includes(controlType as typeof VALID_CONTROL_TYPES[number])) {
    throw new AppError(E.ADDON_TEMPLATE_INVALID_CONTROL)
  }
  const priceMode = input.price_mode || 'fixed'
  if (!VALID_PRICE_MODES.includes(priceMode as typeof VALID_PRICE_MODES[number])) {
    throw new AppError(E.ADDON_TEMPLATE_INVALID_PRICING)
  }
  const defaultPrice = input.default_price ?? 0
  if (defaultPrice < 0) throw new AppError(E.ADDON_TEMPLATE_INVALID_PRICE)
  // SPEC-PRICE-2：percent 计价存整数百分比（50 = +50%）
  if (priceMode === 'percent' && (!Number.isInteger(defaultPrice) || defaultPrice > 1000)) {
    throw new AppError(E.VALIDATION, 400, { field: 'default_price', hint: '百分比须为 0-1000 的整数' })
  }
  // SPEC-PRICE-2：category 维度 + max_quantity 上限校验
  const category = input.category || 'add'
  if (!VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) throw new AppError(E.VALIDATION, 400, { field: 'category', hint: 'category 只能是 add/usage/rush' })
  // 用途/加急必须百分比计价（公式中它们是乘法因子）且只能是开关控件（下单时各选一个）
  if (category !== 'add') {
    if (priceMode !== 'percent') {
      throw new AppError(E.VALIDATION, 400, { field: 'price_mode', hint: '用途/加急增项必须选择百分比计价' })
    }
    if (controlType !== 'switch') {
      throw new AppError(E.VALIDATION, 400, { field: 'control_type', hint: '用途/加急增项只能使用开关控件（下单时各选一个）' })
    }
  }
  if (input.max_quantity != null && (!Number.isInteger(input.max_quantity) || input.max_quantity < 1 || input.max_quantity > 999)) {
    throw new AppError(E.VALIDATION, 400, { field: 'max_quantity', hint: '数量上限须为 1-999 的整数' })
  }

  const maxOrder = (db.prepare(
    'SELECT MAX(sort_order) AS m FROM addon_templates WHERE artist_id = ?'
  ).get(artistId) as { m: number | null }).m ?? -1

  const result = db.prepare(`
    INSERT INTO addon_templates (artist_id, name, control_type, price_mode, default_price, unit_label, sort_order, category, max_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    artistId,
    sanitizeStoredText(input.name).trim(),
    controlType,
    priceMode,
    defaultPrice,
    sanitizeStoredText(input.unit_label) || null,
    maxOrder + 1,
    category,
    input.max_quantity ?? null
  )

  return getAddonTemplate(artistId, Number(result.lastInsertRowid))
}

interface UpdateAddonTemplateFields {
  name?: string
  control_type?: string
  price_mode?: string
  default_price?: number
  unit_label?: string | null
  category?: string
  max_quantity?: number | null
}

/** 更新增项模板 */
export function updateAddonTemplate(artistId: number, templateId: number, fields: UpdateAddonTemplateFields): AddonTemplate {
  // F-1（P3-20）: 校验与写入同事务——任意后置校验抛错即整体回滚，杜绝先写后校验的半态
  return db.transaction(() => {
    const tpl = getAddonTemplate(artistId, templateId) // 归属校验
    // 系统预置模板（artist_id NULL）画师不可改（管理员后台维护）
    if (tpl.artist_id !== artistId) throw new AppError(E.ADDON_TEMPLATE_NOT_FOUND, 404)

    if (fields.name !== undefined) {
      if (!fields.name.trim()) throw new AppError(E.ADDON_TEMPLATE_NAME_EMPTY)
      db.prepare('UPDATE addon_templates SET name = ? WHERE id = ?').run(sanitizeStoredText(fields.name).trim(), templateId)
    }
    if (fields.control_type !== undefined) {
      if (!VALID_CONTROL_TYPES.includes(fields.control_type as typeof VALID_CONTROL_TYPES[number])) {
        throw new AppError(E.ADDON_TEMPLATE_INVALID_CONTROL)
      }
      db.prepare('UPDATE addon_templates SET control_type = ? WHERE id = ?').run(fields.control_type, templateId)
    }
    if (fields.price_mode !== undefined) {
      if (!VALID_PRICE_MODES.includes(fields.price_mode as typeof VALID_PRICE_MODES[number])) {
        throw new AppError(E.ADDON_TEMPLATE_INVALID_PRICING)
      }
      db.prepare('UPDATE addon_templates SET price_mode = ? WHERE id = ?').run(fields.price_mode, templateId)
    }
    if (fields.default_price !== undefined) {
      if (fields.default_price < 0) throw new AppError(E.ADDON_TEMPLATE_INVALID_PRICE)
      db.prepare('UPDATE addon_templates SET default_price = ? WHERE id = ?').run(fields.default_price, templateId)
    }
    if (fields.unit_label !== undefined) {
      db.prepare('UPDATE addon_templates SET unit_label = ? WHERE id = ?').run(sanitizeStoredText(fields.unit_label) || null, templateId)
    }
    if (fields.category !== undefined) {
      if (!VALID_CATEGORIES.includes(fields.category as typeof VALID_CATEGORIES[number])) throw new AppError(E.VALIDATION, 400, { field: 'category', hint: 'category 只能是 add/usage/rush' })
      db.prepare('UPDATE addon_templates SET category = ? WHERE id = ?').run(fields.category, templateId)
    }
    // SPEC-PRICE-2 组合约束：用途/加急必须百分比计价 + 开关控件（跨字段校验，读最新值）
    if (fields.category !== undefined || fields.price_mode !== undefined || fields.control_type !== undefined) {
      const now = db.prepare('SELECT category, price_mode, control_type FROM addon_templates WHERE id = ?').get(templateId) as { category: string; price_mode: string; control_type: string }
      if (now.category !== 'add' && now.price_mode !== 'percent') {
        throw new AppError(E.VALIDATION, 400, { field: 'price_mode', hint: '用途/加急增项必须选择百分比计价' })
      }
      if (now.category !== 'add' && now.control_type !== 'switch') {
        throw new AppError(E.VALIDATION, 400, { field: 'control_type', hint: '用途/加急增项只能使用开关控件（下单时各选一个）' })
      }
    }
    // percent 计价百分比范围校验
    if (fields.default_price !== undefined || fields.price_mode !== undefined) {
      const now = db.prepare('SELECT price_mode, default_price FROM addon_templates WHERE id = ?').get(templateId) as { price_mode: string; default_price: number }
      if (now.price_mode === 'percent' && (!Number.isInteger(now.default_price) || now.default_price > 1000)) {
        throw new AppError(E.VALIDATION, 400, { field: 'default_price', hint: '百分比须为 0-1000 的整数' })
      }
    }
    if (fields.max_quantity !== undefined) {
      if (fields.max_quantity != null && (!Number.isInteger(fields.max_quantity) || fields.max_quantity < 1 || fields.max_quantity > 999)) {
        throw new AppError(E.VALIDATION, 400, { field: 'max_quantity', hint: '数量上限须为 1-999 的整数' })
      }
      db.prepare('UPDATE addon_templates SET max_quantity = ? WHERE id = ?').run(fields.max_quantity ?? null, templateId)
    }

    return getAddonTemplate(artistId, templateId)
  })()
}

/**
 * 删除增项模板（REQ-036 C' 删除策略）
 * 被画风引用 → 快照模板数据到 style_addons 快照列 → 解绑（addon_template_id 置 NULL，保留独立增项）→ 删模板
 * 返回 referenced N：前端弹窗提示「有 N 个画风在用，删除后它们将保留为独立增项」
 */
export function deleteAddonTemplate(artistId: number, templateId: number): { deleted: boolean; referenced: number } {
  const tpl = getAddonTemplate(artistId, templateId) // 归属校验
  // 系统预置模板（artist_id NULL）画师不可删（管理员后台维护）
  if (tpl.artist_id !== artistId) throw new AppError(E.ADDON_TEMPLATE_NOT_FOUND, 404)
  const refs = db.prepare(
    'SELECT COUNT(*) AS c FROM style_addons WHERE addon_template_id = ?'
  ).get(templateId) as { c: number }
  if (refs.c > 0) {
    // 快照模板数据（解绑后独立增项保留名称/控件/价格/上限等展示数据；SPEC-PRICE-2 新维度）
    db.prepare(`
      UPDATE style_addons SET
        tpl_name = ?, tpl_control_type = ?, tpl_price_mode = ?, tpl_default_price = ?,
        tpl_unit_label = ?, tpl_category = ?, tpl_max_quantity = ?
      WHERE addon_template_id = ?
    `).run(
      sanitizeStoredText(tpl.name), tpl.control_type, tpl.price_mode, tpl.default_price,
      sanitizeStoredText(tpl.unit_label), tpl.category, tpl.max_quantity, templateId
    )
    // 解除引用（外键 ON DELETE SET NULL 双保险，此处显式置空保证快照一致性）
    db.prepare('UPDATE style_addons SET addon_template_id = NULL WHERE addon_template_id = ?').run(templateId)
  }
  db.prepare('DELETE FROM addon_templates WHERE id = ?').run(templateId)
  return { deleted: true, referenced: refs.c }
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
  // v49 (REQ-036): 尺寸三态 available/showcase/closed
  display_status: string
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

  return styles.map(style => {
    // v49 (REQ-036): 三态——closed 完全隐藏不返回；showcase 返回（带状态，前端禁「去约稿」）
    const sizes = db.prepare(
      "SELECT * FROM style_sizes WHERE art_style_id = ? AND display_status != 'closed' ORDER BY sort_order ASC"
    ).all(style.id) as StyleSize[]

    // 画风级增项（启用的；SPEC-PRICE-2 新维度；快照语义 v51：仅解绑行生效，绑定行以模板为权威）
    const styleAddons = db.prepare(`
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
      WHERE sa.art_style_id = ? AND sa.is_enabled = 1
      ORDER BY (sa.addon_template_id IS NOT NULL) DESC, at.sort_order ASC, sa.id ASC
    `).all(style.id) as Array<{
      id: number; addon_template_id: number | null; price_override: number | null
      tpl_name: string; tpl_control_type: string; tpl_price_mode: string
      tpl_default_price: number; tpl_unit_label: string | null
      tpl_category: string; tpl_max_quantity: number | null
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
        artwork_image_path: resolveArtworkImagePath(size.image_artwork_id),
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
