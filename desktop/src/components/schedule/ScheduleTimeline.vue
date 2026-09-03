<script setup lang="ts">
// 时间条 pane（9/4 主页重设计落码波1 · 路A）：只读横条图。
// 无拖拽手柄、无改期（波2 待办）。条色随 bandTone，条内文字色 var(--paper)。
// 工具栏：缩放 SegTabs（2周/1月/3月，默认1月）+ 「仅进行中」纸签脉开关。
// 本地模式不渲染本 pane（页签已在宿主层不显示）。
import { computed, ref } from 'vue'
import type { SchedOrder } from '../../schedule/types'
import SegTabs from './SegTabs.vue'
import type { TabItem } from './tabs'
import {
  buildTimelineAxis,
  buildTimelineRows,
  countUnscheduled,
  timelineWindow,
  todayPct
} from './timeline'
import type { ZoomLevel } from './timeline'

const props = defineProps<{
  orders: SchedOrder[]
}>()

const zoom = ref<ZoomLevel>('1m')
const onlyActive = ref(false)

const ZOOM_TABS: TabItem[] = [
  { value: '2w', label: '2周' },
  { value: '1m', label: '1月' },
  { value: '3m', label: '3月' }
]

const window_ = computed(() => timelineWindow(zoom.value))
const rows = computed(() =>
  buildTimelineRows(props.orders, window_.value.start, window_.value.end, { onlyActive: onlyActive.value })
)
const axis = computed(() =>
  buildTimelineAxis(window_.value.start, window_.value.end, zoom.value)
)
const today = computed(() => todayPct(window_.value.start, window_.value.end))
const unscheduled = computed(() => countUnscheduled(props.orders, onlyActive.value))

function onZoomChange(v: string): void {
  zoom.value = v as ZoomLevel
}
function toggleActive(): void {
  onlyActive.value = !onlyActive.value
}

/** 把窗口百分比换算成画布上的横向位置（与 .tl-track 同一坐标系）。
 *  几何单一事实源＝.tl-canvas 上的三个 CSS 变量（内衬/名字列宽/列间隙），
 *  改其中任一个，轴刻度、今天线、横条三者跟着一起动，不会再各自漂移。
 *  长度×数字是合法 calc（百分比×长度不合法，那是旧写法静默失效的原因）。 */
function trackX(pct: number): string {
  const ratio = Math.max(0, Math.min(100, pct)) / 100
  return `calc(var(--tl-track-left) + (100% - var(--tl-track-left) - var(--tl-pad)) * ${ratio})`
}
</script>

<template>
  <div class="tl-pane">
    <!-- 工具栏 -->
    <div class="tl-toolbar">
      <span class="tl-lbl">缩放</span>
      <SegTabs
        :items="ZOOM_TABS"
        :model-value="zoom"
        variant="tray"
        class="tl-zoom"
        @update:model-value="onZoomChange"
      />
      <button
        type="button"
        class="tl-toggle"
        :class="{ on: onlyActive }"
        :aria-pressed="onlyActive"
        @click="toggleActive"
      >
        仅进行中
      </button>
      <span v-if="unscheduled > 0" class="tl-hint">{{ unscheduled }} 单未排期未计入</span>
    </div>

    <!-- 画布 -->
    <div class="tl-canvas">
      <!-- 轴刻度：按 pct 绝对定位，与横条/今天线同一坐标系 -->
      <div class="tl-axis">
        <span
          v-for="t in axis"
          :key="t.pct"
          :style="{ left: trackX(t.pct) }"
        >{{ t.label }}</span>
      </div>
      <!-- 今天线（朱砂）：同一坐标系；原写法 calc(12px + N% * (100% - 24px) / 100) 是非法 CSS
           （百分比不能乘长度），整条 left 会被静默丢弃→线退回画布最左 -->
      <div class="tl-today" :style="{ left: trackX(today) }" />
      <!-- 行 -->
      <div v-if="rows.length === 0" class="tl-empty">窗口内无排期单</div>
      <div v-for="r in rows" :key="r.key" class="tl-row">
        <span class="tl-name">{{ r.name }}</span>
        <span class="tl-track">
          <span
            class="tl-bar"
            :class="r.tone"
            :style="{ left: r.leftPct + '%', width: r.widthPct + '%' }"
          >{{ r.label }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tl-pane { min-width: 0; }

.tl-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.tl-toolbar .tl-lbl { font-size: 12px; color: var(--ink4); }
.tl-zoom { margin-left: 0; }
.tl-toggle {
  margin-left: auto;
  font-size: 12px; padding: 4px 12px;
  border: 1px solid var(--line2); border-radius: var(--r-s-hand);
  color: var(--ink3); background: var(--card);
  transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.tl-toggle:hover { color: var(--ink); }
.tl-toggle.on { color: var(--hq-d); border-color: var(--hq); background: var(--hq-t); }
.tl-hint { font-size: 11.5px; color: var(--ink4); margin-left: 10px; }

.tl-canvas {
  /* 几何单一事实源：轴刻度 / 今天线 / 横条必须同轴（原型里轴按画布宽分布、条按 track 宽分布，
     差着左侧名字列的宽，任何窗宽下都对不上；12+130+10=152px 就是 track 左缘） */
  --tl-pad: 12px;
  --tl-name-w: 130px;
  --tl-col-gap: 10px;
  --tl-track-left: calc(var(--tl-pad) + var(--tl-name-w) + var(--tl-col-gap));
  position: relative; border-radius: var(--r-s-hand);
  background: rgba(var(--ink-rgb), .018); padding: 10px 0; overflow: hidden;
  background-image:
    linear-gradient(90deg, rgba(var(--ink-rgb), .08) 0, transparent 22px),
    linear-gradient(270deg, rgba(var(--ink-rgb), .08) 0, transparent 22px);
}
.tl-axis { position: relative; height: 18px; margin-bottom: 4px; font-size: 10.5px; color: var(--ink4); }
.tl-axis span { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; }
.tl-today { position: absolute; top: 0; bottom: 0; width: 1.5px; background: var(--zs); z-index: 2; }
.tl-row {
  display: grid; grid-template-columns: var(--tl-name-w) minmax(0, 1fr);
  align-items: center; gap: var(--tl-col-gap); height: 38px; padding: 0 var(--tl-pad);
}
.tl-row .tl-name {
  font-size: 12.5px; color: var(--ink2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.tl-track { position: relative; height: 16px; }
.tl-bar {
  position: absolute; top: 0; height: 16px; border-radius: var(--r-s-hand);
  background: var(--hq); display: flex; align-items: center; padding: 0 6px;
  font-size: 10.5px; color: var(--paper); white-space: nowrap; overflow: hidden;
}
.tl-bar.soon { background: var(--th); }
.tl-bar.over { background: var(--zs); }
.tl-bar.done { background: var(--sl); }
.tl-bar.buffer { background: color-mix(in srgb, var(--buf) 40%, transparent); border: 1px dashed var(--buf); color: var(--ink2); }
.tl-bar.nodeadline {
  background: repeating-linear-gradient(45deg, rgba(var(--ink-rgb), .10) 0 4px, transparent 4px 8px);
  color: var(--ink3);
}

.tl-empty { padding: 24px 12px; font-size: 13px; color: var(--ink4); text-align: center; }
</style>
