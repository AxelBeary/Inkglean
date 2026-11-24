import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { sanitizeStoredText } from '../../shared/sanitize.js'
import type { ArtStyle, StyleSize, SizeAddonOverride, SizeAddonOverrideBatchItem } from './style.types.js'
// F0192: saveAddonSettings 的模板级改价复用增项库域的 updateAddonTemplate（归属校验/percent 整数约束单点维护；
// addon-template 域不 import 本文件，无循环依赖，嵌套 db.transaction 由 better-sqlite3 自动降级 SAVEPOINT）
import { updateAddonTemplate } from './style.addon-template.service.js'

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

/**
 * 删除画风（级联删 sizes + style_addons + overrides）
 * SRV-12 修复：删除前校验在途订单引用，有则拒绝（防 FK ON DELETE SET NULL 导致订单丢尺寸关联）
 */
export function deleteArtStyle(artistId: number, styleId: number): { deleted: boolean } {
  getArtStyle(artistId, styleId) // 归属校验

  // SRV-12: 在途订单守卫 — 查引用该画风下任意尺寸的在途订单数
  const inTransitCount = (db.prepare(`
    SELECT COUNT(*) as c FROM orders
    WHERE artist_id = ? AND style_size_id IN (SELECT id FROM style_sizes WHERE art_style_id = ?)
      AND status NOT IN ('delivered', 'cancelled')
  `).get(artistId, styleId) as { c: number }).c
  if (inTransitCount > 0) {
    throw new AppError('STYLE_IN_USE', 409, { count: inTransitCount })
  }

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
  free_revisions?: number
}

/**
 * v81: 档位免费修改次数取值校验（0..99 整数，0 = 不限）
 * 路由 schema 已拦一遍，服务层兑底——本函数也被将来可能的批量/导入路径复用，
 * 不能把「合法值」这件事只托在 HTTP 层。
 */
