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

  /** 加载收款流水 */
  async function loadPayments(orderId) {
    loading.value = true
    try {
      const res = await artistApi.getPayments(orderId)
      payments.value = res.payments || []
    } catch {
      payments.value = []
    } finally {
      loading.value = false
    }
  }

  /** 记录一笔收款（正数） */
  async function addPayment(orderId, { amountCents, note }) {
    submitting.value = true
    try {
      const res = await artistApi.addPayment(orderId, { amountCents, note })
      // 后端返回 { payment, paidTotalCents, finalPriceCents }
      return res
    } finally {
      submitting.value = false
    }
  }

  /** 撤销一笔收款（以负数记录冲抵） */
  async function revokePayment(orderId, payment) {
    submitting.value = true
    try {
      const res = await artistApi.addPayment(orderId, {
        amountCents: -Math.abs(payment.amount_cents),
        note: `撤销 #${payment.id}`
      })
      return res
    } finally {
      submitting.value = false
    }
  }

  /** 流水净额（正数之和 - 负数之和 = 实际已收） */
  const netPaidCents = computed(() =>
    payments.value.reduce((sum, p) => sum + (p.amount_cents || 0), 0)
  )

  return { payments, loading, submitting, loadPayments, addPayment, revokePayment, netPaidCents }
}
