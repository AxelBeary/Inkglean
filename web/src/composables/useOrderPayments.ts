import { ref, computed } from 'vue'
import { i18n } from '../i18n/index'
import { artistApi } from '../api/index'
import type { ApiError } from '../api/index'
import type { AddPaymentResult, PaymentRow } from '../api/types'
import { generateId } from '../utils/id'
import { shouldRotateIdempotencyKey } from '../utils/idempotency'

/**
 * B7 额度池：订单收款记录 composable
 * 画师端 OrderDetail 收款区 + 管理端只读流水共用加载逻辑
 */
export function useOrderPayments() {
  const payments = ref<PaymentRow[]>([])
  const loading = ref(false)
  const submitting = ref(false)
  /** 流水加载失败标记（面板据此显示错误态 + 重试） */
  const loadError = ref(false)
  // D-2（R-9）: 收款/撤销幂等键——同一次提交意图（失败重试）复用同 key，
  // 成功后置空（下一次提交 = 新意图，换新 key）。后端按 payment:orderId + key 去重，
  // 防双标签页/脚本双击重复入账；服务端错误不缓存，修正后重试可成功。
  // WEB-10 修复：add 与 revoke 各自独立 key，避免响应丢失后另一操作被当重放静默吞掉。
  let addIdemKey: string | null = null
  let revokeIdemKey: string | null = null
  /** a3: 请求序号——切订单/快速刷新时旧响应晚到不得覆盖新流水 */
  let loadSeq = 0

  /** 加载收款流水 */
  async function loadPayments(orderId: number) {
    const mySeq = ++loadSeq
    loading.value = true
    loadError.value = false
    try {
      const res = await artistApi.getPayments(orderId)
      if (mySeq !== loadSeq) return
      payments.value = res.payments || []
    } catch {
      if (mySeq !== loadSeq) return
      payments.value = []
      loadError.value = true
    } finally {
      if (mySeq === loadSeq) loading.value = false
    }
  }

  /** 记录一笔收款（正数）。0dd34d96 / SRV-02：节点关联 installmentId 误导入口已移除 */
  async function addPayment(orderId: number, { amountCents, note }: {
    amountCents: number
    note?: string | null
  }): Promise<AddPaymentResult> {
    if (!addIdemKey) addIdemKey = generateId()
    submitting.value = true
    try {
      const res = await artistApi.addPayment(
        orderId,
        { amountCents, note },
        { headers: { 'idempotency-key': addIdemKey } }
      )
      addIdemKey = null
      // 后端返回 { payment, paidTotalCents, finalPriceCents, installments }
      return res
    } catch (err) {
      // 审计 #21 条目 3: 同 key 换载荷被后端判成 409（旧行为是静默回放上一笔结果）。
      // 失败保键的前提是「同一次意图重试」，内容已经变了 → 必须换新 key，否则用户改完
      // 金额再点会一直撞同一个 409，直到刷新页面。
      // TASK2-01: 仅载荷冲突才换新 key；信封解密失败须保留原 key，避免重复入账/扣款
      if (shouldRotateIdempotencyKey((err as ApiError)?.code)) addIdemKey = null
      throw err
    } finally {
      submitting.value = false
    }
  }

  /** 撤销一笔收款（以负数记录冲抵）
   * 审计 #21 条目 4: 撤销行关联被撤的 payment id，金额取「该笔尚未被撤的余额」——
   * 此前固定撤全额且不关联，同一笔刷新后可连撤两次
   */
  async function revokePayment(orderId: number, payment: PaymentRow): Promise<AddPaymentResult> {
    const remainingCents = Math.abs(payment.amount_cents) - (payment.revoked_cents ?? 0)
    if (remainingCents <= 0) {
      throw new Error(i18n.global.t('orderDetail.payAlreadyRevoked'))
    }
    if (!revokeIdemKey) revokeIdemKey = generateId()
    submitting.value = true
    try {
      const res = await artistApi.addPayment(
        orderId,
        {
          amountCents: -remainingCents,
          note: i18n.global.t('orderDetail.paymentRevertNote', { id: payment.id }),
          revokeOfPaymentId: payment.id
        },
        { headers: { 'idempotency-key': revokeIdemKey } }
      )
      revokeIdemKey = null
      return res
    } catch (err) {
      // 同上：撤销换目标行/换原因 = 新意图，载荷冲突 409 后必须换新 key；
      // TASK2-01: 信封解密失败保留原 key，禁止自动重提
      if (shouldRotateIdempotencyKey((err as ApiError)?.code)) revokeIdemKey = null
      throw err
    } finally {
      submitting.value = false
    }
  }

  /** 流水净额（正数之和 - 负数之和 = 实际已收） */
  const netPaidCents = computed(() =>
    payments.value.reduce((sum, p) => sum + (p.amount_cents || 0), 0)
  )

  return { payments, loading, submitting, loadError, loadPayments, addPayment, revokePayment, netPaidCents }
}
