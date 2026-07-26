<template>
  <ArtistLayout>
    <h2>{{ $t('queue.title') }}</h2>
    <p class="hint">{{ $t('queue.hint') }}</p>

    <div class="queue-container" v-loading="loading">
      <draggable
        v-model="queue"
        item-key="id"
        handle=".drag-handle"
        ghost-class="ghost"
        @end="onDragEnd"
        class="queue-list"
      >
        <template #item="{ element, index }">
          <div class="queue-item" :class="`priority-${element.priority}`">
            <div class="drag-handle">⠿</div>
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
            </div>
            <div class="item-actions">
              <el-button size="small" @click="$router.push(`/orders/${element.id}?from=queue`)">{{ $t('common.detail') }}</el-button>
              <el-dropdown trigger="click" @command="(cmd) => quickAction(cmd, element)">
                <el-button size="small">{{ $t('common.actions') }}</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="confirmed" v-if="element.status === 'pending'">{{ $t('queue.confirm') }}</el-dropdown-item>
                    <el-dropdown-item command="wip" v-if="element.status === 'confirmed'">{{ $t('queue.startWip') }}</el-dropdown-item>
                    <el-dropdown-item command="done" v-if="['wip','revision'].includes(element.status)">{{ $t('queue.done') }}</el-dropdown-item>
                    <el-dropdown-item command="delivered">{{ $t('queue.deliver') }}</el-dropdown-item>
                    <el-dropdown-item command="cancelled" divided>{{ $t('queue.cancel') }}</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
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
import draggable from 'vuedraggable'
import { artistApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'

const { t } = useI18n()
const queue = ref([])
const loading = ref(true)

const priorityType = (p) => ({ high: 'danger', medium: 'warning', low: 'success' }[p] || 'info')
const statusType = (s) => ({
  pending: 'info', confirmed: 'primary', wip: 'warning',
  revision: 'warning', done: 'success', delivered: 'success', cancelled: 'danger'
}[s] || 'info')

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
  if (command === 'cancelled') {
    try {
      await ElMessageBox.confirm(t('queue.confirmCancel', { no: order.order_no }), t('queue.confirmCancelTitle'), { type: 'warning' })
    } catch { return }
  }

  try {
    await artistApi.updateStatus(order.id, command)
    ElMessage.success(t('queue.statusUpdated'))
    await loadQueue()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

onMounted(loadQueue)
</script>

<style scoped>
.hint { color: var(--text-secondary); font-size: 13px; margin: 8px 0 16px; }
.queue-list { display: flex; flex-direction: column; gap: 8px; }

.queue-item {
  display: flex; align-items: center; gap: 12px;
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
.item-actions { display: flex; gap: 8px; flex-shrink: 0; }

@media (max-width: 600px) {
  .queue-item { flex-wrap: wrap; }
  .item-actions { width: 100%; justify-content: flex-end; }
}
</style>
