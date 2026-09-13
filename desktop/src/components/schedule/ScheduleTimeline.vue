<script setup lang="ts">
// 时间条 pane（9/4 主页重设计落码波1 · 路A 只读 → 9/13 波2 路B 加横条改期）。
// 波2 增量只做「拖到哪」这一件事：算出整天数 → emit('move', {orderId, edge, deltaDays})。
// 哑组件纪律：不调接口、不进 store、不 import stores/*——数据进 props，意图出 emit；
// 钳制（开工日不得进过去、deadline ≥ startDate）、两步写序、version 接力、冲突回滚全在 store/drag.ts。
// 工具栏：缩放 SegTabs（2周/1月/3月，默认1月）+ 「仅进行中」纸签脉开关。
// 本地模式不渲染本 pane（页签已在宿主层不显示）。
import { computed, onBeforeUnmount, ref } from 'vue'
import type { SchedOrder } from '../../schedule/types'
import { canDragBar, pxToDays } from '../../schedule/drag'
import type { DragEdge } from '../../schedule/drag'
import SegTabs from './SegTabs.vue'
import type { TabItem } from './tabs'
import {
  buildTimelineAxis,
  buildTimelineRows,
  countUnscheduled,
  timelineWindow,
  todayPct
} from './timeline'
import type { TimelineRow, ZoomLevel } from './timeline'

const props = defineProps<{
  orders: SchedOrder[]
  /** 总闸门（宿主给 sched.canWriteTimeline＝云端 + 无在途写）：false 时端柄、grab 光标、tabindex 一律不留 */
  movable: boolean
}>()

const emit = defineEmits<{
  /** 元组命名（不用 `(e, payload)` 函数签名：那会被 eslint 判成未使用形参） */
  move: [payload: { orderId: number; edge: DragEdge; deltaDays: number }]
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

// ─── 波2 · 拖拽改期 ────────────────────────────────────────────
/** 窗口天数：从 timelineWindow 的既有区间反算，不另立档位表（timeline.ts 是窗口口径的单一事实源，
 *  这里只消费它的日期差；写死 30/90/14 会变成两份会漂移的真相）。 */
const windowDays = computed(
  () => Math.round((window_.value.end.getTime() - window_.value.start.getTime()) / 86_400_000)
)

/** 行 key → 归一后的原始行。为什么不切 row.key 字符串拿 id：
 *  'cloud-'/'local-' 前缀只是两模式防撞台的展示命名（types.ts），不是契约；
 *  拿命名规则当 id 来源，规则一改就会静默把日期写到别的单头上。找不到＝不拖。 */
const orderByKey = computed(() => {
  const m = new Map<string, SchedOrder>()
  const list = Array.isArray(props.orders) ? props.orders : [] // 纠形自卫（826 教训：非数组按空处理）
  for (const o of list) m.set(o.key, o)
  return m
})
const orderIdByKey = computed(() => {
  const m = new Map<string, number>()
  for (const [key, o] of orderByKey.value) m.set(key, o.id)
  return m
})

/** 这一行到底能不能拖：宿主闸门 + 行级判定 + id 找得回。
 *  行级判定一律走 canDragBar（云端行 + 非终态 + 两端日期齐），本组件不再抄一份状态名单——
 *  两份名单必然漂移，结局要么是「看得到却拖不动」要么是「拖得动却不该拖」（drag.ts 文件头同口径）。 */
function rowDraggable(key: string): boolean {
  if (!props.movable) return false
  const o = orderByKey.value.get(key)
  if (!o || !canDragBar(o)) return false
  return orderIdByKey.value.has(key)
}

interface BarDrag {
  key: string
  orderId: number
  edge: DragEdge
  /** pointerdown 时的 clientX（位移基准） */
  originX: number
  /** 当前水平位移（px）：只喂视觉，接口一律吃吸附后的整天数 */
  dx: number
  /** pointerdown 时量到的 .tl-track 实际像素宽＝换算分母（拖中不重测，避免逐帧重排） */
  trackWidth: number
}
const drag = ref<BarDrag | null>(null)

/** 百分比 ± 像素：一律写成同侧相加，不出现「百分比 × 长度」（那是 9/4 波1 今天线被静默丢弃的坑）。 */
function calcOffset(pct: number, px: number): string {
  return px >= 0 ? `calc(${pct}% + ${px}px)` : `calc(${pct}% - ${-px}px)`
}

/** 横条定位样式：静默时是纯百分比，拖中把本地位移叠上去（条跟着指针走）。
 *  move＝整条平移（transform）；start＝只挪左端、宽度反向补回；end＝只改宽度。 */
function barStyle(row: TimelineRow): Record<string, string> {
  const d = drag.value
  if (!d || d.key !== row.key || d.dx === 0) {
    return { left: row.leftPct + '%', width: row.widthPct + '%' }
  }
  const px = Math.round(d.dx)
  if (d.edge === 'move') {
    return { left: row.leftPct + '%', width: row.widthPct + '%', transform: `translateX(${px}px)` }
  }
  if (d.edge === 'start') {
    return { left: calcOffset(row.leftPct, px), width: calcOffset(row.widthPct, -px) }
  }
  return { left: row.leftPct + '%', width: calcOffset(row.widthPct, px) }
}

/** 换算分母只认 .tl-track 的实际像素宽：横条 left/width 的百分比就是相对它算的，同一坐标系才有除法。
 *  量不到（0 / 非有限值）一律返 0，交给 pxToDays 自卫成 0 天 → 不发请求。
 *  为什么不用 .tl-canvas 上 --tl-track-left 那套：那是轴刻度/今天线的坐标系（含名字列 152px 左移），
 *  与 track 不同轴，拿它当分母会把天数算少一截（9/4 波1 就是在这上面栽过）。 */
function trackWidthOf(el: Element | null): number {
  const track = el?.closest('.tl-track')
  if (!track) return 0
  const w = track.getBoundingClientRect().width
  return Number.isFinite(w) && w > 0 ? w : 0
}

/** 指针捕获：拖出条外、甚至拖出窗口边界仍能收到 move/up。
 *  捕获失败或环境没这套 API（老内核、happy-dom 桩）都不致命——move/up 挂在 window 上兜底。 */
function capturePointer(el: HTMLElement, pointerId: number): void {
  if (typeof el.setPointerCapture !== 'function') return
  try {
    el.setPointerCapture(pointerId)
  } catch {
    /* 指针已失效（触摸被打断/系统抢走）：静默走 pointercancel 收尾，不因此发半截请求 */
  }
}

function beginDrag(e: PointerEvent, row: TimelineRow, edge: DragEdge): void {
  if (drag.value) return // 已有一次拖拽在途（多指点下/事件二次到达）：不吃第二次 down
  if (!rowDraggable(row.key)) return
  if (e.pointerType === 'mouse' && e.button !== 0) return // 右键/中键不开拖：否则误触右键就发写请求
  const orderId = orderIdByKey.value.get(row.key)
  if (orderId === undefined) return
  const el = e.currentTarget as HTMLElement
  capturePointer(el, e.pointerId)
  drag.value = {
    key: row.key,
    orderId,
    edge,
    originX: e.clientX,
    dx: 0,
    trackWidth: trackWidthOf(el)
  }
  // move/up/cancel 挂 window 而不是挂条自身：只挂条的话，手快一点拖到别的行/拖出画布就丢事件，
  // 位移会算到别的单头上（或直接卡成「松手不生效」）。捕获后的事件照样冒泡到 window。
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragCancel)
  e.preventDefault() // 抑制拖拽时的文本选中（条内有文字）
}

