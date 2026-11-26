/**
 * orderFormDiscount — 约稿表单「折扣码验证 → 预估 → 提交前门禁」单元
 * （自 useOrderForm 拆出，巨型文件防阀 800 行上限拆分批；纯结构搬移，判定与文案逐字不变）
 *
 * 状态（discountResult / discountError / ...）由本 composable 持有并以原引用交回 useOrderForm，
 * 页面与提交逻辑读的是同一份 ref；对外 API 形状（useOrderForm 的返回字段）完全不变。
 */
import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import { artistPublicApi } from '../api/index'
import type { ApiError } from '../api/index'
import { yuanToCents } from '../utils/money'
import type { PublicPricingResult, StylePriceResult } from '../api/types'
import type { DiscountResult } from '../views/client/order-form/types'

export interface OrderFormDiscountState {
  subdomain: string
  form: { discountCode: string }
  selectedSizeId: Ref<number | null>
  stylePricePreview: Ref<StylePriceResult | null>
  pricingData: Ref<PublicPricingResult | null>
  /** 300ms 防抖重算价格预览（useOrderForm 内的同名函数声明，调用时已提升） */
  scheduleStyleCalc: () => void
}

export function useOrderFormDiscount(state: OrderFormDiscountState) {
  const { subdomain, form, selectedSizeId, stylePricePreview, pricingData, scheduleStyleCalc } = state

  // ─── 折扣码（验证 → 预估折扣展示 → 提交时传码，后端真正扣减） ───
  /** 画师是否开启折扣功能（getPricing 返回 discountEnabled） */
  const discountEnabled = computed(() => !!pricingData.value?.discountEnabled)
  /** 验证结果 { discountType: 'percent'|'fixed', discountValue: number } | null */
  const discountResult = ref<DiscountResult | null>(null)
  const discountError = ref('')
  const discountValidating = ref(false)
  // a3: 验证序号——A 码在途时改输入为 B 码，A 的晚到响应不得回写旧折扣结果
  let discountValidationSeq = 0

  /** 验证折扣码（公开 API，需 subdomain） */
  async function validateDiscountCode() {
    const code = form.discountCode.trim()
    if (!code) return
    const mySeq = ++discountValidationSeq
    discountValidating.value = true
    discountError.value = ''
    try {
      const res = await artistPublicApi.validateDiscount({ subdomain, code })
      if (mySeq !== discountValidationSeq) return
      discountResult.value = { discountType: res.discountType, discountValue: res.discountValue }
      // 验证通过后立即重算价格（calculate-style-price 含折扣）
      if (selectedSizeId.value) scheduleStyleCalc()
    } catch (err) {
      if (mySeq !== discountValidationSeq) return
      discountResult.value = null
      discountError.value = (err as ApiError).message
    } finally {
      if (mySeq === discountValidationSeq) discountValidating.value = false
    }
  }

  /** 清除折扣码（修改码时调用） */
  function clearDiscount() {
    discountResult.value = null
    discountError.value = ''
    if (selectedSizeId.value) scheduleStyleCalc()
  }

  // 输入框内容变化 → 清除旧验证结果（防止码改了但折扣还挂着）
  watch(() => form.discountCode, clearDiscount)

  /**
   * 预估折扣金额（分）。与后端 computeDiscountCents 同口径：
   * percent = floor(倍率后总价 × value/100)；fixed = min(value元, 总价)。
   */
  const discountPreviewCents = computed(() => {
    const baseCents = stylePricePreview.value?.afterMultipliersCents
    if (!discountResult.value || baseCents == null || baseCents <= 0) return 0
    const { discountType, discountValue } = discountResult.value
    if (discountType === 'percent') return Math.floor(baseCents * discountValue / 100)
    if (discountType === 'fixed') return Math.min(yuanToCents(discountValue), baseCents)
    return 0
  })

  /** 折扣后预估总价（元；展示用，整数分换算） */
  const discountedTotalYuan = computed(() => {
    const baseCents = stylePricePreview.value?.afterMultipliersCents ?? 0
    return Math.max(0, baseCents - discountPreviewCents.value) / 100
  })

  /** a3: 卸载后在途验证响应作废（原 onUnmounted 内 discountValidationSeq++ 原样迁入） */
  function invalidatePendingValidation() {
    discountValidationSeq++
  }

  return {
    discountEnabled, discountResult, discountError, discountValidating,
    validateDiscountCode, discountPreviewCents, discountedTotalYuan, invalidatePendingValidation
  }
}
