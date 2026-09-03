<script setup lang="ts">
// 月历格（9/4 主页重设计落码波1 · 契约层共享件）：首页卷心 compact 态与独立排期页 full 态共用，
// 格子生成一律走 schedule/cal.ts 的 buildCalCells（本组件只管呈现，不自己算日期）。
// 9/4 用户第三轮报障根治：compact 态**格子不给固定高**——6 行 repeat(6,minmax(0,1fr)) 随窗高平分，
// 固定 74px 在 600 高窗下会撑破卷面出滚动条（原型实测 558≤558 才零溢出）。
// 六态色带文字色用 var(--paper)：亮色主题是深底浅字，暗色主题颜料提亮成浅底 → 自动翻深字（禁硬编码 #fff）。
import { computed } from 'vue'
import { dateKey } from '../../schedule/band'
import type { CalCell } from '../../schedule/cal'

const props = withDefaults(
  defineProps<{
    cells: CalCell[]
    /** true＝首页卷心态（flex 自适应填满可用高、带更小、默认只露 2 条）；false＝排期页态（格子有最小高、默认露 3 条） */
    compact?: boolean
    /** 每格最多露几条带，超出画「+N」；缺省 compact 2 条 / full 3 条 */
    maxBands?: number
  }>(),
  { compact: false, maxBands: undefined }
)

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

const limit = computed(() => props.maxBands ?? (props.compact ? 2 : 3))

function shown(cell: CalCell): CalCell['bands'] {
  return cell.bands.slice(0, limit.value)
}
function rest(cell: CalCell): number {
  return Math.max(0, cell.bands.length - limit.value)
}
/** 悬停看全（截断不丢信息）：日期 + 全部带文字；空日给「可接单」/「无排期」 */
function cellTitle(cell: CalCell): string {
  const head = `${cell.date.getMonth() + 1}月${cell.day}日`
  if (cell.bands.length > 0) return `${head} · ${cell.bands.map(b => b.label).join('、')}`
  return cell.free ? `${head} · 可接单` : `${head} · 无排期`
}
</script>

<template>
  <div class="cal">
    <div class="cal-weekdays" aria-hidden="true">
      <span v-for="w in WEEKDAYS" :key="w">{{ w }}</span>
    </div>
    <div class="cal-grid" :class="{ 'cal-grid--compact': compact }">
      <div
        v-for="c in cells"
        :key="dateKey(c.date)"
        class="cal-cell"
        :class="{ other: !c.inMonth, today: c.isToday, free: c.free }"
        :title="cellTitle(c)"
      >
        <span class="cal-day num">{{ c.day }}</span>
        <div class="cal-bands">
          <span v-for="b in shown(c)" :key="b.order.key" class="band" :class="b.tone">{{ b.label }}</span>
          <span v-if="rest(c) > 0" class="cal-more">+{{ rest(c) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cal { display: flex; flex-direction: column; min-width: 0; min-height: 0; }

.cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 4px; }
.cal-weekdays span { text-align: center; font-size: 11.5px; color: var(--ink4); }

.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; min-width: 0; }
.cal-cell {
  position: relative; min-height: 74px; padding: 5px 6px;
  border-radius: var(--r-s-hand);
  background: rgba(var(--ink-rgb), .018);
  border: 1px solid rgba(var(--ink-rgb), .05);
}
.cal-cell.other { opacity: .35; }
.cal-cell.today { box-shadow: inset 0 0 0 1.5px var(--hq); }
/* 可接单绿点：跟在日号后（今天及以后的空日，且名额未满——受 canAccept 约束，F11 拍板 C） */
.cal-cell.free .cal-day::after {
  content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: var(--sl); margin-left: 5px; vertical-align: middle;
}
.cal-day { font-family: var(--f-d); font-size: 13px; color: var(--ink2); }
.cal-cell.today .cal-day { color: var(--hq-d); font-weight: 700; }

.cal-bands { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; min-width: 0; }
.band {
  font-size: 11px; padding: 2px 6px; border-radius: var(--r-s-hand);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--paper); background: var(--hq);
}
.band.buffer { background: color-mix(in srgb, var(--buf) 26%, transparent); border: 1px dashed var(--buf); color: var(--ink2); }
.band.soon { background: var(--th); }
.band.over { background: var(--zs); }
.band.done { background: var(--sl); }
.band.nodeadline {
  background: repeating-linear-gradient(45deg, rgba(var(--ink-rgb), .10) 0 4px, transparent 4px 8px);
  color: var(--ink3);
}
.cal-more { font-size: 10.5px; color: var(--ink4); margin-top: 2px; }

/* compact（首页卷心）：随窗高自适应，格子零固定高——绝不撑破卷面出滚动条。
   格子另加 size 包含（contain:size）：格子的**固有高**不再由内容算（内容只裁不计）。
   不加这一条的话月历的自然高（实测 6 行共 587px）会反过来把卷心行顶高，
   白白多出一段内滚（实测 1200×600 多 181px、1600×900 多 11px）；
   行高由 repeat(6,minmax(0,1fr)) 从容器定高分下来，容器定高由卷心行给。 */
.cal-grid--compact { flex: 1; min-height: 0; grid-template-rows: repeat(6, minmax(0, 1fr)); }
.cal-grid--compact .cal-cell { min-height: 0; overflow: hidden; contain: size; }
.cal-grid--compact .cal-bands { gap: 2px; margin-top: 3px; }
.cal-grid--compact .band { font-size: 10.5px; padding: 1px 5px; }
.cal-grid--compact .cal-more { font-size: 10px; margin-top: 1px; }

/* full（排期页）高窗加高（原型 @media min-height:800px）；compact 态上面已用 min-height:0 覆盖，不受影响 */
@media (min-height: 800px) {
  .cal-cell { min-height: 96px; }
}

/* 窄窗（≤1020，保险丝；用户已定最小窗 1200×600）：卷心不再被行高约束时，
   compact 格子会塌到接近零（实测 6 行共 110px，不可读）——每行给 52px 地板，
   页面转为卷面内滚（窄窗本就允许滚，不属用户报障的那条「默认窗出滚动条」） */
@media (max-width: 1020px) {
  .cal-grid--compact { grid-template-rows: repeat(6, minmax(52px, auto)); }
  /* 窄窗下行高不再由容器定（页面改为内滚），此时 size 包含会把格子压成空的 52px，故解除 */
  .cal-grid--compact .cal-cell { contain: none; }
}
</style>
