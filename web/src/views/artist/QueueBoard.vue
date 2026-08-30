<template>
  <h2 class="font-display queue-page-title">{{ $t('queue.title') }}</h2>
  <p class="hint">{{ $t('queue.hint') }}</p>

  <!-- 820-M: 视图切换改 el-tabs（对齐价格管理 tab-change + EP 自带切换过渡）。
       三页签全部非 lazy 保活：队列数据在父级 ref，月历月份/时间条缩放与滚动/列表滚动各自实例内保存，
       切视图不丢已加载数据与视图状态。
       queue-view-tabs：新手导览第 3 步锚点（原自绘 .view-switch 已随 820-M 改 el-tabs 消失，导览选择器同步改指此锚点内页签栏） -->
  <el-tabs v-model="viewMode" class="queue-view-tabs" style="margin-top: 16px" @tab-change="saveViewMode">
    <!-- ═══ 列表视图（拆 QueueBoardList，v0.41 瘦身批） ═══ -->
    <el-tab-pane :label="$t('queue.viewBoard')" name="board">
      <QueueBoardList
        :queue="queue"
        :focus-display="focusDisplay"
        :active-tab="activeTab"
        :loading="loading"
        :buffer-queue="bufferQueue"
        :buffer-loading="bufferLoading"
        :completed-queue="completedQueue"
        :completed-loading="completedLoading"
        :refresh-now="refreshNow"
        @update:queue="queue = $event"
        @update:focus-display="onFocusDisplayChange"
        @update:active-tab="activeTab = $event"
        @drag-end="onDragEnd"
        @open-deliver="openDeliverFor"
        @refresh-queue="loadQueue"
        @refresh-all="refreshAll"
      />
    </el-tab-pane>

    <!-- ═══ SPEC-005: 月历 / 时间条视图（拆 QueueBoardCalendar，v0.41 瘦身批） ═══
         月历与时间条各挂一个固定 viewMode 的实例：各自实例独立保活，月份/缩放/滚动状态互不丢失 -->
    <el-tab-pane :label="$t('queue.viewCalendar')" name="calendar">
      <QueueBoardCalendar
        :queue="(queue as never[])"
        :buffer-queue="(bufferQueue as never[])"
        :loading="loading"
        :buffer-loading="bufferLoading"
        :view-mode="'calendar'"
        @refresh-all="refreshAll"
      />
    </el-tab-pane>

    <el-tab-pane :label="$t('queue.viewTimeline')" name="timeline">
      <QueueBoardCalendar
        :queue="(queue as never[])"
        :buffer-queue="(bufferQueue as never[])"
        :loading="loading"
        :buffer-loading="bufferLoading"
        :view-mode="'timeline'"
        @refresh-all="refreshAll"
      />
    </el-tab-pane>
  </el-tabs>

  <!-- 方案 B: 交付弹窗（看板直接弹，含无文件交付） -->
  <DeliverDialog
    v-if="deliverOrderId"
    v-model="deliverDialogVisible"
    :order-id="deliverOrderId"
    @delivered="onDeliveredFromBoard"
  />
  <!-- REQ-037 C1: 拖拽排序成功撤销提示（5s 自动消失，UndoToast 组件） -->
  <UndoToast
    :visible="reorderToastVisible"
    :message="$t('queue.reorderSuccess')"
    :label="$t('queue.reorderUndo')"
    @undo="undoReorder"
    @timeout="reorderToastVisible = false"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { artistApi } from '../../api/index'
import { ElMessage } from 'element-plus'
import { safeGetItem, safeSetItem } from '../../utils/storage'
import { subscribeReconnect } from '../../utils/reconnect'
import DeliverDialog from '../../components/artist/DeliverDialog.vue'
import UndoToast from '../../components/artist/UndoToast.vue'
// v0.41 瘦身批：列表视图 → QueueBoardList，月历/时间条 → QueueBoardCalendar（零行为变化）
import QueueBoardList from '../../components/artist/queue/QueueBoardList.vue'
import QueueBoardCalendar from '../../components/artist/queue/QueueBoardCalendar.vue'
// v0.38: 统一墨线空状态（REQ-026 §二）
import { useSignatureRefresh } from '../../composables/useSignatureRefresh'
import type { QueueOrderItem } from '../../api/types'

const queue = ref<QueueOrderItem[]>([])
const loading = ref(true)

