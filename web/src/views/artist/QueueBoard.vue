<template>
  <ArtistLayout>
    <h2>📋 排期看板</h2>
    <p class="hint">拖拽卡片调整顺序。拖到某个位置后，该订单会获得目标位置的优先级，其余订单自动顺延。</p>

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
                  {{ priorityLabel(element.priority) }}
                </el-tag>
                <el-tag :type="statusType(element.status)" size="small">
                  {{ statusLabel(element.status) }}
                </el-tag>
              </div>
              <div class="item-info">
                <span>{{ element.tier_name || '自定义' }}</span>
                <span>·</span>
                <span>QQ: {{ element.client_qq }}</span>
                <span v-if="element.client_name">· {{ element.client_name }}</span>
              </div>
              <div class="item-desc" v-if="element.description">
                {{ element.description.slice(0, 60) }}{{ element.description.length > 60 ? '...' : '' }}
              </div>
            </div>
            <div class="item-actions">
              <el-button size="small" @click="$router.push(`/orders/${element.id}`)">详情</el-button>
              <el-dropdown trigger="click" @command="(cmd) => quickAction(cmd, element)">
                <el-button size="small">操作</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="confirmed" v-if="element.status === 'pending'">✅ 确认</el-dropdown-item>
                    <el-dropdown-item command="wip" v-if="element.status === 'confirmed'">🎨 开始制作</el-dropdown-item>
                    <el-dropdown-item command="done" v-if="['wip','revision'].includes(element.status)">✔ 完成</el-dropdown-item>
                    <el-dropdown-item command="delivered">📦 交付</el-dropdown-item>
                    <el-dropdown-item command="cancelled" divided>❌ 取消</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </template>
      </draggable>

      <el-empty v-if="!loading && queue.length === 0" description="队列空空，暂无订单" />
    </div>
  </ArtistLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import draggable from 'vuedraggable'
import { artistApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import ArtistLayout from '../../components/ArtistLayout.vue'

const queue = ref([])
const loading = ref(true)

const priorityType = (p) => ({ high: 'danger', medium: 'warning', low: 'success' }[p] || 'info')
const priorityLabel = (p) => ({ high: '高', medium: '中', low: '低' }[p] || p)
const statusType = (s) => ({
  pending: 'info', confirmed: 'primary', wip: 'warning',
  revision: 'warning', done: 'success', delivered: 'success', cancelled: 'danger'
}[s] || 'info')
const statusLabel = (s) => ({
  pending: '待确认', confirmed: '已确认', wip: '制作中',
  revision: '修改中', done: '已完成', delivered: '已交付', cancelled: '已取消'
}[s] || s)

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
 * 拖拽结束 - 核心逻辑
 * 被拖动的订单获得目标位置的优先级，其余顺延（不是交换）
 */
async function onDragEnd(evt) {
  const { oldIndex, newIndex } = evt
  if (oldIndex === newIndex) return

  const draggedOrder = queue.value[newIndex] // vuedraggable 已经移动了数组

  try {
    // 调用后端重排接口
    const newQueue = await artistApi.reorderQueue(draggedOrder.id, newIndex)
    queue.value = newQueue
    ElMessage.success('排序已更新')
  } catch (err) {
    ElMessage.error(err.message)
    // 回滚：重新加载
    await loadQueue()
  }
}

async function quickAction(command, order) {
  if (command === 'cancelled') {
    try {
      await ElMessageBox.confirm(`确定取消订单 #${order.order_no}？`, '确认取消', { type: 'warning' })
    } catch { return }
  }

  try {
    await artistApi.updateStatus(order.id, command)
    ElMessage.success('状态已更新')
    await loadQueue()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

onMounted(loadQueue)
</script>

<style scoped>
.hint { color: #999; font-size: 13px; margin: 8px 0 16px; }
.queue-list { display: flex; flex-direction: column; gap: 8px; }

.queue-item {
  display: flex; align-items: center; gap: 12px;
  background: white; border-radius: 8px; padding: 12px 16px;
  border-left: 4px solid #ddd; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  cursor: default; transition: box-shadow 0.2s;
}
.queue-item:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
.priority-high { border-left-color: #f56c6c; }
.priority-medium { border-left-color: #e6a23c; }
.priority-low { border-left-color: #67c23a; }

.drag-handle { cursor: grab; font-size: 20px; color: #999; user-select: none; }
.drag-handle:active { cursor: grabbing; }
.ghost { opacity: 0.4; }

.item-body { flex: 1; min-width: 0; }
.item-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.order-no { font-weight: bold; font-size: 15px; }
.item-info { color: #666; font-size: 13px; margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap; }
.item-desc { color: #999; font-size: 13px; margin-top: 4px; }
.item-actions { display: flex; gap: 8px; flex-shrink: 0; }

@media (max-width: 600px) {
  .queue-item { flex-wrap: wrap; }
  .item-actions { width: 100%; justify-content: flex-end; }
}
</style>
