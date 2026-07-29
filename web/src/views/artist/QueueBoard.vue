<template>
  <ArtistLayout>
    <h2>{{ $t('queue.title') }}</h2>
    <p class="hint">{{ $t('queue.hint') }}</p>

    <!-- R20: 焦点图显示模式（全局设置，存 localStorage） -->
    <div class="queue-toolbar">
      <span class="toolbar-label">{{ $t('queue.focusDisplay') }}</span>
      <el-radio-group v-model="focusDisplay" size="small" @change="saveFocusDisplay">
        <el-radio-button value="off">{{ $t('queue.focusOff') }}</el-radio-button>
        <el-radio-button value="small">{{ $t('queue.focusSmall') }}</el-radio-button>
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
            <!-- UI-2: 大图模式 — 左图右文布局，与"小"模式形成 48→160 梯度 -->
            <div v-if="element.focus_image_path && focusDisplay === 'large'" class="focus-large">
              <el-image
                :src="element.focusImageUrl" fit="cover" class="focus-large-img"
                :alt="$t('orderDetail.referenceImage')"
                :preview-src-list="[element.focusImageUrl]"
              />
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
              <!-- R20: 焦点图小模式（48px 缩略图，保持在文字下方） -->
              <div v-if="element.focus_image_path && focusDisplay === 'small'" class="focus-small">
                <el-image
                  :src="element.focusImageUrl" fit="cover" class="focus-small-img"
                  :alt="$t('orderDetail.referenceImage')"
                  :preview-src-list="[element.focusImageUrl]"
                />
              </div>
            </div>
            <div class="item-actions">
              <!-- R30b: 下一步主操作外露（按状态显示，不藏下拉） -->
              <el-button
                v-if="nextAction(element.status)"
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
  </ArtistLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import draggable from 'vuedraggable'
import { artistApi } from '../../api/index.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'

const { t } = useI18n()
const router = useRouter()
const queue = ref([])
const loading = ref(true)

// ─── R20: 焦点图显示模式（全局设置） ───
const FOCUS_DISPLAY_KEY = 'queue_focus_display'
const focusDisplay = ref(localStorage.getItem(FOCUS_DISPLAY_KEY) || 'small')
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
  if (e.target.closest('button, .drag-handle, .slide-cancel, .el-dropdown, .el-image')) return
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

onMounted(loadQueue)
</script>

<style scoped>
.hint { color: var(--text-secondary); font-size: 13px; margin: 8px 0 16px; }
.queue-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.toolbar-label { font-size: 13px; color: var(--text-secondary); white-space: nowrap; }

/* R30a: 宽屏多列 — auto-fill 利用横向空间，窄屏自动回退单列 */
.queue-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
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
.item-info { color: var(--text-secondary); font-size: 13px; margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap; }
.item-desc { color: var(--text-muted); font-size: 13px; margin-top: 4px; }
.focus-small { margin-top: 8px; }
.focus-small-img { width: 48px; height: 48px; border-radius: 6px; display: block; }
/* UI-2: 大图模式固定 160×120，左图右文，与小模式 48px 形成梯度 */
.focus-large { flex-shrink: 0; }
.focus-large-img { width: 160px; height: 120px; border-radius: 8px; display: block; }
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
  .queue-list { grid-template-columns: 1fr; }
  .item-actions { width: 100%; justify-content: flex-end; margin-left: 0; }
}
</style>
