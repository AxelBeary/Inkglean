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
  break: 'danger',
  hidden: 'info'
}
