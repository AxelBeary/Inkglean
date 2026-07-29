<template>
  <ArtistLayout>
    <h2>{{ $t('artworks.title') }}</h2>

    <!-- R45: 工具栏——"管理"按钮切换多选模式（C58） -->
    <div class="artwork-toolbar">
      <el-button :type="manageMode ? 'primary' : 'default'" @click="toggleManageMode">
        {{ manageMode ? $t('artworks.manageDone') : $t('artworks.manage') }}
      </el-button>
    </div>

    <!-- 上传区 -->
    <el-card style="margin: 16px 0">
      <el-upload
        drag multiple :auto-upload="true" :http-request="handleUpload"
        accept="image/*" :show-file-list="false"
      >
        <el-icon style="font-size: 40px; color: var(--text-secondary)"><Upload /></el-icon>
        <p>{{ $t('artworks.dragUpload') }}</p>
        <template #tip>
          <p style="color: var(--text-secondary); font-size: 12px">{{ $t('artworks.tip') }}</p>
        </template>
      </el-upload>
      <p class="paste-hint">{{ $t('upload.pasteHint') }}</p>
    </el-card>

    <!-- 作品网格 -->
    <div class="artwork-grid" v-loading="loading">
      <div
        v-for="(art, index) in artworks" :key="art.id"
        class="artwork-item"
        :class="{ 'artwork-item--selected': manageMode && selectedIds.has(art.id) }"
      >
        <el-image
          :src="`/uploads/${art.image_path}`" fit="cover" class="artwork-img"
          :alt="art.title || $t('artworks.image')"
          :preview-src-list="manageMode ? [] : artworks.map(a => `/uploads/${a.image_path}`)"
          :initial-index="index"
        />
        <!-- R45: 多选模式——选择层（覆盖图片，点击切换选中，阻断预览） -->
        <div v-if="manageMode" class="artwork-select-layer" @click="toggleSelect(art.id)">
          <span class="artwork-checkbox" :class="{ 'artwork-checkbox--on': selectedIds.has(art.id) }">
            <span v-if="selectedIds.has(art.id)">✓</span>
          </span>
        </div>
        <!-- 普通模式：单条删除（悬停显示） -->
        <div v-else class="artwork-actions">
          <el-button size="small" type="danger" @click="remove(art)">{{ $t('common.delete') }}</el-button>
        </div>
      </div>
    </div>

    <el-empty v-if="!loading && artworks.length === 0" :description="$t('artworks.empty')" />

    <!-- R45: 批量操作栏（多选模式下固定底部） -->
    <div v-if="manageMode" class="batch-bar">
      <span class="batch-count">{{ $t('artworks.selected', { n: selectedIds.size }) }}</span>
      <el-button size="small" @click="toggleManageMode">{{ $t('common.cancel') }}</el-button>
      <el-button size="small" type="danger" :disabled="selectedIds.size === 0" @click="startBatchDelete">
        {{ $t('common.delete') }}
      </el-button>
    </div>

    <!-- R45/C59: 批量删除 ≥3 条用滑块确认 -->
    <el-dialog v-model="slideDialogVisible" :title="$t('artworks.batchDeleteTitle')" width="400px">
      <p class="batch-slide-hint">{{ $t('artworks.batchDeleteConfirm', { n: selectedIds.size }) }}</p>
      <div class="slide-confirm">
        <div class="slide-confirm-fill" :style="{ width: `calc(${slideProgress} * 100%)` }"></div>
        <span class="slide-confirm-label">{{ $t('artworks.slideToDelete') }}</span>
        <div
          class="slide-confirm-thumb"
          :style="{ left: `calc(2px + ${slideProgress} * (100% - 40px))` }"
          @pointerdown="onSlideStart"
          @pointermove="onSlideMove"
          @pointerup="onSlideEnd"
        >
          →
        </div>
      </div>
    </el-dialog>
  </ArtistLayout>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import { usePasteUpload } from '../../composables/usePasteUpload.js'
import { useSlideConfirm } from '../../composables/useSlideConfirm.js'

const { t } = useI18n()

// ─── 粘贴上传（作品） ───
const { pasteError } = usePasteUpload({
  onFiles: handlePasteArtworkFiles,
  maxCount: 5,
  maxSizeMB: 10
})
watch(pasteError, (msg) => { if (msg) ElMessage.warning(msg) })
const artworks = ref([])
const loading = ref(true)

// ─── R45: 多选模式（C58：工具栏"管理"按钮切换） ───
const manageMode = ref(false)
const selectedIds = ref(new Set())

function toggleManageMode() {
  manageMode.value = !manageMode.value
  selectedIds.value = new Set() // 进入/退出都清空选中
}

