/**
 * P2-B: 订单相关公共常量
 * 状态/优先级映射抽到一处，避免在 6 个文件里重复
 */

/** 订单状态 → Element Plus tag type */
export const ORDER_STATUS_TYPE = {
  pending: 'info',
  confirmed: 'primary',
  wip: 'warning',
  revision: 'warning',
  done: 'success',
  delivered: 'success',
  cancelled: 'danger'
}

/** 优先级 → Element Plus tag type */
export const PRIORITY_TYPE = {
  high: 'danger',
  medium: 'warning',
  low: 'success'
}

/** 画师主页状态 → Element Plus tag type */
export const ARTIST_STATUS_TYPE = {
  open: 'success',
  full: 'warning',
  break: 'danger'
}

/** 订单状态流转步骤激活标记 */
export const STATUS_STEP = {
  submitted: { key: 'stepSubmitted', active: s => true },
  confirmed: { key: 'stepConfirmed', active: s => s !== 'pending' },
  wip: { key: 'stepWip', active: s => !['pending', 'confirmed'].includes(s) },
  done: { key: 'stepDone', active: s => ['done', 'delivered'].includes(s) },
  delivered: { key: 'stepDelivered', active: s => s === 'delivered' }
}
