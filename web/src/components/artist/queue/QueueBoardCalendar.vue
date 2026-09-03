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
          role="button"
          :tabindex="cell.bands.length ? 0 : -1"
          :aria-label="$t('queue.calDayViewTitle', { d: `${calYear}/${calMonth + 1}/${cell.day}`, n: cell.bands.length })"
          @click="openDayView(cell)"
          @keydown.enter.prevent="openDayView(cell)"
          @keydown.space.prevent="openDayView(cell)"
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
              <button
                type="button"
                class="cal-band"
                :class="bandClass(band.order)"
                :data-order-id="band.order.id"
                @click.stop="goOrder(band.order)"
              >
                <span class="cal-band-text">{{ bandLabel(band.order) }}</span>
              </button>
            </el-tooltip>
            <button
              v-if="cell.bands.length > 3" type="button" class="cal-band-more"
              :aria-label="$t('queue.calMoreOrders', { n: cell.bands.length - 3 })"
              @click.stop="openDayView(cell)"
            >
              +{{ cell.bands.length - 3 }}
            </button>
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
          <button
            v-for="order in dayDialogOrders" :key="order.id"
            type="button"
            class="cal-day-item"
            @click="goDayOrder(order)"
          >
            <span class="cal-day-item-band" :class="bandClass(order)">{{ bandLabel(order) }}</span>
            <span class="cal-day-item-no">#{{ order.order_no }}</span>
            <span class="cal-day-item-status">{{ t(`common.orderStatus.${order.status}`) }}</span>
          </button>
        </div>
      </el-dialog>

      <!-- 图例 -->
      <div class="cal-legend">
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--formal"></i>{{ $t('queue.calLegendFormal') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--buffer"></i>{{ $t('queue.calLegendBuffer') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--soon"></i>{{ $t('queue.calLegendSoon') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--nodeadline"></i>{{ $t('queue.calLegendNoDeadline') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--overdue"></i>{{ $t('queue.calLegendOverdue') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--done"></i>{{ $t('queue.calLegendDone') }}</span>
      </div>
    </div>
  </template>
  <!-- ═══ v0.25 D: 时间条视图（SPEC-005 §3）——2026-08-20 二轮回胀拆分整体移入 QueueTimelineView（纯搬移零行为变化） ═══ -->
  <QueueTimelineView
    v-else
    :queue="queue"
    :buffer-queue="bufferQueue"
    :loading="loading"
    :buffer-loading="bufferLoading"
    @refresh-all="$emit('refresh-all')"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { PropType } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import QueueTimelineView from './QueueTimelineView.vue'
// 2026-08-20 二轮回胀拆分：订单带形状与纯函数移入 queue-band（月历与时间条共用）
import type { CalOrder, BoardOrderLite } from './queue-band'
import { bandClass } from './queue-band'
import { bandLabel as bandLabelBase, bandTooltip as bandTooltipBase, parseDate, dateKey } from './queue-band'

const { t } = useI18n()
const router = useRouter()

const props = defineProps({
  queue: { type: Array as PropType<CalOrder[]>, required: true },
  bufferQueue: { type: Array as PropType<CalOrder[]>, default: () => [] },
  loading: { type: Boolean, default: false },
  bufferLoading: { type: Boolean, default: false },
  viewMode: { type: String, required: true },
  // F11 拍板 C：总量名额约束——名额/额度满、休息、暂停时父级传 false，月历空格不再标「可接单」（防「按天空闲」误导为「能接单」）
  canAccept: { type: Boolean, default: true }
})
defineEmits(['refresh-all'])

/** 共享带函数的 t 包装（模板内同名直调，与拆分前签名一致） */
function bandLabel(order: BoardOrderLite) { return bandLabelBase(order, t) }
function bandTooltip(order: BoardOrderLite) { return bandTooltipBase(order, t) }

/** 月订单带（订单 + 起止区间） */
interface CalBand {
  order: CalOrder
  range: { start: Date; end: Date; noDeadline: boolean }
}

/** 月历格子（42 格 = 6 行） */
interface CalCell {
  day: number
  inMonth: boolean
  isToday: boolean
  weekend: boolean
  bands: CalBand[]
  free: boolean
}

// ─── SPEC-005: 月历视图 ───
const WEEKDAY_KEYS = ['queue.calMon', 'queue.calTue', 'queue.calWed', 'queue.calThu', 'queue.calFri', 'queue.calSat', 'queue.calSun']

/** 当前可见月份（Date 对象，指向当月 1 日） */
const calCursor = ref(startOfMonth(new Date()))

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
const calYear = computed(() => calCursor.value.getFullYear())
const calMonth = computed(() => calCursor.value.getMonth())
const isCurrentMonth = computed(() => {
  const now = new Date()
  return calYear.value === now.getFullYear() && calMonth.value === now.getMonth()
})
function changeMonth(delta: number) {
  calCursor.value = new Date(calYear.value, calMonth.value + delta, 1)
}
function goToday() {
  calCursor.value = startOfMonth(new Date())
}

// ─── 批G(2026-08-08): 日视图展开 + 月份选择器 ───
const dayDialogVisible = ref(false)
const dayDialogOrders = ref<CalOrder[]>([])
const dayDialogDate = ref<Date | null>(null)
const dayDialogTitle = computed(() => {
  if (!dayDialogDate.value) return ''
  const d = dayDialogDate.value
  return t('queue.calDayViewTitle', {
    d: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
    n: dayDialogOrders.value.length
  })
})
/** 点击日期格 / "+N" → 打开当天完整订单列表（非当月格或空格不响应） */
function openDayView(cell: CalCell) {
  if (!cell || !cell.inMonth || cell.bands.length === 0) return
  dayDialogOrders.value = cell.bands.map(b => b.order)
  dayDialogDate.value = new Date(calYear.value, calMonth.value, cell.day)
  dayDialogVisible.value = true
}
function goDayOrder(order: BoardOrderLite) {
  dayDialogVisible.value = false
  router.push(`/orders/${order.id}?from=queue`)
}

/** 月份选择器（el-date-picker 月粒度，值 'YYYY-MM'；翻月头时联动） */
const calMonthPicker = ref(`${calYear.value}-${String(calMonth.value + 1).padStart(2, '0')}`)
watch(calCursor, (c) => {
  calMonthPicker.value = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}`
})
function onCalMonthPick(val: string) {
  if (!val) return
  calCursor.value = new Date(Number(val.slice(0, 4)), Number(val.slice(5, 7)) - 1, 1)
}

// ─── v0.25 E: 移动端翻月手势（水平滑动 > 50px 触发，参考 TplTierGrid 实现） ───
let calTouchStartX = 0
function onCalTouchStart(e: TouchEvent) {
  calTouchStartX = e.touches[0].clientX
}
function onCalTouchEnd(e: TouchEvent) {
  const deltaX = e.changedTouches[0].clientX - calTouchStartX
  if (Math.abs(deltaX) < 50) return
  changeMonth(deltaX < 0 ? 1 : -1)
}

/** 全部日历订单（正式 + 缓冲合并，带 zone 标记） */
const calOrders = computed<CalOrder[]>(() => [
  ...props.queue.map((o): CalOrder => ({ ...o, _zone: 'formal' })),
  ...props.bufferQueue.map((o): CalOrder => ({ ...o, _zone: 'buffer' }))
])

/** 订单带区间：开工日(start_date)→确认日(created_at) → 截稿日(deadline)；未设截稿 → 画满到可见月末 */
function bandRange(order: BoardOrderLite) {
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
  // 围剿 a1-6: 今天本地零点——已过去的无单日期不得标记为可接单
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
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
    .filter((b): b is CalBand => b != null)

  const cells: CalCell[] = []
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
      // F11 拍板 C: 叠加总量名额约束——画师名额/额度已满（canAccept=false）时空日子不再标可接单（按天空闲 ≠ 能接单）
      free: props.canAccept && d.getMonth() === first.getMonth() && d >= todayStart && bands.length === 0
    })
  }
  return cells
})

// 月历带点击跳详情（拖拽抑制标记随时间条拆分移入 QueueTimelineView——月历无拖拽路径，直接跳转）
function goOrder(order: BoardOrderLite) {
  router.push(`/orders/${order.id}?from=queue`)
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
  transition: border-color var(--dur-fast);
}
.cal-cell:focus-visible {
  outline: 2px solid var(--hq);
  outline-offset: -2px;
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
  width: 100%;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: inherit;
  transition: border-color var(--dur-fast), background var(--dur-fast);
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
  transition: filter var(--dur-fast);
  overflow: hidden;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: inherit;
  width: 100%;
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
/* 临期=藤黄预警（oimimo 吸纳批六：今天截稿或剩余 ≤3 天；语义在逾期与常规之间） */
.cal-band--soon {
  background: var(--th);
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
  border: none; background: none; font: inherit; cursor: pointer;
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
</style>