function onBarPointerDown(e: PointerEvent, row: TimelineRow): void {
  beginDrag(e, row, 'move')
}
/** 端柄嵌在条身里：不挡住冒泡，条身的 move 分支会把这次拖拽就地改写成「整条平移」
 *  （自检实测过：拖右柄 emit 出 edge:'move'，端柄等于白长）。 */
function onHandlePointerDown(e: PointerEvent, row: TimelineRow, edge: 'start' | 'end'): void {
  e.stopPropagation()
  beginDrag(e, row, edge)
}

function onDragMove(e: PointerEvent): void {
  if (!drag.value) return
  drag.value.dx = e.clientX - drag.value.originX
}

function onDragEnd(e: PointerEvent): void {
  const d = drag.value
  if (!d) return
  // 松手才换算：以 pointerup 的坐标为准（最后一次 move 可能根本没送达）
  const days = pxToDays(e.clientX - d.originX, d.trackWidth, windowDays.value)
  endDrag()
  // deltaDays === 0 一律不发：这一趟会打两次 PUT、把 version 抬一格、还可能吃 409，
  // 而服务端真相纹丝不动——画师看到的时间没变，撤销条却说「已改到 X」。吸附回原位就够了。
  if (days !== 0) emit('move', { orderId: d.orderId, edge: d.edge, deltaDays: days })
}

function onDragCancel(): void {
  endDrag() // 取消（系统抢占/触摸打断）不是改期意图：静默弹回，一个请求都不发
}

function endDrag(): void {
  drag.value = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragCancel)
}

onBeforeUnmount(() => {
  endDrag()
})

/** 端柄语义（读屏念得出「拖的是哪一端」，不靠颜色猜） */
function handleLabel(edge: 'start' | 'end'): string {
  return edge === 'start' ? '调整开工日，左右方向键按天增减' : '调整截稿日，左右方向键按天增减'
}

