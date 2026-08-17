<template>
  <!-- 818-E: 分步高亮导览浮层（自研，不引第三方 tour 库）
       挂载在 ArtistLayoutRoute（后台嵌套路由常驻），Teleport 到 body；
       遮罩/聚光均为 pointer-events:none，页面可正常点击，气泡独占交互。 -->
  <Teleport to="body">
    <div
      v-if="active"
      class="tour-layer"
      role="dialog"
      aria-modal="true"
      :aria-label="t('tour.title')"
    >
      <div class="tour-mask" aria-hidden="true"></div>
      <div v-if="rect" class="tour-spot" :style="spotStyle" aria-hidden="true"></div>
      <div
        v-if="rect"
        ref="bubbleEl"
        class="tour-bubble"
        :style="bubbleStyle"
        tabindex="-1"
      >
        <p class="tour-copy" aria-live="polite">{{ t(currentStep?.textKey ?? '') }}</p>
        <div class="tour-footer">
          <span class="tour-progress">{{ t('tour.step', { current: index + 1, total: steps.length }) }}</span>
          <div class="tour-actions">
            <button type="button" class="tour-btn tour-btn--ghost" @click="skip">{{ t('tour.skip') }}</button>
            <button
              v-if="index > 0"
              type="button"
              class="tour-btn tour-btn--ghost"
              @click="prev"
            >
              {{ t('tour.prev') }}
            </button>
            <button type="button" class="tour-btn tour-btn--primary" @click="next">
              {{ isLast ? t('tour.done') : t('tour.next') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTour } from '../../../composables/useTour'
import type { TourRect } from '../../../composables/useTour'

const { t } = useI18n()
const tour = useTour()
const { active, index, steps, rect, ready, next, prev, skip } = tour

const bubbleEl = ref<HTMLElement | null>(null)
const bubbleHeight = ref(0)
const GAP = 12
const BUBBLE_MAX_WIDTH = 340

const currentStep = computed(() => steps.value[index.value] ?? null)
const isLast = computed(() => steps.value.length > 0 && index.value >= steps.value.length - 1)

/** 聚光挖孔：目标元素本身透明，四周大阴影压暗，外圈花青细线标出边界 */
const spotStyle = computed(() => {
  const r: TourRect | null = rect.value
  if (!r) return {}
  return {
    top: `${r.top}px`,
    left: `${r.left}px`,
    width: `${r.width}px`,
    height: `${r.height}px`
  }
})

/** 气泡定位：优先目标下方，放不下翻到上方；水平方向贴着目标中线并钳制在视口内 */
const bubbleStyle = computed(() => {
  const r: TourRect | null = rect.value
  if (!r) return {}
  const vw = window.innerWidth
  const vh = window.innerHeight
  const bubbleW = Math.min(BUBBLE_MAX_WIDTH, Math.max(160, vw - GAP * 2))
  const below = r.top + r.height + GAP + bubbleHeight.value <= vh - GAP
  const top = below
    ? r.top + r.height + GAP
    : Math.max(GAP, r.top - GAP - bubbleHeight.value)
  const center = r.left + r.width / 2
  const left = Math.min(Math.max(GAP, center - bubbleW / 2), Math.max(GAP, vw - bubbleW - GAP))
  return { top: `${top}px`, left: `${left}px`, maxWidth: `${bubbleW}px` }
})

function measureBubble(): void {
  bubbleHeight.value = bubbleEl.value?.offsetHeight ?? 0
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && active.value) skip()
}

watch(ready, (r) => {
  // 只在步骤切换（气泡挂载/卸载）时测量与聚焦；滚动中的 rect 更新由
  // bubbleStyle computed 直接响应，不再触发 watch 循环
  if (r) {
    nextTick(() => {
      measureBubble()
      bubbleEl.value?.focus({ preventScroll: true })
    })
  }
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', measureBubble)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', measureBubble)
})
</script>

<style scoped>
/* 克制动效：仅淡入，无位移/弹跳；reduced-motion 直接停 */
.tour-layer {
  position: fixed;
  inset: 0;
  z-index: 2400;
  pointer-events: none;
  animation: tour-fade var(--dur-fast) var(--ease-out) both;
}
@keyframes tour-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .tour-layer { animation: none; }
}

/* 遮罩由聚光的超大阴影承担，自身只占位不挡交互 */
.tour-mask {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.tour-spot {
  position: fixed;
  pointer-events: none;
  border-radius: var(--r-m);
  box-shadow:
    0 0 0 2px var(--hq),
    0 0 0 9999px rgba(22, 20, 16, 0.52);
}

.tour-bubble {
  position: fixed;
  pointer-events: auto;
  box-sizing: border-box;
  padding: 16px 16px 12px;
  background: var(--card);
  border: 1px solid var(--line2);
  border-radius: var(--r-l);
  box-shadow: var(--sh-3);
  color: var(--ink);
  font-family: var(--f-b);
  outline: none;
}
.tour-bubble:focus-visible {
  box-shadow: var(--sh-3), 0 0 0 2px var(--hq);
}
.tour-copy {
  margin: 0 0 12px;
  font-size: calc(var(--font-scale, 1) * 13px);
  line-height: 1.75;
  color: var(--ink2);
}
.tour-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.tour-progress {
  flex: none;
  font-size: calc(var(--font-scale, 1) * 11px);
  color: var(--ink3);
  font-variant-numeric: tabular-nums;
}
.tour-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tour-btn {
  font: inherit;
  font-size: calc(var(--font-scale, 1) * 12px);
  line-height: 1;
  padding: 8px 12px;
  border-radius: var(--r-m);
  cursor: pointer;
  transition: background-color var(--dur-fast), color var(--dur-fast), box-shadow var(--dur-fast);
}
.tour-btn--primary {
  background: var(--hq);
  border: 1px solid var(--hq);
  color: #fff;
}
.tour-btn--primary:hover {
  background: var(--hq-d);
  border-color: var(--hq-d);
}
.tour-btn--ghost {
  background: transparent;
  border: 1px solid var(--line2);
  color: var(--ink2);
}
.tour-btn--ghost:hover {
  background: var(--paper2);
  color: var(--ink);
}
.tour-btn:focus-visible {
  outline: 2px solid var(--hq);
  outline-offset: 2px;
}
</style>
