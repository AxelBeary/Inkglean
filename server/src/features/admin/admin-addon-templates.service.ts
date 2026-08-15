import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import type { AddonTemplate } from '../pricing/style.service.js'

// ============================================
// 系统增项模板管理（815 第三批 I 路）
// 只处理 artist_id IS NULL 的系统级模板（全画师共用，画师侧不可改/删）。
// 语义（用户拍板 2026-08-15）：
//   - 冻结（默认，sync=false 或缺省）：改模板价格时先把旧模板价写入所有
//     引用该模板且 price_override 为 NULL 的 style_addons 行，再更新模板价；
//   - 同步（sync=true）：只更新模板价，不写任何 override（NULL 引用行自动跟随）；
//   - 画师改过价的行（price_override 非 NULL）两种模式下一律不碰；
//   - 删除：FK 为 ON DELETE SET NULL，先快照模板数据到引用行再删，快照列保留不丢数据。
// ============================================

const VALID_CONTROL_TYPES = ['switch', 'quantity'] as const
const VALID_PRICE_MODES = ['fixed', 'percent'] as const
const VALID_CATEGORIES = ['add', 'usage', 'rush'] as const

export interface SystemAddonTemplateRow extends AddonTemplate {
  /** 引用该模板的 style_addons 行数（删除确认文案用） */
  referenced: number
}

/** GET 系统模板列表（artist_id IS NULL），附引用计数 */
export function listSystemAddonTemplates(): SystemAddonTemplateRow[] {
  return db.prepare(`
    SELECT at.*, (
      SELECT COUNT(*) FROM style_addons sa WHERE sa.addon_template_id = at.id
    ) AS referenced
    FROM addon_templates at
    WHERE at.artist_id IS NULL
    ORDER BY at.sort_order ASC, at.id ASC
  `).all() as SystemAddonTemplateRow[]
}

/** 读取单个系统模板（仅 artist_id IS NULL；画师私有模板一律 404） */
export function getSystemAddonTemplate(templateId: number): AddonTemplate {
  const tpl = db.prepare(
    'SELECT * FROM addon_templates WHERE id = ? AND artist_id IS NULL'
  ).get(templateId) as AddonTemplate | undefined
  if (!tpl) throw new AppError(E.ADDON_TEMPLATE_NOT_FOUND, 404)
  return tpl
}

export interface CreateSystemAddonTemplateInput {
  name: string
  control_type?: string
  price_mode?: string
  default_price?: number
  unit_label?: string | null
  sort_order?: number
  category?: string
  max_quantity?: number | null
}

export interface UpdateSystemAddonTemplateFields extends CreateSystemAddonTemplateInput {
  /** true=同步（NULL 引用行跟随新价）；false/缺省=冻结（旧价写入 override） */
  sync?: boolean
}

function assertValidInput(input: {
  name: string
  control_type?: string
  price_mode?: string
  default_price?: number
  unit_label?: string | null
  sort_order?: number
  category?: string
  max_quantity?: number | null
}): {
  name: string
  controlType: string
  priceMode: string
  defaultPrice: number
  category: string
} {
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
  const category = input.category || 'add'
  if (!VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    throw new AppError(E.VALIDATION, 400, { field: 'category', hint: 'category 只能是 add/usage/rush' })
  }
  // 用途/加急必须百分比计价且只能是开关控件（下单时各选一个）
  if (category !== 'add') {
    if (priceMode !== 'percent') {
      throw new AppError(E.VALIDATION, 400, { field: 'price_mode', hint: '用途/加急增项必须选择百分比计价' })
    }
    if (controlType !== 'switch') {
      throw new AppError(E.VALIDATION, 400, { field: 'control_type', hint: '用途/加急增项只能使用开关控件（下单时各选一个）' })
    }
  }
  if (input.sort_order != null && (!Number.isInteger(input.sort_order) || input.sort_order < 0 || input.sort_order > 9999)) {
    throw new AppError(E.VALIDATION, 400, { field: 'sort_order', hint: '排序值须为 0-9999 的整数' })
  }
  if (input.max_quantity != null && (!Number.isInteger(input.max_quantity) || input.max_quantity < 1 || input.max_quantity > 999)) {
    throw new AppError(E.VALIDATION, 400, { field: 'max_quantity', hint: '数量上限须为 1-999 的整数' })
  }
  return { name: input.name.trim(), controlType, priceMode, defaultPrice, category }
}