/** 键盘等价：一次一天（与拖拽的吸附粒度同一口径），Enter 无操作。
 *  为什么要键盘路径：只用 pointer 拖拽等于把改期能力钉死在鼠标上，键盘/读屏用户直接失去这项操作。 */
function onHandleKeydown(e: KeyboardEvent, row: TimelineRow, edge: 'start' | 'end'): void {
  if (!rowDraggable(row.key)) return
  const orderId = orderIdByKey.value.get(row.key)
  if (orderId === undefined) return
  // 一天一步：与拖拽同一粒度，只交整天（不发明半天）
  const days = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : null
  if (days === null) return
  e.preventDefault() // 挡住方向键滚动翻页，按键只用于改期
  emit('move', { orderId, edge, deltaDays: days })
}

/** 把窗口百分比换算成画布上的横向位置（与 .tl-track 同一坐标系）。
 *  几何单一事实源＝.tl-canvas 上的三个 CSS 变量（内衬/名字列宽/列间隙），
 *  改其中任一个，轴刻度、今天线、横条三者跟着一起动，不会再各自漂移。
 *  长度×数字是合法 calc（百分比×长度不合法，那是旧写法静默失效的原因）。
 *  注：这条只服务轴刻度与今天线；拖拽换算不走它（分母必须是量到的 track 宽，见 trackWidthOf）。 */
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
            :class="[r.tone, { 'tl-bar--movable': rowDraggable(r.key), 'tl-bar--drag': drag !== null && drag.key === r.key }]"
            :style="barStyle(r)"
            @pointerdown="onBarPointerDown($event, r)"
          >
            {{ r.label }}
            <!-- 端柄：只给可拖行渲染（本地行 / 在途写 / 终态单连 affordance 都不留，
                 不给「看着能拖其实拖不动」的假把手）。pointer 与键盘两条路走同一个 emit 形状 -->
            <span
              v-if="rowDraggable(r.key)"
              class="tl-handle tl-handle--start"
              role="button"
              tabindex="0"
              :aria-label="handleLabel('start')"
              @pointerdown="onHandlePointerDown($event, r, 'start')"
              @keydown="onHandleKeydown($event, r, 'start')"
            />
            <span
              v-if="rowDraggable(r.key)"
              class="tl-handle tl-handle--end"
              role="button"
              tabindex="0"
              :aria-label="handleLabel('end')"
              @pointerdown="onHandlePointerDown($event, r, 'end')"
              @keydown="onHandleKeydown($event, r, 'end')"
            />
          </span>
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
/* 等高纪律：行高 / track 高 / 条高 / grid 列模板都不因波2 改动（端柄只吃既有 16px 条） */
.tl-track { position: relative; height: 16px; }
.tl-bar {
  position: absolute; top: 0; height: 16px; border-radius: var(--r-s-hand);
  background: var(--hq); display: flex; align-items: center; padding: 0 6px;
  font-size: 10.5px; color: var(--paper); white-space: nowrap; overflow: hidden;
  /* 位置过渡：松手后若没落进新的一天，条沿这条曲线弹回原位（吸附回位）；拖中由 --drag 关掉 */
  transition: left var(--dur-fast) var(--ease-out), width var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.tl-bar.soon { background: var(--th); }
.tl-bar.over { background: var(--zs); }
.tl-bar.done { background: var(--sl); }
.tl-bar.buffer { background: color-mix(in srgb, var(--buf) 40%, transparent); border: 1px dashed var(--buf); color: var(--ink2); }
.tl-bar.nodeadline {
  background: repeating-linear-gradient(45deg, rgba(var(--ink-rgb), .10) 0 4px, transparent 4px 8px);
  color: var(--ink3);
}

/* ─── 波2 拖拽 affordance（只给可拖行；grab/grabbing 与端柄同源出现） ─── */
.tl-bar--movable { cursor: grab; touch-action: none; }
.tl-bar--drag { cursor: grabbing; transition: none; } /* 拖中裸跟手：带缓动就成橡皮筋，手感与读数都不准 */

.tl-handle {
  position: absolute; top: 0; bottom: 0; width: 8px; flex: none;
  display: flex; align-items: center; justify-content: center;
  cursor: ew-resize; touch-action: none;
}
.tl-handle--start { left: 0; }
.tl-handle--end { right: 0; }
/* 端柄标记用 currentColor：条内文字色本就随主题翻转（--paper），暗色下不必另配一套墨色 */
.tl-handle::after {
  content: ''; width: 2px; height: 8px; border-radius: var(--r-s-hand);
  background: currentColor; opacity: .55;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.tl-handle:hover::after, .tl-handle:focus-visible::after { opacity: 1; }
.tl-handle:focus-visible { outline: 1px solid currentColor; outline-offset: -2px; }

.tl-empty { padding: 24px 12px; font-size: 13px; color: var(--ink4); text-align: center; }
</style>
