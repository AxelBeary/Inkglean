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
            'cal-cell--weekend': cell.weekend
          }"
        >
          <span class="cal-day-num">{{ cell.day }}</span>
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
                @click="goOrder(band.order)"
              >
                <span class="cal-band-text">{{ bandLabel(band.order) }}</span>
              </div>
            </el-tooltip>
            <div v-if="cell.bands.length > 3" class="cal-band-more">+{{ cell.bands.length - 3 }}</div>
          </div>
        </div>
      </div>

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
        <el-radio-group v-model="tlZoom" size="small" @change="saveTlZoom">
          <el-radio-button value="2w">{{ $t('queue.tlZoom2w') }}</el-radio-button>
          <el-radio-button value="1m">{{ $t('queue.tlZoom1m') }}</el-radio-button>
          <el-radio-button value="3m">{{ $t('queue.tlZoom3m') }}</el-radio-button>
          <el-radio-button value="6m">{{ $t('queue.tlZoom6m') }}</el-radio-button>
        </el-radio-group>
        <el-button v-if="!tlIsTodayVisible" text size="small" @click="tlGoToday">{{ $t('queue.calToday') }}</el-button>
      </div>

      <div class="tl-scroll" ref="tlScrollEl">
        <div class="tl-canvas" :style="{ width: tlCanvasWidth + 'px' }">
          <!-- 日期刻度头 -->
          <div class="tl-axis" :style="{ width: tlCanvasWidth + 'px' }">
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
import { ref, computed, watch, nextTick } from 'vue'
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
      bands
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
// v0.36 波1: 四档缩放（画布宽度分别 672/960/1080/1274px，均 ≤2000px）
const TL_ZOOMS = {
  '2w': { days: 14, dayWidth: 48 },
  '1m': { days: 30, dayWidth: 32 },
  '3m': { days: 90, dayWidth: 12 },
  '6m': { days: 182, dayWidth: 7 }
}
// localStorage 兼容：老版本存的 '2m' 档已删除，落到 '3m'
const storedTlZoom = localStorage.getItem(TL_ZOOM_KEY)
const tlZoom = ref(TL_ZOOMS[storedTlZoom] ? storedTlZoom : (storedTlZoom === '2m' ? '3m' : '2w'))
function saveTlZoom(val) { localStorage.setItem(TL_ZOOM_KEY, val) }

/** 可见窗口中心日期（默认今天，"回到今天"重置） */
const tlCenter = ref(startOfDay(new Date()))
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }

const tlDayWidth = computed(() => TL_ZOOMS[tlZoom.value].dayWidth)
const tlDays = computed(() => TL_ZOOMS[tlZoom.value].days)
/** 可见窗口起点（中心 - 天数/2） */
const tlRangeStart = computed(() => {
  const c = tlCenter.value
  return new Date(c.getFullYear(), c.getMonth(), c.getDate() - Math.floor(tlDays.value / 2))
})
const tlCanvasWidth = computed(() => tlDays.value * tlDayWidth.value)

/** 日期 → 画布 x 坐标（可为负/超出，由裁剪逻辑处理） */
function tlX(date) {
  const ms = startOfDay(date).getTime() - tlRangeStart.value.getTime()
  return Math.round(ms / 86_400_000) * tlDayWidth.value
}

/** 日期刻度数组
 * v0.36 波1 刻度密度适配：
 * - dayWidth ≥ 32（2w/1m）：每天标签 M/D
 * - 16 ≤ dayWidth < 32：每天标签，仅日号
 * - 8 ≤ dayWidth < 16（3m）：仅周一出标签（日号），避免重叠
 * - dayWidth < 8（6m）：仅每月 1 号出标签（短月名），周末染色跳过
 */
const tlTicks = computed(() => {
  const ticks = []
  const todayKey = dateKey(new Date())
  const start = tlRangeStart.value
  const dw = tlDayWidth.value
  const monthFmt = new Intl.DateTimeFormat(locale.value === 'zh-CN' ? 'zh-CN' : 'en', { month: 'short' })
  for (let i = 0; i < tlDays.value; i++) {
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

/** 今天参考线 x（不在可见窗口内 → null） */
const tlTodayX = computed(() => {
  const today = startOfDay(new Date())
  if (today < tlRangeStart.value) return null
  const x = tlX(today)
  return x > tlCanvasWidth.value ? null : x + Math.floor(tlDayWidth.value / 2)
})
const tlIsTodayVisible = computed(() => tlTodayX.value != null)
function tlGoToday() { tlCenter.value = startOfDay(new Date()) }

/** 时间条行：按确认日排序，横条裁剪到可见窗口；未设截稿 → 画满到窗口末端 */
const tlRows = computed(() => {
  const winStart = tlRangeStart.value
  const winEnd = new Date(winStart.getFullYear(), winStart.getMonth(), winStart.getDate() + tlDays.value - 1)
  return calOrders.value
    .map(order => {
      const rawStart = parseDate(order.startDate) || parseDate(order.created_at) || parseDate(order.confirmed_at)
      if (!rawStart) return null
      const start = startOfDay(rawStart)
      const rawEnd = parseDate(order.deadline)
      const noDeadline = !rawEnd
      const end = rawEnd ? startOfDay(rawEnd) : winEnd // 未设截稿：画满到可见窗口末端
      if (end < winStart || start > winEnd) return null // 与窗口无交集
      // 裁剪到窗口
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
const tlScrollEl = ref(null)
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

.cal-bands { display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
.cal-band {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: calc(var(--font-scale, 1) * 11px); line-height: 1.4;
  cursor: pointer;
  transition: filter 0.15s, transform 0.1s;
  overflow: hidden;
}
.cal-band:hover { filter: brightness(1.08); transform: translateX(1px); }
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
}

/* ─── v0.25 D: 时间条视图（v0.38 换肤；今天线朱砂 = REQ §二） ─── */
.tl { min-height: 300px; }
.tl-toolbar {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 12px;
}
.tl-scroll {
  overflow-x: auto; overflow-y: visible;
  border: 1px solid var(--line); border-radius: var(--r-m);
  background: var(--card);
  -webkit-overflow-scrolling: touch;
}
.tl-canvas { position: relative; min-width: 100%; }
.tl-axis {
  position: relative; height: 32px;
  border-bottom: 1px solid var(--line);
  background: var(--paper2);
}
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
