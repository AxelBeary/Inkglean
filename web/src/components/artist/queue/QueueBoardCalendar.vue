<template>
  <!-- ═══ SPEC-005: 月历视图 ═══ -->
  <template v-if="viewMode === 'calendar'">
    <div
      class="cal" v-loading="loading || bufferLoading"
      @touchstart.passive="onCalTouchStart"
      @touchend.passive="onCalTouchEnd"
    >
      <!-- 翻月头 -->
      <div class="cal-head">
        <el-button text @click="changeMonth(-1)" :aria-label="$t('queue.calPrev')">←</el-button>
        <span class="cal-head-title">{{ $t('queue.calTitle', { y: calYear, m: calMonth + 1 }) }}</span>
        <el-button text @click="changeMonth(1)" :aria-label="$t('queue.calNext')">→</el-button>
        <el-date-picker
          v-model="calMonthPicker"
          type="month"
          :clearable="false"
          format="YYYY-MM"
          value-format="YYYY-MM"
          :placeholder="$t('queue.calSelectMonth')"
          class="cal-month-picker"
          @change="onCalMonthPick"
        />
        <el-button v-if="!isCurrentMonth" text size="small" class="cal-today-btn" @click="goToday">{{ $t('queue.calToday') }}</el-button>
      </div>

      <!-- 星期头（周一开头） -->
      <div class="cal-weekdays">
        <span v-for="w in WEEKDAY_KEYS" :key="w" class="cal-weekday">{{ $t(w) }}</span>
      </div>

      <!-- 日期网格 + 订单带 -->
      <div class="cal-grid">
        <div
          v-for="(cell, idx) in calCells" :key="idx"
          class="cal-cell"
          :class="{
            'cal-cell--other': !cell.inMonth,
            'cal-cell--today': cell.isToday,
            'cal-cell--weekend': cell.weekend,
            'cal-cell--free': cell.free
          }"
          @click="openDayView(cell)"
        >
          <div class="cal-day-head">
            <span class="cal-day-num">{{ cell.day }}</span>
            <el-tooltip v-if="cell.free" :content="$t('queue.calAvailable')" placement="top" :show-after="300">
              <span class="cal-free-dot" aria-hidden="true"></span>
            </el-tooltip>
          </div>
          <!-- 该日的订单带（最多 3 条 + "+N"） -->
          <div class="cal-bands">
            <el-tooltip
              v-for="band in cell.bands.slice(0, 3)" :key="band.order.id + '-' + idx"
              :content="bandTooltip(band.order)" placement="top" :show-after="300"
            >
              <div
                class="cal-band"
                :class="bandClass(band.order)"
                :data-order-id="band.order.id"
                @click.stop="goOrder(band.order)"
              >
                <span class="cal-band-text">{{ bandLabel(band.order) }}</span>
              </div>
            </el-tooltip>
            <div v-if="cell.bands.length > 3" class="cal-band-more" @click.stop="openDayView(cell)">+{{ cell.bands.length - 3 }}</div>
          </div>
        </div>
      </div>

      <!-- 批G: 日视图展开（当天完整订单列表） -->
      <el-dialog
        v-model="dayDialogVisible"
        :title="dayDialogTitle"
        width="min(92vw, 460px)"
        class="cal-day-dialog"
      >
        <div class="cal-day-list">
          <div
            v-for="order in dayDialogOrders" :key="order.id"
            class="cal-day-item"
            @click="goDayOrder(order)"
          >
            <span class="cal-day-item-band" :class="bandClass(order)">{{ bandLabel(order) }}</span>
            <span class="cal-day-item-no">#{{ order.order_no }}</span>
            <span class="cal-day-item-status">{{ t(`common.orderStatus.${order.status}`) }}</span>
          </div>
        </div>
      </el-dialog>

      <!-- 图例 -->
      <div class="cal-legend">
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--formal"></i>{{ $t('queue.calLegendFormal') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--buffer"></i>{{ $t('queue.calLegendBuffer') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--nodeadline"></i>{{ $t('queue.calLegendNoDeadline') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--overdue"></i>{{ $t('queue.calLegendOverdue') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--done"></i>{{ $t('queue.calLegendDone') }}</span>
      </div>
    </div>
  </template>
  <!-- ═══ v0.25 D: 时间条视图（SPEC-005 §3） ═══ -->
  <template v-else>
    <div class="tl" v-loading="loading || bufferLoading">
      <!-- 工具栏：缩放 + 回到今天 -->
      <div class="tl-toolbar">
        <el-radio-group :model-value="tlZoom" size="small" @update:model-value="changeTlZoom">
          <el-radio-button value="2w">{{ $t('queue.tlZoom2w') }}</el-radio-button>
          <el-radio-button value="1m">{{ $t('queue.tlZoom1m') }}</el-radio-button>
          <el-radio-button value="3m">{{ $t('queue.tlZoom3m') }}</el-radio-button>
          <el-radio-button value="6m">{{ $t('queue.tlZoom6m') }}</el-radio-button>
        </el-radio-group>
        <el-button v-if="!tlIsTodayVisible" text size="small" @click="tlGoToday">{{ $t('queue.calToday') }}</el-button>
      </div>

      <div class="tl-scroll" ref="tlScrollEl" @scroll="onTlScroll">
        <div
          class="tl-canvas"
          :style="{ width: tlCanvasWidth + 'px' }"
          @pointerdown="onTlCanvasDown"
          @pointermove="onTlCanvasMove"
          @pointerup="onTlCanvasUp"
          @pointercancel="onTlCanvasCancel"
        >
          <!-- 日期刻度头：批F/F2 手势区（拖拽平移/滚轮缩放/双指 pinch；订单横条区不绑定 → 原生滚动） -->
          <div
            class="tl-axis"
            :class="{ 'tl-axis--panning': tlAxisPanning }"
            :style="{ width: tlCanvasWidth + 'px' }"
            @wheel.prevent="onTlCanvasWheel"
          >
            <div
              v-for="tick in tlTicks" :key="tick.key"
              class="tl-tick"
              :class="{ 'tl-tick--weekend': tick.weekend, 'tl-tick--today': tick.isToday }"
              :style="{ left: tick.x + 'px', width: tlDayWidth + 'px' }"
            >
              <span class="tl-tick-label">{{ tick.label }}</span>
            </div>
          </div>

          <!-- 今天竖向参考线 -->
          <div v-if="tlTodayX != null" class="tl-today-line" :style="{ left: tlTodayX + 'px' }"></div>

          <!-- 订单横条列表 -->
          <div class="tl-rows">
            <div v-for="row in tlRows" :key="row.order.id" class="tl-row">
              <div class="tl-row-label" :title="bandLabel(row.order)">
                <span class="tl-row-no">#{{ row.order.order_no }}</span>
                <span class="tl-row-name">{{ bandLabel(row.order) }}</span>
              </div>
              <el-tooltip :content="bandTooltip(row.order)" placement="top" :show-after="300" :disabled="tlDrag != null">
                <div
                  class="tl-bar"
                  :class="[bandClass(row.order), { 'tl-bar--dragging': tlDrag && tlDrag.orderId === row.order.id, 'tl-bar--movable': tlCanDragMove(row) }]"
                  :data-order-id="row.order.id"
                  :style="tlBarStyle(row)"
                  @click="goOrder(row.order)"
                  @pointerdown="onTlBarDown($event, row)"
                  @pointermove="onTlHandleMove"
                  @pointerup="onTlHandleUp"
                  @pointercancel="onTlHandleCancel"
                >
                  <span class="tl-bar-text">{{ bandLabel(row.order) }}</span>
                  <!-- v0.28: 拖拽 handle（左端改开工日 / 右端改截稿日；终态订单与被窗口裁剪的端点不显示） -->
                  <div
                    v-if="tlCanDragStart(row)"
                    class="tl-handle tl-handle--start"
                    @pointerdown="onTlHandleDown($event, row, 'start')"
                    @pointermove="onTlHandleMove"
                    @pointerup="onTlHandleUp"
                    @pointercancel="onTlHandleCancel"
                    @click.stop
                  ></div>
                  <div
                    v-if="tlCanDragEnd(row)"
                    class="tl-handle tl-handle--end"
                    @pointerdown="onTlHandleDown($event, row, 'deadline')"
                    @pointermove="onTlHandleMove"
                    @pointerup="onTlHandleUp"
                    @pointercancel="onTlHandleCancel"
                    @click.stop
                  ></div>
                </div>
              </el-tooltip>
            </div>
            <InkEmpty v-if="!loading && !bufferLoading && tlRows.length === 0" :title="$t('queue.tlEmpty')" />
          </div>
        </div>
      </div>

      <!-- 图例（与月历共用） -->
      <div class="cal-legend">
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--formal"></i>{{ $t('queue.calLegendFormal') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--buffer"></i>{{ $t('queue.calLegendBuffer') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--nodeadline"></i>{{ $t('queue.calLegendNoDeadline') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--overdue"></i>{{ $t('queue.calLegendOverdue') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--done"></i>{{ $t('queue.calLegendDone') }}</span>
      </div>

      <!-- v0.28: 拖拽浮动日期标签（Teleport 到 body，避免祖先 transform 破坏 fixed 定位） -->
      <Teleport to="body">
        <div
          v-if="tlDrag"
          class="tl-drag-label"
          :style="{ left: tlDrag.pointerX + 'px', top: tlDrag.pointerY + 'px' }"
        >
          {{ tlDragLabelText }}
        </div>
      </Teleport>
    </div>
  </template>

  <UndoToast
    :visible="undoToastVisible"
    :message="undoToastMessage"
    :label="t('queue.tlUndo')"
    @undo="onTlUndo"
    @timeout="undoToastVisible = false"
  />
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { artistApi } from '../../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import UndoToast from '../UndoToast.vue'
// v0.38: 统一墨线空状态（REQ-026 §二）
import InkEmpty from '../visual/InkEmpty.vue'

const { t, locale } = useI18n()
const router = useRouter()

const props = defineProps({
  queue: { type: Array, required: true },
  bufferQueue: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  bufferLoading: { type: Boolean, default: false },
  viewMode: { type: String, required: true }
})
const emit = defineEmits(['refresh-all'])

// ─── SPEC-005: 月历视图 ───
const WEEKDAY_KEYS = ['queue.calMon', 'queue.calTue', 'queue.calWed', 'queue.calThu', 'queue.calFri', 'queue.calSat', 'queue.calSun']

/** 当前可见月份（Date 对象，指向当月 1 日） */
const calCursor = ref(startOfMonth(new Date()))

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
const calYear = computed(() => calCursor.value.getFullYear())
const calMonth = computed(() => calCursor.value.getMonth())
const isCurrentMonth = computed(() => {
  const now = new Date()
  return calYear.value === now.getFullYear() && calMonth.value === now.getMonth()
})
function changeMonth(delta) {
  calCursor.value = new Date(calYear.value, calMonth.value + delta, 1)
}
function goToday() {
  calCursor.value = startOfMonth(new Date())
}

// ─── 批G(2026-08-08): 日视图展开 + 月份选择器 ───
const dayDialogVisible = ref(false)
const dayDialogOrders = ref([])
const dayDialogDate = ref(null)
const dayDialogTitle = computed(() => {
  if (!dayDialogDate.value) return ''
  const d = dayDialogDate.value
  return t('queue.calDayViewTitle', {
    d: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
    n: dayDialogOrders.value.length
  })
})
/** 点击日期格 / "+N" → 打开当天完整订单列表（非当月格或空格不响应） */
function openDayView(cell) {
  if (!cell || !cell.inMonth || cell.bands.length === 0) return
  dayDialogOrders.value = cell.bands.map(b => b.order)
  dayDialogDate.value = new Date(calYear.value, calMonth.value, cell.day)
  dayDialogVisible.value = true
}
function goDayOrder(order) {
  dayDialogVisible.value = false
  router.push(`/orders/${order.id}?from=queue`)
}

/** 月份选择器（el-date-picker 月粒度，值 'YYYY-MM'；翻月头时联动） */
const calMonthPicker = ref(`${calYear.value}-${String(calMonth.value + 1).padStart(2, '0')}`)
watch(calCursor, (c) => {
  calMonthPicker.value = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}`
})
function onCalMonthPick(val) {
  if (!val) return
  calCursor.value = new Date(Number(val.slice(0, 4)), Number(val.slice(5, 7)) - 1, 1)
}

// ─── v0.25 E: 移动端翻月手势（水平滑动 > 50px 触发，参考 TplTierGrid 实现） ───
let calTouchStartX = 0
function onCalTouchStart(e) {
  calTouchStartX = e.touches[0].clientX
}
function onCalTouchEnd(e) {
  const deltaX = e.changedTouches[0].clientX - calTouchStartX
  if (Math.abs(deltaX) < 50) return
  changeMonth(deltaX < 0 ? 1 : -1)
}

/** 日期 → 'YYYY-MM-DD' 键（本地时区） */
function dateKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
/** 解析后端日期字符串为本地 Date（兼容 'YYYY-MM-DD' 与 ISO） */
function parseDate(str) {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

/** 全部日历订单（正式 + 缓冲合并，带 zone 标记） */
const calOrders = computed(() => [
  ...props.queue.map(o => ({ ...o, _zone: 'formal' })),
  ...props.bufferQueue.map(o => ({ ...o, _zone: 'buffer' }))
])

/** 订单带区间：开工日(start_date)→确认日(created_at) → 截稿日(deadline)；未设截稿 → 画满到可见月末 */
function bandRange(order) {
  const start = parseDate(order.startDate) || parseDate(order.created_at) || parseDate(order.confirmed_at)
  if (!start) return null
  let end = parseDate(order.deadline)
  const noDeadline = !end
  if (!end) {
    // 未设截稿：画满到当前可见月份末尾
    end = new Date(calYear.value, calMonth.value + 1, 0)
  }
  return { start, end, noDeadline }
}

/** 月历格子数组（42 格 = 6 行，周一开头，含上月末/下月初） */
const calCells = computed(() => {
  const first = calCursor.value
  // 周一开头：getDay() 周日=0 → 偏移 (day+6)%7
  const lead = (first.getDay() + 6) % 7
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - lead)

  const todayKey = dateKey(new Date())
  const monthEnd = new Date(first.getFullYear(), first.getMonth() + 1, 0)

  // 预计算每个订单的带区间（截断到可见范围）
  const visibleBands = calOrders.value
    .map(order => {
      const range = bandRange(order)
      if (!range) return null
      // 带与可见月无交集 → 不渲染
      if (range.end < first || range.start > monthEnd) return null
      return { order, range }
    })
    .filter(Boolean)

  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
    const key = dateKey(d)
    const bands = visibleBands
      .filter(({ range }) => {
        // 区间相交判断：订单带覆盖该日
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
        const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
        return range.start <= dayEnd && range.end >= dayStart
      })
      .map(({ order, range }) => ({ order, range }))
    cells.push({
      day: d.getDate(),
      inMonth: d.getMonth() === first.getMonth(),
      isToday: key === todayKey,
      weekend: d.getDay() === 0 || d.getDay() === 6,
      bands,
      // 批G: 可接单 = 当月无任何订单覆盖（formal + buffer 均算）
      free: d.getMonth() === first.getMonth() && bands.length === 0
    })
  }
  return cells
})

/** 带内文字：昵称-类型（超长 CSS 截断）；未设截稿日 → 前置 ⚠️（REQ §二 色带标准） */
function bandLabel(order) {
  const name = order.client_name || order.client_qq || ''
  const tier = order.tier_name || t('common.custom')
  const base = name ? `${name}-${tier}` : tier
  const noDeadline = !order.deadline && !['delivered', 'done'].includes(order.status)
  return noDeadline ? `⚠️ ${base}` : base
}

/** 带视觉样式（正式实心 / 缓冲半透明虚线 / 未设截稿斜纹 / 逾期朱砂 / 完成石绿）。
 * v0.38: 同时输出 band-doing/band-over/band-done 全局别名——
 * artist-tokens.css 的墨黑主题覆写挂在这组类上（实心带提亮，语义不变）。 */
function bandClass(order) {
  if (!order.deadline && !['delivered', 'done'].includes(order.status)) {
    return ['cal-band--nodeadline', 'band-nd']
  }
  if (['delivered', 'done'].includes(order.status)) return ['cal-band--done', 'band-done']
  const deadline = parseDate(order.deadline)
  if (deadline && deadline < new Date() && !['delivered', 'done'].includes(order.status)) {
    return ['cal-band--overdue', 'band-over']
  }
  const base = order._zone === 'buffer' ? 'cal-band--buffer' : 'cal-band--formal'
  return [base, 'band-doing']
}

/** hover tooltip：订单号 + 截稿日 + 状态 */
function bandTooltip(order) {
  const deadline = order.deadline
    ? String(order.deadline).slice(0, 10)
    : t('queue.calNoDeadline')
  return `#${order.order_no} · ${deadline} · ${t(`common.orderStatus.${order.status}`)}`
}

let tlDragHappened = false // 拖拽刚结束，抑制 click 跳转
function goOrder(order) {
  if (tlDragHappened) return // 拖拽松手不跳转
  router.push(`/orders/${order.id}?from=queue`)
}

// ─── v0.25 D: 时间条视图（SPEC-005 §3，共享 calOrders 数据源） ───
const TL_ZOOM_KEY = 'queue_tl_zoom'
// v0.36 波1: 四档缩放。批F(2026-08-08): 档位只定义 dayWidth——画布恒覆盖订单日期范围，
// 视野宽度由容器决定（不再由 days 裁剪），days 字段删除
// 档位 = 视野宽度（视口内显示的天数），dayWidth 由视口宽÷视野天数自适应（Google Calendar 式）
const TL_ZOOMS = {
  '2w': { viewDays: 14 },
  '1m': { viewDays: 30 },
  '3m': { viewDays: 90 },
  '6m': { viewDays: 180 }
}
// localStorage 兼容：老版本存的 '2m' 档已删除，落到 '3m'
const storedTlZoom = localStorage.getItem(TL_ZOOM_KEY)
const tlZoom = ref(TL_ZOOMS[storedTlZoom] ? storedTlZoom : (storedTlZoom === '2m' ? '3m' : '2w'))
function saveTlZoom(val) { localStorage.setItem(TL_ZOOM_KEY, val) }

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }

// 视口宽度（.tl-scroll clientWidth），ResizeObserver 跟踪；档位=视野天数 → dayWidth=视口宽/视野天数
const tlViewportW = ref(0)
let tlViewportObserver = null
function watchTlViewport() {
  const el = tlScrollEl.value
  if (!el) return
  tlViewportW.value = el.clientWidth || 0
  tlViewportObserver?.disconnect()
  if (typeof ResizeObserver !== 'undefined') {
    tlViewportObserver = new ResizeObserver(() => {
      if (tlScrollEl.value) tlViewportW.value = tlScrollEl.value.clientWidth || 0
    })
    tlViewportObserver.observe(el)
  }
}
onMounted(watchTlViewport)
onBeforeUnmount(() => { tlViewportObserver?.disconnect() })
/** 天宽：档位决定视野内天数，视口宽÷视野天数 → 自适应（Google Calendar 式缩放） */
const tlDayWidth = computed(() => {
  const days = TL_ZOOMS[tlZoom.value].viewDays
  const w = tlViewportW.value || 1200
  return Math.max(4, Math.round(w / days))
})
// ─── v0.42 时间条 Excel 式滚动（用户第 6 条反馈）+ 批F(2026-08-08) 画布覆盖订单范围 ───
// 批F: 画布恒覆盖「全部订单日期范围 ∪ 今天」+ 余量；缩放只改 dayWidth/视野中心，
// 画布不再被视野窗口裁剪 → 任何档位下窗口外订单都可拖拽/滚动查看
/** 画布余量（天）与宽度上限（防极端数据：超上限部分截断属预期保护） */
const TL_CANVAS_PAD_DAYS = 7
const TL_CANVAS_MAX_PX = 120000
/** 订单实际日期范围（所有订单最早/最晚的开工日/截稿日，startOfDay 归一） */
const tlOrderRange = computed(() => {
  let min = null, max = null
  for (const order of calOrders.value) {
    const rawStart = parseDate(order.startDate) || parseDate(order.created_at) || parseDate(order.confirmed_at)
    if (rawStart) {
      const d = startOfDay(rawStart)
      if (!min || d < min) min = d
      if (!max || d > max) max = d
    }
    const rawEnd = parseDate(order.deadline)
    if (rawEnd) {
      const d = startOfDay(rawEnd)
      if (!min || d < min) min = d
      if (!max || d > max) max = d
    }
  }
  return { min, max }
})
/** 画布起点：最早订单日与今天取更早，再减余量（保证今天线始终在画布内） */
const tlCanvasStart = computed(() => {
  const today = startOfDay(new Date())
  const { min } = tlOrderRange.value
  const anchor = min && min < today ? min : today
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - TL_CANVAS_PAD_DAYS)
})
/** 画布终点：最晚订单日与今天取更晚，再加余量 */
const tlCanvasEnd = computed(() => {
  const today = startOfDay(new Date())
  const { max } = tlOrderRange.value
  const anchor = max && max > today ? max : today
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + TL_CANVAS_PAD_DAYS)
})
const tlCanvasDays = computed(() =>
  Math.round((tlCanvasEnd.value.getTime() - tlCanvasStart.value.getTime()) / 86_400_000) + 1
)
/** 画布宽度：覆盖订单范围（min = 当前跨度），上限 TL_CANVAS_MAX_PX（防极端数据） */
const tlCanvasWidth = computed(() => Math.min(tlCanvasDays.value * tlDayWidth.value, TL_CANVAS_MAX_PX))

/** 日期 → 画布 x 坐标（相对画布起点；画布覆盖订单范围，x ≥ 0） */
function tlX(date) {
  const ms = startOfDay(date).getTime() - tlCanvasStart.value.getTime()
  return Math.round(ms / 86_400_000) * tlDayWidth.value
}

/** 滚动容器状态（提前声明：tlTicks 虚拟化依赖） */
const tlScrollEl = ref(null)
const tlScrollLeft = ref(0)
function onTlScroll() { tlScrollLeft.value = tlScrollEl.value?.scrollLeft || 0 }

/** 日期刻度数组（虚拟化：只渲染视口内 ± buffer 的刻度，画布 2 万 px 也不卡）
 * v0.36 波1 刻度密度适配：
 * - dayWidth ≥ 32（2w/1m）：每天标签 M/D
 * - 16 ≤ dayWidth < 32：每天标签，仅日号
 * - 8 ≤ dayWidth < 16（3m）：仅周一出标签（日号），避免重叠
 * - dayWidth < 8（6m）：仅每月 1 号出标签（短月名），周末染色跳过
 */
const TL_TICK_BUFFER = 4
const tlTicks = computed(() => {
  const ticks = []
  const todayKey = dateKey(new Date())
  const start = tlCanvasStart.value
  const dw = tlDayWidth.value
  const vw = tlViewportW.value || 1200
  const first = Math.max(0, Math.floor(tlScrollLeft.value / dw) - TL_TICK_BUFFER)
  const last = Math.min(tlCanvasDays.value, Math.ceil((tlScrollLeft.value + vw) / dw) + TL_TICK_BUFFER)
  const monthFmt = new Intl.DateTimeFormat(locale.value === 'zh-CN' ? 'zh-CN' : 'en', { month: 'short' })
  for (let i = first; i < last; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    let label
    if (dw >= 32) label = `${d.getMonth() + 1}/${d.getDate()}`
    else if (dw >= 16) label = String(d.getDate())
    else if (dw >= 8) label = d.getDay() === 1 ? String(d.getDate()) : '' // 3m: 仅周一
    else label = d.getDate() === 1 ? monthFmt.format(d) : '' // 6m: 仅每月 1 号
    ticks.push({
      key: dateKey(d),
      x: i * dw,
      label,
      weekend: dw >= 8 && (d.getDay() === 0 || d.getDay() === 6), // 低缩放跳过周末染色
      isToday: dateKey(d) === todayKey
    })
  }
  return ticks
})

/** 今天参考线 x（不在画布内 → null；画布恒含今天，故通常有值） */
const tlTodayX = computed(() => {
  const today = startOfDay(new Date())
  if (today < tlCanvasStart.value) return null
  const x = tlX(today)
  return x > tlCanvasWidth.value ? null : x + Math.floor(tlDayWidth.value / 2)
})
/** 今天是否在容器可见区内（今天恒在画布内，需结合滚动位置判断；scroll 事件驱动更新） */
const tlIsTodayVisible = computed(() => {
  const x = tlTodayX.value
  if (x == null) return false
  const el = tlScrollEl.value
  const w = el ? el.clientWidth : 0
  return x >= tlScrollLeft.value && x <= tlScrollLeft.value + w
})
function tlGoToday() {
  nextTick(() => {
    const el = tlScrollEl.value
    if (!el) return
    const x = tlX(new Date())
    el.scrollLeft = Math.max(0, x - el.clientWidth / 3)
  })
}

/** 时间条行：按确认日排序，横条裁剪到画布（v0.42 画布覆盖订单范围）；未设截稿 → 画满到画布末端 */
const tlRows = computed(() => {
  const winStart = tlCanvasStart.value
  const winEnd = tlCanvasEnd.value
  return calOrders.value
    .map(order => {
      const rawStart = parseDate(order.startDate) || parseDate(order.created_at) || parseDate(order.confirmed_at)
      if (!rawStart) return null
      const start = startOfDay(rawStart)
      const rawEnd = parseDate(order.deadline)
      const noDeadline = !rawEnd
      const end = rawEnd ? startOfDay(rawEnd) : winEnd // 未设截稿：画满到画布末端
      if (end < winStart || start > winEnd) return null // 与画布无交集
      // 裁剪到画布
      const clipStart = start < winStart ? winStart : start
      const clipEnd = end > winEnd ? winEnd : end
      return {
        order,
        left: tlX(clipStart),
        width: (Math.round((clipEnd.getTime() - clipStart.getTime()) / 86_400_000) + 1) * tlDayWidth.value - 4,
        // v0.28 拖拽用：真实起止日（startOfDay 归一）+ 是否被窗口裁剪
        startDate: start,
        endDate: end,
        noDeadline,
        startClipped: start < winStart,
        endClipped: end > winEnd
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      const sa = parseDate(a.order.startDate) || parseDate(a.order.created_at) || parseDate(a.order.confirmed_at)
      const sb = parseDate(b.order.startDate) || parseDate(b.order.created_at) || parseDate(b.order.confirmed_at)
      return (sa?.getTime() || 0) - (sb?.getTime() || 0)
    })
})

/** 切到时间条视图时，滚动到今天附近 */
watch(() => props.viewMode, (mode) => {
  if (mode !== 'timeline') return
  nextTick(() => {
    const el = tlScrollEl.value
    if (!el) return
    const today = startOfDay(new Date())
    const x = tlX(today)
    el.scrollLeft = Math.max(0, x - el.clientWidth / 3)
  })
}, { immediate: true })

// ─── 批F + 批F2(2026-08-08) + 重做(2026-08-08): 画布手势——拖拽平移 / 滚轮缩放 / 双指 pinch ───
// 事件绑定在整个 .tl-canvas（刻度区 + 横条区 + 空白区）：
// - 空白/刻度区拖拽 = 平移（地图式），滚轮 = 缩放，双指 = pinch 缩放
// - 横条/手柄自身 pointerdown 会 stopPropagation，只走改期拖拽，不触发画布平移
/** 缩放档位顺序（放大方向） */
const TL_ZOOM_ORDER = ['2w', '1m', '3m', '6m']

/** 切档：更新 tlZoom + 持久化 + 保持视野中心。radio 点击 / 滚轮 / pinch 统一走这里 */
function changeTlZoom(nextZoom) {
  if (!TL_ZOOMS[nextZoom] || nextZoom === tlZoom.value) return
  const prevDayWidth = tlDayWidth.value // 旧 dayWidth（切档前取值，供中心换算）
  tlZoom.value = nextZoom
  saveTlZoom(nextZoom)
  keepTlCenter(prevDayWidth)
}

/** 缩放切换后保持视野中心日期：按旧 dayWidth 把滚动中心换算成日期，切后重新定位 */
function keepTlCenter(prevDayWidth) {
  const el = tlScrollEl.value
  if (!el) return
  const dw = prevDayWidth || tlDayWidth.value
  const centerX = el.scrollLeft + el.clientWidth / 2
  const centerDate = new Date(tlCanvasStart.value.getTime() + Math.round(centerX / dw) * 86_400_000)
  nextTick(() => {
    const x = tlX(centerDate)
    el.scrollLeft = Math.max(0, Math.min(x - el.clientWidth / 2, el.scrollWidth - el.clientWidth))
  })
}

/** 滚轮缩放：deltaY 累计 ≥ 阈值切一档（快速连滚可多档，慢滚一次一档；保持视野中心） */
let tlWheelAcc = 0
const TL_WHEEL_STEP = 48
function onTlCanvasWheel(e) {
  tlWheelAcc += e.deltaY
  if (Math.abs(tlWheelAcc) < TL_WHEEL_STEP) return
  const dir = tlWheelAcc > 0 ? 1 : -1 // 下滚 = 缩小（视野变宽）；上滚 = 放大（视野变窄）
  tlWheelAcc = 0
  const idx = TL_ZOOM_ORDER.indexOf(tlZoom.value)
  const next = TL_ZOOM_ORDER[idx + dir]
  if (next) changeTlZoom(next)
  e.preventDefault() // 滚轮在画布 = 缩放，不滚动画布
}

// ─── 刻度区指针手势状态（批F 平移 / 批F2 pinch） ───
const tlAxisPointers = new Map() // pointerId → { x, y }
let tlAxisPan = null // { startScrollX, startScrollY, startX, startY, moved }
let tlPinchDist = 0 // 双指初始间距（>0 表示 pinch 中）
const tlAxisPanning = ref(false) // 平移中 → 光标 grabbing
/** 平移轻移阈值（px）：超过才开始移动，防点击误触 */
const TL_AXIS_PAN_THRESHOLD = 4

function onTlCanvasDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  // 横条/手柄/行标签按下 → 不启动画布手势（横条拖拽/点击由自身 handler 处理）
  const t = e.target
  if (t && t.closest && t.closest('.tl-bar, .tl-handle, .tl-row-label')) return
  e.preventDefault()
  tlAxisPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  // 第二根手指落下：释放平移 capture，进入 pinch（记录初始间距）
  if (tlAxisPointers.size === 2) {
    const [a, b] = [...tlAxisPointers.values()]
    tlPinchDist = Math.hypot(a.x - b.x, a.y - b.y)
    tlAxisPan = null
    tlAxisPanning.value = false
    const el = tlScrollEl.value
    if (el) {
      for (const id of [...tlAxisPointers.keys()]) {
        try { el.releasePointerCapture(id) } catch { /* 未捕获则忽略 */ }
      }
    }
    return
  }
  // 第一根手指/鼠标：准备平移（不立即移动，超阈值才生效）
  if (tlAxisPointers.size === 1) {
    const el = tlScrollEl.value
    tlAxisPan = {
      startScrollX: el ? el.scrollLeft : 0,
      startScrollY: el ? el.scrollTop : 0,
      startX: e.clientX, startY: e.clientY,
      moved: false
    }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* 忽略 */ }
  }
}

function onTlCanvasMove(e) {
  if (!tlAxisPointers.has(e.pointerId)) return
  const cur = { x: e.clientX, y: e.clientY }
  tlAxisPointers.set(e.pointerId, cur)
  // pinch：两指间距变化 ≥20% 切一档并重置基准（连续捏合可多档）
  if (tlAxisPointers.size === 2 && tlPinchDist > 0) {
    const [a, b] = [...tlAxisPointers.values()]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    if (dist / tlPinchDist >= 1.2) {
      const idx = TL_ZOOM_ORDER.indexOf(tlZoom.value)
      if (idx < TL_ZOOM_ORDER.length - 1) changeTlZoom(TL_ZOOM_ORDER[idx + 1])
      tlPinchDist = dist
    } else if (dist / tlPinchDist <= 0.8) {
      const idx = TL_ZOOM_ORDER.indexOf(tlZoom.value)
      if (idx > 0) changeTlZoom(TL_ZOOM_ORDER[idx - 1])
      tlPinchDist = dist
    }
    return
  }
  // 单指/鼠标：平移（超过轻移阈值才生效；地图式 2D：左右=时间轴，上下=订单列表）
  const pan = tlAxisPan
  if (!pan || tlAxisPointers.size !== 1) return
  const deltaX = e.clientX - pan.startX
  const deltaY = e.clientY - pan.startY
  if (!pan.moved) {
    if (Math.abs(deltaX) < TL_AXIS_PAN_THRESHOLD && Math.abs(deltaY) < TL_AXIS_PAN_THRESHOLD) return
    pan.moved = true
    tlAxisPanning.value = true
  }
  const el = tlScrollEl.value
  if (el) {
    el.scrollLeft = pan.startScrollX - deltaX
    el.scrollTop = pan.startScrollY - deltaY
  }
}

function onTlCanvasUp(e) {
  if (!tlAxisPointers.has(e.pointerId)) return
  tlAxisPointers.delete(e.pointerId)
  if (tlAxisPointers.size < 2) tlPinchDist = 0
  if (tlAxisPointers.size === 0) {
    tlAxisPan = null
    tlAxisPanning.value = false
    return
  }
  // 双指 pinch 抬起一根：剩余单指以当前 scroll 为新基准继续平移
  if (tlAxisPointers.size === 1) {
    const [only] = [...tlAxisPointers.values()]
    const el = tlScrollEl.value
    tlAxisPan = {
      startScrollX: el ? el.scrollLeft : 0,
      startScrollY: el ? el.scrollTop : 0,
      startX: only.x, startY: only.y,
      moved: false
    }
  }
}

function onTlCanvasCancel(e) {
  if (e.pointerId != null && tlAxisPointers.has(e.pointerId)) {
    tlAxisPointers.delete(e.pointerId)
  }
  if (tlAxisPointers.size < 2) tlPinchDist = 0
  if (tlAxisPointers.size === 0) {
    tlAxisPan = null
    tlAxisPanning.value = false
  }
}

// ─── v0.28: 时间条拖拽（原生 Pointer Events：右端改截稿日 / 左端改开工日，吸附到天） ───
const TL_TERMINAL_STATUSES = ['done', 'delivered', 'cancelled']

/**
 * 拖拽状态（null = 未在拖拽）
 * { orderId, edge('start'|'deadline'), startDate, endDate, noDeadline,
 *   startX, dayDelta, pointerX, pointerY }
 */
const tlDrag = ref(null)

/** 终态订单不可拖；被窗口裁剪的端点不可拖（拖了等于把日期设成窗口边界，误导） */
function tlCanDragStart(row) {
  return !TL_TERMINAL_STATUSES.includes(row.order.status) && !row.startClipped
}
function tlCanDragEnd(row) {
  return !TL_TERMINAL_STATUSES.includes(row.order.status) && !row.endClipped
}
/** REQ-019: 整体平移——非终态 + 有截稿日 + 两端未被裁剪 */
function tlCanDragMove(row) {
  return !TL_TERMINAL_STATUSES.includes(row.order.status) && !row.noDeadline && !row.startClipped && !row.endClipped
}

/** 横条样式：拖拽中按 dayDelta 覆盖 left/width，其余走 tlRows 计算值 */
function tlBarStyle(row) {
  const d = tlDrag.value
  if (!d || d.orderId !== row.order.id) {
    return { left: row.left + 'px', width: Math.max(row.width, 8) + 'px' }
  }
  const dw = d.dayDelta * tlDayWidth.value
  const minW = tlDayWidth.value - 4 // 最短 1 天
  // REQ-019: 整体平移——left 偏移，width 不变
  if (d.edge === 'move') {
    return { left: row.left + dw + 'px', width: Math.max(row.width, 8) + 'px' }
  }
  if (d.edge === 'deadline') {
    return { left: row.left + 'px', width: Math.max(row.width + dw, minW) + 'px' }
  }
  return { left: row.left + dw + 'px', width: Math.max(row.width - dw, minW) + 'px' }
}

/** 浮动标签文字：目标日期 M/D */
const tlDragLabelText = computed(() => {
  const d = tlDrag.value
  if (!d) return ''
  // REQ-019: 整体平移显示两端日期
  if (d.edge === 'move') {
    const s = new Date(d.startDate.getTime() + d.dayDelta * 86_400_000)
    const e = new Date(d.endDate.getTime() + d.dayDelta * 86_400_000)
    const fmt = (dt) => `${dt.getMonth() + 1}/${dt.getDate()}`
    return t('queue.tlDragMove', { s: fmt(s), e: fmt(e) })
  }
  const base = d.edge === 'deadline' ? d.endDate : d.startDate
  const target = new Date(base.getTime() + d.dayDelta * 86_400_000)
  const dStr = `${target.getMonth() + 1}/${target.getDate()}`
  return d.edge === 'deadline' ? t('queue.tlDragDeadline', { d: dStr }) : t('queue.tlDragStart', { d: dStr })
})

/** v0.36 波1: 构造拖拽状态——拖拽前记录 oldStartDate/oldDeadline，供撤销恢复 */
function tlMakeDrag(row, edge, e) {
  return {
    orderId: row.order.id,
    edge,
    startDate: row.startDate,
    endDate: row.endDate,
    noDeadline: row.noDeadline,
    // 旧值快照：开工日原本缺失（fallback 显示）时记 null，撤销恢复为 null
    oldStartDate: row.order.startDate ? dateKey(row.startDate) : null,
    oldDeadline: row.noDeadline ? null : dateKey(row.endDate),
    startX: e.clientX,
    dayDelta: 0,
    pointerX: e.clientX,
    pointerY: e.clientY
  }
}

function onTlHandleDown(e, row, edge) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  e.stopPropagation()
  e.currentTarget.setPointerCapture(e.pointerId)
  tlDrag.value = tlMakeDrag(row, edge, e)
}

/** REQ-019: 横条中间区域按下 → 整体平移模式（handle 的 pointerdown 已 stopPropagation，不会冒泡到这里） */
function onTlBarDown(e, row) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  e.stopPropagation() // 画布手势隔离：横条拖拽不触发画布平移
  if (!tlCanDragMove(row)) return
  e.currentTarget.setPointerCapture(e.pointerId)
  tlDrag.value = tlMakeDrag(row, 'move', e)
}

function onTlHandleMove(e) {
  const d = tlDrag.value
  if (!d) return
  let delta = Math.round((e.clientX - d.startX) / tlDayWidth.value)
  const spanDays = Math.round((d.endDate.getTime() - d.startDate.getTime()) / 86_400_000)
  // 吸附约束：截稿日 ≥ 开工日；开工日 ≤ 截稿日（未设截稿时开工日右移不受限）
  if (d.edge === 'deadline') delta = Math.max(delta, -spanDays)
  else if (d.edge === 'start' && !d.noDeadline) delta = Math.min(delta, spanDays)
  // REQ-019: 整体平移——开工日不早于今天（触达边界停止，不弹错误）
  else if (d.edge === 'move') {
    const today = startOfDay(new Date())
    const minDelta = Math.ceil((today.getTime() - d.startDate.getTime()) / 86_400_000)
    // BUG-6 修复：恒执行钳制（原版 if (minDelta > 0) 只在开工日已在过去时生效，
    // 开工日在未来时左拖可把开工日拖进过去，错误排期静默持久化）
    delta = Math.max(delta, minDelta)
  }
  d.dayDelta = delta
  d.pointerX = e.clientX
  d.pointerY = e.clientY
}

// ─── v0.36 波1: 拖拽成功后的撤销 toast（软撤销，无全局 undo 栈） ───
const undoToastVisible = ref(false)
const undoToastMessage = ref('')
/** 撤销快照：拖拽提交成功后记录订单与新值/旧值；「撤销」点击或超时即失效 */
let tlUndoState = null

const tlFmtMD = (dt) => `${dt.getMonth() + 1}/${dt.getDate()}`

/** 拖拽成功后弹出撤销 toast（替代原 ElMessage.success） */
function showTlUndoToast(d) {
  let msg
  if (d.edge === 'move') {
    const s = tlFmtMD(new Date(d.startDate.getTime() + d.dayDelta * 86_400_000))
    const e = tlFmtMD(new Date(d.endDate.getTime() + d.dayDelta * 86_400_000))
    msg = t('queue.tlUndoMove', { s, e })
  } else if (d.edge === 'deadline') {
    msg = t('queue.tlUndoDeadline', { d: tlFmtMD(new Date(d.endDate.getTime() + d.dayDelta * 86_400_000)) })
  } else {
    msg = t('queue.tlUndoStart', { d: tlFmtMD(new Date(d.startDate.getTime() + d.dayDelta * 86_400_000)) })
  }
  tlUndoState = {
    orderId: d.orderId,
    edge: d.edge,
    oldStartDate: d.oldStartDate,
    oldDeadline: d.oldDeadline,
    newStart: dateKey(new Date(d.startDate.getTime() + d.dayDelta * 86_400_000)),
    newEnd: dateKey(new Date(d.endDate.getTime() + d.dayDelta * 86_400_000))
  }
  undoToastMessage.value = msg
  undoToastVisible.value = true
}

/** 点「撤销」：调同样的 API 恢复旧日期（一次性；成功后刷新队列 + 轻提示） */
async function onTlUndo() {
  const u = tlUndoState
  tlUndoState = null
  undoToastVisible.value = false
  if (!u) return
  try {
    if (u.edge === 'move') {
      // 两次 PUT 恢复顺序与拖拽时 dayDelta 正负分支对称，避免交叉校验 400：
      // 旧开工日晚于当前截稿日（拖右的撤销）→ 先恢复截稿日再恢复开工日
      if (u.oldStartDate > u.newEnd) {
        await artistApi.updateDeadline(u.orderId, u.oldDeadline)
        await artistApi.updateStartDate(u.orderId, u.oldStartDate)
      } else {
        await artistApi.updateStartDate(u.orderId, u.oldStartDate)
        await artistApi.updateDeadline(u.orderId, u.oldDeadline)
      }
    } else if (u.edge === 'deadline') {
      // oldDeadline 可能为 null（原本未设截稿，拖拽才设上）→ 恢复即清除
      await artistApi.updateDeadline(u.orderId, u.oldDeadline)
    } else {
      // oldStartDate 可能为 null（原本未设开工日，横条起点是 fallback 显示）
      await artistApi.updateStartDate(u.orderId, u.oldStartDate)
    }
    emit('refresh-all')
    ElMessage.success(t('queue.tlUndone'))
  } catch (err) {
    ElMessage.error(err.message)
    emit('refresh-all') // 恢复失败重拉服务端数据，界面与后端一致
  }
}

async function onTlHandleUp() {
  const d = tlDrag.value
  if (!d) return
  tlDrag.value = null
  if (d.dayDelta === 0) return // 没移动过，不发请求
  tlDragHappened = true // 抑制拖拽松手后的 click 跳转
  setTimeout(() => { tlDragHappened = false }, 50)

  const base = d.edge === 'deadline' ? d.endDate : d.startDate
  const target = new Date(base.getTime() + d.dayDelta * 86_400_000)
  const dateStr = dateKey(target)

  // 兜底校验（正常在 move 阶段被吸附约束拦住，此处防御）
  if (d.edge === 'deadline' && target < d.startDate) {
    ElMessage.warning(t('queue.tlDragDeadlineBeforeStart'))
    return
  }
  if (d.edge === 'start' && !d.noDeadline && target > d.endDate) {
    ElMessage.warning(t('queue.tlDragStartAfterDeadline'))
    return
  }

  try {
    if (d.edge === 'move') {
      // REQ-019: 整体平移——一次性更新开工日+截稿日
      const newStart = dateKey(new Date(d.startDate.getTime() + d.dayDelta * 86_400_000))
      const newEnd = dateKey(new Date(d.endDate.getTime() + d.dayDelta * 86_400_000))
      // 往右拖（延后）：先更新截稿日再更新开工日，避免交叉校验 400（newStart > 旧 deadline）
      // 往左拖（提前）：先更新开工日再更新截稿日，避免 newEnd < 旧 startDate
      if (d.dayDelta > 0) {
        await artistApi.updateDeadline(d.orderId, newEnd)
        await artistApi.updateStartDate(d.orderId, newStart)
      } else {
        await artistApi.updateStartDate(d.orderId, newStart)
        await artistApi.updateDeadline(d.orderId, newEnd)
      }
      const src = props.queue.find(o => o.id === d.orderId) || props.bufferQueue.find(o => o.id === d.orderId)
      if (src) { src.startDate = newStart; src.deadline = newEnd }
    } else if (d.edge === 'deadline') {
      await artistApi.updateDeadline(d.orderId, dateStr)
      const src = props.queue.find(o => o.id === d.orderId) || props.bufferQueue.find(o => o.id === d.orderId)
      if (src) src.deadline = dateStr
    } else {
      await artistApi.updateStartDate(d.orderId, dateStr)
      const src = props.queue.find(o => o.id === d.orderId) || props.bufferQueue.find(o => o.id === d.orderId)
      if (src) src.startDate = dateStr
    }
    // v0.36 波1: 成功不再弹 ElMessage.success，改带「撤销」按钮的 toast（API 失败走 catch，不弹）
    showTlUndoToast(d)
  } catch (err) {
    ElMessage.error(err.message)
    emit('refresh-all') // 回滚
  }
}

function onTlHandleCancel() {
  tlDrag.value = null
}
</script>

<style scoped>
.cal { min-height: 400px; }
.cal-head {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 12px;
}
.cal-head-title {
  font-size: calc(var(--font-scale, 1) * 18px); font-weight: 700; color: var(--ink);
  min-width: 110px; text-align: center;
  font-family: var(--f-d);
  font-variant-numeric: tabular-nums;
}
.cal-today-btn { margin-left: 8px; }

.cal-weekdays {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;
  margin-bottom: 4px;
}
.cal-weekday {
  text-align: center; font-size: calc(var(--font-scale, 1) * 12px); font-weight: 600;
  color: var(--ink3); padding: 4px 0;
}

.cal-grid {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;
}
.cal-cell {
  min-height: 92px;
  border: 1px solid var(--line); border-radius: var(--r-m);
  background: var(--card);
  padding: 4px;
  display: flex; flex-direction: column; gap: 3px;
  transition: border-color 0.15s;
}
.cal-cell--other { opacity: 0.4; background: transparent; }
.cal-cell--weekend { background: color-mix(in srgb, var(--paper2) 70%, var(--card)); }
/* 今天：花青软底 + 墨色日期圆（提案 v2 .day.today） */
.cal-cell--today {
  background: var(--hq-t);
  border-color: color-mix(in srgb, var(--hq) 45%, transparent);
}
.cal-day-num {
  font-size: calc(var(--font-scale, 1) * 12px); font-weight: 600; color: var(--ink3);
  font-variant-numeric: tabular-nums;
}
.cal-cell--today .cal-day-num {
  background: var(--ink); color: var(--paper);
  width: 19px; height: 19px;
  display: inline-grid; place-items: center;
  border-radius: 50%;
}

/* 批G: 可接单标识（无订单覆盖的当月格）——石绿浅底 + 角标，轻量不打扰 */
.cal-day-head { display: flex; align-items: center; gap: 5px; }
.cal-free-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--sl); opacity: 0.8; flex-shrink: 0;
  cursor: help;
}
.cal-cell--free:not(.cal-cell--today):not(.cal-cell--weekend) {
  background: color-mix(in srgb, var(--sl) 7%, var(--card));
}
.cal-month-picker { width: 132px; }
/* 批G: 日视图展开（当天完整订单列表） */
.cal-day-list {
  display: flex; flex-direction: column; gap: 6px;
  max-height: 60vh; overflow-y: auto;
}
.cal-day-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--line); border-radius: var(--r-m);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.cal-day-item:hover { border-color: var(--hq); background: var(--hq-t); }
.cal-day-item-band {
  flex-shrink: 0;
  padding: 2px 8px; border-radius: 4px;
  font-size: calc(var(--font-scale, 1) * 12px); line-height: 1.5;
  max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cal-day-item-no {
  font-family: var(--f-d); font-variant-numeric: tabular-nums;
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); white-space: nowrap;
}
.cal-day-item-status {
  margin-left: auto;
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); white-space: nowrap;
}

