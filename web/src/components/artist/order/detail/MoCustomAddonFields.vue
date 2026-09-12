<template>
  <!-- R5 (REQ-029): 自定义增项录入 + 已录列表（两条路径通用：选了画风可录，自定义单也可录）
       （F-09 巨型文件拆分批·丁：自 ManualOrderRight.vue 原样搬入，桌面 sticky 面板与移动端价格条两处共用同一块；
        增项状态机与 add/remove 逻辑留在宿主 useManualOrderPricing，本卡只做录入与上抛） -->
  <div v-if="open" class="custom-addon-editor">
    <el-input
      v-model="addonName" maxlength="50" size="small"
      :placeholder="$t('manualOrder.customAddonNamePlaceholder')"
    />
    <el-input-number
      v-model="addonPrice" :precision="2" :step="10" :controls="false"
      size="small" style="width: 130px"
      :placeholder="$t('manualOrder.customAddonPricePlaceholder')"
    />
    <el-button type="primary" size="small" @click="emit('add')">✓</el-button>
    <el-button size="small" :aria-label="$t('common.cancel')" @click="emit('close')">✕</el-button>
  </div>
  <div v-if="customAddons.length > 0" class="custom-addon-list">
    <div v-for="(item, idx) in customAddons" :key="item.uid" class="custom-addon-item">
      <span class="custom-addon-name">{{ item.name }}</span>
      <span class="custom-addon-price" :class="{ 'custom-addon-price--neg': item.priceYuan < 0 }">
        {{ formatCustomAddonPrice(item) }}
      </span>
      <el-button size="small" text type="danger" :aria-label="$t('manualOrder.removeCustomAddon')" @click="emit('remove', idx)">✕</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'

/** 自定义增项条目（本卡消费字段；口径同宿主 useManualOrderPricing 的 CustomAddon） */
interface CustomAddonLite {
  uid: string
  name: string
  priceYuan: number
}

defineProps({
  // 录入区展开状态（宿主 customAddonOpen，标签行「＋添加」按钮的开合仍在父组件）
  open: Boolean,
  customAddons: { type: Array as PropType<CustomAddonLite[]>, required: true },
  // 金额文案（宿主 useManualOrderPricing.formatCustomAddonPrice，随卡传入避免重复实现）
  formatCustomAddonPrice: { type: Function as PropType<(item: CustomAddonLite) => string>, required: true }
})
const emit = defineEmits(['add', 'remove', 'close'])

// 录入草稿字段（宿主 customAddonName / customAddonPrice 经 v-model 双向透传，校验与入库仍在父组件）
const addonName = defineModel<string>('name', { default: '' })
const addonPrice = defineModel<number | null | undefined>('price')
</script>

<style scoped>
/* ─── 以下样式自 ManualOrderRight.vue 原样搬入（值/选择器零改动） ─── */
.custom-addon-editor {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px; flex-wrap: wrap;
}
.custom-addon-list {
  display: flex; flex-direction: column; gap: 4px;
  margin-top: 4px;
}
.custom-addon-item {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 0;
  font-size: calc(var(--font-scale, 1) * 13px);
}
.custom-addon-name {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--ink);
}
.custom-addon-price {
  font-weight: 600; color: var(--hq);
  font-variant-numeric: tabular-nums;
}
.custom-addon-price--neg { color: var(--zs); }
</style>
