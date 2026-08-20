<template>
  <!-- ═══ v0.25 D: 时间条视图（SPEC-005 §3；2026-08-20 二轮回胀拆分自 QueueBoardCalendar，纯搬移零行为变化） ═══ -->
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
          <el-radio-button value="1y">{{ $t('queue.tlZoom1y') }}</el-radio-button>
        </el-radio-group>
        <el-button v-if="!tlIsTodayVisible" text size="small" @click="tlGoToday">{{ $t('queue.calToday') }}</el-button>
      </div>
    </div>
    <!-- oimimo 吸纳批二：显示范围过滤（默认仅进行中，防已完成老横条挤空可视区） -->
    <div class="tl-toolbar">
      <div class="field-text">
        <div class="lab">{{ $t('queue.tlFilterLabel') }}</div>
        <div class="desc">{{ $t('queue.tlFilterDesc') }}</div>
      </div>
      <div class="ctrl">
        <el-radio-group :model-value="tlFilterActive" size="small" @update:model-value="setTlFilter">
          <el-radio-button :value="true">{{ $t('queue.tlFilterActiveOnly') }}</el-radio-button>
          <el-radio-button :value="false">{{ $t('queue.tlFilterAll') }}</el-radio-button>
        </el-radio-group>
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

    <!-- 图例（与月历同款；样式规则与 QueueBoardCalendar 月历图例保持一致） -->
    <div class="cal-legend">
      <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--formal"></i>{{ $t('queue.calLegendFormal') }}</span>
      <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--buffer"></i>{{ $t('queue.calLegendBuffer') }}</span>
      <span class="cal-legend-item"><i class="cal-legend-swatch cal-band--soon"></i>{{ $t('queue.calLegendSoon') }}</span>
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

    <UndoToast
      :visible="undoToastVisible"
      :message="undoToastMessage"
      :label="t('queue.tlUndo')"
      @undo="onTlUndo"
      @timeout="undoToastVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import type { PropType } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { artistApi } from '../../../api/index'
import type { ApiError } from '../../../api/index'
import UndoToast from '../UndoToast.vue'
// v0.38: 统一墨线空状态（REQ-026 §二）
import InkEmpty from '../visual/InkEmpty.vue'
// 2026-08-10 拆分批：时间条状态机抽 composable（纯搬移零行为变化）
import { useQueueTimeline } from '../../../composables/useQueueTimeline'
import type { CalOrder, BoardOrderLite } from './queue-band'
import { bandClass, parseDate, dateKey } from './queue-band'
import { bandLabel as bandLabelBase, bandTooltip as bandTooltipBase } from './queue-band'

const { t } = useI18n()
const router = useRouter()

/** 共享带函数的 t 包装（模板内同名直调，与拆分前签名一致） */
function bandLabel(order: BoardOrderLite) { return bandLabelBase(order, t) }
function bandTooltip(order: BoardOrderLite) { return bandTooltipBase(order, t) }

const props = defineProps({
  queue: { type: Array as PropType<CalOrder[]>, required: true },
  bufferQueue: { type: Array as PropType<CalOrder[]>, default: () => [] },
  loading: { type: Boolean, default: false },
  bufferLoading: { type: Boolean, default: false }
})
const emit = defineEmits(['refresh-all'])

/** 全部日历订单（正式 + 缓冲合并，带 zone 标记） */
const calOrders = computed<CalOrder[]>(() => [
  ...props.queue.map((o): CalOrder => ({ ...o, _zone: 'formal' })),
  ...props.bufferQueue.map((o): CalOrder => ({ ...o, _zone: 'buffer' }))
])

let tlDragHappened = false // 拖拽刚结束，抑制 click 跳转
let tlDragResetTimer: number | null = null
function goOrder(order: BoardOrderLite) {
  if (tlDragHappened) return // 拖拽松手不跳转
  router.push(`/orders/${order.id}?from=queue`)
}

onUnmounted(() => { if (tlDragResetTimer) clearTimeout(tlDragResetTimer) }) // a1: 50ms 复位定时器随组件卸载清理

