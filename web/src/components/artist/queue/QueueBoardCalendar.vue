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
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--nodeadline"></i>{{ $t('queue.calLegendNoDeadline') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--overdue"></i>{{ $t('queue.calLegendOverdue') }}</span>
        <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--done"></i>{{ $t('queue.calLegendDone') }}</span>
      </div>
    </div>
  </template>
  <!-- ═══ v0.25 D: 时间条视图（SPEC-005 §3） ═══ -->
  <template v-else>
    <div class="tl" v-loading="loading || bufferLoading">
      <!-- 818-H：工具栏按行结构整理（说明在左、控件在右） -->
      <div class="tl-toolbar">
        <div class="field-text">
          <div class="lab">{{ $t('queue.tlZoomLabel') }}</div>
          <div class="desc">{{ $t('queue.tlZoomDesc') }}</div>
        </div>
        <div class="ctrl">
          <el-radio-group :model-value="tlZoom" size="small" @update:model-value="changeTlZoom">
            <el-radio-button value="2w">{{ $t('queue.tlZoom2w') }}</el-radio-button>
            <el-radio-button value="1m">{{ $t('queue.tlZoom1m') }}</el-radio-button>
            <el-radio-button value="3m">{{ $t('queue.tlZoom3m') }}</el-radio-button>
            <el-radio-button value="6m">{{ $t('queue.tlZoom6m') }}</el-radio-button>
          </el-radio-group>
          <el-button v-if="!tlIsTodayVisible" text size="small" @click="tlGoToday">{{ $t('queue.calToday') }}</el-button>
        </div>
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
                <!-- v127①：客户身份主显示，单号降为前置小字 -->
                <span class="tl-row-name">{{ bandLabel(row.order) }}</span>
                <span class="tl-row-no">#{{ row.order.order_no }}</span>
                <!-- 键盘等价：时间条拖拽改期的替代路径 -->
                <button
                  v-if="!['done', 'delivered', 'cancelled'].includes(row.order.status)"
                  type="button" class="tl-edit-btn"
                  :aria-label="$t('queue.tlEditDates')" :title="$t('queue.tlEditDates')"
                  @click.stop="openDateEdit(row.order)"
                >
                  ✎
                </button>
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

      <!-- 键盘等价：时间条改期对话框（替代拖拽 handle） -->
      <el-dialog
        v-model="dateEditVisible"
        :title="$t('queue.tlEditDates')"
        width="min(92vw, 420px)"
        :close-on-click-modal="false"
      >
        <el-form label-position="top">
          <el-form-item :label="$t('queue.tlEditStart')">
            <el-date-picker
              v-model="dateEditStart" type="date" value-format="YYYY-MM-DD"
              style="width: 100%" :disabled-date="dateEditStartDisabled"
            />
          </el-form-item>
          <el-form-item :label="$t('queue.tlEditDeadline')">
            <el-date-picker
              v-model="dateEditDeadline" type="date" value-format="YYYY-MM-DD"
              clearable style="width: 100%" :disabled-date="dateEditDeadlineDisabled"
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="dateEditVisible = false">{{ $t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="dateEditSaving" @click="saveDateEdit">
            {{ $t('common.save') }}
          </el-button>
        </template>
      </el-dialog>
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
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { artistApi } from '../../../api/index.js'
import UndoToast from '../UndoToast.vue'
// v0.38: 统一墨线空状态（REQ-026 §二）
import InkEmpty from '../visual/InkEmpty.vue'
// 2026-08-10 拆分批：时间条状态机抽 composable（纯搬移零行为变化）
import { useQueueTimeline } from '../../../composables/useQueueTimeline.js'

const { t } = useI18n()
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

// ─── 时间条改期对话框（键盘等价：替代拖拽 handle；与 onTlHandleUp 同 API/乐观锁） ───
const dateEditVisible = ref(false)
const dateEditOrder = ref(null)
const dateEditStart = ref('')
const dateEditDeadline = ref('')
const dateEditSaving = ref(false)

function openDateEdit(order) {
  dateEditOrder.value = order
  dateEditStart.value = order.startDate || ''
  dateEditDeadline.value = order.deadline || ''
  dateEditVisible.value = true
}
function dateEditStartDisabled(d) {
  if (dateEditDeadline.value) return d > new Date(dateEditDeadline.value + 'T00:00:00')
  return false
}
function dateEditDeadlineDisabled(d) {
  if (dateEditStart.value) return d < new Date(dateEditStart.value + 'T00:00:00')
  return false
}
async function saveDateEdit() {
  const order = dateEditOrder.value
  if (!order) return
  const start = dateEditStart.value || null
  const deadline = dateEditDeadline.value || null
  if (start && deadline && start > deadline) {
    ElMessage.warning(t('queue.tlDragDeadlineBeforeStart'))
    return
  }
  dateEditSaving.value = true
  try {
    const src = props.queue.find(o => o.id === order.id) || props.bufferQueue.find(o => o.id === order.id)
    let version = src?.version
    const oldStart = src?.startDate || null
    const oldDeadline = src?.deadline || null
    // 两步 PUT 带乐观锁，顺序避开后端交叉校验 400（与拖拽 onTlHandleUp 同款）
    if (start && deadline && oldDeadline && start > oldDeadline) {
      const first = await artistApi.updateDeadline(order.id, deadline, { version })
      version = first?.version
      const second = await artistApi.updateStartDate(order.id, start, { version })
      version = second?.version
    } else if (start && deadline && oldStart && deadline < oldStart) {
      const first = await artistApi.updateStartDate(order.id, start, { version })
      version = first?.version
      const second = await artistApi.updateDeadline(order.id, deadline, { version })
      version = second?.version
    } else {
      if (start && start !== oldStart) {
        const res = await artistApi.updateStartDate(order.id, start, { version })
        version = res?.version
      }
      if (deadline !== oldDeadline) {
        const res = await artistApi.updateDeadline(order.id, deadline, { version })
        version = res?.version
      }
    }
    dateEditVisible.value = false
    ElMessage.success(t('queue.tlDateSaved'))
    emit('refresh-all')
  } catch (err) {
    if (err?.code === 'ORDER_CONFLICT') ElMessage.warning(t('queue.tlOrderConflict'))
    else ElMessage.error(err.message)
    emit('refresh-all')
  } finally {
    dateEditSaving.value = false
  }
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
      free: d.getMonth() === first.getMonth() && d >= todayStart && bands.length === 0
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
  // 围剿 a1-7: 逾期判定按本地日归零比较（parseDate('YYYY-MM-DD') 是 UTC 零点，UTC+8 下今天截稿当天不应显逾期；
  // 同 OrderDetail daysLeft 写法）
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  if (deadline && deadline < todayStart && !['delivered', 'done'].includes(order.status)) {
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
let tlDragResetTimer = null
function goOrder(order) {
  if (tlDragHappened) return // 拖拽松手不跳转
  router.push(`/orders/${order.id}?from=queue`)
}

onUnmounted(() => { if (tlDragResetTimer) clearTimeout(tlDragResetTimer) }) // a1: 50ms 复位定时器随组件卸载清理

// ─── v0.25 D: 时间条视图状态机装配（2026-08-10 拆分：useQueueTimeline，纯搬移零行为变化） ───
const {
  tlZoom, changeTlZoom, tlDayWidth,
  tlScrollEl, onTlScroll, tlCanvasWidth, tlTicks,
  tlTodayX, tlIsTodayVisible, tlGoToday, tlRows,
  tlAxisPanning, onTlCanvasWheel, onTlCanvasDown, onTlCanvasMove, onTlCanvasUp, onTlCanvasCancel,
  tlDrag, tlDragLabelText, tlBarStyle,
  tlCanDragStart, tlCanDragEnd, tlCanDragMove,
  onTlHandleDown, onTlBarDown, onTlHandleMove, onTlHandleUp, onTlHandleCancel,
  undoToastVisible, undoToastMessage, onTlUndo
} = useQueueTimeline({
  calOrders,
  getViewMode: () => props.viewMode,
  findOrder: (id) => props.queue.find(o => o.id === id) || props.bufferQueue.find(o => o.id === id),
  onRefreshAll: () => emit('refresh-all'),
  dateKey, parseDate,
  // 拖拽松手抑制 click 跳转：标记宿主持有（上方 goOrder 消费），composable 经此回写
  markDragHappened: () => {
    tlDragHappened = true
    tlDragResetTimer = setTimeout(() => { tlDragHappened = false }, 50)
  }
})
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

/* ─── v0.25 D: 时间条视图（v0.38 换肤；今天线朱砂 = REQ §二） ─── */
.tl { min-height: 300px; }
.tl-toolbar {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  margin-bottom: 12px;
}
.field-text { min-width: 0; }
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; line-height: 1.5; }
.ctrl { display: flex; align-items: center; gap: 12px; min-width: 0; flex-wrap: wrap; }

@media (max-width: 720px) {
  .tl-toolbar { grid-template-columns: 1fr; }
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
.tl-edit-btn {
  margin-left: auto;
  flex: none;
  width: 22px; height: 22px; padding: 0;
  border: none; border-radius: var(--r-s);
  background: none; color: var(--ink3);
  font-size: calc(var(--font-scale, 1) * 12px); line-height: 1;
  cursor: pointer;
  transition: color var(--dur-fast), background var(--dur-fast);
}
.tl-edit-btn:hover { color: var(--hq); background: var(--hq-t); }
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
  transition: filter var(--dur-fast);
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
  transition: opacity var(--dur-fast);
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
