/**
 * 小票打印机计算口径（oimimo 吸纳批五）——纯函数抽离，单测不碰 canvas
 * 对标 oimimo 小票计算链的简化版：赠品恒 0 → 小计 → 整单折扣 → 应收 → 减定金 = 尾款
 *
 * shared-824 搬家批：自 web/src/utils/receipt.ts 整件迁入，作为小票计算唯一事实源
 */

/** 小票制品行（priceYuan 单位元；gift=赠品划线计 0） */
export interface ReceiptItemLike {
  name: string
  qty: number
  priceYuan: number | null
  gift: boolean
}

/** 整单折扣形态：无 / 百分比（如 90 = 九折）/ 直减金额（元） */
export type ReceiptDiscountType = 'none' | 'percent' | 'amount'

export interface ReceiptTotals {
  /** 小计（赠品计 0），分 */
  subtotalCents: number
  /** 折扣金额（正数 = 减掉的钱），分 */
  discountCents: number
  /** 应收 = 小计 - 折扣，分（下限 0） */
  totalCents: number
  /** 定金，分 */
  depositCents: number
  /** 尾款 = 应收 - 定金（下限 0），分 */
  balanceCents: number
}

const yuanToCentsLocal = (yuan: number | null): number =>
  yuan == null || !Number.isFinite(yuan) ? 0 : Math.round(yuan * 100)

/** 有效行：名称非空且（数量>0；赠品行不要求价格） */
export function validItems(items: ReceiptItemLike[]): ReceiptItemLike[] {
  return items.filter(i =>
    i.name.trim() && i.qty > 0 && (i.gift || (i.priceYuan != null && i.priceYuan > 0))
  )
}

/**
 * 计算小票合计。折扣钳制：percent 0〜100，amount 0〜小计（不让应收变负）。
 */
export function computeReceiptTotals(
  items: ReceiptItemLike[],
  discountType: ReceiptDiscountType,
  discountValue: number,
  depositYuan: number | null
): ReceiptTotals {
  const subtotalCents = validItems(items).reduce(
    (sum, i) => sum + (i.gift ? 0 : Math.max(0, i.qty) * yuanToCentsLocal(i.priceYuan)),
    0
  )

  let discountCents = 0
  if (discountType === 'percent') {
    const pct = Math.min(100, Math.max(0, Number.isFinite(discountValue) ? discountValue : 0))
    discountCents = Math.round(subtotalCents * (1 - pct / 100))
  } else if (discountType === 'amount') {
    discountCents = Math.min(subtotalCents, Math.max(0, yuanToCentsLocal(discountValue)))
  }

  const totalCents = Math.max(0, subtotalCents - discountCents)
  const depositCents = Math.max(0, yuanToCentsLocal(depositYuan))
  const balanceCents = Math.max(0, totalCents - depositCents)
  return { subtotalCents, discountCents, totalCents, depositCents, balanceCents }
}

/** 折扣展示文案：percent → '9 折'（zh）/ '10% off'（en）；amount → '-¥xx.xx'；none → '' */
export function discountLabel(type: ReceiptDiscountType, value: number, locale: string): string {
  if (type === 'percent') {
    const pct = Math.min(100, Math.max(0, value))
    return locale === 'zh-CN'
      ? `${(pct / 10).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 折`
      : `${Math.round(100 - pct)}% off`
  }
  if (type === 'amount') {
    return `-${(Math.max(0, value)).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return ''
}
