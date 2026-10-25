<template>
  <!-- ── v0.32: 选尺寸（画风模式步骤 2 / 单画风步骤 1） ── -->
  <div>
    <h3 class="step-title">{{ t('orderForm.sizeStepTitle') }}</h3>
    <!-- 画风无可约尺寸：提示 + 直接跳过（2026-08-07 用户反馈：无尺寸画风卡死无下一步；
         issue #50-4：全是展示档尺寸时同样卡死，判定口径与服务端 style-pricing 一致） -->
    <div v-if="!hasAvailable" class="no-size-hint">
      <p>{{ sizes.length ? t('orderForm.sizeNoneAvailable') : t('orderForm.noSizeHint') }}</p>
      <div class="step-nav">
        <el-button v-if="isMultiStyle" @click="emit('prev')">{{ t('orderForm.prevStep') }}</el-button>
        <el-button type="primary" @click="emit('skip')">{{ t('orderForm.noSizeContinue') }}</el-button>
      </div>
    </div>
    <template v-else>
      <div class="size-pick-list">
        <button
          v-for="sz in sizes" :key="sz.id"
          class="size-pick" :class="{ 'size-pick--on': selectedSizeId === sz.id, 'size-pick--showcase': sz.display_status === 'showcase' }"
          type="button"
          role="radio"
          :aria-checked="selectedSizeId === sz.id"
          :aria-label="sz.name"
          @click="emit('select', sz.id)"
        >
          <span class="size-pick-name">{{ sz.name }}</span>
          <!-- SPEC-PRICE-2: 展示态尺寸可见但不可约（后端同步拒单） -->
          <span v-if="sz.display_status === 'showcase'" class="size-pick-showcase">{{ t('orderForm.sizeShowcaseTag') }}</span>
          <span class="size-pick-price">{{ formatYuanValue(sz.base_price) }}</span>
          <span v-if="selectedSizeId === sz.id" class="size-pick-check">✓</span>
        </button>
      </div>
      <div class="step-nav" :class="{ 'step-nav--end': !isMultiStyle }">
        <el-button v-if="isMultiStyle" @click="emit('prev')">{{ t('orderForm.prevStep') }}</el-button>
        <el-button type="primary" :disabled="!selectedSizeId" @click="emit('next')">{{ t('orderForm.nextStep') }}</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatYuanValue } from '../../../utils/money'
import type { StyleSize } from './types'

const props = defineProps<{
  /** 当前已选画风的尺寸列表（无画风时父层不渲染本组件） */
  sizes: StyleSize[]
  selectedSizeId: number | null
  isMultiStyle: boolean
}>()

// 与服务端 style-pricing.service.ts 同口径：display_status 为空或 available 才可算价，
// showcase/closed 一律拒。全部不可约时走空态出口，不留死锁。
const hasAvailable = computed(() =>
  props.sizes.some(sz => !sz.display_status || sz.display_status === 'available')
)

const emit = defineEmits<{
  (e: 'select', id: number): void
  (e: 'prev'): void
  (e: 'next'): void
  /** 画风无尺寸：跳过增项直达写需求 */
  (e: 'skip'): void
}>()

const { t } = useI18n()
</script>

<style scoped>
.step-title {
  font-family: var(--font-display);
  font-size: clamp(18px, 3vw, 22px);
  color: var(--text-primary);
  margin: 0 0 16px;
}
.step-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 24px; }
.step-nav--end { justify-content: flex-end; }
@media (max-width: 860px) {
  .step-nav { padding-bottom: 64px; }
}

/* ─── v0.32: 尺寸选择列表 ─── */
.size-pick-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
/* 画风无尺寸提示（2026-08-07） */
.no-size-hint { padding: 14px 16px; border-radius: 8px; background: var(--bg-soft, rgba(127,127,127,.08)); color: var(--text-secondary, inherit); margin-bottom: 16px; }
.no-size-hint p { margin: 0 0 10px; }
.size-pick {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; cursor: pointer;
  background: var(--bg-card);
  border: 2px solid var(--border-color); border-radius: 10px;
  font: inherit;
  color: inherit;
  text-align: inherit;
  transition: border-color var(--dur-mid), box-shadow var(--dur-fast) var(--ease-out);
}
.size-pick:hover { border-color: var(--color-primary-light-5); }
.size-pick--on { border-color: var(--color-primary); background: var(--color-primary-soft); }
.size-pick--showcase { opacity: 0.75; }
.size-pick-name { flex: 1; font-size: 15px; font-weight: 600; color: var(--text-primary); }
.size-pick-price { font-size: 18px; font-weight: 700; color: var(--color-primary); font-variant-numeric: tabular-nums; }
.size-pick-check { font-size: 16px; color: var(--color-primary); font-weight: 700; }
/* 展示态尺寸徽标（可见但不可约） */
.size-pick-showcase {
  font-size: 11px; padding: 1px 8px; border-radius: 999px;
  background: color-mix(in srgb, var(--color-warning, #e6a23c) 15%, transparent);
  color: var(--color-warning, #e6a23c);
}
</style>
