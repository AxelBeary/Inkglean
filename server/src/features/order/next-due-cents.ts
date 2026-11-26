// M-3 / F0314：客户查单页「下期应付」口径——从 order-pricing.ts 拆出，行为与导出不变。
import type { OrderInstallment } from './order-pricing.js'
import { deriveInstallmentProgress } from '../pricing/pricing-engine.js'

/**
 * F0314：客户查单页「下期应付」（分）——与展示侧同源的权威口径。
 * 内部走引擎 deriveInstallmentProgress（与 computeLockedState「付清即锁」共用同一 forwardFill），
 * 取首个 remainingCents > 0 的节点（partial 时即该节点剩余）；全部覆盖返回 0。
 * 尾款负待收（纯超付应退）不满足 > 0，恒不下发负数。
 * ⚠ 不是 finalPriceCents - paidTotalCents——那是订单级待收（前端 trackRemainingCents），语义不同勿混。
 * 入参吃展示行（amountCents 已钳 0 口径）而非再查库：track 组装处复用已查出的同一批
 * installments 行（order-client.routes.ts），纯内存推导、无新 SQL。
 *
 * M-3（PR114 审计）：无节点时返回 null 而非 0。SPEC-004 缓冲订单下单时不生成付款节点、
 * 递补时才补，是正常长期态——有价无节点下 0 会被前端当成权威值显示「下期应付 ¥0.00」，
 * 与同屏「剩余 ¥200」自相矛盾。null 让前端走 trackRemainingCents 既有回退；
 * 「有节点但全付清/纯超付」仍返回 0，语义是「本期不欠」，不可一并改成 null。
 */
export function getNextDueCents(
  installments: ReadonlyArray<Pick<OrderInstallment, 'amountCents'>>,
  paidTotalCents: number
): number | null {
  if (installments.length === 0) return null
  const progress = deriveInstallmentProgress(
    installments.map((inst, i) => ({ sortOrder: i, amountCents: inst.amountCents })),
    paidTotalCents
  )
  const nextDue = progress.find(row => row.remainingCents > 0)
  return nextDue ? nextDue.remainingCents : 0
}