.cal-bands { display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
.cal-band {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: calc(var(--font-scale, 1) * 11px); line-height: 1.4;
  cursor: pointer;
  transition: filter 0.15s;
  overflow: hidden;
}
.cal-band:hover { filter: brightness(1.08); }
.cal-band-text {
  display: block;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* 正式订单=实心花青（进行中语义；墨黑主题由 artist-tokens.css 提亮） */
.cal-band--formal {
  background: var(--hq);
  color: #fff;
}
/* 缓冲位=--buf 半透明 + 虚线边框（派工 Q2：以提案 CSS 实际变量为准） */
.cal-band--buffer {
  background: color-mix(in srgb, var(--buf) 26%, transparent);
  border: 1px dashed var(--buf);
  color: var(--buf);
}
/* 未设截稿=斜纹纹理 + ⚠️（纹理编码状态，色盲友好；⚠️ 在 bandLabel 前置） */
.cal-band--nodeadline {
  background: repeating-linear-gradient(
    45deg,
    var(--paper2),
    var(--paper2) 3px,
    var(--line) 3px,
    var(--line) 6px
  );
  border: 1px solid var(--line2);
  color: var(--ink2);
}
/* 逾期=朱砂（出现即重要，验收 3） */
.cal-band--overdue {
  background: var(--zs);
  color: #fff;
}
/* 已完成=石绿 */
.cal-band--done {
  background: var(--sl);
  color: #fff;
}
.cal-band-more {
  font-size: calc(var(--font-scale, 1) * 10px); color: var(--ink3); text-align: center;
  padding: 1px 0;
}

/* 图例 */
.cal-legend {
  display: flex; flex-wrap: wrap; gap: 14px;
  margin-top: 14px; padding-top: 12px;
  border-top: 1px solid var(--line);
}
.cal-legend-item {
  display: flex; align-items: center; gap: 6px;
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2);
}
.cal-legend-swatch {
  display: inline-block; width: 22px; height: 12px;
  border-radius: 3px;
}

/* 移动端：格子缩小，带内文字截断 */
@media (max-width: 768px) {
  .cal-cell { min-height: 64px; padding: 2px; }
  .cal-day-num { font-size: calc(var(--font-scale, 1) * 10px); }
  .cal-band { padding: 1px 3px; font-size: calc(var(--font-scale, 1) * 9px); }
  .cal-head-title { font-size: calc(var(--font-scale, 1) * 15px); min-width: 90px; }
  .cal-month-picker { width: 96px; }
  .cal-day-item-band { max-width: 110px; }
}

/* ─── v0.25 D: 时间条视图（v0.38 换肤；今天线朱砂 = REQ §二） ─── */
.tl { min-height: 300px; }
.tl-toolbar {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 12px;
}
.tl-scroll {
  overflow-x: auto; overflow-y: auto;
  max-height: min(62vh, 640px);
  border: 1px solid var(--line); border-radius: var(--r-m);
  background: var(--card);
  -webkit-overflow-scrolling: touch;
}
.tl-canvas {
  position: relative; min-width: 100%;
  /* 重做：整块画布手势（平移/pinch）由 pointer 事件处理；横向滚动归原生（刻度区外的空白不拦截） */
  touch-action: pan-y;
  user-select: none;
}
.tl-axis {
  position: relative; height: 32px;
  border-bottom: 1px solid var(--line);
  background: var(--paper2);
  /* 批F/F2: 手势区——禁用浏览器滚动接管（平移/pinch 由 pointer 事件处理）；滚轮=缩放 */
  touch-action: none;
  cursor: grab;
  user-select: none;
}
.tl-axis--panning { cursor: grabbing; }
.tl-tick {
  position: absolute; top: 0; bottom: 0;
  display: flex; align-items: center; justify-content: center;
  border-right: 1px solid color-mix(in srgb, var(--line) 40%, transparent);
}
.tl-tick--weekend { background: color-mix(in srgb, var(--ink) 3%, transparent); }
.tl-tick--today { background: var(--zs-t); }
.tl-tick-label {
  font-size: calc(var(--font-scale, 1) * 10px); color: var(--ink3);
  white-space: nowrap; overflow: hidden;
  font-variant-numeric: tabular-nums;
}
.tl-tick--today .tl-tick-label { color: var(--zs); font-weight: 700; }

/* 今天线=朱砂竖线（REQ §二 排期色带标准） */
.tl-today-line {
  position: absolute; top: 32px; bottom: 0;
  width: 2px; background: var(--zs);
  z-index: 2; pointer-events: none;
}

.tl-rows { position: relative; padding: 8px 0; }
.tl-row {
  display: flex; align-items: center;
  height: 36px; position: relative;
}
.tl-row-label {
  position: sticky; left: 0; z-index: 3;
  width: 140px; min-width: 140px; flex-shrink: 0;
  padding: 0 8px;
  display: flex; align-items: center; gap: 4px;
  background: var(--card);
  border-right: 1px solid var(--line);
  overflow: hidden;
}
.tl-row-no { font-size: calc(var(--font-scale, 1) * 11px); font-weight: 700; color: var(--ink3); white-space: nowrap; font-family: var(--f-d); }
.tl-row-name {
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tl-bar {
  position: absolute; top: 6px; height: 24px;
  border-radius: 4px; cursor: pointer;
  display: flex; align-items: center;
  padding: 0 6px; overflow: hidden;
  transition: filter 0.15s;
  touch-action: none; /* 重做：移动端拖拽改期不被浏览器滚动接管 */
}
.tl-bar:hover { filter: brightness(1.1); }
.tl-bar-text {
  font-size: calc(var(--font-scale, 1) * 11px); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}

/* ─── v0.28: 时间条拖拽 handle + 浮动日期标签 ─── */
.tl-handle {
  position: absolute; top: 0; bottom: 0;
  width: 14px;
  cursor: col-resize;
  touch-action: none; /* 移动端：阻止浏览器接管滚动手势，拖拽优先 */
  z-index: 1;
}
.tl-handle--start { left: 0; }
.tl-handle--end { right: 0; }
/* hover / 拖拽中显示竖线指示可拖 */
.tl-handle::after {
  content: '';
  position: absolute; top: 3px; bottom: 3px;
  width: 2px; border-radius: 1px;
  background: rgba(255, 255, 255, 0.85);
  opacity: 0;
  transition: opacity 0.15s;
}
.tl-handle--start::after { left: 3px; }
.tl-handle--end::after { right: 3px; }
.tl-handle:hover::after { opacity: 1; }
.tl-bar--dragging { box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6); }
.tl-bar--dragging .tl-handle::after { opacity: 1; }
/* REQ-019: 可整体平移的横条——中间区域 grab 光标 */
.tl-bar--movable { cursor: grab; }
.tl-bar--movable.tl-bar--dragging { cursor: grabbing; }

/* 拖拽浮动日期标签（Teleport 到 body，fixed 跟随指针；
   Teleport 出 artist-scope 但仍在 html[data-artist-theme] 子树内，token 可继承） */
.tl-drag-label {
  position: fixed;
  transform: translate(-50%, calc(-100% - 10px));
  background: var(--hq);
  color: #fff;
  font-size: calc(var(--font-scale, 1) * 12px); font-weight: 600;
  line-height: 1;
  padding: 5px 9px; border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 3000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 768px) {
  .tl-row-label { width: 100px; min-width: 100px; }
  .tl-row-name { font-size: calc(var(--font-scale, 1) * 11px); }
  .tl-tick-label { font-size: calc(var(--font-scale, 1) * 9px); }
  .tl-handle { width: 24px; } /* 触摸热区扩大 */
}
</style>