function assertFreeRevisions(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 99) {
    throw new AppError(E.VALIDATION, 400, { field: 'free_revisions', hint: 'free_revisions 只能是 0..99 的整数（0 = 不限）' })
  }
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

  // v81: 未传 = 0（不限），与迁移默认值同义
  const freeRevisions = input.free_revisions ?? 0
  assertFreeRevisions(freeRevisions)

  const result = db.prepare(`
    INSERT INTO style_sizes (art_style_id, name, base_price, sort_order, image, image_artwork_id, description, work_days, display_status, free_revisions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    styleId, sanitizeStoredText(input.name).trim(), input.base_price, maxOrder + 1,
    img.image, img.image_artwork_id,
    sanitizeStoredText(input.description) || null, input.work_days ?? null,
    input.display_status && VALID_DISPLAY_STATUS.includes(input.display_status as typeof VALID_DISPLAY_STATUS[number]) ? input.display_status : 'available',
    freeRevisions
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
  free_revisions?: number
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
    // v81: 只改档位默认值——已下单订单的 free_revision_limit 是快照，不回头改
    if (fields.free_revisions !== undefined) {
      assertFreeRevisions(fields.free_revisions)
      db.prepare('UPDATE style_sizes SET free_revisions = ? WHERE id = ?').run(fields.free_revisions, sizeId)
    }

    return db.prepare('SELECT * FROM style_sizes WHERE id = ?').get(sizeId) as StyleSize
  })()
}

/**
 * 删除尺寸（级联删 size_addon_overrides）
 * SRV-12 修复：删除前校验在途订单引用，有则拒绝（防 FK ON DELETE SET NULL 导致订单丢尺寸关联）
 */
export function deleteStyleSize(artistId: number, styleId: number, sizeId: number): { deleted: boolean } {
  getStyleSize(artistId, styleId, sizeId) // 归属校验

  // SRV-12: 在途订单守卫 — 查引用该尺寸的在途订单数
  const inTransitCount = (db.prepare(`
    SELECT COUNT(*) as c FROM orders
    WHERE artist_id = ? AND style_size_id = ?
      AND status NOT IN ('delivered', 'cancelled')
  `).get(artistId, sizeId) as { c: number }).c
  if (inTransitCount > 0) {
    throw new AppError('STYLE_SIZE_IN_USE', 409, { count: inTransitCount })
  }

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

/**
 * 画风增项行字段写入共用 helper（F0192 抽出）——继承语义（price_override 传 null = 清覆盖跟随模板）单点维护。
 * 老端点 setStyleAddons 按模板 id 定位行后调用；新端点 saveAddonSettings 按行 id 定位后调用（孤儿行亦可），
 * 两条写入路径共用同一份字段落库逻辑，规则不漂移。
 */
function applyStyleAddonFields(
  styleId: number,
  addonTemplateId: number | null,
  rowId: number | undefined,
  fields: { is_enabled?: boolean; price_override?: number | null }
): void {
  if (rowId !== undefined) {
    // 更新（仅写传入字段；两者都缺省则零写入）
    const updates: string[] = []
    const params: unknown[] = []
    if (fields.is_enabled !== undefined) { updates.push('is_enabled = ?'); params.push(fields.is_enabled ? 1 : 0) }
    if (fields.price_override !== undefined) { updates.push('price_override = ?'); params.push(fields.price_override) }
    if (updates.length > 0) {
      params.push(rowId)
      db.prepare(`UPDATE style_addons SET ${updates.join(', ')} WHERE id = ?`).run(...params)
    }
  } else {
    // 新增（is_enabled 缺省 1；price_override ?? null = 继承模板）
    db.prepare(
      'INSERT INTO style_addons (art_style_id, addon_template_id, is_enabled, price_override) VALUES (?, ?, ?, ?)'
    ).run(
      styleId,
      addonTemplateId,
      fields.is_enabled !== undefined ? (fields.is_enabled ? 1 : 0) : 1,
      fields.price_override ?? null
    )
  }
}

/** 画风增项单行 upsert（按模板 id 定位；含模板归属校验）——F0192 自 setStyleAddons 循环体原样抽出，行为一字未改 */
function upsertStyleAddonRow(artistId: number, styleId: number, item: StyleAddonSetItem): void {
  // 验证模板属于该画师
  const tpl = db.prepare(
    'SELECT id FROM addon_templates WHERE id = ? AND (artist_id = ? OR artist_id IS NULL)'
  ).get(item.addon_template_id, artistId)
  if (!tpl) throw new AppError(E.ADDON_TEMPLATE_NOT_FOUND, 404, { templateId: item.addon_template_id })

  const existing = db.prepare(
    'SELECT id FROM style_addons WHERE art_style_id = ? AND addon_template_id = ?'
  ).get(styleId, item.addon_template_id) as { id: number } | undefined

  applyStyleAddonFields(styleId, item.addon_template_id, existing?.id, item)
}

/**
 * 批量设置画风增项（启用/禁用/改价）
 * F0192 deprecated（仅注释，契约原样保留）：增项设置弹窗的「一次保存」请改用 saveAddonSettings
 * （单事务全成全败 + 服务端互斥推导）；本端点仍是 ArtStyleManager 拖拽/新建挂载、
 * AddonImportDialog 整体导入等调用方的契约，不动。
 */
export function setStyleAddons(artistId: number, styleId: number, items: StyleAddonSetItem[]): StyleAddonWithTemplate[] {
  getArtStyle(artistId, styleId) // 画风归属校验

  const tx = db.transaction(() => {
    // F0192: 循环体原样抽到 upsertStyleAddonRow（与新端点共用写路径），行为一字未改
    for (const item of items) upsertStyleAddonRow(artistId, styleId, item)
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

/**
 * 读取画师全量尺寸覆盖（只读；画风管理页一次性预载用，替代 N 画风 × M 尺寸的逐对 GET）
 * 归属判定落在 art_styles.artist_id —— 只可能返回本画师数据，跨画师行不出现。
 * 固定一条 SQL，查询次数不随画风/尺寸/覆盖行数增长（N+1 从源头消掉）。
 */
export function getAllSizeOverrides(artistId: number): SizeAddonOverrideBatchItem[] {
  return db.prepare(`
    SELECT so.*, ss.art_style_id AS style_id
    FROM size_addon_overrides so
    JOIN style_sizes ss ON ss.id = so.style_size_id
    JOIN art_styles st ON st.id = ss.art_style_id
    WHERE st.artist_id = ?
    ORDER BY so.id ASC
  `).all(artistId) as SizeAddonOverrideBatchItem[]
}

/** 尺寸覆盖单行 upsert（含 style_addon 归属校验）——F0192 自 setSizeOverrides 循环体原样抽出，行为一字未改 */
function upsertSizeOverrideRow(styleId: number, sizeId: number, item: OverrideSetItem): void {
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

/**
 * 设置尺寸覆盖（price_override / is_hidden）
 * F0192 deprecated（仅注释，契约原样保留）：增项设置弹窗的尺寸级改动已并入 saveAddonSettings；
 * 本端点仍是 ArtStyleManager 拖拽到池/拖入尺寸行的单行停用-启用路径的契约，不动。
 */
export function setSizeOverrides(artistId: number, styleId: number, sizeId: number, items: OverrideSetItem[]): SizeAddonOverride[] {
  getStyleSize(artistId, styleId, sizeId) // 尺寸归属校验

  const tx = db.transaction(() => {
    // F0192: 循环体原样抽到 upsertSizeOverrideRow（与新端点共用写路径），行为一字未改
    for (const item of items) upsertSizeOverrideRow(styleId, sizeId, item)
  })
  tx()

  return db.prepare(
    'SELECT * FROM size_addon_overrides WHERE style_size_id = ?'
  ).all(sizeId) as SizeAddonOverride[]
}

// ─── F0192: 增项「一次保存」事务端点（孤儿行口径已拍板＝服务端跳过模板级写入 + 告警，不 422 整批拒） ───

/** F0192「一次保存」payload —— 身份键 styleAddonId（style_addons 行 id），非施工图建议形状的 addonTemplateId：
 *  孤儿行 addon_template_id 为 null（模板已删、快照独立增项），靠模板 id 定位不到行（同画风可有多条孤儿行）；
 *  模板 id 一律由服务端从行内读取、不信前端回传（根治 F0190/F0191 的孤儿 null 被当 number 回传问题）。 */
export interface SaveAddonSettingsInput {
  styleAddonId: number
  /** 模板级本身价（scope=all 且模板价变更才带）；孤儿行带此项 → 服务端跳过模板级写入并告警（拍板口径） */
  templateDefaultPrice?: number
  /** 画风价覆盖；null = 清覆盖跟随模板（继承语义，与 setStyleAddons 同口径） */
  stylePriceOverride?: number | null
  /** 画风级激活；置 true 时服务端按库内 category 推导同类互斥停用（前端不传互斥项） */
  styleEnabled?: boolean
  /** 尺寸级覆盖（仅变更行；逐项校验 size 归属，非法即整体回滚） */
  sizeOverrides: Array<{ sizeId: number; priceOverride: number | null; isHidden: boolean }>
}

/** F0192 聚合返回：画风增项最新态 + 画师全量尺寸覆盖（一次保存可跨多尺寸，前端免二次拉取） */
export interface SaveAddonSettingsResult {
  addons: StyleAddonWithTemplate[]
  sizeOverrides: SizeAddonOverrideBatchItem[]
}

/**
 * F0192: 同类互斥推导（service 内共用 helper）——usage/rush 类打开时停用同画风同类其他启用行；add 类不互斥。
 * 类别一律读库：绑定行 = 模板 category、孤儿行 = 快照 tpl_category（复用 getStyleAddons 的 CASE 读模型，
 * 不另写第三份类别推导）。仅新端点调用；老端点 setStyleAddons 保持「前端显式传停用项」的既有契约不动。
 */
function disableMutexSiblingAddons(styleId: number, targetSaId: number): void {
  const rows = getStyleAddons(styleId)
  const target = rows.find(r => r.id === targetSaId)
  if (!target || target.template_category === 'add') return // add 类不互斥（usage/rush 才互斥）
  for (const other of rows) {
    if (other.id !== targetSaId && other.template_category === target.template_category && !!other.is_enabled) {
      db.prepare('UPDATE style_addons SET is_enabled = 0 WHERE id = ?').run(other.id)
    }
  }
}

/**
 * F0192: 增项设置「一次保存」——模板价 / 画风价覆盖 / 激活互斥 / 尺寸覆盖合并进单个 db.transaction，
 * 全成全败（替代前端对三类端点串行多次写导致的「部分生效无回滚」）。
 * 业务规则复用既有实现，不复制第三份：模板价走 updateAddonTemplate（归属校验 + percent 整数约束 +
 * 负价拒绝全在既有实现内）；行级写入走 applyStyleAddonFields / upsertSizeOverrideRow（老端点同调，
 * price_override=null=继承语义单点维护）；互斥按库内 category 推导（含孤儿行快照类别）。
 */
export function saveAddonSettings(artistId: number, styleId: number, input: SaveAddonSettingsInput): SaveAddonSettingsResult {
  getArtStyle(artistId, styleId) // 画风归属校验
  // 目标行定位（行 id 为键：孤儿行也有行 id；addon_template_id 以库内为准，不信前端）
  const target = db.prepare(
    'SELECT id, addon_template_id FROM style_addons WHERE id = ? AND art_style_id = ?'
  ).get(input.styleAddonId, styleId) as { id: number; addon_template_id: number | null } | undefined
  if (!target) throw new AppError(E.STYLE_ADDON_NOT_FOUND, 404, { styleAddonId: input.styleAddonId })

  return db.transaction(() => {
    // ── 模板级：本身价 ──
    if (input.templateDefaultPrice !== undefined) {
      if (target.addon_template_id == null) {
        // F0192 拍板口径：孤儿行无模板可改价 → 跳过模板级写入并告警，不 422 整批拒（其余层级照常生效）
        console.warn(`[F0192] 孤儿增项行（styleId=${styleId}, styleAddonId=${target.id}）无模板可改价，跳过模板级写入`)
      } else {
        // 复用 updateAddonTemplate：模板归属校验 + percent 整数约束 + 负价拒绝全在既有实现内
        updateAddonTemplate(artistId, target.addon_template_id, { default_price: input.templateDefaultPrice })
      }
    }

    // ── 画风级：价格覆盖（null=清覆盖继承）+ 激活开关（共用字段写入 helper，老端点同调） ──
    if (input.stylePriceOverride !== undefined || input.styleEnabled !== undefined) {
      applyStyleAddonFields(styleId, target.addon_template_id, target.id, {
        is_enabled: input.styleEnabled,
        price_override: input.stylePriceOverride
      })
    }
    if (input.styleEnabled) {
      // 同类互斥：服务端按库内 category 推导（usage/rush 互斥、add 不互斥；孤儿行按快照类别参与）
      disableMutexSiblingAddons(styleId, target.id)
    }

    // ── 尺寸级：覆盖 upsert（共用 helper；size 归属逐项校验，非法即整体回滚） ──
    for (const item of input.sizeOverrides) {
      const size = db.prepare(
        'SELECT id FROM style_sizes WHERE id = ? AND art_style_id = ?'
      ).get(item.sizeId, styleId)
      if (!size) throw new AppError(E.STYLE_SIZE_NOT_FOUND, 404, { sizeId: item.sizeId })
      upsertSizeOverrideRow(styleId, item.sizeId, {
        style_addon_id: target.id,
        price_override: item.priceOverride,
        is_hidden: item.isHidden
      })
    }

    // 聚合最新状态（复用既有只读 helper；sizeOverrides 取画师级批量版——单尺寸 getSizeOverrides 覆盖不了多尺寸一次保存）
    return { addons: getStyleAddons(styleId), sizeOverrides: getAllSizeOverrides(artistId) }
  })()
}
