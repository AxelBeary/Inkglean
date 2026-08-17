/**
 * 818-D「同信息再来一单」一期：回填选项解析与字段映射（纯函数，便于单测）
 *
 * 契约（用户拍板 2026-08-17）：
 * - 入口 query：/orders/new?from=<orderId>&fill=desc,style,note
 * - QQ/昵称无条件带上；描述/款式尺寸/备注按 fill 勾选；全部可改
 * - 新单从零：deadline/startDate/priority/收款/节点一律不带
 * - 备注只回填文字（备注时间线中非系统备注正文，系统备注如「改价」「0 元单」不带走）
 */

/** 可回填字段白名单（一期：参考图二期再做，不放选项） */
export const REORDER_FILL_KEYS = ['desc', 'style', 'note']

/** 单条备注写入上限（后端 POST /artist/orders/:id/notes content maxLength=1000） */
export const REORDER_NOTE_MAX = 1000

/**
 * 解析 fill query（逗号分隔）→ Set；未知项/空值静默忽略
 * @param {string|undefined} fill
 * @returns {Set<string>}
 */
export function parseReorderFill(fill) {
  const set = new Set()
  if (!fill) return set
  for (const raw of String(fill).split(',')) {
    const key = raw.trim()
    if (REORDER_FILL_KEYS.includes(key)) set.add(key)
  }
  return set
}

/**
 * 源单备注时间线 → 可预填文字：
 * 只取非系统备注（created_by !== 'system'）且有正文的条目，按原时间升序换行合并，
 * 截断到 addNote 单条上限（避免提交被后端 400 拦下）。
 * @param {object|null|undefined} sourceOrder
 * @returns {string}
 */
export function buildReorderNoteText(sourceOrder) {
  const texts = (sourceOrder?.notes || [])
    .filter(n => n && n.created_by !== 'system' && n.content)
    .map(n => String(n.content).trim())
    .filter(Boolean)
  return texts.join('\n').slice(0, REORDER_NOTE_MAX)
}

/**
 * 源单 → 文字字段预填（QQ/昵称必带；描述/备注按勾选）
 * @param {object|null|undefined} sourceOrder
 * @param {Set<string>|string|undefined} fill
 * @returns {{ clientQq: string, clientName: string, description: string, note: string }}
 */
export function buildReorderTextPrefill(sourceOrder, fill) {
  const fillSet = fill instanceof Set ? fill : parseReorderFill(fill)
  return {
    clientQq: String(sourceOrder?.client_qq || '').trim(),
    clientName: String(sourceOrder?.client_name || '').trim(),
    description: fillSet.has('desc') ? String(sourceOrder?.description || '').trim() : '',
    note: fillSet.has('note') ? buildReorderNoteText(sourceOrder) : ''
  }
}

/**
 * 款式尺寸预填目标：源单 style_size_id 在当前画师画风列表仍存在时返回
 * { styleId, sizeId }，否则 null（降级只回填描述类）。
 * 说明：画师端订单详情接口只回 style_size_id，不含结构化增项选择，
 * 因此一期只回填尺寸，增项/用途/加急留给画师重选。
 * @param {object|null|undefined} sourceOrder
 * @param {Array<object>} styles 画师公开画风列表（getPublicStyles 响应）
 * @returns {{ styleId: number, sizeId: number }|null}
 */
export function findReorderStyleTarget(sourceOrder, styles) {
  const sizeId = sourceOrder?.style_size_id
  if (sizeId == null || !Array.isArray(styles)) return null
  const style = styles.find(s => (s.sizes || []).some(sz => Number(sz.id) === Number(sizeId)))
  if (!style) return null
  return { styleId: style.id, sizeId: Number(sizeId) }
}
