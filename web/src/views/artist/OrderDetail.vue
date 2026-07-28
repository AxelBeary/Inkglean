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
          <el-button v-if="order.status === 'wip'" @click="changeStatus('revision')">{{ $t('orderDetail.needRevision') }}</el-button>
          <el-button v-if="['wip','revision'].includes(order.status)" type="success" @click="changeStatus('done')">{{ $t('orderDetail.markDone') }}</el-button>
          <el-button v-if="order.status === 'done'" type="success" @click="openDeliverDialog">{{ $t('orderDetail.uploadDeliver') }}</el-button>
          <el-button v-if="!['delivered','cancelled'].includes(order.status)" type="danger" plain @click="changeStatus('cancelled')">{{ $t('orderDetail.cancelOrder') }}</el-button>
        </div>
      </el-card>

      <!-- 参考图 + 焦点图设置（R4） -->
      <el-card style="margin-top: 16px">
        <template #header>{{ $t('orderDetail.references') }}</template>
        <template v-if="order.references?.length">
          <div class="ref-grid">
            <div
              v-for="(reference, index) in order.references" :key="reference.id"
              class="ref-item" :class="{ 'ref-item--focus': order.focus_image_path === reference.file_path }"
            >
              <el-image
                :src="reference.url" fit="cover" class="ref-img"
                :alt="$t('orderDetail.referenceImage')"
                :preview-src-list="order.references.map(r => r.url)"
                :initial-index="index"
              />
              <el-button
                size="small" class="ref-focus-btn"
                :type="order.focus_image_path === reference.file_path ? 'primary' : 'default'"
                @click="selectFocusImage(reference)"
              >
                {{ order.focus_image_path === reference.file_path ? $t('orderDetail.focusSelected') : $t('orderDetail.setFocus') }}
              </el-button>
            </div>
          </div>
        </template>
        <p v-else class="no-refs">{{ $t('orderDetail.noReferences') }}</p>
        <div class="focus-mode-row">
          <span class="focus-mode-label">{{ $t('orderDetail.focusMode') }}</span>
          <el-radio-group v-model="focusMode" size="small" :disabled="!order.references?.length" @change="changeFocusMode">
            <el-radio-button value="off">{{ $t('orderDetail.focusOff') }}</el-radio-button>
            <el-radio-button value="small">{{ $t('orderDetail.focusSmall') }}</el-radio-button>
            <el-radio-button value="large">{{ $t('orderDetail.focusLarge') }}</el-radio-button>
          </el-radio-group>
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
          <el-button size="small" @click="openFile(d.url)">{{ $t('common.download') }}</el-button>
        </div>
      </el-card>
    </div>

    <!-- 交付弹窗 -->
    <el-dialog v-model="showDeliver" :title="$t('orderDetail.deliverTitle')" width="400px">
      <el-upload
        drag :auto-upload="false" :limit="1" :file-list="deliverFileList"
        :on-change="handleDeliverFile" :on-remove="handleDeliverRemove"
        accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.psd,.ai,.tiff,.pdf,.zip,.rar,.7z,.mp4,.mov,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md"
      >
        <el-icon style="font-size: 40px; color: var(--text-secondary)"><Upload /></el-icon>
        <p>{{ $t('orderDetail.dragUpload') }}</p>
        <template #tip>
          <div class="el-upload__tip">{{ $t('orderDetail.uploadTip') }}</div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="showDeliver = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitDeliver" :disabled="!deliverFile" :loading="delivering">{{ $t('orderDetail.confirmDeliver') }}</el-button>
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
import { formatDateTime } from '../../utils/datetime.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const order = ref(null)
const focusMode = ref('off')
const newNote = ref('')
const showDeliver = ref(false)
const deliverFile = ref(null)
const deliverFileList = ref([])
const delivering = ref(false)

// P2-12: 交付文件前端校验
const DELIVER_MAX_SIZE = 50 * 1024 * 1024 // 50MB
const DELIVER_ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.zip', '.rar', '.7z', '.psd']

