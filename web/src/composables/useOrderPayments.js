import { ref, computed } from 'vue'
import { artistApi } from '../api/index.js'

/**
 * B7 额度池：订单收款记录 composable
 * 画师端 OrderDetail 收款区 + 管理端只读流水共用加载逻辑
 */
export function useOrderPayments() {
  const payments = ref([])
  const loading = ref(false)
  const submitting = ref(false)
  /** 流水加载失败标记（面板据此显示错误态 + 重试） */
  const loadError = ref(false)
  // D-2（R-9）: 收款/撤销幂等键——同一次提交意图（失败重试）复用同 key，
  // 成功后置空（下一次提交 = 新意图，换新 key）。后端按 payment:orderId + key 去重，
  // 防双标签页/脚本双击重复入账；服务端错误不缓存，修正后重试可成功。
  let submitIdemKey = null

  /** 加载收款流水 */
  async function loadPayments(orderId) {
    loading.value = true
    loadError.value = false
    try {
      const res = await artistApi.getPayments(orderId)
      payments.value = res.payments || []
    } catch {
      payments.value = []
      loadError.value = true
    } finally {
      loading.value = false
    }
  }

  /** 记录一笔收款（正数），v0.31 F4: 可关联节点 */
  async function addPayment(orderId, { amountCents, note, installmentId }) {
    if (!submitIdemKey) submitIdemKey = crypto.randomUUID()
    submitting.value = true
    try {
      const res = await artistApi.addPayment(
        orderId,
        { amountCents, note, installmentId: installmentId || null },
        { headers: { 'idempotency-key': submitIdemKey } }
      )
      submitIdemKey = null
      // 后端返回 { payment, paidTotalCents, finalPriceCents, installments }
      return res
    } finally {
      submitting.value = false
    }
  }

  /** 撤销一笔收款（以负数记录冲抵） */
  async function revokePayment(orderId, payment) {
    if (!submitIdemKey) submitIdemKey = crypto.randomUUID()
    submitting.value = true
    try {
      const res = await artistApi.addPayment(
        orderId,
        {
          amountCents: -Math.abs(payment.amount_cents),
          note: `撤销 #${payment.id}`
        },
        { headers: { 'idempotency-key': submitIdemKey } }
      )
      submitIdemKey = null
      return res
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