// ─── v0.25 D: 时间条视图状态机装配（2026-08-10 拆分：useQueueTimeline，纯搬移零行为变化） ───
const {
  tlZoom, changeTlZoom: setTlZoom, tlDayWidth,
  tlFilterActive, setTlFilter,
  tlScrollEl: tlScrollRef, onTlScroll, tlCanvasWidth, tlTicks,
  tlTodayX, tlIsTodayVisible, tlGoToday, tlRows: rawTlRows,
  tlAxisPanning, onTlCanvasWheel, onTlCanvasDown, onTlCanvasMove, onTlCanvasUp, onTlCanvasCancel,
  tlDrag, tlDragLabelText, tlBarStyle,
  tlCanDragStart, tlCanDragEnd, tlCanDragMove,
  onTlHandleDown, onTlBarDown, onTlHandleMove, onTlHandleUp, onTlHandleCancel,
  undoToastVisible, undoToastMessage, onTlUndo
} = useQueueTimeline({
  calOrders,
  getViewMode: () => 'timeline',
  findOrder: (id) => props.queue.find(o => o.id === id) || props.bufferQueue.find(o => o.id === id),
  onRefreshAll: () => emit('refresh-all'),
  dateKey, parseDate,
  // 拖拽松手抑制 click 跳转：标记宿主持有（上方 goOrder 消费），composable 经此回写
  markDragHappened: () => {
    tlDragHappened = true
    tlDragResetTimer = setTimeout(() => { tlDragHappened = false }, 50)
  }
})

// 模板 ref 别名：tl-scroll 容器（composable 持 ref，同名别名供模板绑定，零运行时差异）
const tlScrollEl = tlScrollRef
void tlScrollEl // 模板侧消费（ref 绑定），此处保 setup 作用域引用计数

/** composable 行的 order 为轻量形状（无 order_no）：读取时补单号（运行时补出 undefined 与原状一致，仅类型补齐） */
const tlRows = computed(() => rawTlRows.value.map(row => ({
  ...row,
  order: {
    ...row.order,
    order_no: (props.queue.find(o => o.id === row.order.id) || props.bufferQueue.find(o => o.id === row.order.id))?.order_no
  }
})))

// el-radio-group 的 update:model-value emit 为宽类型；缩放键五档字面量（oimimo 吸纳批二补 1y）
//（composable 内部 TL_ZOOMS 守卫兜底，断言安全）
type TlZoomKeyLite = '2w' | '1m' | '3m' | '6m' | '1y'
function changeTlZoom(val: string | number | boolean | undefined) {
  setTlZoom(val as TlZoomKeyLite)
}

// ─── 时间条改期对话框（键盘等价：替代拖拽 handle；与 onTlHandleUp 同 API/乐观锁） ───
const dateEditVisible = ref(false)
const dateEditOrder = ref<BoardOrderLite | null>(null)
const dateEditStart = ref('')
const dateEditDeadline = ref('')
const dateEditSaving = ref(false)

function openDateEdit(order: BoardOrderLite) {
  dateEditOrder.value = order
  dateEditStart.value = order.startDate || ''
  dateEditDeadline.value = order.deadline || ''
  dateEditVisible.value = true
}
function dateEditStartDisabled(d: Date) {
  if (dateEditDeadline.value) return d > new Date(dateEditDeadline.value + 'T00:00:00')
  return false
}
function dateEditDeadlineDisabled(d: Date) {
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
    if ((err as ApiError)?.code === 'ORDER_CONFLICT') ElMessage.warning(t('queue.tlOrderConflict'))
    else ElMessage.error((err as Error).message)
    emit('refresh-all')
  } finally {
    dateEditSaving.value = false
  }
}
</script>

<style scoped>
/* 图例（与月历视图同款；规则与 QueueBoardCalendar 保持一致） */
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
/* 图例色样状态色（与月历订单带同源） */
.cal-band--formal { background: var(--hq); }
.cal-band--buffer {
  background: color-mix(in srgb, var(--buf) 26%, transparent);
  border: 1px dashed var(--buf);
}
.cal-band--nodeadline {
  background: repeating-linear-gradient(
    45deg,
    var(--paper2),
    var(--paper2) 3px,
    var(--line) 3px,
    var(--line) 6px
  );
  border: 1px solid var(--line2);
}
.cal-band--overdue { background: var(--zs); }
.cal-band--soon { background: var(--th); }
.cal-band--done { background: var(--sl); }

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
