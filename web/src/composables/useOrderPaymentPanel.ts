import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useOrderPayments } from './useOrderPayments'
import { formatCents } from '../utils/money'
import type { ApiError } from '../api/index'
import type { EnrichedOrderDetail, OrderInstallment, PaymentRow } from '../api/types'

/** 订单 ref 宽松形状（finalPriceCents 为防御性读取字段，运行时不一定存在） */
type PaymentPanelOrder = EnrichedOrderDetail & { finalPriceCents?: number | null }

/**
 * 收款面板状态（从 OrderDetail.vue 拆分，纯搬移零行为变化）
 *
 * ⚠️ 归属说明（与施工图骨架的差异，见交付报告自修节）：
 * - formatCents 在 OrderDetail.vue 中为本地工具函数（utils 无导出），
 *   本 composable 内部复刻同款实现（父组件仍保留自己的 formatCents 供模板/日志用）。
 *
 * API 逻辑走已有 useOrderPayments，本 composable 只做装配 + 面板状态。
 *
 * @param ctx
 * @param ctx.order - 订单 ref
 * @param ctx.routeId - 订单 id（route.params.id）
 * @param ctx.onRefresh - 刷新回调（提交/撤销后 loadOrder）
 */
export function useOrderPaymentPanel({ order, routeId, onRefresh }: {
  order: Ref<PaymentPanelOrder | null>
  routeId: number
  onRefresh: () => Promise<void> | void
}) {
  const { t } = useI18n()
  const { payments, loading: paymentsLoading, submitting: paymentSubmitting, loadError: paymentsError, loadPayments, addPayment, revokePayment } = useOrderPayments()

  /** 金额分 → 元（后端返分，前端 /100；与 OrderDetail.vue 本地 formatCents 同款） */
  // ─── B7: 额度池收款区 ───
  /** 收款弹窗 */
  const payDialogVisible = ref(false)
  const payForm = ref<{ amountYuan: number | null; note: string }>({ amountYuan: null, note: '' })

  /** 已收 / 应收 / 待收（后端字段优先，兜底用流水净额） */
  const poolPaidCents = computed(() => order.value?.paidTotalCents ?? 0)
  const poolFinalCents = computed(() => order.value?.finalPriceCents ?? order.value?.totalPriceCents ?? 0)
  const poolRemainingCents = computed(() => Math.max(0, poolFinalCents.value - poolPaidCents.value))
  const poolPercent = computed(() =>
    poolFinalCents.value > 0 ? Math.min(100, Math.round(poolPaidCents.value / poolFinalCents.value * 100)) : 0
  )
  /** P2: 多收金额（客户多付部分；后端 addPayment 正数无上限，溢出记为"多收"） */
  const poolOverpaidCents = computed(() => Math.max(0, poolPaidCents.value - poolFinalCents.value))

  /** v0.31 F4: 节点收款（后端直接返回 paidCents/amountCents/remainingCents/status） */
  const installmentRefs = computed(() => order.value?.installments || [])

  /** v0.31 F5: 下一节点应收（第一个 remainingCents > 0 的节点） */
  const nextDueInstallment = computed(() =>
    installmentRefs.value.find(inst => inst.remainingCents > 0) || null
  )

  /** REQ-025 二阶段: 订单级总待收（后端 enrich：总价 − 已收；无总价时 null，与 >0 比较自然为 false 不显示横幅） */
  const remainingCents = computed(() => order.value?.remainingCents ?? 0)

  /** v0.31 F5: 点击跳转到收款区 */
  function scrollToPayment() {
    document.querySelector('.pool-ref')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** 提交收款 */
  async function submitPayment() {
    const cents = Math.round((payForm.value.amountYuan || 0) * 100)
    // 金额范围校验（后端 addPayment 规则的子集）：0 禁止；正数不设上限（后端支持多收，P2）；
    // 负数（退款/撤销）必须填原因且不超已收金额。上限/下限提示由提交时给出，不在输入框硬钳制（P1）
    if (cents === 0) {
      ElMessage.warning(t('orderDetail.payAmountZero'))
      return
    }
    if (cents < 0 && !payForm.value.note?.trim()) {
      ElMessage.warning(t('orderDetail.payRefundNoteRequired'))
      return
    }
    if (cents < 0 && -cents > poolPaidCents.value) {
      ElMessage.warning(t('orderDetail.payRefundExceed', { amount: formatCents(poolPaidCents.value) }))
      return
    }
    try {
      await addPayment(routeId, { amountCents: cents, note: payForm.value.note || undefined })
      ElMessage.success(t('orderDetail.paySuccess'))
      payDialogVisible.value = false
      payForm.value = { amountYuan: null, note: '' }
      await Promise.all([onRefresh(), loadPayments(routeId)])
    } catch (err) {
      ElMessage.error((err as ApiError).message)
    }
  }

  // ─── v0.31 F4: 节点快捷收款 ───
  const nodePayDialogVisible = ref(false)
  const nodePayTarget = ref<OrderInstallment | null>(null) // { id, name, remainingCents }
  const nodePayForm = ref<{ amountYuan: number | null; note: string }>({ amountYuan: null, note: '' })

  function openNodePayDialog(inst: OrderInstallment) {
    nodePayTarget.value = inst
    nodePayForm.value = { amountYuan: inst.remainingCents > 0 ? inst.remainingCents / 100 : null, note: '' }
    nodePayDialogVisible.value = true
  }

  async function submitNodePayment() {
    const cents = Math.round((nodePayForm.value.amountYuan || 0) * 100)
    if (!nodePayTarget.value) return
    // 金额范围校验（节点快捷收款只收正数；退款/撤销请用订单级「记录收款」填负数）
    if (cents <= 0) {
      ElMessage.warning(t('orderDetail.payAmountInvalid'))
      return
    }

    try {
      await addPayment(routeId, {
        amountCents: cents,
        note: nodePayForm.value.note || t('orderDetail.nodePayNoteFallback', { name: nodePayTarget.value.name }),
        installmentId: nodePayTarget.value.id
      })
      ElMessage.success(t('orderDetail.paySuccess'))
      nodePayDialogVisible.value = false
      await Promise.all([onRefresh(), loadPayments(routeId)])
    } catch (err) {
      ElMessage.error((err as ApiError).message)
    }
  }

  /** 撤销收款（二次确认） */
  async function handleRevokePayment(payment: PaymentRow) {
    try {
      await ElMessageBox.confirm(
        t('orderDetail.payRevokeConfirm', { amount: `¥${formatCents(payment.amount_cents)}` }),
        t('orderDetail.confirmTitle'),
        { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
      )
    } catch { return }
    try {
      await revokePayment(routeId, payment)
      ElMessage.success(t('orderDetail.payRevokeSuccess'))
      await Promise.all([onRefresh(), loadPayments(routeId)])
    } catch (err) {
      ElMessage.error((err as ApiError).message)
    }
  }

  return {
    payments, paymentsLoading, paymentsError, paymentSubmitting, loadPayments,
    payDialogVisible, payForm, submitPayment,
    nodePayDialogVisible, nodePayTarget, nodePayForm, openNodePayDialog, submitNodePayment, handleRevokePayment,
    poolPaidCents, poolFinalCents, poolRemainingCents, poolPercent, poolOverpaidCents,
    installmentRefs, nextDueInstallment, remainingCents, scrollToPayment
  }
}
