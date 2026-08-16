<template>
  <!--
  QueueBoardList.vue — 队列看板列表视图（正式区 draggable 卡 + 缓冲区 + 完成区）
  拆分自 QueueBoard.vue（v0.41 瘦身批，零行为变化）：props 数据向下 / emit 事件向上，同 PaymentPanel 模式
  交互逻辑随卡移入（焦点图上传/滑块取消/左滑详情/递补），API 变更后 emit(refresh-queue|refresh-all) 由父重拉队列
-->
  <!-- R20: 焦点图显示模式（全局设置，存 localStorage；仅 无/大 两态） -->
  <div class="queue-toolbar">
    <span class="toolbar-label">{{ $t('queue.focusDisplay') }}</span>
    <SliderSwitch v-model="focusDisplayModel" size="small" :options="focusDisplayOptions" />
  </div>

  <!-- 工作流节点加载失败：隐藏推进按钮 + 错误提示 + 重试（不再静默无固定态） -->
  <div v-if="workflowLoadFailed" class="module-error">
    <span>{{ $t('queue.workflowLoadFailed') }}</span>
    <el-button size="small" @click="loadWorkflowStages">{{ $t('dashboard.retry') }}</el-button>
  </div>

  <!-- P0-3b: 标签切换（正式区 / 缓冲区） -->
  <el-tabs v-model="activeTabModel" class="queue-tabs">
    <el-tab-pane :label="$t('queue.tabFormal')" name="formal">
      <!-- M3: 加载期显示卡片骨架屏（不遮罩已渲染内容），正式区列表 v-if="!loading" -->
      <HySkeleton v-if="loading" count="6" />
      <div class="queue-container" v-if="!loading">
        <draggable
          v-model="queueModel"
          item-key="id"
          handle=".drag-handle"
          ghost-class="ghost"
          @end="(evt) => emit('drag-end', evt)"
          class="queue-list"
        >
          <template #item="{ element, index }">
            <div
              class="queue-item"
              :class="`priority-${element.priority}`"
              @pointerdown="onCardPointerDown"
              @pointerup="(e) => onCardPointerUp(e, element)"
            >
              <div class="drag-handle" :title="$t('queue.dragHint')" aria-hidden="true">⠿</div>
              <!-- 键盘等价：上移/下移（拖拽排序的可达替代，走同一条 drag-end 持久化） -->
              <div class="queue-move" role="group" :aria-label="$t('queue.reorderLabel')">
                <button
                  type="button" class="queue-move-btn" :disabled="index === 0"
                  :aria-label="$t('queue.moveUp')" :title="$t('queue.moveUp')"
                  @click.stop="moveQueueItem(element, -1)"
                >
                  ↑
                </button>
                <button
                  type="button" class="queue-move-btn" :disabled="index === queue.length - 1"
                  :aria-label="$t('queue.moveDown')" :title="$t('queue.moveDown')"
                  @click.stop="moveQueueItem(element, 1)"
                >
                  ↓
                </button>
              </div>
              <!-- 焦点图区域：大图模式显示焦点图，无焦点图时显示空态上传入口 -->
              <div v-if="focusDisplay === 'large'" class="focus-area">
                <!-- R53: 已有焦点图 — 点击选文件 / 拖拽图片替换（复用 uploadAndSetFocus；
                   移除 preview-src-list 避免 el-image 内置预览吞掉点击，R18 同款陷阱） -->
                <button
                  v-if="element.focus_image_path"
                  type="button"
                  class="focus-img-wrap"
                  :class="{ 'focus-img-wrap--active': focusDragId === element.id }"
                  :aria-label="$t('queue.replaceFocus')"
                  @click="triggerFocusUpload(element)"
                  @dragenter.capture="guardDragEnter"
                  @dragover.capture="guardDragOver"
                  @dragover.prevent="focusDragId = element.id"
                  @dragleave="onFocusDragLeave($event, element)"
                  @drop.prevent="handleFocusDrop($event, element)"
                >
                  <el-image
                    :src="element.focusImageUrl" fit="cover" class="focus-large-img"
                    :alt="$t('orderDetail.referenceImage')"
                    lazy decoding="async"
                    @error="() => refreshNow(element.focus_image_path)"
                  />
                  <div v-if="focusDragId === element.id" class="focus-replace-overlay">
                    <span>{{ $t('queue.dropToReplace') }}</span>
                  </div>
                </button>
                <!-- 空态上传：点击选文件 / 拖拽图片放入，上传后直接设为焦点图 -->
                <button
                  v-else
                  type="button"
                  class="focus-empty"
                  :class="{ 'focus-empty--active': focusDragId === element.id }"
                  :aria-label="$t('queue.uploadFocus')"
                  @click="triggerFocusUpload(element)"
                  @dragenter.capture="guardDragEnter"
                  @dragover.capture="guardDragOver"
                  @dragover.prevent="focusDragId = element.id"
                  @dragleave="onFocusDragLeave($event, element)"
                  @drop.prevent="handleFocusDrop($event, element)"
                >
                  <el-icon :size="20"><Plus /></el-icon>
                  <span class="focus-empty-text">{{ $t('queue.uploadFocus') }}</span>
                </button>
              </div>
              <div class="item-body">
                <div class="item-header">
                  <span class="order-no">#{{ element.order_no }}</span>
                  <el-tag :type="priorityType(element.priority)" size="small" effect="dark">
                    {{ $t(`common.priority.${element.priority}`) }}
                  </el-tag>
                  <el-tag :type="statusType(element.status)" size="small">
                    {{ $t(`common.orderStatus.${element.status}`) }}
                  </el-tag>
                  <!-- R30d: 当前流程节点名（打回时带 ↩ 标记） -->
                  <el-tag v-if="element.currentStageId != null" type="info" size="small" effect="plain" class="stage-tag">
                    {{ element.status === 'revision' ? '↩ ' : '' }}{{ element.currentStageName }}
                  </el-tag>
                </div>
                <div class="item-info">
                  <span>{{ element.tier_name || $t('common.custom') }}</span>
                  <span>·</span>
                  <span>QQ: {{ element.client_qq }}</span>
                  <span v-if="element.client_name">· {{ element.client_name }}</span>
                </div>
                <div class="item-desc" v-if="element.description">
                  {{ element.description.slice(0, 60) }}{{ element.description.length > 60 ? '...' : '' }}
                </div>
              </div>
              <div class="item-actions">
                <!-- R30d: 接入流程的订单 → "推进到下一节点"（替代固定状态按钮） -->
                <el-button
                  v-if="!workflowLoadFailed && element.currentStageId != null && canAdvance(element)"
                  size="small" type="primary" :loading="busyOrderIds.has(element.id)"
                  @click="advanceOrderStage(element)"
                >
                  {{ $t('queue.advanceStage') }}
                </el-button>
                <!-- REQ-013 #7: 工作流订单到达最后节点(done) → "去交付"跳转详情页（交付需上传文件） -->
                <el-button
                  v-else-if="element.currentStageId != null && element.status === 'done'"
                  size="small" type="success"
                  @click="emit('open-deliver', element)"
                >
                  {{ $t('queue.goDeliver') }}
                </el-button>
                <!-- R30b: 未接入流程的订单 → 固定状态主操作外露（Bug 4: 工作流订单不穿透到此按钮） -->
                <el-button
                  v-else-if="element.currentStageId == null && nextAction(element.status)"
                  size="small" :loading="busyOrderIds.has(element.id)"
                  :type="nextAction(element.status).type"
                  @click="quickAction(nextAction(element.status).command, element)"
                >
                  {{ $t(nextAction(element.status).labelKey) }}
                </el-button>
                <el-button size="small" @click="$router.push(`/orders/${element.id}?from=queue`)">{{ $t('common.detail') }}</el-button>
                <el-dropdown trigger="click" @command="(cmd) => quickAction(cmd, element)">
                  <el-button size="small">{{ $t('common.actions') }}</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="confirmed" v-if="element.status === 'pending' && element.currentStageId == null">{{ $t('queue.confirm') }}</el-dropdown-item>
                      <el-dropdown-item command="wip" v-if="element.status === 'confirmed' && element.currentStageId == null">{{ $t('queue.startWip') }}</el-dropdown-item>
                      <el-dropdown-item command="done" v-if="['wip','revision'].includes(element.status) && element.currentStageId == null">{{ $t('queue.done') }}</el-dropdown-item>
                      <el-dropdown-item command="delivered" v-if="element.status === 'done' && element.currentStageId == null">{{ $t('queue.deliver') }}</el-dropdown-item>
                      <el-dropdown-item command="cancelled" divided>{{ $t('queue.cancel') }}</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>

              <!-- R30e: 取消订单滑块确认（替代普通弹窗，防误触） -->
              <div v-if="cancellingId === element.id" class="slide-cancel-row">
                <div class="slide-cancel">
                  <div class="slide-cancel-fill" :style="{ width: `calc(${slideProgress} * 100%)` }"></div>
                  <span class="slide-cancel-label">{{ $t('queue.slideToCancel') }}</span>
                  <div
                    class="slide-cancel-thumb"
                    :style="{ left: `calc(2px + ${slideProgress} * (100% - 40px))` }"
                    @pointerdown="onSlideStart"
                    @pointermove="onSlideMove"
                    @pointerup="(e) => onSlideEnd(e, element)"
                  >
                    →
                  </div>
                </div>
                <el-button
                  text size="small" type="danger"
                  :disabled="cancellingBusyId === element.id"
                  @click="confirmSlideCancel(element)"
                >
                  {{ $t('queue.slideCancelConfirm') }}
                </el-button>
                <el-button text size="small" :aria-label="$t('common.close')" @click="closeSlideCancel">✕</el-button>
              </div>
            </div>
          </template>
        </draggable>

        <InkEmpty v-if="!loading && queue.length === 0" :title="$t('queue.empty')" />
      </div>

      <!-- REQ-013 #7: 完成区（留在正式区标签内，不随标签切换） -->
      <template v-if="completedQueue.length || completedLoading">
        <h3 class="completed-title">{{ $t('queue.completedTitle') }}</h3>
        <p class="completed-hint">{{ $t('queue.completedHint') }}</p>
        <div class="queue-container" v-loading="completedLoading">
          <div class="queue-list">
            <div
              v-for="element in completedQueue" :key="element.id"
              class="queue-item completed-item"
            >
              <div class="item-body">
                <div class="item-header">
                  <span class="order-no">#{{ element.order_no }}</span>
                  <el-tag type="success" size="small">{{ $t('common.orderStatus.delivered') }}</el-tag>
                  <el-tag v-if="element.currentStageId != null" type="info" size="small" effect="plain" class="stage-tag">
                    {{ element.currentStageName }}
                  </el-tag>
                </div>
                <div class="item-info">
                  <span>{{ element.tier_name || $t('common.custom') }}</span>
                  <span>·</span>
                  <span>QQ: {{ element.client_qq }}</span>
                  <span v-if="element.client_name">· {{ element.client_name }}</span>
                </div>
              </div>
              <div class="item-actions">
                <el-button size="small" @click="$router.push(`/orders/${element.id}?from=queue`)">{{ $t('common.detail') }}</el-button>
              </div>
            </div>
          </div>
          <InkEmpty v-if="!completedLoading && completedQueue.length === 0" :title="$t('queue.completedEmpty')" />
        </div>
      </template>
    </el-tab-pane>

    <!-- P0-3b: 缓冲区标签 -->
    <el-tab-pane :label="$t('queue.tabBuffer')" name="buffer">
      <p class="buffer-hint">{{ $t('queue.bufferHint') }}</p>
      <div class="queue-container" v-loading="bufferLoading">
        <div class="queue-list">
          <div
            v-for="element in bufferQueue" :key="element.id"
            class="queue-item buffer-item"
            :class="`priority-${element.priority}`"
          >
            <div v-if="focusDisplay === 'large'" class="focus-area">
              <el-image
                v-if="element.focus_image_path"
                :src="element.focusImageUrl" fit="cover" class="focus-large-img"
                :alt="$t('orderDetail.referenceImage')"
                lazy decoding="async"
                @error="() => refreshNow(element.focus_image_path)"
              />
              <div v-else class="focus-empty focus-empty--static">
                <el-icon :size="20"><Plus /></el-icon>
              </div>
            </div>
            <div class="item-body">
              <div class="item-header">
                <span class="order-no">#{{ element.order_no }}</span>
                <el-tag type="warning" size="small" effect="dark">{{ $t('queue.bufferTag') }}</el-tag>
                <el-tag :type="statusType(element.status)" size="small">
                  {{ $t(`common.orderStatus.${element.status}`) }}
                </el-tag>
              </div>
              <div class="item-info">
                <span>{{ element.tier_name || $t('common.custom') }}</span>
                <span>·</span>
                <span>QQ: {{ element.client_qq }}</span>
                <span v-if="element.client_name">· {{ element.client_name }}</span>
              </div>
            </div>
            <div class="item-actions">
              <el-button size="small" type="primary" @click="promoteOrder(element)" :loading="promotingId === element.id">
                {{ $t('queue.promote') }}
              </el-button>
              <el-button size="small" @click="$router.push(`/orders/${element.id}?from=queue`)">{{ $t('common.detail') }}</el-button>
            </div>
          </div>
        </div>
        <InkEmpty v-if="!bufferLoading && bufferQueue.length === 0" :title="$t('queue.bufferEmpty')" />
      </div>
    </el-tab-pane>
  </el-tabs>

  <!-- 焦点图空态上传：隐藏文件选择器（点击占位按钮触发） -->
  <input
    ref="focusInputEl" type="file" accept="image/*" hidden
    @change="handleFocusFileSelect"
  />

  <!-- 815 拍板 #1：取消后 5 秒撤销提示 -->
  <CancelUndoToast
    v-if="cancelUndo.visible"
    :label="cancelUndo.label"
    :window-ms="cancelUndo.windowMs"
    @undo="onUndoCancel"
    @expire="cancelUndo.visible = false"
  />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import draggable from 'vuedraggable'