// 方案 B: 看板交付弹窗（直接弹，不跳详情页）
const deliverDialogVisible = ref(false)
const deliverOrderId = ref<number | null>(null)
function openDeliverFor(order: QueueOrderItem) {
  deliverOrderId.value = order.id
  deliverDialogVisible.value = true
}
async function onDeliveredFromBoard() {
  // 交付成功后刷新队列（状态变 delivered，名额释放）
  await loadQueue()
  // 05D-Q1: 完成区同步刷新（刚交付的订单立即出现在最近 7 天完成区）
  await loadCompletedQueue()
}
// P0-3b: 标签切换（正式区 / 缓冲区）——状态留父，切视图不丢
const activeTab = ref('formal')

// ─── R20: 焦点图显示模式（全局设置；仅 无/大 两态，旧值 small 映射为 large） ───
const FOCUS_DISPLAY_KEY = 'queue_focus_display'
// G-5: 裸读写换 safe 封装（存储禁用时按默认值降级，不抛错）
const focusDisplay = ref(
  safeGetItem(FOCUS_DISPLAY_KEY) === 'small' ? 'large'
    : (safeGetItem(FOCUS_DISPLAY_KEY) || 'large')
)
function saveFocusDisplay(val: string) {
  safeSetItem(FOCUS_DISPLAY_KEY, val)
}
/** 子组件 v-model 上抛 → 更新 ref + 持久化（原 el-radio-group v-model + @change 合并） */
function onFocusDisplayChange(val: string) {
  focusDisplay.value = val
  saveFocusDisplay(val)
}

// ─── SPEC-005: 视图切换（列表 / 月历 / 时间条）+ 默认视图（localStorage，复用"默认面板"模式）。
//    820-M: 自绘切换控件改 el-tabs，viewMode 即页签 v-model，切换时持久化 ───
const VIEW_MODE_KEY = 'queue_view_mode'
const VALID_VIEW_MODES = ['board', 'calendar', 'timeline']
const viewMode = ref(
  VALID_VIEW_MODES.includes(safeGetItem(VIEW_MODE_KEY) ?? '') ? (safeGetItem(VIEW_MODE_KEY) ?? 'board') : 'board'
)
function saveViewMode(val: string | number) {
  safeSetItem(VIEW_MODE_KEY, String(val))
}

// ─── M-8（审计 260830）: 加载统一序号守卫 ───
// 围剿 a1-5 序号模式延伸到加载路径：「推进/交付/重连」触发的 loadQueue 与拖拽重排请求并发在途时，
// 晚到的旧响应会用旧快照整体覆盖已确认数据。三区各持一个序号（refreshAll/onMounted 并发起跑，
// 缓冲区/完成区的号不能作废正式区，反之亦然）。
let loadSeq = 0
let bufferLoadSeq = 0
let completedLoadSeq = 0
// 围剿 a1-5: 拖拽排序请求序号——两次快速拖拽时仅最新序号写 queue/lastServerOrder，防旧响应乱序覆盖；
// M-8: loadQueue 每次发起也递增此号——加载先回时作废在途重排响应（原缺口：loadQueue 从不递增，守卫恒通过）
let reorderSeq = 0

async function loadQueue() {
  const mySeq = ++loadSeq
  reorderSeq++ // M-8: 作废在途拖拽重排响应（其写回归律认此序号）
  loading.value = true
  try {
    const data = await artistApi.getQueue()
    if (mySeq !== loadSeq) return // 晚到即旧快照，整体丢弃
    queue.value = data
    lastServerOrder.value = queue.value.map(o => o.id) // REQ-037 C1
    // M-8: 撤销基准同步到最新服务端确认顺序——撤销写错库的真实通道是 reorderUndoTarget（拖拽开始时的旧快照），
    // 加载改写顺序后它不得滞留旧快照（toast 亦随加载隐藏，此处兜住一切读取路径）
    reorderUndoTarget = lastServerOrder.value
    reorderToastVisible.value = false
  } catch (err) {
    if (mySeq !== loadSeq) return
    ElMessage.error((err instanceof Error ? err.message : '') || String(err))
  } finally {
    if (mySeq === loadSeq) loading.value = false // 过期响应不得提前熄灭新请求的 loading
  }
}

// ─── REQ-037 C1: 拖拽排序成功提示 + 软撤销（UndoToast 与时间条拖拽改期同款交互） ───
const reorderToastVisible = ref(false)
const lastServerOrder = ref<number[]>([])   // 最近一次服务端确认的正式区顺序（ids）
let reorderUndoTarget: number[] = []        // 本次拖拽前的顺序（撤销目标）

