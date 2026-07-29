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
            <!-- R17: 优先级分段按钮（红/黄/绿，点击即保存） -->
            <el-radio-group v-model="order.priority" size="small" class="priority-group" @change="changePriority">
              <el-radio-button value="high" class="prio-high">{{ $t('common.priority.high') }}</el-radio-button>
              <el-radio-button value="medium" class="prio-medium">{{ $t('common.priority.medium') }}</el-radio-button>
              <el-radio-button value="low" class="prio-low">{{ $t('common.priority.low') }}</el-radio-button>
            </el-radio-group>
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

      <!-- R30d: 流程进度（仅接入工作流的订单显示；老订单走上方固定状态流） -->
      <el-card v-if="order.currentStageId != null" style="margin-top: 16px">
        <template #header>
          <div class="card-header">
            <span>{{ $t('orderDetail.workflowTitle') }}</span>
            <el-button text size="small" type="info" @click="turnOffStageTracking">{{ $t('orderDetail.stageOff') }}</el-button>
          </div>
        </template>
        <OrderTimeline :stages="workflowStages" :current-stage-id="order.currentStageId" />
        <p class="stage-progress-text">
          {{ $t('orderDetail.stageProgress', { current: stageProgress.current, total: stageProgress.total }) }}
          <span v-if="order.status === 'revision'" class="stage-revision-mark">↩ {{ $t('orderDetail.stageRevision') }}</span>
        </p>
        <div class="stage-actions">
          <el-button v-if="canAdvanceStage" type="primary" @click="advanceStage">
            {{ $t('orderDetail.advanceTo') }}{{ nextStageName }}
          </el-button>
          <el-button v-if="canBackStage" type="warning" plain @click="backStage">{{ $t('orderDetail.stageBack') }}</el-button>
        </div>
      </el-card>

      <!-- R18: 订单图库（参考图 + 画师加图，点击设焦点） -->
      <el-card style="margin-top: 16px">
        <template #header>
          <div class="card-header">
            <span>{{ $t('orderDetail.gallery') }}</span>
            <span class="gallery-count">{{ order.references?.length || 0 }} / 20</span>
          </div>
        </template>
        <div class="ref-grid">
          <div
            v-for="(reference, index) in order.references" :key="reference.id"
            class="ref-item" :class="{ 'ref-item--focus': order.focus_image_path === reference.file_path }"
          >
            <div class="ref-img-wrap" @click="selectFocusImage(reference)">
              <el-image :src="reference.url" fit="cover" class="ref-img" :alt="$t('orderDetail.referenceImage')" @error="refreshNow" />
              <!-- R18: 来源角标（客户/画师） -->
              <span class="ref-source-badge" :class="`ref-source-badge--${reference.source || 'client'}`">
                {{ reference.source === 'artist' ? $t('orderDetail.sourceArtist') : $t('orderDetail.sourceClient') }}
              </span>
              <!-- 悬停操作：预览 + 删除 -->
              <span class="ref-hover-actions">
                <el-button size="small" circle :title="$t('orderDetail.galleryPreview')" @click.stop="openGalleryViewer(index)">🔍</el-button>
                <el-button size="small" circle type="danger" :title="$t('orderDetail.deleteRef')" @click.stop="deleteReference(reference)">✕</el-button>
              </span>
              <!-- 焦点指示 -->
              <span v-if="order.focus_image_path === reference.file_path" class="ref-focus-indicator">✓</span>
            </div>
          </div>

          <!-- R18: 上传入口（拖拽/点击/Ctrl+V） -->
          <div
            class="ref-upload-tile"
            :class="{ 'ref-upload-tile--active': isGalleryDragOver }"
            @dragover.prevent="isGalleryDragOver = true"
            @dragleave="isGalleryDragOver = false"
            @drop.prevent="handleGalleryDrop"
            @click="triggerGalleryUpload"
          >
            <el-icon :size="24"><Plus /></el-icon>
            <span class="ref-upload-text">{{ $t('orderDetail.galleryUpload') }}</span>
          </div>
          <input
            ref="galleryInputEl" type="file" accept="image/*" multiple hidden
            @change="handleGalleryFileSelect"
          />
        </div>
        <p v-if="!order.references?.length" class="no-refs">{{ $t('orderDetail.noReferences') }}</p>
        <p v-if="galleryUploading" class="upload-status">{{ $t('orderDetail.uploading') }}</p>
        <p v-if="pasteError" class="upload-error">{{ pasteError }}</p>
        <p class="focus-hint">{{ $t('orderDetail.galleryHint') }}</p>
      </el-card>

      <!-- R19: 备注（支持附图） -->
      <el-card style="margin-top: 16px">
        <template #header>{{ $t('orderDetail.notes') }}</template>
        <div class="notes">
          <div v-for="note in order.notes" :key="note.id" class="note-item">
            <div class="note-head">
              <span class="note-time">{{ formatDate(note.created_at) }}</span>
            </div>
            <span class="note-content">{{ note.content }}</span>
            <!-- R19: 带图备注显示缩略图，点击看大图 -->
            <img
              v-if="note.imageUrl"
              :src="note.imageUrl"
              class="note-thumb"
              :alt="$t('orderDetail.noteImage')"
              @click="openNoteImage(note.imageUrl)"
              @error="refreshNow"
            />
          </div>
          <el-empty v-if="!order.notes?.length" :description="$t('orderDetail.noNotes')" :image-size="60" />
        </div>
        <div class="note-input">
          <el-input v-model="newNote" :placeholder="$t('orderDetail.notePlaceholder')" @keyup.enter="addNote" />
          <!-- R19: 附图按钮（上传/粘贴 1 张） -->
          <el-button @click="triggerNoteImageUpload" :disabled="!!pendingNoteImage">
            <el-icon><Picture /></el-icon>
          </el-button>
          <input
            ref="noteImageInputEl" type="file" accept="image/*" hidden
            @change="handleNoteImageSelect"
          />
          <el-button type="primary" @click="addNote" :loading="noteSubmitting">{{ $t('orderDetail.addNote') }}</el-button>
        </div>
        <!-- R19: 待发送附图预览 -->
        <div v-if="pendingNoteImage" class="note-pending">
          <img :src="pendingNoteImage.url" class="note-pending-img" :alt="$t('orderDetail.noteImage')" />
          <el-button text type="danger" size="small" @click="pendingNoteImage = null">✕ {{ $t('common.cancel') }}</el-button>
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

    <!-- R18: 图库大图预览（悬停放大镜打开，支持左右切换） -->
    <el-image-viewer
      v-if="galleryViewerVisible"
      :url-list="order.references?.map(r => r.url) || []"
      :initial-index="galleryViewerIndex"
      @close="galleryViewerVisible = false"
    />

    <!-- R19: 备注附图大图查看 -->
    <el-image-viewer
      v-if="noteImageViewerUrl"
      :url-list="[noteImageViewerUrl]"
      @close="noteImageViewerUrl = null"
    />
  </ArtistLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, Plus, Picture } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import OrderTimeline from '../../components/shared/OrderTimeline.vue'