import { artistApi } from '../../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import InkEmpty from '../visual/InkEmpty.vue'
import SliderSwitch from '../SliderSwitch.vue'
import CancelUndoToast from '../CancelUndoToast.vue'
// M3: 订单卡片骨架屏（加载期替代 v-loading 遮罩）
import HySkeleton from '../../shared/HySkeleton.vue'
import { useDropGuard } from '../../../composables/useDropGuard.js'
import { statusType, priorityType } from '../../../constants/order.js'
import { MAX_IMAGE_BYTES } from '../../../constants/upload.js'
import { formatCents } from '../../../utils/money.js'
import { uploadReferenceWithAnonToken, AnonTokenUnavailableError } from '../../../utils/anonUpload.js'

const { t } = useI18n()
const router = useRouter()

const props = defineProps({
  queue: { type: Array, required: true },
  focusDisplay: { type: String, default: 'large' },
  activeTab: { type: String, default: 'formal' },
  loading: { type: Boolean, default: false },
  bufferQueue: { type: Array, default: () => [] },
  bufferLoading: { type: Boolean, default: false },
  completedQueue: { type: Array, default: () => [] },
  completedLoading: { type: Boolean, default: false },
  refreshNow: { type: Function, required: true }
})
const emit = defineEmits([
  'update:queue', 'update:focus-display', 'update:active-tab',
  'drag-end', 'open-deliver', 'refresh-queue', 'refresh-all'
])

