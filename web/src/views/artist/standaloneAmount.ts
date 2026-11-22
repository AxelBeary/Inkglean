import { yuanToCents } from '../../utils/money'

/** F0310: 散单收入金额换算（元→整数分）单列，便于组件级回归；非法/非正金额返回 0，由上游校验拦截 */
export function toStandaloneAmountCents(amount: number | string | null | undefined): number {
  if (amount == null || amount === '') return 0
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n) || n <= 0) return 0
  return yuanToCents(n)
}
