<template>
  <!-- SPEC-PRICE-2: 尺寸预览弹窗 —— 顾客视角只读（状态标签 + 价格构成 + 用途/加急可选 + 公式） -->
  <!-- 与后端 calculateStylePrice 严格同公式：(基础价 + Σ固定增项 + Σ百分比增项[只基于基础价]) × 用途 × 加急 × 折扣 -->
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

      <!-- ── 价格构成（基础价 + 已启用增项） ── -->
      <div class="pv-section-label">{{ $t('styleManage.previewComposition') }}</div>
      <div class="pv-line base">
        <span class="pv-name">{{ $t('styleManage.previewBase', { name: size.name }) }}</span>
        <span class="pv-price">{{ formatYuanTrimmed(preview.baseCents) }}</span>
      </div>
      <template v-if="preview.fixedItems.length || preview.percentItems.length">
        <div v-for="item in preview.fixedItems" :key="item.id" class="pv-line">
          <span class="pv-name">
            {{ item.name }}
            <span v-if="item.isQuantityControl" class="pv-control">{{ $t('styleManage.previewQtyEstimate') }}</span>
          </span>
          <span class="pv-price">{{ formatYuanTrimmed(item.amountCents) }}</span>
        </div>
        <div v-for="item in preview.percentItems" :key="item.id" class="pv-line">
          <span class="pv-name">
            {{ item.name }} <span class="pv-pct">+{{ item.percent }}%</span>
            <span class="pv-control">{{ $t('styleManage.previewPctOfBase') }}</span>
          </span>
          <span class="pv-price">{{ formatYuanTrimmed(item.amountCents) }}</span>
        </div>
      </template>
      <div v-else class="pv-empty">{{ $t('styleManage.previewEmpty') }}</div>

      <div class="pv-total">
        <span>{{ $t('styleManage.previewSubtotal') }}</span>
        <span class="amt">{{ formatYuanTrimmed(preview.subtotalCents) }}</span>
      </div>

      <!-- ── 用途/加急可选项（顾客下单时各选一个生效，乘在小计上） ── -->
      <div v-if="preview.usageOptions.length || preview.rushOptions.length" class="pv-mult">
        <div v-if="preview.usageOptions.length" class="pv-mult-row">
          <span class="pv-mult-label">{{ $t('styleManage.previewUsageLabel') }}</span>
          <span v-for="opt in preview.usageOptions" :key="opt.id" class="pv-mult-chip usage">{{ opt.name }} +{{ opt.percent }}%</span>
        </div>
        <div v-if="preview.rushOptions.length" class="pv-mult-row">
          <span class="pv-mult-label">{{ $t('styleManage.previewRushLabel') }}</span>
          <span v-for="opt in preview.rushOptions" :key="opt.id" class="pv-mult-chip rush">{{ opt.name }} +{{ opt.percent }}%</span>
        </div>
        <p class="pv-mult-hint">{{ $t('styleManage.previewMultHint') }}</p>
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
import { formatYuanTrimmed } from '../../utils/money.js'
import { computeSizePreview } from './addon-utils.js'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  style: { type: Object, required: true },
  size: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue'])

/** 尺寸三态：读后端真实字段 display_status（available/showcase/closed） */
const status = computed(() => props.size?.display_status || 'available')
const statusLabel = computed(() => {
  if (status.value === 'showcase') return t('styleManage.previewStatusShow')
  if (status.value === 'closed') return t('styleManage.previewStatusClose')
  return t('styleManage.previewStatusOpen')
})

/** 预览计算（纯函数，与后端引擎同公式同舍入） */
const preview = computed(() => computeSizePreview(props.style, props.size))
</script>

<style scoped>
.pv { display: flex; flex-direction: column; }
.pv-head { display: flex; gap: 12px; align-items: center; padding-bottom: 10px; border-bottom: 1px solid var(--line); margin-bottom: 12px; }
.pv-thumb {
  width: 52px; height: 52px; border-radius: var(--r-m); background: var(--line); display: grid; place-items: center;
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink4); flex: none; border: 1px solid var(--line2);
}
.pv-head-main { min-width: 0; }
.pv-title { font-family: var(--f-d); font-size: calc(var(--font-scale, 1) * 17px); font-weight: 700; color: var(--ink); }
.pv-sub { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin-top: 2px; }
.pv-size-tag { display: inline-block; margin-top: 6px; padding: 2px 10px; border-radius: var(--r-pill); font-size: calc(var(--font-scale, 1) * 11.5px); }
/* 三态语义色（7色体系：石绿/藤黄/朱砂，色块+文字不只靠颜色） */
.pv-size-tag.st-available { background: var(--sl-t); color: var(--sl); }
.pv-size-tag.st-showcase { background: var(--th-t); color: var(--th); }
.pv-size-tag.st-closed { background: var(--zs-t); color: var(--zs); }
.pv-section-label { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin-bottom: 4px; }
.pv-line { display: flex; justify-content: space-between; align-items: center; padding: 6px 2px; border-bottom: 1px dashed var(--line); font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }
.pv-line .pv-name { display: flex; align-items: center; gap: 8px; }
.pv-line .pv-price { font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.pv-line.base { color: var(--ink); }
.pv-line.base .pv-price { font-size: calc(var(--font-scale, 1) * 15px); font-family: var(--f-d); }
.pv-pct { color: var(--zhe); font-weight: 600; }
.pv-control { margin-left: 4px; font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink4); border: 1px solid var(--line); border-radius: var(--r-s); padding: 0 6px; background: var(--paper2); }
.pv-total { display: flex; justify-content: space-between; align-items: center; padding: 10px 2px 2px; font-size: calc(var(--font-scale, 1) * 15px); color: var(--ink); }
.pv-total .amt { font-family: var(--f-d); font-size: calc(var(--font-scale, 1) * 22px); color: var(--zs); font-weight: 700; font-variant-numeric: tabular-nums; }
/* 用途/加急可选项区 */
.pv-mult { margin-top: 10px; padding: 10px 12px; background: var(--paper2); border: 1px solid var(--line); border-radius: var(--r-m); display: flex; flex-direction: column; gap: 8px; }
.pv-mult-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pv-mult-label { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); flex: none; }
.pv-mult-chip { font-size: calc(var(--font-scale, 1) * 12px); padding: 2px 10px; border-radius: var(--r-pill); font-variant-numeric: tabular-nums; }
.pv-mult-chip.usage { background: var(--zhe-t); color: var(--zhe); }
.pv-mult-chip.rush { background: var(--zs-t); color: var(--zs); }
.pv-mult-hint { margin: 0; font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink4); line-height: 1.6; }
.pv-formula { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink4); margin-top: 10px; line-height: 1.7; background: var(--paper2); border: 1px dashed var(--line2); border-radius: var(--r-m); padding: 8px 10px; }
.pv-empty { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink4); text-align: center; padding: 14px 0; }
</style>
