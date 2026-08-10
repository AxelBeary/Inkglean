<template>
  <!-- R40: 活动时间线（系统备注 + 画师备注按 created_at 混排，方案A 纯前端；R46 悬停删除）
       2026-08-10 拆分批：整卡+附图查看器搬自 OrderDetail.vue，零行为变化 -->
  <el-card class="od-card">
    <template #header>
      <CardHead :title="$t('orderDetail.timelineTitle')">
        <template #extra>
          <span class="timeline-count">{{ $t('orderDetail.noteCount', { n: order.notes?.length || 0 }) }}</span>
        </template>
      </CardHead>
    </template>
    <el-timeline v-if="order.notes?.length" class="activity-timeline">
      <el-timeline-item
        v-for="note in order.notes" :key="note.id"
        :type="note.created_by === 'system' ? 'info' : (note.image_path ? 'success' : 'primary')"
        :hollow="note.created_by === 'system'"
        :timestamp="formatDate(note.created_at)" placement="top"
      >
        <div class="tl-item" :class="{ 'tl-item--system': note.created_by === 'system' }">
          <div class="tl-head">
            <span class="tl-type">{{ note.created_by === 'system' ? $t('orderDetail.tlTypeSystem') : (note.image_path ? $t('orderDetail.tlTypeImage') : $t('orderDetail.tlTypeNote')) }}</span>
            <!-- R46: 画师备注悬停显示删除（系统备注不显示；触屏常驻，与参考图交互一致 C56） -->
            <el-button
              v-if="note.created_by !== 'system'"
              class="tl-delete" size="small" circle type="danger"
              :title="$t('orderDetail.deleteNote')"
              @click="deleteNote(note)"
            >
              ✕
            </el-button>
          </div>
          <div class="tl-content">{{ note.content }}</div>
          <!-- R19: 带图备注显示缩略图，点击看大图 -->
          <img
            v-if="note.imageUrl"
            :src="note.imageUrl"
            class="note-thumb"
            :alt="$t('orderDetail.noteImage')"
            @click="openNoteImage(note.imageUrl)"
            @error="emit('refresh')"
          />
        </div>
      </el-timeline-item>
    </el-timeline>
    <InkEmpty v-else :title="$t('orderDetail.noNotes')" />
    <!-- 添加备注输入框（R40：移到时间线底部） -->
    <div
      class="note-input"
      :class="{ 'note-input--drag-over': isNoteDragOver }"
      @dragenter.capture="guardDragEnter"
      @dragover.capture="guardDragOver"
      @dragover.prevent="isNoteDragOver = true"
      @dragleave="onNoteDragLeave"
      @drop.prevent="handleNoteDrop"
    >
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

  <!-- R19: 备注附图大图查看 -->
  <el-image-viewer
    v-if="noteImageViewerUrl"
    :url-list="[noteImageViewerUrl]"
    @close="noteImageViewerUrl = null"
  />
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Picture } from '@element-plus/icons-vue'
import CardHead from '../visual/CardHead.vue'
import InkEmpty from '../visual/InkEmpty.vue'
import { artistApi, uploadApi } from '../../../api/index.js'
import { formatDateTime } from '../../../utils/datetime.js'

const props = defineProps({
  order: { type: Object, required: true },
  routeId: { type: [String, Number], required: true },
  /* 图库 composable 的守卫/校验（拖拽防页内图 + 图片类型校验），由父级传入保持单一来源 */
  guardDrop: { type: Function, required: true },
  guardDragEnter: { type: Function, required: true },
  guardDragOver: { type: Function, required: true },
  validateImageFile: { type: Function, required: true }
})
const emit = defineEmits(['order-updated', 'refresh'])

const { t } = useI18n()

function formatDate(str) {
  return formatDateTime(str)
}

const newNote = ref('')
const noteImageInputEl = ref(null)
const pendingNoteImage = ref(null) // { filePath, url }
const noteSubmitting = ref(false)
const noteImageViewerUrl = ref(null)