// ─── 双向 props 代理（v-model 语义，与 PaymentPanel 同款数据流纪律） ───
const queueModel = computed({
  get: () => props.queue,
  set: (val) => emit('update:queue', val)
})

/** 键盘等价：上移/下移队列顺序（vuedraggable 拖拽结束同款持久化路径） */
function moveQueueItem(order, direction) {
  const idx = props.queue.findIndex(o => o.id === order.id)
  const target = idx + direction
  if (idx < 0 || target < 0 || target >= props.queue.length) return
  const next = props.queue.slice()
  ;[next[idx], next[target]] = [next[target], next[idx]]
  queueModel.value = next
  emit('drag-end', { oldIndex: idx, newIndex: target })
}
const focusDisplayModel = computed({
  get: () => props.focusDisplay,
  set: (val) => emit('update:focus-display', val)
})

// 05B: 焦点图显示模式两态滑块选项
const focusDisplayOptions = [
  { value: 'off', label: t('queue.focusOff') },
  { value: 'large', label: t('queue.focusLarge') }
]
const activeTabModel = computed({
  get: () => props.activeTab,
  set: (val) => emit('update:active-tab', val)
})

// ─── R30b: 下一步主操作映射（外露按钮用） ───
const NEXT_ACTION = {
  pending: { command: 'confirmed', labelKey: 'queue.confirm', type: 'primary' },
  confirmed: { command: 'wip', labelKey: 'queue.startWip', type: 'warning' },
  wip: { command: 'done', labelKey: 'queue.done', type: 'success' },
  revision: { command: 'done', labelKey: 'queue.done', type: 'success' },
  done: { command: 'delivered', labelKey: 'queue.deliver', type: 'success' }
}
const nextAction = (status) => NEXT_ACTION[status] || null