function toggleSelect(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

/** 批量删除入口：<3 条标准弹窗，≥3 条滑块确认（C59 分级） */
async function startBatchDelete() {
  if (selectedIds.value.size === 0) return
  if (selectedIds.value.size < 3) {
    try {
      await ElMessageBox.confirm(
        t('artworks.batchDeleteConfirm', { n: selectedIds.value.size }),
        t('common.confirmDeleteTitle'),
        { type: 'warning' }
      )
    } catch { return }
    await doBatchDelete()
  } else {
    slideDialogVisible.value = true
  }
}

const slideDialogVisible = ref(false)
const {
  progress: slideProgress,
  onStart: onSlideStart,
  onMove: onSlideMove,
  onEnd: onSlideEnd
} = useSlideConfirm({
  onConfirm: async () => {
    slideDialogVisible.value = false
    await doBatchDelete()
  }
})

/** 逐条删除（无批量接口），完成后退出多选模式并刷新 */
async function doBatchDelete() {
  const ids = [...selectedIds.value]
  let failed = 0
  for (const id of ids) {
    try {
      await artistApi.deleteArtwork(id)
    } catch {
      failed++
    }
  }
  if (failed === 0) {
    ElMessage.success(t('artworks.batchDeleted', { n: ids.length }))
  } else {
    ElMessage.warning(t('artworks.batchPartial', { ok: ids.length - failed, failed }))
  }
  manageMode.value = false
  selectedIds.value = new Set()
  await loadArtworks()
}

async function handleUpload({ file }) {
  try {
    const uploaded = await uploadApi.image(file)
    await artistApi.createArtwork({ imagePath: uploaded.filePath, title: uploaded.originalName })
    ElMessage.success(t('artworks.uploaded'))
    await loadArtworks()
  } catch (err) {
    ElMessage.error(err.message || t('common.uploadFailed'))
  }
}

async function remove(art) {
  try {
    await ElMessageBox.confirm(t('artworks.confirmDelete'), t('common.confirmDeleteTitle'), { type: 'warning' })
    await artistApi.deleteArtwork(art.id)
    ElMessage.success(t('common.deleted'))
    await loadArtworks()
  } catch { /* cancelled */ }
}

async function loadArtworks() {
  loading.value = true
  try {
    artworks.value = await artistApi.getArtworks()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

async function handlePasteArtworkFiles(files) {
  for (const file of files) {
    const uploaded = await uploadApi.image(file)
    await artistApi.createArtwork({ imagePath: uploaded.filePath, title: uploaded.originalName || file.name })
  }
  ElMessage.success(t('artworks.uploaded'))
  await loadArtworks()
}

onMounted(loadArtworks)
</script>

<style scoped>
/* R45: 工具栏 */
.artwork-toolbar { margin: 12px 0; }

.artwork-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px; margin-top: 16px;
}
.artwork-item { position: relative; border-radius: 8px; overflow: hidden; }
.artwork-img { width: 100%; height: 180px; display: block; }
.artwork-actions {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: var(--overlay-bg, rgba(0,0,0,0.5)); padding: 8px; text-align: center;
  opacity: 0; transition: opacity 0.2s;
}
.artwork-item:hover .artwork-actions,
.artwork-item:focus-within .artwork-actions { opacity: 1; }
.paste-hint { font-size: 12px; color: var(--text-secondary); margin-top: 8px; text-align: center; }

/* ─── R45: 多选模式 ─── */
.artwork-item--selected { outline: 3px solid var(--el-color-primary); outline-offset: -3px; }
.artwork-select-layer {
  position: absolute; inset: 0;
  cursor: pointer; background: rgba(0, 0, 0, 0.08);
}
.artwork-checkbox {
  position: absolute; top: 8px; left: 8px;
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid #fff; background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 14px; font-weight: 700;
  transition: background 0.15s;
}
.artwork-checkbox--on { background: var(--el-color-primary); border-color: var(--el-color-primary); }

/* 批量操作栏（固定底部） */
.batch-bar {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 12px;
  padding: 10px 20px; border-radius: 999px;
  background: var(--bg-card); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  z-index: 100;
}
.batch-count { font-size: 14px; font-weight: 600; color: var(--text-primary); white-space: nowrap; }

/* 滑块确认（与 OrderDetail/QueueBoard 视觉一致） */
.batch-slide-hint { font-size: 14px; color: var(--text-primary); margin-bottom: 16px; }
.slide-confirm {
  position: relative; height: 40px;
  border-radius: 999px; overflow: hidden; user-select: none;
  background: var(--el-color-danger-light-9);
  border: 1px solid var(--el-color-danger-light-5);
}
.slide-confirm-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: var(--el-color-danger-light-7);
  transition: width 0.05s linear;
}
.slide-confirm-label {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600; color: var(--el-color-danger);
  pointer-events: none;
}
.slide-confirm-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--el-color-danger); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 700;
  cursor: grab; touch-action: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
.slide-confirm-thumb:active { cursor: grabbing; }
</style>
