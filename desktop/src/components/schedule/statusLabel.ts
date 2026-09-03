// 排期状态文案与色调映射（9/4 主页重设计落码波1）：云端七态 + 本地四态一个不漏，未知状态落原串不炸。
// 独立成模块的原因：组件与哨兵测试必须**同源 import**——测试自己抄一份表就等于自我循环，
// 被测件改词/漏态时测试照绿（9/4 收口啄虫查出的重要-3，已修）。
// 色调走原型 .q-st.hq / .q-st.th / .q-st.sl / .q-st.buf 四档纸签色。

/** 状态 → 中文文案 */
export const STATUS_LABEL: Record<string, string> = {
  // 云端七态（OrderStatus）
  pending: '待确认',
  confirmed: '已确认',
  wip: '进行中',
  revision: '修改中',
  done: '已完成',
  delivered: '已交付',
  cancelled: '已取消',
  // 本地四态（LocalOrderStatus；delivered 与云端同名同义，不重复登记）
  draft: '草稿',
  in_progress: '进行中',
  paid: '已收款'
}

/** 状态 → 纸签色调 */
export const STATUS_TONE: Record<string, string> = {
  pending: 'th',
  confirmed: 'hq',
  wip: 'hq',
  revision: 'th',
  done: 'sl',
  delivered: 'sl',
  cancelled: 'buf',
  draft: 'th',
  in_progress: 'hq',
  paid: 'sl'
}

/** 全集（云端七态 + 本地四态，delivered 两模式同名故共 10 项）：哨兵测试逐条断言用，
 *  将来后端或记账加态而漏登记时，测试会红而不是静默落原串 */
export const KNOWN_STATUSES: readonly string[] = [
  'pending', 'confirmed', 'wip', 'revision', 'done', 'delivered', 'cancelled',
  'draft', 'in_progress', 'paid'
]

export function statusLabel(s: string): string {
  return STATUS_LABEL[s] ?? s
}

export function statusTone(s: string): string {
  return STATUS_TONE[s] ?? 'hq'
}
