/**
 * 818-D「同信息再来一单」一期：回填选项解析与字段映射（纯函数，便于单测）
 *
 * 契约（用户拍板 2026-08-17）：
 * - 入口 query：/orders/new?from=<orderId>&fill=desc,style,note
 * - QQ/昵称无条件带上；描述/款式尺寸/备注按 fill 勾选；全部可改
 * - 新单从零：deadline/startDate/priority/收款/节点一律不带
 * - 备注只回填文字（备注时间线中非系统备注正文，系统备注如「改价」「0 元单」不带走）
 *
 * 819-J 二期：新增 refs——源单参考图走路径引用复用（不重新上传），数量按
 * MAX_IMAGE_COUNT 截断；源单无参考图时 refs 为空数组，由调用方提示降级。
 * 只复用客户参考图（source !== 'artist'）：画师加图属内部图库，客户追踪页不展示，
 * 若当作新单参考图提交会变成 source='client' 泄漏给客户。
 */
import { MAX_IMAGE_COUNT } from '../constants/upload'

/** 可回填字段白名单（819-J 二期：+refs 参考图） */
export const REORDER_FILL_KEYS = ['desc', 'style', 'note', 'refs']

/** 单条备注写入上限（后端 POST /artist/orders/:id/notes content maxLength=1000） */
export const REORDER_NOTE_MAX = 1000

/**
 * 解析 fill query（逗号分隔）→ Set；未知项/空值静默忽略
 * @param {string|undefined} fill
 * @returns {Set<string>}
 */
export function parseReorderFill(fill: string | undefined): Set<string> {
  const set = new Set<string>()
  if (!fill) return set
  for (const raw of String(fill).split(',')) {
    const key = raw.trim()
    if (REORDER_FILL_KEYS.includes(key)) set.add(key)
  }
  return set
}

/** 源单备注条目（回填只取正文与创建者） */
interface ReorderNote {
  created_by?: string | null
  content?: string | null
}

/** 源单参考图条目（保留原字段，缩略图与删除沿用上传链路） */
interface ReorderReference {
  file_path?: string | null
  source?: string | null
  [key: string]: unknown
}

/** 源单（再来一单回填所需的只读字段） */
interface ReorderSourceOrder {
  client_qq?: string | number | null
  client_name?: string | null
  description?: string | null
  style_size_id?: number | string | null
  notes?: ReorderNote[] | null
  references?: ReorderReference[] | null
}

/**
 * 源单备注时间线 → 可预填文字：
 * 只取非系统备注（created_by !== 'system'）且有正文的条目，按原时间升序换行合并，
 * 截断到 addNote 单条上限（避免提交被后端 400 拦下）。
 * @param {object|null|undefined} sourceOrder
 * @returns {string}
 */
export function buildReorderNoteText(sourceOrder: ReorderSourceOrder | null | undefined): string {
  const texts = (sourceOrder?.notes || [])
    .filter(n => n && n.created_by !== 'system' && n.content)
    .map(n => String(n.content).trim())
    .filter(Boolean)
  return texts.join('\n').slice(0, REORDER_NOTE_MAX)
}

/**
 * 源单参考图 → 可复用的路径引用（819-J 二期）
 * 只取客户参考图（source !== 'artist'）且有 file_path 的条目，按后端返回顺序截断到
 * maxCount（默认 MAX_IMAGE_COUNT）；
 * truncated=true 表示源单超出上限已被截断（调用方轻提示）。
 * 返回条目保留原字段（url/original_name/source 等），缩略图与删除沿用上传链路。
 * @param {object|null|undefined} sourceOrder
 * @param {number} [maxCount]
 * @returns {{ refs: Array<object>, truncated: boolean }}
 */
export function buildReorderRefs(sourceOrder: ReorderSourceOrder | null | undefined, maxCount: number = MAX_IMAGE_COUNT): { refs: ReorderReference[], truncated: boolean } {
  const cap = Number.isInteger(maxCount) && maxCount > 0 ? maxCount : MAX_IMAGE_COUNT
  const refs = (sourceOrder?.references || [])
    .filter(r => r && r.source !== 'artist' && String(r.file_path || '').trim())
    .map(r => ({ ...r, file_path: String(r.file_path).trim() }))
  return { refs: refs.slice(0, cap), truncated: refs.length > cap }
}

/**
 * 源单 → 文字字段预填（QQ/昵称必带；描述/备注按勾选）
 * @param {object|null|undefined} sourceOrder
 * @param {Set<string>|string|undefined} fill
 * @returns {{ clientQq: string, clientName: string, description: string, note: string }}
 */
export function buildReorderTextPrefill(sourceOrder: ReorderSourceOrder | null | undefined, fill: Set<string> | string | undefined): { clientQq: string, clientName: string, description: string, note: string } {
  const fillSet = fill instanceof Set ? fill : parseReorderFill(fill)
  return {
    clientQq: String(sourceOrder?.client_qq || '').trim(),
    clientName: String(sourceOrder?.client_name || '').trim(),
    description: fillSet.has('desc') ? String(sourceOrder?.description || '').trim() : '',
    note: fillSet.has('note') ? buildReorderNoteText(sourceOrder) : ''
  }
}

/** 画师公开画风列表条目（getPublicStyles 响应） */
interface ReorderStyleOption {
  id: number
  sizes?: { id: number | string }[] | null
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
export function findReorderStyleTarget(sourceOrder: ReorderSourceOrder | null | undefined, styles: ReorderStyleOption[] | null | undefined): { styleId: number, sizeId: number } | null {
  const sizeId = sourceOrder?.style_size_id
  if (sizeId == null || !Array.isArray(styles)) return null
  const style = styles.find(s => (s.sizes || []).some(sz => Number(sz.id) === Number(sizeId)))
  if (!style) return null
  return { styleId: style.id, sizeId: Number(sizeId) }
}