// ─── R30d: 流程状态机（看板推进） ───
const workflowStages = ref([])
/** a1: 逐订单在途集合——连点/下拉与主按钮并发时不再重复发状态请求 */
const busyOrderIds = ref(new Set())
/** 工作流节点加载失败（失败时隐藏推进按钮，给出错误提示 + 重试入口） */
const workflowLoadFailed = ref(false)
async function loadWorkflowStages() {
  workflowLoadFailed.value = false
  try {
    const res = await artistApi.getWorkflow()
    workflowStages.value = res.stages || []
  } catch {
    workflowLoadFailed.value = true
  }
}
function canAdvance(order) {
  if (order.currentStageId == null) return false
  if (['delivered', 'cancelled'].includes(order.status)) return false
  const idx = workflowStages.value.findIndex(s => s.id === order.currentStageId)
  return idx !== -1 && idx < workflowStages.value.length - 1
}
async function advanceOrderStage(order) {
  if (busyOrderIds.value.has(order.id)) return
  const idx = workflowStages.value.findIndex(s => s.id === order.currentStageId)
  const next = workflowStages.value[idx + 1]
  if (!next) return
  busyOrderIds.value.add(order.id)
  try {
    // 815 审计 P1-3：乐观锁接线——携带当前 version，冲突时提示并重拉队列
    await artistApi.advanceStage(order.id, next.id, order.version != null ? { version: order.version } : {})
    ElMessage.success(t('queue.stageAdvanced'))
    emit('refresh-queue')
  } catch (err) {
    if (err?.code === 'ORDER_CONFLICT') {
      ElMessage.warning(t('common.orderConflict'))
      emit('refresh-queue')
    } else {
      ElMessage.error(err.message)
    }
  } finally {
    busyOrderIds.value.delete(order.id)
  }
}

