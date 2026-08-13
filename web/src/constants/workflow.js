/**
 * 工作流收款比例公共常量（P1 汇总波 C15）
 * 单源：PaymentBar / WorkflowPaymentEditor 曾各持一份本地实现。
 * 与 server workflow.service.ts 常量保持一致（基点口径）。
 */

/** 最小收款段（基点；5%） */
export const MIN_BP = 500
/** 收款总基点（100%） */
export const TOTAL_BP = 10000
/** 拖拽吸附步长（基点；1%） */
export const SNAP = 100
/** 最大分期数（WorkflowPaymentEditor 新增收款段上限） */
export const MAX_INSTALLMENTS = 20
/** 新增收款段默认基点（10%） */
export const NEW_BP = 1000