import { usePasteUpload } from '../../composables/usePasteUpload.js'
import { useSignatureRefresh } from '../../composables/useSignatureRefresh.js'
import { formatDateTime } from '../../utils/datetime.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const order = ref(null)
const prevPriority = ref(null)
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
    prevPriority.value = order.value?.priority || 'medium'
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── R30d: 流程状态机（进度条 + 推进/打回 + 关闭跟踪） ───
const workflowStages = ref([])

/** 当前节点在排序后列表中的索引（-1 = 未接入/节点已删） */
const currentStageIdx = computed(() =>
  workflowStages.value.findIndex(s => s.id === order.value?.currentStageId)
)

/** 进度 { current, total }（后端未返回时前端兜底计算） */
const stageProgress = computed(() =>
  order.value?.stageProgress || { current: currentStageIdx.value + 1, total: workflowStages.value.length }
)

/** 下一节点（用于推进按钮文案） */
const nextStage = computed(() =>
  currentStageIdx.value !== -1 ? workflowStages.value[currentStageIdx.value + 1] : null
)
const nextStageName = computed(() => nextStage.value?.name || '')

/** 可推进：有 stage、非终态、存在下一节点 */
const canAdvanceStage = computed(() =>
  order.value?.currentStageId != null
  && !['delivered', 'cancelled'].includes(order.value?.status)
  && !!nextStage.value
)