async function quickAction(command, order) {
  // R30e: 取消不走弹窗，打开滑块确认
  if (command === 'cancelled') { openSlideCancel(order); return }
  // H1: 交付统一走交付弹窗（防手滑一步点成已交付）
  if (command === 'delivered') { emit('open-deliver', order); return }
  if (busyOrderIds.value.has(order.id)) return
  busyOrderIds.value.add(order.id)
  try {
    // 815 审计 P1-3：乐观锁接线——携带当前 version，冲突时提示并重拉队列
    await artistApi.updateStatus(order.id, command, order.version != null ? { version: order.version } : {})
    ElMessage.success(t('queue.statusUpdated'))
    emit('refresh-queue')
  } catch (err) {
    if (err?.code === 'ORDER_CONFLICT') {
      ElMessage.warning(t('common.orderConflict'))
      emit('refresh-queue')
    } else {
      ElMessage.error(err.message)
    }
  } finally {
    busyOrderIds.value.delete(order.id)
  }
}

// ─── 焦点图空态上传（点击选文件 / 拖拽图片，上传后直接设为焦点图） ───
// 本页不开粘贴上传：多个上传目标，全局粘贴无法路由（用户明确指示）
// G1: 页内拖拽守卫——捕获阶段拦 dragenter/dragover（模板已挂），drop 兜底判断在 handler 开头
const { guardDragEnter, guardDragOver, guardDrop } = useDropGuard()
const focusInputEl = ref(null)
const focusDragId = ref(null) // 正在拖拽进入的订单 ID（高亮用）
let focusUploadTarget = null  // 当前点击上传的订单

