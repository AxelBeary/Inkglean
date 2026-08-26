<script setup lang="ts">
// 近 7 日时长周条（本地核心环波14 · F8 摸鱼可视化输出件）：
// 一天一柱，柱内三段堆叠（在画花青/其他藤黄/离开灰），柱高按七日峰值归一。
// 等高纪律：定高 36px，纯 CSS 无图表库；无数据不渲染（父级把关）。
import { computed } from 'vue'
import type { DayTimeRow } from '../../stores/autoTime'
import { formatSeconds } from '../../stores/timer'

const props = defineProps<{ week: DayTimeRow[] }>()

const maxTotal = computed(() =>
  Math.max(1, ...props.week.map(d => d.paint + d.other + d.idle))
)

interface BarDay {
  date: string
  label: string
  title: string
  heightPct: number
  paintPct: number
  otherPct: number
  idlePct: number
}

const bars = computed<BarDay[]>(() =>
  props.week.map(d => {
    const total = d.paint + d.other + d.idle
    const heightPct = total > 0 ? Math.max(8, (total / maxTotal.value) * 100) : 0
    const paintPct = total > 0 ? (d.paint / total) * 100 : 0
    const otherPct = total > 0 ? (d.other / total) * 100 : 0
    const idlePct = total > 0 ? (d.idle / total) * 100 : 0
    const dateObj = new Date(d.date)
    const label = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
    const title = total > 0
      ? `${label} · 在画 ${formatSeconds(d.paint)} · 其他 ${formatSeconds(d.other)} · 离开 ${formatSeconds(d.idle)}`
      : `${label} · 无记录`
    return { date: d.date, label, title, heightPct, paintPct, otherPct, idlePct }
  })
)
</script>

<template>
  <div class="week-bars" role="img" aria-label="近 7 日画画时间分布">
    <div v-for="b in bars" :key="b.date" class="day" :title="b.title">
      <span v-if="b.heightPct > 0" class="col" :style="{ height: b.heightPct + '%' }">
        <i class="seg seg--idle" :style="{ height: b.idlePct + '%' }"></i>
        <i class="seg seg--other" :style="{ height: b.otherPct + '%' }"></i>
        <i class="seg seg--paint" :style="{ height: b.paintPct + '%' }"></i>
      </span>
      <span class="dl">{{ b.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.week-bars { display: flex; align-items: flex-end; gap: 8px; height: 52px; }
.day { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 3px; height: 100%; }
.col {
  width: 100%; max-width: 22px; border-radius: 2px 2px 1px 1px; overflow: hidden;
  display: flex; flex-direction: column-reverse;
}
.seg { display: block; width: 100%; }
.seg--paint { background: var(--hq); }
.seg--other { background: var(--th); opacity: .55; }
.seg--idle { background: var(--buf); opacity: .45; }
.dl { font-size: 10px; color: var(--ink4); white-space: nowrap; }
</style>
