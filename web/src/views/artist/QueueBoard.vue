<template>
  <ArtistLayout>
    <h2>{{ $t('queue.title') }}</h2>
    <p class="hint">{{ $t('queue.hint') }}</p>

    <!-- R20: 焦点图显示模式（全局设置，存 localStorage；仅 无/大 两态） -->
    <div class="queue-toolbar">
      <span class="toolbar-label">{{ $t('queue.focusDisplay') }}</span>
      <el-radio-group v-model="focusDisplay" size="small" @change="saveFocusDisplay">
        <el-radio-button value="off">{{ $t('queue.focusOff') }}</el-radio-button>
        <el-radio-button value="large">{{ $t('queue.focusLarge') }}</el-radio-button>
      </el-radio-group>
    </div>

    <div class="queue-container" v-loading="loading">
      <draggable
        v-model="queue"
        item-key="id"
        handle=".drag-handle"
        ghost-class="ghost"
        @end="onDragEnd"
        class="queue-list"
      >
        <template #item="{ element }">
          <div
            class="queue-item"
            :class="`priority-${element.priority}`"
            @pointerdown="onCardPointerDown"
            @pointerup="(e) => onCardPointerUp(e, element)"
          >
            <div class="drag-handle" :title="$t('queue.dragHint')" aria-hidden="true">⠿</div>
            <!-- 焦点图区域：大图模式显示焦点图，无焦点图时显示空态上传入口 -->
            <div v-if="focusDisplay === 'large'" class="focus-area">
              <!-- R53: 已有焦点图 — 点击选文件 / 拖拽图片替换（复用 uploadAndSetFocus；
                   移除 preview-src-list 避免 el-image 内置预览吞掉点击，R18 同款陷阱） -->
              <div
                v-if="element.focus_image_path"
                class="focus-img-wrap"
                :class="{ 'focus-img-wrap--active': focusDragId === element.id }"
                @click="triggerFocusUpload(element)"
                @dragover.prevent="focusDragId = element.id"
                @dragleave="onFocusDragLeave($event, element)"
                @drop.prevent="handleFocusDrop($event, element)"
              >
                <el-image
                  :src="element.focusImageUrl" fit="cover" class="focus-large-img"
                  :alt="$t('orderDetail.referenceImage')"
                  @error="refreshNow"
                />
                <div v-if="focusDragId === element.id" class="focus-replace-overlay">
                  <span>{{ $t('queue.dropToReplace') }}</span>
                </div>
              </div>
              <!-- 空态上传：点击选文件 / 拖拽图片放入，上传后直接设为焦点图 -->
              <div
                v-else
                class="focus-empty"
                :class="{ 'focus-empty--active': focusDragId === element.id }"
                @click="triggerFocusUpload(element)"
                @dragover.prevent="focusDragId = element.id"
                @dragleave="onFocusDragLeave($event, element)"
                @drop.prevent="handleFocusDrop($event, element)"
              >
                <el-icon :size="20"><Plus /></el-icon>
                <span class="focus-empty-text">{{ $t('queue.uploadFocus') }}</span>
              </div>
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
                v-if="element.currentStageId != null && canAdvance(element)"
                size="small" type="primary"
                @click="advanceOrderStage(element)"
              >
                {{ $t('queue.advanceStage') }}
              </el-button>
              <!-- R30b: 未接入流程的订单 → 固定状态主操作外露 -->
              <el-button
                v-else-if="nextAction(element.status)"
                size="small"
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
                    <el-dropdown-item command="confirmed" v-if="element.status === 'pending'">{{ $t('queue.confirm') }}</el-dropdown-item>
                    <el-dropdown-item command="wip" v-if="element.status === 'confirmed'">{{ $t('queue.startWip') }}</el-dropdown-item>
                    <el-dropdown-item command="done" v-if="['wip','revision'].includes(element.status)">{{ $t('queue.done') }}</el-dropdown-item>
                    <el-dropdown-item command="delivered" v-if="element.status === 'done'">{{ $t('queue.deliver') }}</el-dropdown-item>
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
              <el-button text size="small" @click="closeSlideCancel">✕</el-button>
            </div>
          </div>
        </template>
      </draggable>

      <el-empty v-if="!loading && queue.length === 0" :description="$t('queue.empty')" />
    </div>

    <!-- 焦点图空态上传：隐藏文件选择器（点击占位按钮触发） -->
    <input
      ref="focusInputEl" type="file" accept="image/*" hidden
      @change="handleFocusFileSelect"
    />
  </ArtistLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import draggable from 'vuedraggable'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import { useSignatureRefresh } from '../../composables/useSignatureRefresh.js'

