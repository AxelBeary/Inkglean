<script setup lang="ts">
// 卷心月历 pane（9/4 主页重设计落码波1 · 路B）：与「今日要办」共享卷心主位，切换由 Home 的 SegTabs 决定。
// 框架纪律：**组件自己不取数**——orders / canAccept 由 Home 下发；月份游标本组件自持（首页与排期页各自翻月互不串）。
// 防溢出（用户第三轮报障根治）：根 flex:1 + min-height:0，一路把高度约束传到 CalGrid 的 compact 态
//   （CalGrid 内部 .cal-grid--compact 已 repeat(6,minmax(0,1fr))，格子零固定高随窗高平分，绝不出滚动条）。
// 图例诚实（拍板②）：「可接单」绿点受名额约束，canAccept=false（本地恒 false / 云端名额满）时该项不渲染——
//   不留一个永不出现的图例骗人。
import { computed, ref } from 'vue'
import CalGrid from '../schedule/CalGrid.vue'
import { buildCalCells, monthCursor, shiftMonth } from '../../schedule/cal'
import type { SchedOrder } from '../../schedule/types'

const props = defineProps<{
  /** 归一后的排期行（云端队列 / 本地记账，由 Home 下发） */
  orders: SchedOrder[]
  /** 能否接单（本地恒 false）：决定 free 绿点与「可接单」图例是否出现 */
  canAccept: boolean
}>()

const cursor = ref<Date>(monthCursor(new Date()))

const cells = computed(() =>
  buildCalCells({ cursor: cursor.value, orders: props.orders, canAccept: props.canAccept })
)
const title = computed(() => `${cursor.value.getFullYear()}年${cursor.value.getMonth() + 1}月`)

function prev(): void { cursor.value = shiftMonth(cursor.value, -1) }
function next(): void { cursor.value = shiftMonth(cursor.value, 1) }
</script>

<template>
  <div class="home-cal">
    <div class="cal-head">
      <button type="button" class="cal-nav" aria-label="上月" @click="prev">←</button>
      <span class="ct num">{{ title }}</span>
      <button type="button" class="cal-nav" aria-label="下月" @click="next">→</button>
      <span class="cal-legend">
        <span><i class="sw sw-hq" aria-hidden="true"></i>在画</span>
        <span><i class="sw sw-zs" aria-hidden="true"></i>逾期</span>
        <span v-if="canAccept"><i class="sw sw-sl" aria-hidden="true"></i>可接单</span>
      </span>
    </div>
    <CalGrid :cells="cells" compact />
  </div>
</template>

<style scoped>
/* 根填满 pane 剩余高，把约束往下传（防溢出链路不断） */
.home-cal { flex: 1; min-height: 0; display: flex; flex-direction: column; min-width: 0; }

.cal-head { flex: none; display: flex; align-items: center; gap: 12px; margin-bottom: 8px; min-width: 0; }
.cal-nav {
  flex: none; width: 28px; height: 28px; border-radius: var(--r-s-hand); color: var(--ink3);
  display: flex; align-items: center; justify-content: center;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.cal-nav:hover { background: rgba(var(--ink-rgb), .05); color: var(--ink); }
.ct { font-family: var(--f-d); font-size: 17px; font-weight: 700; white-space: nowrap; }

/* 行内简图例：靠右，色块只取 token（禁硬编码色） */
.cal-legend { margin-left: auto; display: flex; align-items: center; gap: 14px; font-size: 11.5px; color: var(--ink4); min-width: 0; }
.cal-legend span { display: inline-flex; align-items: center; white-space: nowrap; }
.sw { display: inline-block; width: 9px; height: 9px; border-radius: var(--r-s-hand); margin-right: 5px; }
.sw-hq { background: var(--hq); }
.sw-zs { background: var(--zs); }
.sw-sl { background: var(--sl); border-radius: 50%; }

/* CalGrid 根填满剩余高（其 compact 态内部已 repeat(6,minmax(0,1fr)) 随高平分） */
.home-cal :deep(.cal) { flex: 1; min-height: 0; }
</style>
