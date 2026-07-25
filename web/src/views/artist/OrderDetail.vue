<template>
  <ArtistLayout>
    <el-page-header @back="goBack" :title="backTitle" :content="`${$t('orderDetail.orderNo')}${order?.order_no}`" />

    <div v-if="order" class="order-detail">
      <!-- 基本信息 -->
      <el-card style="margin-top: 16px">
        <template #header>
          <div class="card-header">
            <span>{{ $t('orderDetail.orderInfo') }}</span>
            <el-tag :type="statusType(order.status)">{{ $t(`common.orderStatus.${order.status}`) }}</el-tag>
          </div>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item :label="$t('orderDetail.colOrderNo')">{{ order.order_no }}</el-descriptions-item>
          <el-descriptions-item :label="$t('orderDetail.colType')">{{ order.tier_name || $t('common.custom') }}</el-descriptions-item>
          <el-descriptions-item :label="$t('orderDetail.colQq')">{{ order.client_qq }}</el-descriptions-item>
          <el-descriptions-item :label="$t('orderDetail.colName')">{{ order.client_name || '-' }}</el-descriptions-item>
          <el-descriptions-item :label="$t('orderDetail.colPriority')">
            <el-select v-model="order.priority" @change="changePriority" size="small" style="width: 100px">
              <el-option value="high" :label="$t('common.priority.high')" />
              <el-option value="medium" :label="$t('common.priority.medium')" />
              <el-option value="low" :label="$t('common.priority.low')" />
            </el-select>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('orderDetail.colSource')">{{ order.source === 'self' ? $t('common.source.clientSelf') : $t('common.source.manualEntry') }}</el-descriptions-item>
          <el-descriptions-item :label="$t('orderDetail.colTime')" :span="2">{{ formatDate(order.created_at) }}</el-descriptions-item>
          <el-descriptions-item :label="$t('orderDetail.colDesc')" :span="2">{{ order.description || $t('common.none') }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 状态操作 -->
      <el-card style="margin-top: 16px">
        <template #header>{{ $t('orderDetail.statusFlow') }}</template>
        <el-steps :active="stepActive" finish-status="success" simple>
          <el-step :title="$t('common.orderStatus.pending')" />
          <el-step :title="$t('common.orderStatus.confirmed')" />
          <el-step :title="$t('common.orderStatus.wip')" />
          <el-step :title="$t('common.orderStatus.done')" />
          <el-step :title="$t('common.orderStatus.delivered')" />
        </el-steps>
        <div class="status-actions">
          <el-button v-if="order.status === 'pending'" type="primary" @click="changeStatus('confirmed')">{{ $t('orderDetail.confirmOrder') }}</el-button>
          <el-button v-if="order.status === 'confirmed'" type="warning" @click="changeStatus('wip')">{{ $t('orderDetail.startWip') }}</el-button>
          <el-button v-if="['wip','revision'].includes(order.status)" @click="changeStatus('revision')">{{ $t('orderDetail.needRevision') }}</el-button>
          <el-button v-if="['wip','revision'].includes(order.status)" type="success" @click="changeStatus('done')">{{ $t('orderDetail.markDone') }}</el-button>
          <el-button v-if="order.status === 'done'" type="success" @click="showDeliver = true">{{ $t('orderDetail.uploadDeliver') }}</el-button>
          <el-button v-if="!['delivered','cancelled'].includes(order.status)" type="danger" plain @click="changeStatus('cancelled')">{{ $t('orderDetail.cancelOrder') }}</el-button>
        </div>
      </el-card>

      <!-- 参考图 -->
      <el-card style="margin-top: 16px" v-if="order.references?.length">
        <template #header>{{ $t('orderDetail.references') }}</template>
        <div class="ref-grid">
          <el-image v-for="ref in order.references" :key="ref.id"
            :src="`/uploads/${ref.file_path}`" fit="cover" class="ref-img"
            :preview-src-list="order.references.map(r => `/uploads/${r.file_path}`)" />
        </div>
      </el-card>

      <!-- 备注 -->
      <el-card style="margin-top: 16px">
        <template #header>{{ $t('orderDetail.notes') }}</template>
        <div class="notes">
          <div v-for="note in order.notes" :key="note.id" class="note-item">
            <span class="note-time">{{ formatDate(note.created_at) }}</span>
            <span class="note-content">{{ note.content }}</span>
          </div>
          <el-empty v-if="!order.notes?.length" :description="$t('orderDetail.noNotes')" :image-size="60" />
        </div>
        <div class="note-input">
          <el-input v-model="newNote" :placeholder="$t('orderDetail.notePlaceholder')" @keyup.enter="addNote" />
          <el-button type="primary" @click="addNote">{{ $t('orderDetail.addNote') }}</el-button>
        </div>
      </el-card>

      <!-- 交付文件 -->
      <el-card style="margin-top: 16px" v-if="order.deliverables?.length">
        <template #header>{{ $t('orderDetail.deliverFiles') }}</template>
        <div v-for="d in order.deliverables" :key="d.id" class="file-item">
          <span>📄 {{ d.original_name }}</span>
          <el-button size="small" @click="openFile(d.file_path)">{{ $t('common.download') }}</el-button>
        </div>
      </el-card>
    </div>

    <!-- 交付弹窗 -->
    <el-dialog v-model="showDeliver" :title="$t('orderDetail.deliverTitle')" width="400px">
      <el-upload drag :auto-upload="false" :limit="1" :on-change="handleDeliverFile">
        <el-icon style="font-size: 40px; color: var(--text-secondary)"><Upload /></el-icon>
        <p>{{ $t('orderDetail.dragUpload') }}</p>
      </el-upload>
      <template #footer>
        <el-button @click="showDeliver = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitDeliver" :disabled="!deliverFile">{{ $t('orderDetail.confirmDeliver') }}</el-button>
      </template>
    </el-dialog>
  </ArtistLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const order = ref(null)
const newNote = ref('')
const showDeliver = ref(false)
const deliverFile = ref(null)

// 返回来源页：排期看板进来回排期，订单列表进来回列表，直接访问则默认回列表
const fromQueue = route.query.from === 'queue'
const backTitle = computed(() => fromQueue ? t('orderDetail.backToQueue') : t('orderDetail.backToList'))
function goBack() {
  router.push(fromQueue ? '/queue' : '/orders')
}

const statusType = (s) => ({
  pending: 'info', confirmed: 'primary', wip: 'warning',
  revision: 'warning', done: 'success', delivered: 'success', cancelled: 'danger'
}[s] || 'info')

const stepActive = computed(() => {
  const map = { pending: 0, confirmed: 1, wip: 2, revision: 2, done: 3, delivered: 4, cancelled: -1 }
  return map[order.value?.status] ?? 0
})

function formatDate(str) {
  if (!str) return ''
  const loc = locale.value === 'zh-CN' ? 'zh-CN' : 'en-US'
  return new Date(str).toLocaleString(loc)
}

async function loadOrder() {
  try {
    order.value = await artistApi.getOrder(route.params.id)
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function changeStatus(status) {
  if (status === 'cancelled') {
    try {
      await ElMessageBox.confirm(t('orderDetail.cancelConfirm'), t('orderDetail.confirmTitle'), { type: 'warning' })
    } catch { return }
  }
  try {
    order.value = await artistApi.updateStatus(route.params.id, status)
    ElMessage.success(t('orderDetail.statusUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function changePriority(priority) {
  try {
    await artistApi.updatePriority(route.params.id, priority)
    ElMessage.success(t('orderDetail.priorityUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function addNote() {
  if (!newNote.value.trim()) return
  try {
    order.value = await artistApi.addNote(route.params.id, newNote.value.trim())
    newNote.value = ''
    ElMessage.success(t('orderDetail.noteAdded'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

function openFile(filePath) {
  window.open(`/uploads/${filePath}`, '_blank')
}

function handleDeliverFile(file) {
  deliverFile.value = file.raw
}

async function submitDeliver() {
  if (!deliverFile.value) return
  try {
    const uploaded = await uploadApi.deliverable(deliverFile.value)
    order.value = await artistApi.deliver(route.params.id, {
      filePath: uploaded.filePath,
      fileName: uploaded.originalName
    })
    showDeliver.value = false
    deliverFile.value = null
    ElMessage.success(t('orderDetail.deliverSuccess'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

onMounted(loadOrder)
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.status-actions { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
.ref-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.ref-img { height: 120px; width: 100%; border-radius: 6px; }
.notes { max-height: 200px; overflow-y: auto; margin-bottom: 12px; }
.note-item { padding: 8px 0; border-bottom: 1px solid var(--border-color); }
.note-time { color: var(--text-secondary); font-size: 12px; margin-right: 8px; }
.note-input { display: flex; gap: 8px; }
.note-input .el-input { flex: 1; }
.file-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }
</style>