function triggerFocusUpload(order) {
  focusUploadTarget = order
  focusInputEl.value?.click()
}
async function handleFocusFileSelect(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !focusUploadTarget) return
  await uploadAndSetFocus(file, focusUploadTarget)
  focusUploadTarget = null
}
/** 防 dragleave 闪烁：子元素间移动时 relatedTarget 仍在占位区内，忽略 */
function onFocusDragLeave(e, order) {
  if (e.currentTarget.contains(e.relatedTarget)) return
  if (focusDragId.value === order.id) focusDragId.value = null
}
async function handleFocusDrop(event, order) {
  focusDragId.value = null
  if (!guardDrop(event)) return // G1: 页内图拖入 → 拒绝 + 警告（dragover 已拦，此处兜底）
  const file = [...event.dataTransfer.files].find(f => f.type.startsWith('image/'))
  if (file) {
    await uploadAndSetFocus(file, order)
  } else if (event.dataTransfer.files.length > 0) {
    // BUG-2 补充：拖入非图片时提示，不再静默丢弃
    ElMessage.error(t('orderDetail.galleryNotImage'))
  }
}
/** 上传图片 → 设为该订单焦点图（复用 reference 上传 + setFocusImage 接口） */
async function uploadAndSetFocus(file, order) {
  if (!file.type.startsWith('image/')) { ElMessage.error(t('orderDetail.galleryNotImage')); return }
  if (file.size > MAX_IMAGE_BYTES) { ElMessage.error(t('orderDetail.galleryTooBig')); return }
  try {
    // G-7（P2-13 前端侧）: 参考图接口强制 x-anon-token——上传前 await 凭证，
    // 失效凭证由 anonUpload 换新重试一次（与订单图库同链路）
    const { uploaded } = await uploadReferenceWithAnonToken(file)
    // 必须先关联到订单（写入 order_references），否则 setFocusImage 校验归属失败
    await artistApi.addReference(order.id, { filePath: uploaded.filePath })
    await artistApi.setFocusImage(order.id, { imagePath: uploaded.filePath, mode: 'large' })
    ElMessage.success(t('orderDetail.focusUpdated'))
    emit('refresh-queue')
  } catch (err) {
    ElMessage.error(err instanceof AnonTokenUnavailableError ? t('orderDetail.anonTokenRequired') : err.message)
  }
}

// ─── R30e: 滑块确认取消（拖到底触发，防误触） ───
const cancellingId = ref(null)
/** 取消请求在途锁（防滑块/按钮重复触发；409 二次确认期间同样上锁） */
const cancellingBusyId = ref(null)
const slideProgress = ref(0)
let slideRect = null
function openSlideCancel(order) {
  if (cancellingBusyId.value !== null) return
  cancellingId.value = order.id
  slideProgress.value = 0
}
function closeSlideCancel() {
  cancellingId.value = null
  slideProgress.value = 0
}
function onSlideStart(e) {
  if (cancellingBusyId.value !== null) return
  const track = e.currentTarget.closest('.slide-cancel')
  slideRect = track.getBoundingClientRect()
  e.currentTarget.setPointerCapture(e.pointerId)
}
function onSlideMove(e) {
  if (cancellingBusyId.value !== null) return
  if (!slideRect) return
  const x = e.clientX - slideRect.left - 20
  slideProgress.value = Math.max(0, Math.min(1, x / (slideRect.width - 40)))
}
async function onSlideEnd(e, order) {
  if (cancellingBusyId.value !== null) return
  if (!slideRect) return
  slideRect = null
  if (slideProgress.value >= 0.9) {
    closeSlideCancel()
    await doCancelWithUndo(order)
  } else {
    slideProgress.value = 0
  }
}

/** 键盘等价：滑块取消的替代按钮路径（与滑到底行为一致） */
async function confirmSlideCancel(order) {
  closeSlideCancel()
  await doCancelWithUndo(order)
}

// 815 拍板 #1：取消走带 5 秒撤销窗口的新端点（队列重排延迟结算）
const cancelUndo = ref({ visible: false, orderId: null, label: '', windowMs: 5000 })

