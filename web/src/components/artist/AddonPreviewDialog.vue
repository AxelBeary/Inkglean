<template>
  <!-- REQ-036 批A (任务5): 预览弹窗 —— 顾客视角只读（画风+尺寸+状态标签+价格构成+预估合计+计价公式） -->
  <!-- 只读纯展示，无任何顾客流程按钮；「展示」态语义用状态徽章文字表达 -->
  <el-dialog
    :model-value="modelValue"
    :title="$t('styleManage.previewTitle')"
    width="560px"
    destroy-on-close
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <div v-if="size" class="pv">
      <div class="pv-head">
        <div class="pv-thumb">{{ size.name }}</div>
        <div class="pv-head-main">
          <div class="pv-title">{{ style.name }} · {{ size.name }}</div>
          <div class="pv-sub">{{ $t('styleManage.previewReadonly') }}</div>
          <span class="pv-size-tag" :class="`st-${status}`">{{ statusLabel }}</span>
        </div>
      </div>

      <div class="pv-section-label">{{ $t('styleManage.previewComposition') }}</div>
      <div class="pv-line base">
        <span class="pv-name">{{ $t('styleManage.previewBase', { name: size.name }) }}</span>
        <span class="pv-price">¥{{ size.base_price }}</span>
      </div>
      <template v-if="visibleAddons.length">
        <div v-for="sa in visibleAddons" :key="sa.id" class="pv-line">
          <span class="pv-name">
            {{ sa.template_name }}
            <span class="pv-control">{{ controlLabel(t, sa.template_control_type) }}</span>
          </span>
          <span class="pv-price">{{ addonPriceText(sa) }}</span>
        </div>
      </template>
      <div v-else class="pv-empty">{{ $t('styleManage.previewEmpty') }}</div>

      <div class="pv-total">
        <span>{{ $t('styleManage.previewTotal') }}</span>
        <span class="amt">¥{{ subtotal }}</span>
      </div>
      <div class="pv-formula">{{ $t('styleManage.previewFormula') }}</div>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ $t('styleManage.previewClose') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { controlLabel, formatAddonPrice, effectivePrice } from './addon-utils.js'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  style: { type: Object, required: true },
  size: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue'])

/** 尺寸三态：本批前端本地状态（批B后端 status 字段接入后持久化） */
const status = computed(() => props.size?._status || 'open')
const statusLabel = computed(() => {
  if (status.value === 'show') return t('styleManage.previewStatusShow')
  if (status.value === 'close') return t('styleManage.previewStatusClose')
  return t('styleManage.previewStatusOpen')
})

/** 顾客视角明细 = 画风级激活 && 尺寸级未隐藏（与后端算价过滤语义一致） */
const visibleAddons = computed(() => {
  const size = props.size
  if (!size) return []
  return (props.style.addons || []).filter(sa => !!sa.is_enabled && !(size._overrides?.[sa.id]?.is_hidden))
})

/** 明细价格：生效价（本尺寸差异价 > 画风价 > 本身价） */
function addonPriceText(sa) {
  const size = props.size
  const sizePrice = size._overrides?.[sa.id]?.price_override ?? null
  return formatAddonPrice(effectivePrice(sa, sizePrice), sa.template_pricing_mode, undefined)
}

/** 预估合计：基础价 + 增项和（本批不含倍率/折扣——顾客勾选后才有，公式文本已说明完整链路） */
const subtotal = computed(() => {
  const size = props.size
  if (!size) return 0
  const base = Number(size.base_price) || 0
  const addons = visibleAddons.value.reduce((sum, sa) => {
    const sizePrice = size._overrides?.[sa.id]?.price_override ?? null
    return sum + (Number(effectivePrice(sa, sizePrice)) || 0)
  }, 0)
  return base + addons
})
</script>

<style scoped>
.pv { display: flex; flex-direction: column; }
.pv-head { display: flex; gap: 12px; align-items: center; padding-bottom: 10px; border-bottom: 1px solid var(--line); margin-bottom: 12px; }
.pv-thumb {
  width: 52px; height: 52px; border-radius: 8px; background: var(--line); display: grid; place-items: center;
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink4); flex: none; border: 1px solid var(--line2);
}
.pv-head-main { min-width: 0; }
.pv-title { font-family: var(--f-d); font-size: calc(var(--font-scale, 1) * 17px); font-weight: 700; color: var(--ink); }
.pv-sub { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin-top: 2px; }
.pv-size-tag { display: inline-block; margin-top: 6px; padding: 2px 10px; border-radius: 10px; font-size: calc(var(--font-scale, 1) * 11.5px); }
/* 三态语义色（7色体系：石绿/藤黄/朱砂，色块+文字不只靠颜色） */
.pv-size-tag.st-open { background: var(--sl-t); color: var(--sl); }
.pv-size-tag.st-show { background: var(--th-t); color: var(--th); }
.pv-size-tag.st-close { background: var(--zs-t); color: var(--zs); }
.pv-section-label { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin-bottom: 4px; }
.pv-line { display: flex; justify-content: space-between; align-items: center; padding: 6px 2px; border-bottom: 1px dashed var(--line); font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }
.pv-line .pv-name { display: flex; align-items: center; gap: 8px; }
.pv-line .pv-price { font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.pv-line.base { color: var(--ink); }
.pv-line.base .pv-price { font-size: calc(var(--font-scale, 1) * 15px); font-family: var(--f-d); }
.pv-control { margin-left: 4px; font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink4); border: 1px solid var(--line); border-radius: 5px; padding: 0 6px; background: var(--paper2); }
.pv-total { display: flex; justify-content: space-between; align-items: center; padding: 10px 2px 2px; font-size: calc(var(--font-scale, 1) * 15px); color: var(--ink); }
.pv-total .amt { font-family: var(--f-d); font-size: calc(var(--font-scale, 1) * 22px); color: var(--zs); font-weight: 700; font-variant-numeric: tabular-nums; }
.pv-formula { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink4); margin-top: 6px; line-height: 1.7; background: var(--paper2); border: 1px dashed var(--line2); border-radius: 6px; padding: 8px 10px; }
.pv-empty { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink4); text-align: center; padding: 14px 0; }
</style>