// ─── R41/C55: 备注附图拖拽上传（粘贴由父级 usePasteUpload 焦点路由调 expose 的 uploadNoteImage） ───
const isNoteDragOver = ref(false)
/** 防 dragleave 闪烁：子元素间移动时 relatedTarget 仍在容器内，忽略 */
function onNoteDragLeave(e) {
  if (e.currentTarget.contains(e.relatedTarget)) return
  isNoteDragOver.value = false
}
async function handleNoteDrop(event) {
  isNoteDragOver.value = false
  if (!props.guardDrop(event)) return // G1: 页内图拖入 → 拒绝 + 警告（dragover 已拦，此处兜底）
  const file = [...event.dataTransfer.files].find(f => f.type.startsWith('image/'))
  if (file) await uploadNoteImage(file) // 单张，与粘贴行为一致
}

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
  if (!props.validateImageFile(file)) return
  try {
    const uploaded = await uploadApi.noteImage(file)
    pendingNoteImage.value = { filePath: uploaded.filePath, url: uploaded.url }
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function addNote() {
  // T2: Enter 路径与按钮共用 addNote，按钮有 :loading 防连点，Enter 没有——统一在此拦截
  if (noteSubmitting.value) return
  if (!newNote.value.trim()) return
  noteSubmitting.value = true
  try {
    // R19: 带可选附图（imagePath 走 notes/{artistId}/ 目录，后端签名返回 imageUrl）
    emit('order-updated', await artistApi.addNote(props.routeId, {
      content: newNote.value.trim(),
      imagePath: pendingNoteImage.value?.filePath || null
    }))
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

// R46: 删除备注（C59 方案C：单条用 ElMessageBox.confirm；系统备注后端 403 拒绝，前端不显示按钮）
async function deleteNote(note) {
  try {
    await ElMessageBox.confirm(
      t('orderDetail.deleteNoteConfirm'),
      t('orderDetail.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    // 后端返回删除后的完整订单（含新签名 URL），直接替换保证状态一致
    emit('order-updated', await artistApi.deleteNote(props.routeId, note.id))
    ElMessage.success(t('orderDetail.deleteNoteSuccess'))
  } catch (err) {
    ElMessage.error(err.message)
  }
}

/* 父级粘贴焦点路由调用（usePasteUpload：聚焦 .note-input 时粘贴 → 备注附图） */
defineExpose({ uploadNoteImage })
</script>

<style scoped>
/* ─── R40: 活动时间线 ─── */
.timeline-count { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); }
.activity-timeline { padding-top: 4px; }
.tl-item { position: relative; }
.tl-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.tl-type { font-size: calc(var(--font-scale, 1) * 12px); font-weight: 600; color: var(--ink2); }
.tl-item--system .tl-content { color: var(--ink2); font-size: calc(var(--font-scale, 1) * 13px); }
.tl-content { font-size: calc(var(--font-scale, 1) * 14px); color: var(--ink); line-height: 1.6; word-break: break-word; }
/* R46: 删除按钮悬停显示（触屏常驻，与参考图 .ref-hover-actions 交互一致 C56） */
.tl-delete { opacity: 0; transition: opacity 0.15s; margin-left: auto; }
.tl-item:hover .tl-delete { opacity: 1; }
@media (hover: none) {
  .tl-delete { opacity: 1; }
}
.note-thumb {
  display: block;
  margin-top: 6px;
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: var(--r-m);
  cursor: zoom-in;
  border: 1px solid var(--line);
  background: var(--paper2);
  transition: box-shadow 0.15s;
}
.note-thumb:hover { box-shadow: var(--sh-2); }
.note-input { display: flex; gap: 8px; border-radius: var(--r-m); transition: outline 0.15s; }
/* R41: 拖拽进入高亮 */
.note-input--drag-over { outline: 2px dashed var(--hq); outline-offset: 4px; }
.note-input .el-input { flex: 1; }
.note-pending {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  border: 1px dashed var(--hq);
  border-radius: var(--r-m);
  background: var(--hq-t);
}
.note-pending-img { width: 48px; height: 48px; object-fit: cover; border-radius: var(--r-s); }
</style>
