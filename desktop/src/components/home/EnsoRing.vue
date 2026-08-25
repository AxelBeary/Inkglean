<script setup lang="ts">
// 墨环（enso）：今日在画的一笔圈成圆相，飞白留口——视觉照原型 proto-desktop-home-r2-A.html 逐段移植。
// 数据源＝本地手动计时器（stores/timer.ts），F8 数据永不上传。
import { computed, useId } from 'vue'
import { formatSeconds } from '../../stores/timer'

const props = defineProps<{
  /** 今日累计秒数 */
  seconds: number
  /** 环中心小字（默认「今日在画」） */
  caption?: string
  /** 尺寸（px，默认 118 与原型一致） */
  size?: number
}>()

const dim = computed(() => props.size ?? 118)
const text = computed(() => formatSeconds(props.seconds))
// 湍流滤镜 id 全局唯一（同页可能出现多枚墨环：经营卡 + 悬浮计时窗投影）
const uid = useId()
const roughId = computed(() => `rough-${uid}`)
const rough2Id = computed(() => `rough2-${uid}`)
</script>

<template>
  <div class="enso-wrap" :style="{ width: `${dim}px`, height: `${dim}px` }">
    <svg class="enso" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <filter :id="roughId" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="7" />
        </filter>
        <filter :id="rough2Id" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="12" />
        </filter>
      </defs>
      <g :filter="`url(#${rough2Id})`" opacity=".14">
        <circle class="echo" cx="100" cy="100" r="78" fill="none" stroke="rgba(38,37,32,.6)" stroke-width="6" stroke-linecap="round" stroke-dasharray="428 62" transform="rotate(-50 100 100)" />
      </g>
      <g :filter="`url(#${roughId})`">
        <circle class="main" cx="100" cy="100" r="78" fill="none" stroke="rgba(38,37,32,.5)" stroke-width="12" stroke-linecap="round" stroke-dasharray="441 49" transform="rotate(-52 100 100)" />
      </g>
    </svg>
    <div class="enso-text">
      <b class="v num">{{ text }}</b>
      <span class="k">{{ caption ?? '今日在画' }}</span>
    </div>
  </div>
</template>

<style scoped>
/* 照原型 CSS 移植（一笔圈成动效 + 飞白留口） */
.enso-wrap { position: relative; flex: none; }
.enso { width: 100%; height: 100%; display: block; }
.enso .main { animation: ensoDraw 1.3s var(--ease-out) .15s both; }
.enso .echo { animation: ensoDraw2 1.3s var(--ease-out) .22s both; }
@keyframes ensoDraw { from { stroke-dasharray: 0 490; } to { stroke-dasharray: 441 49; } }
@keyframes ensoDraw2 { from { stroke-dasharray: 0 490; } to { stroke-dasharray: 428 62; } }
.enso-text {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
}
.enso-text .v { font-family: var(--f-d); font-size: 17px; font-weight: 700; color: var(--ink); line-height: 1.2; }
.enso-text .k { font-size: 10.5px; color: var(--ink3); }
@media (prefers-reduced-motion: reduce) {
  .enso .main, .enso .echo { animation: none; }
}
</style>
