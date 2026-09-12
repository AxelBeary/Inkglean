<template>
  <!-- SPEC-PRICE-2 实时价格明细（小计×用途×加急 + R5 自定义增项并列）
       （F-09 巨型文件拆分批·丁：自 ManualOrderRight.vue 原样搬入，桌面 sticky 面板与移动端价格条两处共用同一块） -->
  <div v-if="stylePricePreview" class="price-preview">
    <div class="price-line">
      <span>{{ stylePricePreview.styleName }} · {{ stylePricePreview.sizeName }}</span>
      <span class="price-amount">{{ formatYuan(stylePricePreview.baseCents ?? 0) }}</span>
    </div>
    <div v-for="(item, idx) in (stylePricePreview.fixedAddonItems || [])" :key="'f' + idx" class="price-line">
      <span>{{ item.name }}{{ item.quantity > 1 ? ` ×${item.quantity}` : '' }}</span>
      <span class="price-amount">+{{ formatYuan(item.amountCents) }}</span>
    </div>
    <div v-for="(item, idx) in (stylePricePreview.percentAddonItems || [])" :key="'p' + idx" class="price-line">
      <span>{{ item.name }} +{{ item.percent }}%</span>
      <span class="price-amount">+{{ formatYuan(item.amountCents) }}</span>
    </div>
    <div v-if="stylePricePreview.usage" class="price-line">
      <span>{{ stylePricePreview.usage.name }} +{{ stylePricePreview.usage.percent }}%</span>
      <span class="price-amount">+{{ formatYuan(stylePricePreview.usage.incrementCents) }}</span>
    </div>
    <div v-if="stylePricePreview.rush" class="price-line">
      <span>{{ stylePricePreview.rush.name }} +{{ stylePricePreview.rush.percent }}%</span>
      <span class="price-amount">+{{ formatYuan(stylePricePreview.rush.incrementCents) }}</span>
    </div>
    <div v-for="item in customAddons" :key="item.uid" class="price-line">
      <span>{{ item.name }}</span>
      <span class="price-amount">{{ formatCustomAddonPrice(item) }}</span>
    </div>
    <div class="price-divider"></div>
    <div class="price-line total">
      <span>{{ $t('manualOrder.totalPrice') }}</span>
      <span class="price-amount">{{ formatYuan((stylePricePreview.totalCents ?? 0) + yuanToCents(customAddonsTotal)) }}</span>
    </div>
  </div>
  <!-- R5: 自定义单（什么都不选）时无计算明细，自定义增项独立成块 -->
  <div v-else-if="customAddons.length > 0" class="price-preview">
    <div v-for="item in customAddons" :key="item.uid" class="price-line">
      <span>{{ item.name }}</span>
      <span class="price-amount">{{ formatCustomAddonPrice(item) }}</span>
    </div>
    <div class="price-divider"></div>
    <div class="price-line total">
      <span>{{ $t('manualOrder.totalPrice') }}</span>
      <span class="price-amount">{{ formatYuan(yuanToCents(customAddonsTotal)) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { StylePriceResult } from '../../../../api/types'
import { formatYuan, yuanToCents } from '../../../../utils/money'

/** 自定义增项条目（本卡消费字段；组件私有 Lite 接口，口径同宿主 useManualOrderPricing 的 CustomAddon） */
interface CustomAddonLite {
  uid: string
  name: string
  priceYuan: number
}

defineProps({
  // 画风计价结果（null = 自定义单路径）
  stylePricePreview: { type: Object as PropType<StylePriceResult | null>, default: null },
  customAddons: { type: Array as PropType<CustomAddonLite[]>, required: true },
  // 自定义增项合计（元）
  customAddonsTotal: { type: Number, required: true },
  // 自定义增项金额文案（宿主 useManualOrderPricing.formatCustomAddonPrice，随卡传入避免重复实现）
  formatCustomAddonPrice: { type: Function as PropType<(item: CustomAddonLite) => string>, required: true }
})
</script>

<style scoped>
/* ─── 以下样式自 ManualOrderRight.vue 原样搬入（值/选择器零改动） ─── */
.price-preview {
  background: var(--paper2); border: 1px solid var(--line);
  border-radius: var(--r-m); padding: 14px 16px; margin-bottom: 16px;
}
.price-line { display: flex; justify-content: space-between; padding: 3px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }
/* 总价：文楷落款数字（REQ §1.3），墨色不上色 */
.price-line.total { font-size: calc(var(--font-scale, 1) * 16px); font-weight: 700; color: var(--ink); padding-top: 8px; }
.price-line.total .price-amount { font-family: var(--f-d); }
.price-amount { font-variant-numeric: tabular-nums; }
.price-divider { border-top: 1px dashed var(--line2); margin: 6px 0; }
</style>