// 返回来源页：排期看板进来回排期，订单列表进来回列表，直接访问则默认回列表
const fromQueue = route.query.from === 'queue'
const backTitle = computed(() => fromQueue ? t('orderDetail.backToQueue') : t('orderDetail.backToList'))
function goBack() {
  router.push(fromQueue ? '/queue' : '/orders')
}

import { ORDER_STATUS_TYPE } from '../../constants/order.js'

const statusType = (s) => ORDER_STATUS_TYPE[s] || 'info'

const stepActive = computed(() => {
  const map = { pending: 0, confirmed: 1, wip: 2, revision: 2, done: 3, delivered: 4, cancelled: -1 }
  return map[order.value?.status] ?? 0
})

function formatDate(str) {
  return formatDateTime(str)
}

async function loadOrder() {
  try {
    order.value = await artistApi.getOrder(route.params.id)
    focusMode.value = order.value?.focus_image_mode || 'off'
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── R4: 焦点图 ───
async function selectFocusImage(reference) {
  try {
    // 当前为"关"时选择焦点图，默认切到"小"
    const mode = focusMode.value === 'off' ? 'small' : focusMode.value
    order.value = await artistApi.setFocusImage(route.params.id, { imagePath: reference.file_path, mode })
    focusMode.value = order.value.focus_image_mode
    ElMessage.success(t('orderDetail.focusUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function changeFocusMode(mode) {
  if (mode !== 'off' && !order.value?.focus_image_path) {
    ElMessage.warning(t('orderDetail.focusSelectFirst'))
    focusMode.value = 'off'
    return
  }
  try {
    order.value = await artistApi.setFocusImage(route.params.id, {
      imagePath: mode === 'off' ? null : order.value.focus_image_path,
      mode
    })
    focusMode.value = order.value.focus_image_mode
    ElMessage.success(t('orderDetail.focusUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
    focusMode.value = order.value?.focus_image_mode || 'off'
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

function openFile(url) {
  // H-1 修复：使用后端返回的签名 URL（references/deliverables 非公开目录）
  window.open(url, '_blank', 'noopener')
}

function handleDeliverFile(file) {
  // P2-12: 前端校验文件类型和大小
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
  if (!DELIVER_ALLOWED_EXT.includes(ext)) {
    ElMessage.error(t('orderDetail.invalidFileType'))
    return
  }
  if (file.size > DELIVER_MAX_SIZE) {
    ElMessage.error(t('orderDetail.fileTooLarge'))
    return
  }
  deliverFile.value = file.raw
}

function handleDeliverRemove() {
  deliverFile.value = null
}

// 打开交付弹窗时重置文件选择
function openDeliverDialog() {
  deliverFile.value = null
  deliverFileList.value = []
  showDeliver.value = true
}

async function submitDeliver() {
  if (!deliverFile.value) return
  delivering.value = true
  try {
    const uploaded = await uploadApi.deliverable(deliverFile.value)
    order.value = await artistApi.deliver(route.params.id, {
      filePath: uploaded.filePath,
      fileName: uploaded.originalName
    })
    showDeliver.value = false
    deliverFile.value = null
    deliverFileList.value = []
    ElMessage.success(t('orderDetail.deliverSuccess'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    delivering.value = false
  }
}

onMounted(loadOrder)
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.status-actions { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
.ref-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.ref-item { display: flex; flex-direction: column; gap: 4px; }
.ref-item--focus .ref-img { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.ref-img { height: 120px; width: 100%; border-radius: 6px; }
.ref-focus-btn { width: 100%; }
.no-refs { color: var(--text-secondary); font-size: 13px; margin: 0; }
.focus-mode-row { display: flex; align-items: center; gap: 12px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color); }
.focus-mode-label { font-size: 13px; color: var(--text-secondary); white-space: nowrap; }
.notes { max-height: 200px; overflow-y: auto; margin-bottom: 12px; }
.note-item { padding: 8px 0; border-bottom: 1px solid var(--border-color); }
.note-time { color: var(--text-secondary); font-size: 12px; margin-right: 8px; }
.note-input { display: flex; gap: 8px; }
.note-input .el-input { flex: 1; }
.file-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }
</style>
