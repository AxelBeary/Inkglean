// M-3 / F0314：TrackOrder.vue 的「下期应付」口径——从视图拆出，模板与行为不变。
import { computed, type ComputedRef, type Ref } from 'vue'
import type { OrderInstallment } from '../api/types'

/** 仅取 nextDue 计算所需字段，避免耦合视图的 TrackOrderData 局部类型。 */
interface NextDueSource {
  installments?: OrderInstallment[] | null
  paidTotalCents?: number | null
  nextDueCents?: number | null
}

/**
 * F0314 之前的客户端自算「Σ正节点封顶」——降级为旧后端（未下发 nextDueCents 字段）的回退，
 * 兼容窗口保留一个发版周期，观测稳定后下批删除（勿再扩散使用）。
 * 2-1（审计二章1）：零/负价节点视为已结清不参与吞并，大幅降价后不再算出负数下期。
 */
export function legacyNextDueCents(insts: OrderInstallment[], paidTotalCents: number, fallbackCents: number): number {
  if (!insts.length) return fallbackCents
  const sumPositive = insts.reduce((s, i) => s + Math.max(0, i.amountCents || 0), 0)
  let covered = Math.min(paidTotalCents, sumPositive)
  for (const inst of insts) {
    // K1-6：GET /orders/track 的 installments 来自 getOrderInstallments（order-pricing.ts），
    // 后端只返回 camelCase amountCents，snake_case 分支为死代码
    const amt = inst.amountCents || 0
    if (amt <= 0) continue // 零/负价节点：已结清，跳过
    if (covered >= amt) { covered -= amt; continue }
    return amt - covered // partial：返回剩余
  }
  return 0 // 全部覆盖
}

/**
 * 下期应付：下一个未覆盖分期节点的金额（partial 时显示剩余）
 * F0314：后端 track 响应已下发权威 nextDueCents（服务端 deriveInstallmentProgress 口径，
 * 与本页 installments 同源推导），字段存在直接采用；缺失（旧后端）回退 legacyNextDueCents。
 * M-3：无分期节点是 buffer 订单的正常长期态（下单不建节点、递补才补），此时字段无权威值：
 * 新后端下发 null，旧后端可能仍下发 0——两种情况都必须回退订单级待收，避免同屏
 * 「下期应付 ¥0.00 / 剩余 ¥200」自相矛盾。
 */
export function useNextDueCents<T extends NextDueSource | null | undefined>(
  order: Ref<T>,
  fallbackCents: ComputedRef<number>
) {
  const trackNextDueCents = computed(() => {
    const data = order.value
    if (Array.isArray(data?.installments) && data.installments.length === 0) {
      return legacyNextDueCents([], data?.paidTotalCents || 0, fallbackCents.value)
    }
    if (typeof data?.nextDueCents === 'number') return data.nextDueCents
    return legacyNextDueCents(data?.installments ?? [], data?.paidTotalCents || 0, fallbackCents.value)
  })
  return { trackNextDueCents }
}
