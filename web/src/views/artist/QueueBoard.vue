<template>
  <ArtistLayout>
    <h2>{{ $t('queue.title') }}</h2>
    <p class="hint">{{ $t('queue.hint') }}</p>

    <!-- SPEC-005: 视图切换（列表 / 月历 / 时间条），默认视图存 localStorage -->
    <div class="view-switch">
      <SliderSwitch v-model="viewMode" :options="viewOptions" @change="saveViewMode" />
    </div>

    <!-- ═══ 列表视图（拆 QueueBoardList，v0.41 瘦身批） ═══ -->
    <QueueBoardList
      v-if="viewMode === 'board'"
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

    <!-- ═══ SPEC-005: 月历 / 时间条视图（拆 QueueBoardCalendar，v0.41 瘦身批） ═══ -->
    <QueueBoardCalendar
      v-else
      :queue="queue"
      :buffer-queue="bufferQueue"
      :loading="loading"
      :buffer-loading="bufferLoading"
      :view-mode="viewMode"
      @refresh-all="refreshAll"
    />
    <!-- 方案 B: 交付弹窗（看板直接弹，含无文件交付） -->
    <DeliverDialog
      v-if="deliverOrderId"
      v-model="deliverDialogVisible"
      :order-id="deliverOrderId"
      @delivered="onDeliveredFromBoard"
    />
  </ArtistLayout>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { safeGetItem, safeSetItem } from '../../utils/storage.js'
import { subscribeReconnect } from '../../utils/reconnect.js'
import ArtistLayout from '../../components/ArtistLayout.vue'
import DeliverDialog from '../../components/artist/DeliverDialog.vue'
import SliderSwitch from '../../components/artist/SliderSwitch.vue'
import { Odometer, Calendar, Clock } from '@element-plus/icons-vue'
// v0.41 瘦身批：列表视图 → QueueBoardList，月历/时间条 → QueueBoardCalendar（零行为变化）
import QueueBoardList from '../../components/artist/queue/QueueBoardList.vue'
import QueueBoardCalendar from '../../components/artist/queue/QueueBoardCalendar.vue'
// v0.38: 统一墨线空状态（REQ-026 §二）
import { useSignatureRefresh } from '../../composables/useSignatureRefresh.js'

const { t } = useI18n()

const queue = ref([])
const loading = ref(true)

// 方案 B: 看板交付弹窗（直接弹，不跳详情页）
const deliverDialogVisible = ref(false)
const deliverOrderId = ref(null)
function openDeliverFor(order) {
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
function saveFocusDisplay(val) {
  safeSetItem(FOCUS_DISPLAY_KEY, val)
}
/** 子组件 v-model 上抛 → 更新 ref + 持久化（原 el-radio-group v-model + @change 合并） */
function onFocusDisplayChange(val) {
  focusDisplay.value = val
  saveFocusDisplay(val)
}

// ─── SPEC-005: 视图切换（列表 / 月历 / 时间条）+ 默认视图（localStorage，复用"默认面板"模式） ───
const VIEW_MODE_KEY = 'queue_view_mode'
const VALID_VIEW_MODES = ['board', 'calendar', 'timeline']
const viewMode = ref(
  VALID_VIEW_MODES.includes(safeGetItem(VIEW_MODE_KEY)) ? safeGetItem(VIEW_MODE_KEY) : 'board'
)
function saveViewMode(val) {
  safeSetItem(VIEW_MODE_KEY, val)
}

// 05B: 三视图滑块选项（radiogroup 语义等价 el-radio-button）
const viewOptions = [
  { value: 'board', label: t('queue.viewBoard'), icon: Odometer },
  { value: 'calendar', label: t('queue.viewCalendar'), icon: Calendar },
  { value: 'timeline', label: t('queue.viewTimeline'), icon: Clock }
]

async function loadQueue() {
  loading.value = true
  try {
    queue.value = await artistApi.getQueue()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

/**
 * P1-2: 拖拽结束 — 发送完整排序后的 ID 数组
 * vuedraggable 已就地移动数组，直接把新顺序的 ID 列表发给后端
 */
async function onDragEnd(evt) {
  const { oldIndex, newIndex } = evt
  if (oldIndex === newIndex) return

  try {
    const orderedIds = queue.value.map(item => item.id)
    const newQueue = await artistApi.reorderQueue(orderedIds)
    queue.value = newQueue
    ElMessage.success(t('queue.orderUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
    // 回滚：重新加载
    await loadQueue()
  }
}

async function loadBufferQueue() {
  bufferLoading.value = true
  try {
    bufferQueue.value = await artistApi.getQueue('buffer')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    bufferLoading.value = false
  }
}

/** REQ-013 #7: 加载完成区（最近 7 天已交付订单） */
async function loadCompletedQueue() {
  completedLoading.value = true
  try {
    completedQueue.value = await artistApi.getQueue('completed')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    completedLoading.value = false
  }
}

// 子组件 API 变更后重拉（与 OrderDetail 拆分同款：composable 留父，子纯展示/事件上抛）
async function refreshAll() {
  await Promise.all([loadQueue(), loadBufferQueue(), loadCompletedQueue()])
}

// ─── SPEC-004: 缓冲区（候补订单列表 + 手动递补） ───
const bufferQueue = ref([])
const bufferLoading = ref(false)

// ─── REQ-013 #7: 完成区（最近 7 天已交付订单，沉底灰色展示） ───
const completedQueue = ref([])
const completedLoading = ref(false)

// ─── R33: 签名 URL 定时刷新（焦点图 15min 过期防 403；正式区+缓冲区+完成区统一收集） ───
const { refreshNow } = useSignatureRefresh({
  collect: () => [...queue.value, ...bufferQueue.value, ...completedQueue.value].filter(o => o.focus_image_path).map(o => o.focus_image_path),
  apply: (urlMap) => {
    for (const o of [...queue.value, ...bufferQueue.value, ...completedQueue.value]) {
      if (o.focus_image_path && urlMap[o.focus_image_path]) o.focusImageUrl = urlMap[o.focus_image_path]
    }
  }
})

let unsubscribeReconnect = null
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
.hint { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 13px); margin: 8px 0 16px; }

/* ─── SPEC-005: 视图切换（列表 / 月历 / 时间条） ─── */
.view-switch { margin-bottom: 16px; }
</style>