/** 可打回：有 stage、非终态、存在上一节点 */
const canBackStage = computed(() =>
  order.value?.currentStageId != null
  && !['delivered', 'cancelled'].includes(order.value?.status)
  && currentStageIdx.value > 0
)

async function advanceStage() {
  if (!nextStage.value) return
  try {
    order.value = await artistApi.advanceStage(route.params.id, nextStage.value.id)
    ElMessage.success(t('orderDetail.stageUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function backStage() {
  const prev = workflowStages.value[currentStageIdx.value - 1]
  if (!prev) return
  try {
    await ElMessageBox.confirm(
      t('orderDetail.stageBackConfirm', { name: prev.name }),
      t('orderDetail.confirmTitle'),
      { type: 'warning' }
    )
  } catch { return }
  try {
    order.value = await artistApi.stageBack(route.params.id, prev.id)
    ElMessage.success(t('orderDetail.stageUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function turnOffStageTracking() {
  try {
    await ElMessageBox.confirm(
      t('orderDetail.stageOffConfirm'),
      t('orderDetail.confirmTitle'),
      { type: 'warning' }
    )
  } catch { return }
  try {
    order.value = await artistApi.stageOff(route.params.id)
    ElMessage.success(t('orderDetail.stageOffDone'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function loadWorkflowStages() {
  try {
    const res = await artistApi.getWorkflow()
    workflowStages.value = res.stages || []
  } catch {
    // 静默失败：无工作流时流程卡片不显示（currentStageId 为 null）
  }
}

// ─── R18: 订单图库（上传 + 来源角标 + 点击设焦点） ───
const galleryInputEl = ref(null)
const galleryUploading = ref(false)
const isGalleryDragOver = ref(false)
const galleryViewerVisible = ref(false)
const galleryViewerIndex = ref(0)

function openGalleryViewer(index) {
  galleryViewerIndex.value = index
  galleryViewerVisible.value = true
}

/** 图片文件前端校验（格式 + 10MB） */
function validateImageFile(file) {
  if (!file.type.startsWith('image/')) {
    ElMessage.error(t('orderDetail.galleryNotImage'))
    return false
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error(t('orderDetail.galleryTooBig'))
    return false
  }
  return true
}

/** 上传单张图并关联到订单（画师加图，后端自动标 source='artist'） */
async function uploadAndAttachReference(file) {
  if (!validateImageFile(file)) return
  const uploaded = await uploadApi.reference(file)
  order.value = await artistApi.addReference(route.params.id, {
    filePath: uploaded.filePath,
    fileName: uploaded.originalName,
    fileSize: uploaded.size
  })
}

/** 批量上传（拖拽/多选/粘贴共用） */
async function uploadGalleryFiles(files) {
  if (!files.length) return
  galleryUploading.value = true
  try {
    for (const file of files) {
      await uploadAndAttachReference(file)
    }
    ElMessage.success(t('orderDetail.galleryUploadSuccess'))
  } catch (err) {
    ElMessage.error(err.message)
    await loadOrder() // 部分成功时刷新到最新状态
  } finally {
    galleryUploading.value = false
  }
}

function triggerGalleryUpload() {
  galleryInputEl.value?.click()
}

function handleGalleryFileSelect(event) {
  const files = [...event.target.files]
  event.target.value = ''
  uploadGalleryFiles(files)
}

function handleGalleryDrop(event) {
  isGalleryDragOver.value = false
  const files = [...event.dataTransfer.files].filter(f => f.type.startsWith('image/'))
  if (files.length) uploadGalleryFiles(files)
}

// R18/R19: Ctrl+V 粘贴上传（复用 usePasteUpload，焦点路由：
// 备注输入框聚焦时 → 备注附图（单张）；否则 → 订单图库（多张））
const { pasteError } = usePasteUpload({
  onFiles: async (files) => {
    if (document.activeElement?.closest('.note-input')) {
      await uploadNoteImage(files[0])
      if (files.length > 1) ElMessage.info(t('orderDetail.noteImageSingle'))
    } else {
      await uploadGalleryFiles(files)
    }
  },
  maxCount: 5,
  maxSizeMB: 10
})

// R18: 点击图片 = 设为焦点（替代独立"设为焦点"按钮）
async function selectFocusImage(reference) {
  try {
    // mode 仅为满足后端 schema；实际显示尺寸由看板 queue_focus_display 决定
    order.value = await artistApi.setFocusImage(route.params.id, { imagePath: reference.file_path, mode: 'small' })
    ElMessage.success(t('orderDetail.focusUpdated'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── R17: 优先级（点击即保存，失败回滚） ───
async function changePriority(priority) {
  try {
    await artistApi.updatePriority(route.params.id, priority)
    prevPriority.value = priority
    ElMessage.success(t('orderDetail.priorityUpdated'))
  } catch (err) {
    order.value.priority = prevPriority.value
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

// ─── R19: 备注附图 ───
const noteImageInputEl = ref(null)
const pendingNoteImage = ref(null) // { filePath, url }
const noteSubmitting = ref(false)
const noteImageViewerUrl = ref(null)

function triggerNoteImageUpload() {
  noteImageInputEl.value?.click()
}

async function handleNoteImageSelect(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  await uploadNoteImage(file)
}

async function uploadNoteImage(file) {
  if (!validateImageFile(file)) return
  try {
    const uploaded = await uploadApi.noteImage(file)
    pendingNoteImage.value = { filePath: uploaded.filePath, url: uploaded.url }
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function addNote() {
  if (!newNote.value.trim()) return
  noteSubmitting.value = true
  try {
    // R19: 带可选附图（imagePath 走 notes/{artistId}/ 目录，后端签名返回 imageUrl）
    order.value = await artistApi.addNote(route.params.id, {
      content: newNote.value.trim(),
      imagePath: pendingNoteImage.value?.filePath || null
    })
    newNote.value = ''
    pendingNoteImage.value = null
    ElMessage.success(t('orderDetail.noteAdded'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    noteSubmitting.value = false
  }
}

function openNoteImage(url) {
  noteImageViewerUrl.value = url
}

function openFile(url) {
  // H-1 修复：使用后端返回的签名 URL（references/deliverables 非公开目录）
  window.open(url, '_blank', 'noopener')
}

// UI-1: 删除参考图（悬停显示，确认后删除，焦点图由后端自动清理）
async function deleteReference(reference) {
  try {
    await ElMessageBox.confirm(
      t('orderDetail.deleteRefConfirm'),
      t('orderDetail.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    await artistApi.deleteReference(route.params.id, reference.id)
    await loadOrder()
    ElMessage.success(t('orderDetail.deleteRefSuccess'))
  } catch (err) {
    ElMessage.error(err.message)
  }
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

// ─── R33: 签名 URL 定时刷新（10 分钟轮询 + el-image @error 兜底） ───
const { refreshNow } = useSignatureRefresh({
  collect: () => {
    const o = order.value
    if (!o) return []
    return [
      ...(o.references || []).map(r => r.file_path),
      ...(o.notes || []).filter(n => n.image_path).map(n => n.image_path),
      ...(o.deliverables || []).map(d => d.file_path)
    ].filter(Boolean)
  },
  apply: (urlMap) => {
    const o = order.value
    if (!o) return
    o.references?.forEach(r => { if (urlMap[r.file_path]) r.url = urlMap[r.file_path] })
    o.notes?.forEach(n => { if (n.image_path && urlMap[n.image_path]) n.imageUrl = urlMap[n.image_path] })
    o.deliverables?.forEach(d => { if (urlMap[d.file_path]) d.url = urlMap[d.file_path] })
  }
})

onMounted(() => {
  loadOrder()
  loadWorkflowStages() // R30d: 流程进度条需要节点列表
})
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.status-actions { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }

/* ─── R30d: 流程进度 ─── */
.stage-progress-text { font-size: 13px; color: var(--text-secondary); margin: 12px 0 0; }
.stage-revision-mark { color: var(--el-color-warning); font-weight: 600; margin-left: 8px; }
.stage-actions { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; }

/* ─── R18: 订单图库 ─── */
.gallery-count { font-size: 13px; color: var(--text-secondary); }
.ref-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.ref-item { display: flex; flex-direction: column; gap: 4px; }
.ref-item--focus .ref-img { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.ref-img-wrap {
  position: relative;
  cursor: pointer;
  border-radius: 6px;
  overflow: hidden;
  transition: transform 0.15s;
}
.ref-img-wrap:hover { transform: scale(1.02); }
.ref-img { height: 120px; width: 100%; border-radius: 6px; display: block; }
/* R18: 来源角标 */
.ref-source-badge {
  position: absolute;
  bottom: 4px;
  left: 4px;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  line-height: 1.5;
  pointer-events: none;
}
.ref-source-badge--client { background: rgba(0, 0, 0, 0.55); color: #fff; }
.ref-source-badge--artist { background: var(--el-color-primary); color: #fff; }
/* 焦点指示 */
.ref-focus-indicator {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
/* 悬停操作组（预览 + 删除） */
.ref-hover-actions {
  position: absolute; top: 4px; right: 4px;
  display: flex; gap: 4px;
  opacity: 0; transition: opacity 0.15s;
}
.ref-img-wrap:hover .ref-hover-actions { opacity: 1; }
/* R18: 上传磁贴 */
.ref-upload-tile {
  height: 120px;
  border: 2px dashed var(--border-color);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}
.ref-upload-tile:hover, .ref-upload-tile--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.ref-upload-text { font-size: 12px; }
.upload-status { font-size: 12px; color: var(--el-color-primary); margin: 8px 0 0; }
.upload-error { font-size: 12px; color: var(--el-color-danger); margin: 8px 0 0; }
.no-refs { color: var(--text-secondary); font-size: 13px; margin: 0; }
.focus-hint { font-size: 12px; color: var(--text-secondary); margin: 12px 0 0; }

/* R17: 优先级分段按钮配色（选中态由 Element Plus 内部 is-checked 控制） */
.priority-group :deep(.prio-high.is-checked .el-radio-button__inner) { background: var(--el-color-danger); border-color: var(--el-color-danger); box-shadow: -1px 0 0 0 var(--el-color-danger); }
.priority-group :deep(.prio-medium.is-checked .el-radio-button__inner) { background: var(--el-color-warning); border-color: var(--el-color-warning); box-shadow: -1px 0 0 0 var(--el-color-warning); }
.priority-group :deep(.prio-low.is-checked .el-radio-button__inner) { background: var(--el-color-success); border-color: var(--el-color-success); box-shadow: -1px 0 0 0 var(--el-color-success); }

/* ─── R19: 备注附图 ─── */
.notes { max-height: 300px; overflow-y: auto; margin-bottom: 12px; }
.note-item { padding: 8px 0; border-bottom: 1px solid var(--border-color); }
.note-head { margin-bottom: 2px; }
.note-time { color: var(--text-secondary); font-size: 12px; margin-right: 8px; }
.note-content { font-size: 14px; }
.note-thumb {
  display: block;
  margin-top: 6px;
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
  cursor: zoom-in;
  border: 1px solid var(--border-color);
  transition: transform 0.15s, box-shadow 0.15s;
}
.note-thumb:hover { transform: scale(1.05); box-shadow: var(--shadow-card, 0 2px 8px rgba(0,0,0,0.1)); }
.note-input { display: flex; gap: 8px; }
.note-input .el-input { flex: 1; }
.note-pending {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  border: 1px dashed var(--el-color-primary);
  border-radius: 6px;
  background: var(--el-color-primary-light-9);
}
.note-pending-img { width: 48px; height: 48px; object-fit: cover; border-radius: 4px; }

.file-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }
</style>