async function doCancelWithUndo(order) {
  if (cancellingBusyId.value === order.id) return
  cancellingBusyId.value = order.id
  try {
    const res = await artistApi.cancelOrder(order.id)
    cancelUndo.value = {
      visible: true,
      orderId: order.id,
      label: res.order_no || order.orderNo || String(order.id),
      windowMs: res.undoWindowMs ?? 5000
    }
    ElMessage.success(t('queue.statusUpdated'))
    emit('refresh-queue')
  } catch (err) {
    // 已收款取消：后端 409 CANCEL_WITH_PAYMENT + detail.paidCents → 二次确认后带 confirmPaidCancel 重发
    if (err.code === 'CANCEL_WITH_PAYMENT' && err.detail?.paidCents != null) {
      try {
        await ElMessageBox.confirm(
          t('orderDetail.cancelPaidConfirm', { amount: formatCents(err.detail.paidCents) }),
          t('orderDetail.confirmTitle'),
          { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
        )
      } catch {
        return // 用户取消二次确认：不取消订单
      }
      try {
        const res = await artistApi.cancelOrder(order.id, { confirmPaidCancel: true })
        cancelUndo.value = {
          visible: true,
          orderId: order.id,
          label: res.order_no || order.orderNo || String(order.id),
          windowMs: res.undoWindowMs ?? 5000
        }
        ElMessage.success(t('queue.statusUpdated'))
        emit('refresh-queue')
      } catch (err) {
        ElMessage.error(err.message)
      }
    } else {
      ElMessage.error(err.message)
    }
  } finally {
    cancellingBusyId.value = null
  }
}

async function onUndoCancel() {
  const id = cancelUndo.value.orderId
  cancelUndo.value.visible = false
  if (id == null) return
  try {
    await artistApi.undoCancelOrder(id)
    ElMessage.success(t('orderDetail.cancelUndone'))
  } catch (err) {
    ElMessage.error(err.code === 'CANCEL_UNDO_EXPIRED' ? t('orderDetail.cancelUndoExpired') : err.message)
  }
  emit('refresh-queue')
}

// ─── R30c: 手机端左滑进详情（触屏专属，C43 桌面不做等效） ───
let swipeStart = null
function onCardPointerDown(e) {
  if (e.pointerType !== 'touch') return
  if (e.target.closest('button, .drag-handle, .slide-cancel, .el-dropdown, .el-image, .focus-empty, .focus-img-wrap')) return
  swipeStart = { x: e.clientX, y: e.clientY }
}
function onCardPointerUp(e, order) {
  if (!swipeStart) return
  const dx = e.clientX - swipeStart.x
  const dy = e.clientY - swipeStart.y
  swipeStart = null
  // 左滑 ≥60px 且水平方向主导 → 进详情
  if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    router.push(`/orders/${order.id}?from=queue`)
  }
}

// ─── SPEC-004: 缓冲区（候补订单列表 + 手动递补） ───
const promotingId = ref(null)
async function promoteOrder(order) {
  promotingId.value = order.id
  try {
    // 815 审计 P1-3：乐观锁接线——递补同为订单写路径，携带 version，冲突重拉
    await artistApi.promoteOrder(order.id, order.version != null ? { version: order.version } : {})
    ElMessage.success(t('queue.promoted'))
    emit('refresh-all')
  } catch (err) {
    if (err?.code === 'ORDER_CONFLICT') {
      ElMessage.warning(t('common.orderConflict'))
      emit('refresh-all')
    } else {
      ElMessage.error(err.message)
    }
  } finally {
    promotingId.value = null
  }
}

onMounted(() => {
  // R30d: 加载工作流节点（看板推进需要知道"下一节点"）
  loadWorkflowStages()
})
</script>

<style scoped>
.queue-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.toolbar-label { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); white-space: nowrap; }
/* 工作流节点加载失败错误态（对齐 dashboard module-error） */
.module-error {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 16px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}
/* 812-C B9: 窄屏焦点图开关控件组可换行（间距对齐 4px 栅格；桌面不变） */
@media (max-width: 768px) {
  .queue-toolbar { flex-wrap: wrap; gap: 8px; }
}

/* 一行一条（用户决策：排期看板必须保持一行一条；宽屏空间由卡片内部横向展开消化） */
.queue-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.queue-item {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  background: var(--card); border-radius: var(--r-l); padding: 12px 16px;
  border-left: 4px solid var(--line); box-shadow: var(--sh-1);
  cursor: default; transition: box-shadow var(--dur-mid);
}
.queue-item:hover { box-shadow: var(--sh-2); }
/* 优先级色条（REQ §1.1 语义：高优先=赭石 / 中=藤黄提醒 / 低=安静中性） */
.priority-high { border-left-color: var(--zhe); }
.priority-medium { border-left-color: var(--th); }
.priority-low { border-left-color: var(--ink4); }

.drag-handle { cursor: grab; font-size: calc(var(--font-scale, 1) * 20px); color: var(--ink3); user-select: none; }
.drag-handle:active { cursor: grabbing; }
.queue-move { display: inline-flex; gap: 1px; flex-shrink: 0; }
.queue-move-btn {
  width: 24px; height: 24px; padding: 0;
  border: none; border-radius: var(--r-s);
  background: none; color: var(--ink3);
  font-size: calc(var(--font-scale, 1) * 13px); font-weight: 700; line-height: 1;
  cursor: pointer;
  transition: color var(--dur-fast), background var(--dur-fast);
}
.queue-move-btn:hover:not(:disabled) { color: var(--hq); background: var(--hq-t); }
.queue-move-btn:disabled { opacity: 0.35; cursor: default; }
.ghost { opacity: 0.4; }

