<template>
  <!-- ═══ 移动端底部钉住价格条（<600px，淘宝结算页模式）
       （F-09 巨型文件拆分批·丁：自 ManualOrderRight.vue 原样搬入；明细与自定义增项复用同批拆出的
        MoPricePreview / MoCustomAddonFields；展开态、录入草稿与提交动作仍归宿主，经 v-model / emit 透传） ═══ -->
  <div class="mo-mobile-bar">
    <!-- 展开明细（点价格区域切换） -->
    <transition name="mo-slide">
      <div v-show="mobileDetailOpen" class="mo-mobile-details">
        <MoPricePreview
          :style-price-preview="stylePricePreview"
          :custom-addons="customAddons"
          :custom-addons-total="customAddonsTotal"
          :format-custom-addon-price="formatCustomAddonPrice"
        />

        <!-- R5: 移动端自定义增项（录入 + 列表，与桌面一致） -->
        <div class="mo-mobile-custom">
          <div class="mo-mobile-custom-label">
            <span>{{ $t('manualOrder.customAddons') }}</span>
            <el-button size="small" text type="primary" @click="customAddonOpen = !customAddonOpen">
              ＋ {{ $t('manualOrder.addCustomAddon') }}
            </el-button>
          </div>
          <MoCustomAddonFields
            v-model:name="customAddonName"
            v-model:price="customAddonPrice"
            :open="customAddonOpen"
            :custom-addons="customAddons"
            :format-custom-addon-price="formatCustomAddonPrice"
            @add="emit('add-addon')"
            @remove="emit('remove-addon', $event)"
            @close="customAddonOpen = false"
          />
        </div>

        <div class="mo-mobile-final">
          <span>{{ $t('manualOrder.finalPrice') }}</span>
          <el-input-number
            v-model="priceInput"
            :min="0" :max="999999.99" :precision="2" :step="10"
            size="small" style="width: 150px"
          />
        </div>
      </div>
    </transition>
    <!-- 底栏：价格 + 提交 -->
    <div class="mo-mobile-actions">
      <button
        type="button"
        class="mo-mobile-price"
        :aria-expanded="mobileDetailOpen"
        @click="mobileDetailOpen = !mobileDetailOpen"
      >
        <span class="mo-mobile-total">{{ displayPrice ? formatYuanValue(displayPrice) : '—' }}</span>
        <span class="mo-mobile-detail-link">
          {{ $t('manualOrder.priceDetail') }}
          <el-icon :size="12"><ArrowUp v-if="mobileDetailOpen" /><ArrowDown v-else /></el-icon>
        </span>
      </button>
      <el-button type="primary" @click="emit('submit')" :loading="submitting" class="mo-mobile-submit">
        {{ $t('manualOrder.submit') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { StylePriceResult } from '../../../../api/types'
import { ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import MoPricePreview from './MoPricePreview.vue'
import MoCustomAddonFields from './MoCustomAddonFields.vue'

/** 自定义增项条目（本卡消费字段；口径同宿主 useManualOrderPricing 的 CustomAddon） */
interface CustomAddonLite {
  uid: string
  name: string
  priceYuan: number
}

defineProps({
  // 提交按钮上显示的价格文案（宿主 computed displayPrice）
  displayPrice: { type: String, default: '' },
  submitting: Boolean,
  // 元值格式化（宿主 utils/money.formatYuanValue，随卡传入避免重复实现）
  formatYuanValue: { type: Function as PropType<(v: number | string | null | undefined) => string>, required: true },
  // ─── 以下四项透传给 MoPricePreview / MoCustomAddonFields（与桌面面板共用同一批宿主状态） ───
  stylePricePreview: { type: Object as PropType<StylePriceResult | null>, default: null },
  customAddons: { type: Array as PropType<CustomAddonLite[]>, required: true },
  customAddonsTotal: { type: Number, required: true },
  formatCustomAddonPrice: { type: Function as PropType<(item: CustomAddonLite) => string>, required: true }
})
const emit = defineEmits(['submit', 'add-addon', 'remove-addon'])

// 宿主状态透传（v-model 双向：明细展开、增项开合与草稿、最终价手输）
const mobileDetailOpen = defineModel<boolean>('mobileDetailOpen', { required: true })
const customAddonOpen = defineModel<boolean>('customAddonOpen', { required: true })
const customAddonName = defineModel<string>('customAddonName', { required: true })
const customAddonPrice = defineModel<number | null | undefined>('customAddonPrice', { required: true })
const priceInput = defineModel<number | null>('priceInput', { required: true })
</script>

<style scoped>
/* ─── 以下样式自 ManualOrderRight.vue 原样搬入（值/选择器零改动） ─── */
/* ─── 移动端底部价格条（默认隐藏，<600px 显示） ─── */
.mo-mobile-bar { display: none; }

/* ─── 响应式：手机（<600px）底部钉住价格条 ─── */
@media (max-width: 599px) {
  .mo-mobile-bar {
    display: block;
    position: fixed; bottom: 0; left: 0; right: 0;
    z-index: 200;
    background: var(--card);
    border-top: 1px solid var(--line);
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
  }
  .mo-mobile-details {
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
    max-height: 40vh; overflow-y: auto;
  }
  .mo-mobile-final {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; margin-top: 10px; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink);
  }
  .mo-mobile-actions {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px;
    padding-bottom: calc(10px + env(safe-area-inset-bottom));
  }
  .mo-mobile-price {
    flex: 1; cursor: pointer;
    display: flex; flex-direction: column; gap: 2px;
    font: inherit;
    color: inherit;
    text-align: inherit;
    background: none;
    border: none;
    padding: 0;
  }
  /* 总价文楷（REQ §1.3 数字用文楷），墨色不上色 */
  .mo-mobile-total { font-size: calc(var(--font-scale, 1) * 20px); font-weight: 700; color: var(--ink); font-family: var(--f-d); font-variant-numeric: tabular-nums; }
  .mo-mobile-detail-link {
    font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink3);
    display: flex; align-items: center; gap: 2px;
  }
  .mo-mobile-submit { min-width: 120px; }
}

/* ─── 明细展开动画 ─── */
.mo-slide-enter-active, .mo-slide-leave-active { transition: opacity var(--dur-mid) var(--ease-out), transform var(--dur-mid) var(--ease-out); }
.mo-slide-enter-from, .mo-slide-leave-to { opacity: 0; transform: translateY(8px); }

/* ─── R5 (REQ-029): 移动端自定义增项外壳 ─── */
.mo-mobile-custom {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid var(--line);
}
.mo-mobile-custom-label {
  display: flex; align-items: center; justify-content: space-between;
  font-size: calc(var(--font-scale, 1) * 13px); font-weight: 600; color: var(--ink);
}
</style>
