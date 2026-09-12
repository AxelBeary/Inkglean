import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { sanitizeStoredText } from '../../shared/sanitize.js'

// ============================================
// 增项库（addon_templates）CRUD — REQ-023 Phase 1 / SPEC-PRICE-2（v50）
// F-09 巨型文件拆分批·自 style.service.ts 纯搬移（原 10-13、16-215 行），代码体一字未改；
// 本域与画风/尺寸/覆盖域之间只有 SQL 表级关联、无函数互调，故可整体外提且无循环依赖。
// ============================================

// SPEC-PRICE-2（v50）：增项两类控件 × 两种计价 × 三类别；radio/options 退役
const VALID_CONTROL_TYPES = ['switch', 'quantity'] as const
const VALID_PRICE_MODES = ['fixed', 'percent'] as const
const VALID_CATEGORIES = ['add', 'usage', 'rush'] as const

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
