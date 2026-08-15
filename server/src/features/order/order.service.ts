// ============================================
// 订单服务 - 门面（facade）
// 原巨型文件已按子域拆分，本文件只做 re-export，保证既有 import 点零改动：
//   order-read.ts     只读查询（getOrder/getOrderByNo/getArtistOrders/客户端查询等）
//   order-fields.ts   版本守卫写 updateOrderChecked + 截稿日/开工日/备注
//   order-status.ts   状态机 STATUS_TRANSITIONS + 状态流转 + 队列压缩/递补
//   order-create.ts   createOrder + generateOrderNo + 报价快照
//   order-pricing.ts  改价/增项/收款/条目账本/锁价/守恒
// 依赖方向单向（read ← fields ← pricing ← {status, create}），无循环。
// ============================================

export {
  getOrder,
  getOrderByNo,
  getArtistOrders,
  getClientQueuePosition,
  getClientOrderByToken,
  generateCustomerToken,
  hashCustomerToken,
  buildCustomerTrackUrl,
  getPlatformConfig
} from './order-read.js'

export { updateOrderChecked, updateDeadline, updateStartDate, addNote, deleteNote } from './order-fields.js'

export { STATUS_TRANSITIONS, assertStatusTransition, updateOrderStatus, compactQueue, generateInstallmentsForOrder, promoteOrder, tryAutoPromote } from './order-status.js'
// 815 拍板 #1：取消 5 秒撤销
export { cancelOrderWithUndo, undoCancelOrder, settleExpiredUndoWindows, CANCEL_UNDO_WINDOW_MS } from './order-status.js'

export { generateOrderNo, createOrder } from './order-create.js'

export {
  updateFinalPrice,
  getOrderInstallments,
  getOrderPayments,
  getPriceEntries,
  refreshInstallmentLocks,
  checkOrderConservation,
  addExtraItem,
  deleteExtraItem,
  addPayment,
  getPayments
} from './order-pricing.js'