.item-body { flex: 1; min-width: 0; }
.item-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.order-no { font-weight: bold; font-size: calc(var(--font-scale, 1) * 15px); color: var(--ink); font-family: var(--f-d); }
/* R30d: 流程节点标签 */
.stage-tag { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-info { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 13px); margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap; }
.item-desc { color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); margin-top: 4px; }
/* 焦点图区域：大图 160×120，左图右文 */
.focus-area { flex-shrink: 0; }
.focus-large-img { width: 160px; height: 120px; border-radius: var(--r-m); display: block; background: var(--card); }
/* R53: 已有焦点图替换（点击选文件 / 拖拽替换，不需要确认弹窗——旧图保留在图库） */
.focus-img-wrap {
  position: relative; width: 160px; height: 120px;
  border-radius: var(--r-m); overflow: hidden; cursor: pointer;
  background: var(--card);
  padding: 0; border: none; font: inherit; color: inherit; text-align: inherit;
  transition: box-shadow var(--dur-fast);
}
.focus-img-wrap:hover { box-shadow: 0 0 0 2px color-mix(in srgb, var(--hq) 45%, transparent); }
.focus-replace-overlay {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55); color: #fff;
  font-size: calc(var(--font-scale, 1) * 13px); font-weight: 600;
  pointer-events: none;
}
.focus-img-wrap--active { box-shadow: 0 0 0 2px var(--hq); }
/* 焦点图空态上传占位（虚线边框 + 图标 + 文字，hover/拖拽高亮） */
.focus-empty {
  width: 160px; height: 120px;
  border: 2px dashed var(--line2); border-radius: var(--r-m);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; cursor: pointer; color: var(--ink3);
  padding: 0; font: inherit; text-align: inherit;
  transition: border-color var(--dur-mid), background var(--dur-mid), color var(--dur-mid);
}
.focus-empty:hover, .focus-empty--active {
  border-color: var(--hq);
  background: var(--hq-t);
  color: var(--hq);
}
.focus-empty-text { font-size: calc(var(--font-scale, 1) * 12px); }
.item-actions { display: flex; gap: 8px; flex-shrink: 0; margin-left: auto; }

/* R30e: 滑块确认（整行，拖到底触发取消） */
.slide-cancel-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.slide-cancel {
  position: relative;
  flex: 1;
  height: 40px;
  border-radius: 999px;
  background: var(--zs-t);
  border: 1px solid color-mix(in srgb, var(--zs) 45%, transparent);
  overflow: hidden;
  user-select: none;
}
.slide-cancel-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: color-mix(in srgb, var(--zs) 28%, transparent);
  transition: width 0.05s linear;
}
.slide-cancel-label {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: calc(var(--font-scale, 1) * 13px); font-weight: 600;
  color: var(--zs);
  pointer-events: none;
}
.slide-cancel-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 36px; height: 36px;
  border-radius: 50%;
  background: var(--zs);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: calc(var(--font-scale, 1) * 16px); font-weight: 700;
  cursor: grab;
  touch-action: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
.slide-cancel-thumb:active { cursor: grabbing; }

@media (max-width: 600px) {
  .item-actions { width: 100%; justify-content: flex-end; margin-left: 0; }
}

/* ─── SPEC-004: 缓冲区（缓冲=--buf 灰，REQ §二/派工 Q2） ─── */
.buffer-title { margin: 28px 0 4px; color: var(--ink); font-size: calc(var(--font-scale, 1) * 16px); }
.buffer-hint { margin: 0 0 12px; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); }
.buffer-item { border-left: 3px dashed var(--buf); }
.focus-empty--static { cursor: default; }

/* ─── REQ-013 #7: 完成区（灰色沉底，不可拖拽） ─── */
.completed-title { margin: 28px 0 4px; color: var(--ink2); font-size: calc(var(--font-scale, 1) * 16px); }
.completed-hint { margin: 0 0 12px; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }
.completed-item {
  opacity: 0.55;
  border-left: 3px solid color-mix(in srgb, var(--sl) 55%, transparent);
  cursor: default;
}
.completed-item:hover { box-shadow: var(--sh-1); }
</style>
