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
        @dragenter.capture="guardDragEnter"
        @dragover.capture="guardDragOver"
        @drop.capture="guardDrop"
      >
        <el-icon style="font-size: 40px; color: var(--text-secondary)"><Upload /></el-icon>
        <p>{{ $t('artworks.dragUpload') }}</p>
        <template #tip>
          <p style="color: var(--text-secondary); font-size: 12px">{{ $t('artworks.tip') }}</p>
        </template>
      </el-upload>
      <p class="paste-hint">{{ $t('upload.pasteHint') }}</p>
    </el-card>

    <!-- F7: 主图区（is_cover=1 单独展示，不在下方网格重复） -->
    <div v-if="mainArtworks.length > 0" class="main-artwork-section">
      <h3 class="section-label">{{ $t('artworks.mainImages') }}</h3>
      <div class="main-artwork-row">
        <div v-for="art in mainArtworks" :key="art.id" class="main-artwork-card">
          <el-image
            :src="`/uploads/${art.image_path}`" fit="cover" class="main-artwork-img"
            :alt="art.title || $t('artworks.image')"
            :preview-src-list="manageMode ? [] : artworks.map(a => `/uploads/${a.image_path}`)"
            :initial-index="artworks.indexOf(art)"
            preview-teleported
          />
          <span class="main-artwork-tag">
            {{ $t('artworks.mainTag') }}<template v-if="coverCount > 1"> {{ coverOrderOf(art) }}</template>
          </span>
          <!-- v0.31: 多封面排序按钮（≥2 张主图时显示，调整轮播顺序）——F7 去重后主图不进网格，排序入口必须在主图区 -->
          <div v-if="coverCount > 1" class="artwork-cover-reorder">
            <button
              class="cover-reorder-btn" :disabled="coverOrderOf(art) <= 1 || coverReordering"
              :title="$t('artworks.coverMoveUp')"
              @click.stop="moveCover(art, -1)"
            >
              ↑
            </button>
            <button
              class="cover-reorder-btn" :disabled="coverOrderOf(art) >= coverCount || coverReordering"
              :title="$t('artworks.coverMoveDown')"
              @click.stop="moveCover(art, 1)"
            >
              ↓
            </button>
          </div>
          <button
            class="artwork-cover-star artwork-cover-star--on"
            :disabled="coverBusyId === art.id"
            :title="$t('artworks.coverUnset')"
            @click="toggleCover(art)"
          >
            ★
          </button>
          <div v-if="manageMode" class="artwork-select-layer" @click="toggleSelect(art.id)">
            <span class="artwork-checkbox" :class="{ 'artwork-checkbox--on': selectedIds.has(art.id) }">
              <span v-if="selectedIds.has(art.id)">✓</span>
            </span>
          </div>
          <div v-else class="artwork-actions">
            <!-- v0.35 波3 (REQ-024 F6): 作品编辑入口（档位标注+自由描述） -->
            <el-button size="small" @click="openEditDialog(art)">{{ $t('common.edit') }}</el-button>
            <el-button size="small" type="danger" @click="remove(art)">{{ $t('common.delete') }}</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 作品网格（F7: 只显示非主图；去重后为空则兜底显示全部） -->
    <div class="artwork-grid" v-loading="loading">
      <div
        v-for="art in gridArtworks" :key="art.id"
        class="artwork-item"
        :class="{ 'artwork-item--selected': manageMode && selectedIds.has(art.id) }"
      >
        <el-image
          :src="`/uploads/${art.image_path}`" fit="cover" class="artwork-img"
          :alt="art.title || $t('artworks.image')"
          :preview-src-list="manageMode ? [] : artworks.map(a => `/uploads/${a.image_path}`)"
          :initial-index="artworks.indexOf(art)"
          preview-teleported
        />
        <!-- R45: 多选模式——选择层（覆盖图片，点击切换选中，阻断预览） -->
        <div v-if="manageMode" class="artwork-select-layer" @click="toggleSelect(art.id)">
          <span class="artwork-checkbox" :class="{ 'artwork-checkbox--on': selectedIds.has(art.id) }">
            <span v-if="selectedIds.has(art.id)">✓</span>
          </span>
        </div>
        <!-- 普通模式：单条删除（悬停显示） -->
        <div v-else class="artwork-actions">
          <!-- v0.35 波3 (REQ-024 F6): 作品编辑入口（档位标注+自由描述） -->
          <el-button size="small" @click="openEditDialog(art)">{{ $t('common.edit') }}</el-button>
          <el-button size="small" type="danger" @click="remove(art)">{{ $t('common.delete') }}</el-button>
        </div>
        <!-- REQ-017: 封面星标（常驻右上角，不依赖 hover） -->
        <button
          class="artwork-cover-star"
          :class="{ 'artwork-cover-star--on': art.is_cover }"
          :disabled="coverBusyId === art.id"
          :title="art.is_cover ? $t('artworks.coverUnset') : $t('artworks.coverSet')"
          @click="toggleCover(art)"
        >
          {{ art.is_cover ? '★' : '☆' }}
        </button>
        <!-- REQ-017: 封面标签 + cover_order 序号（多封面时显示顺序） -->
        <span v-if="art.is_cover" class="artwork-cover-tag">
          {{ $t('artworks.coverTag') }}<template v-if="coverCount > 1"> {{ coverOrderOf(art) }}</template>
        </span>
        <!-- v0.31: 多封面排序按钮（≥2 张封面时显示，调整轮播顺序） -->
        <div v-if="art.is_cover && coverCount > 1" class="artwork-cover-reorder">
          <button
            class="cover-reorder-btn" :disabled="coverOrderOf(art) <= 1 || coverReordering"
            :title="$t('artworks.coverMoveUp')"
            @click.stop="moveCover(art, -1)"
          >
            ↑
          </button>
          <button
            class="cover-reorder-btn" :disabled="coverOrderOf(art) >= coverCount || coverReordering"
            :title="$t('artworks.coverMoveDown')"
            @click.stop="moveCover(art, 1)"
          >
            ↓
          </button>
        </div>
      </div>
    </div>

    <el-empty v-if="!loading && artworks.length === 0" :description="$t('artworks.empty')" />

    <!-- R45: 批量操作栏（多选模式下固定底部） -->
    <div v-if="manageMode" class="batch-bar">
      <span class="batch-count">{{ $t('artworks.selected', { n: selectedIds.size }) }}</span>
      <el-button size="small" @click="toggleManageMode">{{ $t('common.cancel') }}</el-button>
      <el-button size="small" type="danger" :disabled="selectedIds.size === 0" :loading="batchDeleting" @click="startBatchDelete">
        {{ $t('common.delete') }}
      </el-button>
    </div>

    <!-- R45/C59: 批量删除 ≥3 条用滑块确认 -->
    <el-dialog v-model="slideDialogVisible" :title="$t('artworks.batchDeleteTitle')" width="400px" @closed="slideProgress = 0">
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

    <!-- v0.35 波3 (REQ-024 F6): 作品编辑弹窗 — 标题/自由描述/档位标注多选，保存即时 PUT -->
    <el-dialog v-model="editDialogVisible" :title="$t('artworks.editTitle')" width="520px" destroy-on-close>
      <el-form :model="editForm" label-position="top">
        <el-form-item :label="$t('artworks.editTitleLabel')">
          <el-input v-model="editForm.title" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item :label="$t('artworks.editDescLabel')">
          <el-input
            v-model="editForm.description" type="textarea" :rows="4"
            :placeholder="$t('artworks.editDescPlaceholder')" maxlength="2000" show-word-limit
          />
        </el-form-item>
        <el-form-item :label="$t('artworks.editTagsLabel')">
          <el-select
            v-model="editForm.sizeIds" multiple clearable
            :placeholder="$t('artworks.editTagsEmptyHint')" style="width: 100%"
          >
            <el-option v-for="opt in sizeOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
          </el-select>
          <p class="edit-hint">{{ $t('artworks.editTagsHint') }}</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="editSaving" @click="saveArtworkEdit">{{ $t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import ArtistLayout from '../../components/ArtistLayout.vue'
import { usePasteUpload } from '../../composables/usePasteUpload.js'
import { useSlideConfirm } from '../../composables/useSlideConfirm.js'
import { useDropGuard } from '../../composables/useDropGuard.js'

const { t } = useI18n()

// ─── 粘贴上传（作品） ───
const { pasteError } = usePasteUpload({
  onFiles: handlePasteArtworkFiles,
  maxCount: 5,
  maxSizeMB: 10
})
watch(pasteError, (msg) => { if (msg) ElMessage.warning(msg) })

// G1: 页内拖拽守卫（捕获阶段挂在 el-upload 上，抢在 EP dragger 之前拦截）
const { guardDragEnter, guardDragOver, guardDrop } = useDropGuard()
const artworks = ref([])
const loading = ref(true)

// ─── F7: 主图去重（主图单独展示，网格只显示非主图） ───
/** 主图列表（is_cover=1，按 cover_order 排序） */
const mainArtworks = computed(() =>
  artworks.value
    .filter(a => a.is_cover)
    .sort((a, b) => (a.cover_order || 0) - (b.cover_order || 0))
)
/** 网格作品列表：排除主图；去重后为空则兜底显示全部（只有一张作品且设了主图时） */
const gridArtworks = computed(() => {
  const filtered = artworks.value.filter(a => !a.is_cover)
  return filtered.length > 0 ? filtered : artworks.value
})

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
const batchDeleting = ref(false)
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
  batchDeleting.value = true
  const ids = [...selectedIds.value]
  let failed = 0
  try {
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
  } finally {
    batchDeleting.value = false
  }
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

// ─── REQ-017: 封面操作（星标切换，复用 v0.25 API） ───
const coverBusyId = ref(null)

/** 封面总数（多封面时卡片显示 cover_order 序号） */
const coverCount = computed(() => artworks.value.filter(a => a.is_cover).length)

/** 作品在封面序列中的序号（按 cover_order 排序，字段缺失 fallback 0 保持后端原序） */
function coverOrderOf(art) {
  const covers = artworks.value
    .filter(a => a.is_cover)
    .sort((a, b) => (a.cover_order || 0) - (b.cover_order || 0))
  return covers.findIndex(a => a.id === art.id) + 1
}

async function toggleCover(art) {
  coverBusyId.value = art.id
  try {
    if (art.is_cover) {
      await artistApi.unsetArtworkCover(art.id)
      art.is_cover = 0
      art.cover_order = 0
      ElMessage.success(t('artworks.coverUnsetSuccess'))
    } else {
      await artistApi.setArtworkCover(art.id)
      art.is_cover = 1
      ElMessage.success(t('artworks.coverSetSuccess'))
    }
    await loadArtworks()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    coverBusyId.value = null
  }
}

// ─── v0.31: 多封面排序（↑↓ 按钮调整轮播顺序） ───
const coverReordering = ref(false)

async function moveCover(art, direction) {
  const covers = artworks.value
    .filter(a => a.is_cover)
    .sort((a, b) => (a.cover_order || 0) - (b.cover_order || 0))
  const idx = covers.findIndex(a => a.id === art.id)
  const swapIdx = idx + direction
  if (swapIdx < 0 || swapIdx >= covers.length) return

  // 交换位置
  const orderedIds = covers.map(a => a.id)
  ;[orderedIds[idx], orderedIds[swapIdx]] = [orderedIds[swapIdx], orderedIds[idx]]

  coverReordering.value = true
  try {
    artworks.value = await artistApi.reorderCovers(orderedIds)
    ElMessage.success(t('artworks.coverReordered'))
  } catch (err) {
    ElMessage.error(err.message)
    await loadArtworks()
  } finally {
    coverReordering.value = false
  }
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

// ─── v0.35 波3 (REQ-024 F6): 作品编辑 — 档位标注多选 + 自由描述 ───
const artStyles = ref([]) // 档位标注选项来源（仅取启用画风，排序沿用后端返回序）
const editDialogVisible = ref(false)
const editSaving = ref(false)
const editingArtworkId = ref(null)
const editForm = reactive({ title: '', description: '', sizeIds: [] })

/** 档位选项：启用画风×尺寸展平；多画风时「画风 · 尺寸」防歧义（派工要求） */
const sizeOptions = computed(() => {
  const multi = artStyles.value.length > 1
  return artStyles.value.flatMap(style =>
    (style.sizes || []).map(size => ({
      value: size.id,
      label: multi ? `${style.name} · ${size.name}` : size.name
    }))
  )
})

async function openEditDialog(art) {
  editingArtworkId.value = art.id
  Object.assign(editForm, {
    title: art.title || '',
    description: art.description || '',
    sizeIds: [...(art.size_tag_ids || [])]
  })
  editDialogVisible.value = true
}

/** 保存：两个 PUT 串行（后端无合并端点）；任一失败提示并刷新回显 */
async function saveArtworkEdit() {
  editSaving.value = true
  try {
    await artistApi.updateArtwork(editingArtworkId.value, {
      title: editForm.title.trim() || null,
      description: editForm.description.trim() || null
    })
    await artistApi.setArtworkTags(editingArtworkId.value, editForm.sizeIds)
    ElMessage.success(t('artworks.editSaved'))
    editDialogVisible.value = false
    await loadArtworks()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    editSaving.value = false
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

onMounted(async () => {
  await loadArtworks()
  // 档位标注选项：加载失败不阻塞页面（编辑弹窗打开时选项为空，不影响其他功能）
  try {
    artStyles.value = await artistApi.getArtStyles()
  } catch { /* 静默 */ }
})
</script>

<style scoped>
/* R45: 工具栏 */
.artwork-toolbar { margin: 12px 0; }

/* ─── F7: 主图区（单独展示，不在网格重复） ─── */
.main-artwork-section { margin: 16px 0 8px; }
.section-label {
  font-size: 14px; font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 10px;
}
.main-artwork-row {
  display: flex; gap: 12px; flex-wrap: wrap;
}
.main-artwork-card {
  position: relative; border-radius: 8px; overflow: hidden;
  width: 220px; flex-shrink: 0;
  border: 2px solid var(--el-color-warning-light-5);
}
.main-artwork-img { width: 100%; height: 160px; display: block; }
.main-artwork-tag {
  position: absolute; top: 6px; left: 6px; z-index: 2;
  padding: 2px 8px; border-radius: 999px;
  background: color-mix(in srgb, var(--el-color-warning) 85%, transparent);
  color: #fff; font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
  pointer-events: none;
}
.main-artwork-card:hover .artwork-actions { opacity: 1; }

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

/* v0.35 波3: 作品编辑弹窗提示 */
.edit-hint { font-size: 11px; color: var(--text-secondary); margin: 4px 0 0; line-height: 1.5; }

/* ─── REQ-017: 封面星标 + 标签 ─── */
.artwork-cover-star {
  position: absolute; top: 6px; right: 6px; z-index: 2;
  width: 30px; height: 30px; border-radius: 50%; border: none;
  background: color-mix(in srgb, var(--bg-card) 75%, transparent);
  backdrop-filter: blur(4px);
  color: var(--text-secondary); font-size: 18px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: color 0.15s, transform 0.15s;
}
.artwork-cover-star:hover { transform: scale(1.15); }
.artwork-cover-star:disabled { cursor: wait; opacity: 0.6; }
.artwork-cover-star--on { color: var(--el-color-warning); }
.artwork-cover-tag {
  position: absolute; top: 6px; left: 6px; z-index: 2;
  padding: 2px 8px; border-radius: 999px;
  background: color-mix(in srgb, var(--el-color-warning) 85%, transparent);
  color: #fff; font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
  pointer-events: none;
}

/* ─── v0.31: 多封面排序按钮 ─── */
.artwork-cover-reorder {
  position: absolute; bottom: 6px; right: 6px; z-index: 2;
  display: flex; gap: 2px;
}
.cover-reorder-btn {
  width: 24px; height: 24px; border-radius: 4px; border: none;
  background: color-mix(in srgb, var(--bg-card) 80%, transparent);
  backdrop-filter: blur(4px);
  color: var(--text-primary); font-size: 12px; font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.cover-reorder-btn:hover:not(:disabled) { background: var(--el-color-primary-light-8); }
.cover-reorder-btn:disabled { opacity: 0.35; cursor: not-allowed; }

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