const { t } = useI18n()
const router = useRouter()
const queue = ref([])
const loading = ref(true)

// ─── R20: 焦点图显示模式（全局设置；仅 无/大 两态，旧值 small 映射为 large） ───
const FOCUS_DISPLAY_KEY = 'queue_focus_display'
const focusDisplay = ref(
  localStorage.getItem(FOCUS_DISPLAY_KEY) === 'small' ? 'large'
    : (localStorage.getItem(FOCUS_DISPLAY_KEY) || 'large')
)
function saveFocusDisplay(val) {
  localStorage.setItem(FOCUS_DISPLAY_KEY, val)
}

import { ORDER_STATUS_TYPE, PRIORITY_TYPE } from '../../constants/order.js'

const priorityType = (p) => PRIORITY_TYPE[p] || 'info'
const statusType = (s) => ORDER_STATUS_TYPE[s] || 'info'

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

/** 订单是否可推进（有 stage、非终态、非最后节点） */
function canAdvance(order) {
  if (order.currentStageId == null) return false
  if (['delivered', 'cancelled'].includes(order.status)) return false
  const idx = workflowStages.value.findIndex(s => s.id === order.currentStageId)
  return idx !== -1 && idx < workflowStages.value.length - 1
}

/** 推进到下一节点（stageId = 当前节点的下一个） */
async function advanceOrderStage(order) {
  const idx = workflowStages.value.findIndex(s => s.id === order.currentStageId)
  const next = workflowStages.value[idx + 1]
  if (!next) return
  try {
    await artistApi.advanceStage(order.id, next.id)
    ElMessage.success(t('queue.stageAdvanced'))
    await loadQueue()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

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

async function quickAction(command, order) {
  // R30e: 取消不走弹窗，打开滑块确认
  if (command === 'cancelled') {
    openSlideCancel(order)
    return
  }

  try {
    await artistApi.updateStatus(order.id, command)
    ElMessage.success(t('queue.statusUpdated'))
    await loadQueue()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── 焦点图空态上传（点击选文件 / 拖拽图片，上传后直接设为焦点图） ───
// 本页不开粘贴上传：多个上传目标，全局粘贴无法路由（用户明确指示）
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
  const file = [...event.dataTransfer.files].find(f => f.type.startsWith('image/'))
  if (file) await uploadAndSetFocus(file, order)
}

/** 上传图片 → 设为该订单焦点图（复用 reference 上传 + setFocusImage 接口） */
async function uploadAndSetFocus(file, order) {
  if (!file.type.startsWith('image/')) {
    ElMessage.error(t('orderDetail.galleryNotImage'))
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error(t('orderDetail.galleryTooBig'))
    return
  }
  try {
    const uploaded = await uploadApi.reference(file)
    // 必须先关联到订单（写入 order_references），否则 setFocusImage 校验归属失败
    await artistApi.addReference(order.id, { filePath: uploaded.filePath })
    await artistApi.setFocusImage(order.id, { imagePath: uploaded.filePath, mode: 'large' })
    ElMessage.success(t('orderDetail.focusUpdated'))
    await loadQueue()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── R30e: 滑块确认取消（拖到底触发，防误触） ───
const cancellingId = ref(null)
const slideProgress = ref(0)
let slideRect = null

function openSlideCancel(order) {
  cancellingId.value = order.id
  slideProgress.value = 0
}
function closeSlideCancel() {
  cancellingId.value = null
  slideProgress.value = 0
}
function onSlideStart(e) {
  const track = e.currentTarget.closest('.slide-cancel')
  slideRect = track.getBoundingClientRect()
  e.currentTarget.setPointerCapture(e.pointerId)
}
function onSlideMove(e) {
  if (!slideRect) return
  const x = e.clientX - slideRect.left - 20
  slideProgress.value = Math.max(0, Math.min(1, x / (slideRect.width - 40)))
}
async function onSlideEnd(e, order) {
  if (!slideRect) return
  slideRect = null
  if (slideProgress.value >= 0.9) {
    closeSlideCancel()
    try {
      await artistApi.updateStatus(order.id, 'cancelled')
      ElMessage.success(t('queue.statusUpdated'))
      await loadQueue()
    } catch (err) {
      ElMessage.error(err.message)
    }
  } else {
    slideProgress.value = 0
  }
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

// ─── R33: 签名 URL 定时刷新（焦点图 15min 过期防 403） ───
const { refreshNow } = useSignatureRefresh({
  collect: () => queue.value.filter(o => o.focus_image_path).map(o => o.focus_image_path),
  apply: (urlMap) => {
    queue.value.forEach(o => {
      if (o.focus_image_path && urlMap[o.focus_image_path]) o.focusImageUrl = urlMap[o.focus_image_path]
    })
  }
})

onMounted(() => {
  loadQueue()
  // R30d: 加载工作流节点（看板推进需要知道"下一节点"）
  artistApi.getWorkflow()
    .then(res => { workflowStages.value = res.stages || [] })
    .catch(() => {})
})
</script>

<style scoped>
.hint { color: var(--text-secondary); font-size: 13px; margin: 8px 0 16px; }
.queue-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.toolbar-label { font-size: 13px; color: var(--text-secondary); white-space: nowrap; }

/* 一行一条（用户决策：排期看板必须保持一行一条；宽屏空间由卡片内部横向展开消化） */
.queue-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.queue-item {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  background: var(--bg-card); border-radius: 8px; padding: 12px 16px;
  border-left: 4px solid var(--border-color); box-shadow: var(--shadow-card);
  cursor: default; transition: box-shadow 0.2s, background 0.3s;
}
.queue-item:hover { box-shadow: var(--shadow-card-hover); }
.priority-high { border-left-color: var(--el-color-danger); }
.priority-medium { border-left-color: var(--el-color-warning); }
.priority-low { border-left-color: var(--el-color-success); }

.drag-handle { cursor: grab; font-size: 20px; color: var(--text-secondary); user-select: none; }
.drag-handle:active { cursor: grabbing; }
.ghost { opacity: 0.4; }

.item-body { flex: 1; min-width: 0; }
.item-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.order-no { font-weight: bold; font-size: 15px; color: var(--text-primary); }
/* R30d: 流程节点标签 */
.stage-tag { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-info { color: var(--text-secondary); font-size: 13px; margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap; }
.item-desc { color: var(--text-muted); font-size: 13px; margin-top: 4px; }
/* 焦点图区域：大图 160×120，左图右文 */
.focus-area { flex-shrink: 0; }
.focus-large-img { width: 160px; height: 120px; border-radius: 8px; display: block; }
/* R53: 已有焦点图替换（点击选文件 / 拖拽替换，不需要确认弹窗——旧图保留在图库） */
.focus-img-wrap {
  position: relative; width: 160px; height: 120px;
  border-radius: 8px; overflow: hidden; cursor: pointer;
  transition: box-shadow 0.15s;
}
.focus-img-wrap:hover { box-shadow: 0 0 0 2px var(--el-color-primary-light-5); }
.focus-replace-overlay {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55); color: #fff;
  font-size: 13px; font-weight: 600;
  pointer-events: none;
}
.focus-img-wrap--active { box-shadow: 0 0 0 2px var(--el-color-primary); }
/* 焦点图空态上传占位（虚线边框 + 图标 + 文字，hover/拖拽高亮） */
.focus-empty {
  width: 160px; height: 120px;
  border: 2px dashed var(--border-color); border-radius: 8px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; cursor: pointer; color: var(--text-secondary);
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}
.focus-empty:hover, .focus-empty--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.focus-empty-text { font-size: 12px; }
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
  background: var(--el-color-danger-light-9);
  border: 1px solid var(--el-color-danger-light-5);
  overflow: hidden;
  user-select: none;
}
.slide-cancel-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: var(--el-color-danger-light-7);
  transition: width 0.05s linear;
}
.slide-cancel-label {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600;
  color: var(--el-color-danger);
  pointer-events: none;
}
.slide-cancel-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 36px; height: 36px;
  border-radius: 50%;
  background: var(--el-color-danger);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 700;
  cursor: grab;
  touch-action: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
.slide-cancel-thumb:active { cursor: grabbing; }

@media (max-width: 600px) {
  .item-actions { width: 100%; justify-content: flex-end; margin-left: 0; }
}
</style>