/** 撤销：把服务端顺序还原为拖拽前（失败则重拉兜底） */
async function undoReorder() {
  try {
    const restored = await artistApi.reorderQueue(reorderUndoTarget)
    queue.value = restored
    lastServerOrder.value = restored.map(o => o.id)
  } catch (err) {
    ElMessage.error((err instanceof Error ? err.message : '') || String(err))
    await loadQueue()
  } finally {
    reorderToastVisible.value = false
  }
}

/**
 * P1-2: 拖拽结束 — 发送完整排序后的 ID 数组
 * vuedraggable 已就地移动数组，直接把新顺序的 ID 列表发给后端
 */
async function onDragEnd(evt: { oldIndex?: number; newIndex?: number }) {
  const { oldIndex, newIndex } = evt
  if (oldIndex === newIndex) return

  reorderUndoTarget = lastServerOrder.value // REQ-037 C1: 撤销目标 = 拖拽前的服务端顺序
  const mySeq = ++reorderSeq
  try {
    const orderedIds = queue.value.map(item => item.id)
    const newQueue = await artistApi.reorderQueue(orderedIds)
    if (mySeq !== reorderSeq) return
    queue.value = newQueue
    lastServerOrder.value = newQueue.map(o => o.id)
    reorderToastVisible.value = true
  } catch (err) {
    // 守卫内（mySeq 已核对）：回滚重拉走 loadQueue 自己的 loadSeq 守卫
    if (mySeq !== reorderSeq) return
    ElMessage.error((err instanceof Error ? err.message : '') || String(err))
    // 回滚：重新加载
    await loadQueue()
  }
}

async function loadBufferQueue() {
  const mySeq = ++bufferLoadSeq
  bufferLoading.value = true
  try {
    const data = await artistApi.getQueue('buffer')
    if (mySeq !== bufferLoadSeq) return
    bufferQueue.value = data
  } catch (err) {
    if (mySeq !== bufferLoadSeq) return
    ElMessage.error((err instanceof Error ? err.message : '') || String(err))
  } finally {
    if (mySeq === bufferLoadSeq) bufferLoading.value = false
  }
}

/** REQ-013 #7: 加载完成区（最近 7 天已交付订单） */
async function loadCompletedQueue() {
  const mySeq = ++completedLoadSeq
  completedLoading.value = true
  try {
    const data = await artistApi.getQueue('completed')
    if (mySeq !== completedLoadSeq) return
    completedQueue.value = data
  } catch (err) {
    if (mySeq !== completedLoadSeq) return
    ElMessage.error((err instanceof Error ? err.message : '') || String(err))
  } finally {
    if (mySeq === completedLoadSeq) completedLoading.value = false
  }
}

// 子组件 API 变更后重拉（与 OrderDetail 拆分同款：composable 留父，子纯展示/事件上抛）
async function refreshAll() {
  await Promise.all([loadQueue(), loadBufferQueue(), loadCompletedQueue()])
}

// ─── SPEC-004: 缓冲区（候补订单列表 + 手动递补） ───
const bufferQueue = ref<QueueOrderItem[]>([])
const bufferLoading = ref(false)

// ─── REQ-013 #7: 完成区（最近 7 天已交付订单，沉底灰色展示） ───
const completedQueue = ref<QueueOrderItem[]>([])
const completedLoading = ref(false)

// ─── R33: 签名 URL 定时刷新（焦点图 15min 过期防 403；正式区+缓冲区+完成区统一收集） ───
const { refreshNow } = useSignatureRefresh({
  collect: () => [...queue.value, ...bufferQueue.value, ...completedQueue.value].filter(o => o.focus_image_path).map(o => o.focus_image_path as string),
  apply: (urlMap) => {
    for (const o of [...queue.value, ...bufferQueue.value, ...completedQueue.value]) {
      const path = o.focus_image_path
      if (path && urlMap[path]) o.focusImageUrl = urlMap[path]
    }
  }
})

let unsubscribeReconnect: (() => void) | null = null
onMounted(() => {
  loadQueue()
  loadBufferQueue()
  loadCompletedQueue()
  // G-3（R-16）: 断网重连后复用 refreshAll 重拉（online / 回前台）
  unsubscribeReconnect = subscribeReconnect(refreshAll)
})
onUnmounted(() => {
  unsubscribeReconnect?.()
})
</script>

<style scoped>
/* ═══ v0.38: 全页换肤到纸墨 token（REQ-026 §二；旧变量不残留——派工 §二.3） ═══ */
/* H1 页面标题：文楷 28/700（REQ §1.3，对齐价格管理页标题语言） */
.queue-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }
.hint { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 13px); margin: 8px 0 0; }
</style>