/** POST 新建系统模板（artist_id 恒 NULL） */
export function createSystemAddonTemplate(input: CreateSystemAddonTemplateInput): AddonTemplate {
  const v = assertValidInput(input)
  const maxOrder = (db.prepare(
    'SELECT MAX(sort_order) AS m FROM addon_templates WHERE artist_id IS NULL'
  ).get() as { m: number | null }).m ?? -1
  const sortOrder = input.sort_order ?? maxOrder + 1

  const result = db.prepare(`
    INSERT INTO addon_templates (artist_id, name, control_type, price_mode, default_price, unit_label, sort_order, category, max_quantity)
    VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    v.name,
    v.controlType,
    v.priceMode,
    v.defaultPrice,
    input.unit_label || null,
    sortOrder,
    v.category,
    input.max_quantity ?? null
  )
  return getSystemAddonTemplate(Number(result.lastInsertRowid))
}

/**
 * PUT 更新系统模板（冻结/同步语义见文件头注释）
 * - sync !== true 且 default_price 变化：先把旧模板价写入 price_override 为 NULL 的引用行，再更新模板；
 * - 已覆盖行（price_override 非 NULL）两种模式都不碰；
 * - 不提供「解冻恢复跟随」（v1 无法区分冻结写入与画师自定义）。
 */
export function updateSystemAddonTemplate(
  templateId: number,
  fields: UpdateSystemAddonTemplateFields
): AddonTemplate {
  // F-1（P3-20）：校验与写入同事务，任意后置校验抛错即整体回滚
  return db.transaction(() => {
    const tpl = getSystemAddonTemplate(templateId)

    // ─── 冻结（默认）───
    if (fields.sync !== true && fields.default_price !== undefined && fields.default_price !== tpl.default_price) {
      db.prepare(
        'UPDATE style_addons SET price_override = ? WHERE addon_template_id = ? AND price_override IS NULL'
      ).run(tpl.default_price, templateId)
    }

    // ─── 字段更新 ───
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
      db.prepare('UPDATE addon_templates SET unit_label = ? WHERE id = ?').run(fields.unit_label || null, templateId)
    }
    if (fields.sort_order !== undefined) {
      if (!Number.isInteger(fields.sort_order) || fields.sort_order < 0 || fields.sort_order > 9999) {
        throw new AppError(E.VALIDATION, 400, { field: 'sort_order', hint: '排序值须为 0-9999 的整数' })
      }
      db.prepare('UPDATE addon_templates SET sort_order = ? WHERE id = ?').run(fields.sort_order, templateId)
    }
    if (fields.category !== undefined) {
      if (!VALID_CATEGORIES.includes(fields.category as typeof VALID_CATEGORIES[number])) {
        throw new AppError(E.VALIDATION, 400, { field: 'category', hint: 'category 只能是 add/usage/rush' })
      }
      db.prepare('UPDATE addon_templates SET category = ? WHERE id = ?').run(fields.category, templateId)
    }
    if (fields.max_quantity !== undefined) {
      if (fields.max_quantity != null && (!Number.isInteger(fields.max_quantity) || fields.max_quantity < 1 || fields.max_quantity > 999)) {
        throw new AppError(E.VALIDATION, 400, { field: 'max_quantity', hint: '数量上限须为 1-999 的整数' })
      }
      db.prepare('UPDATE addon_templates SET max_quantity = ? WHERE id = ?').run(fields.max_quantity ?? null, templateId)
    }

    // 组合约束：用途/加急必须百分比计价 + 开关控件（读最新值，跨字段校验）
    const now = db.prepare('SELECT category, price_mode, control_type, default_price FROM addon_templates WHERE id = ?').get(templateId) as {
      category: string
      price_mode: string
      control_type: string
      default_price: number
    }
    if (now.category !== 'add' && now.price_mode !== 'percent') {
      throw new AppError(E.VALIDATION, 400, { field: 'price_mode', hint: '用途/加急增项必须选择百分比计价' })
    }
    if (now.category !== 'add' && now.control_type !== 'switch') {
      throw new AppError(E.VALIDATION, 400, { field: 'control_type', hint: '用途/加急增项只能使用开关控件（下单时各选一个）' })
    }
    if (now.price_mode === 'percent' && (!Number.isInteger(now.default_price) || now.default_price > 1000)) {
      throw new AppError(E.VALIDATION, 400, { field: 'default_price', hint: '百分比须为 0-1000 的整数' })
    }

    return getSystemAddonTemplate(templateId)
  })()
}

/**
 * DELETE 删除系统模板（仅 artist_id IS NULL）
 * FK 为 ON DELETE SET NULL：先把模板快照写入引用行（保留独立增项的展示/计价数据），
 * 再显式解绑并删除。返回引用数供前端二次确认文案使用。
 */
export function deleteSystemAddonTemplate(templateId: number): { deleted: boolean; referenced: number } {
  const tpl = getSystemAddonTemplate(templateId) // 非系统模板一律 404
  const refs = db.prepare(
    'SELECT COUNT(*) AS c FROM style_addons WHERE addon_template_id = ?'
  ).get(templateId) as { c: number }
  if (refs.c > 0) {
    // 快照模板数据（解绑后独立增项保留名称/控件/价格/上限等展示数据）
    db.prepare(`
      UPDATE style_addons SET
        tpl_name = ?, tpl_control_type = ?, tpl_price_mode = ?, tpl_default_price = ?,
        tpl_unit_label = ?, tpl_category = ?, tpl_max_quantity = ?
      WHERE addon_template_id = ?
    `).run(
      tpl.name, tpl.control_type, tpl.price_mode, tpl.default_price,
      tpl.unit_label, tpl.category, tpl.max_quantity, templateId
    )
    // 显式解绑（外键 ON DELETE SET NULL 双保险，保证快照一致性）
    db.prepare('UPDATE style_addons SET addon_template_id = NULL WHERE addon_template_id = ?').run(templateId)
  }
  db.prepare('DELETE FROM addon_templates WHERE id = ?').run(templateId)
  return { deleted: true, referenced: refs.c }
}
