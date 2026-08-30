<template>
  <!-- v0.38 第二批: H1 文楷 28/700（REQ §1.3）；v127⑤：标题与管理入口同行，顺带收纳原工具栏卡片，顶部不再吃一整块卡 -->
  <div class="page-head">
    <h2 class="font-display artwork-page-title">{{ $t('artworks.title') }}</h2>
    <div class="page-head-ctrl">
      <span class="page-head-hint">{{ $t('artworks.manageDesc') }}</span>
      <!-- R45: 工具栏——"管理"按钮切换多选模式（C58） -->
      <el-button :type="manageMode ? 'primary' : 'default'" @click="toggleManageMode">
        {{ manageMode ? $t('artworks.manageDone') : $t('artworks.manage') }}
      </el-button>
    </div>
  </div>

  <!-- 上传区 -->
  <div class="group upload-group">
    <div class="group-head">{{ $t('artworks.uploadTitle') }}</div>
    <div class="row">
      <div class="field-text">
        <div class="lab">{{ $t('artworks.dragUpload') }}</div>
        <div class="desc">{{ $t('artworks.tip') }}</div>
      </div>
      <div class="ctrl ctrl--upload">
        <el-upload
          class="artwork-upload"
          drag multiple :auto-upload="true" :http-request="handleUpload"
          accept="image/*" :show-file-list="false"
          @dragenter.capture="guardDragEnter"
          @dragover.capture="guardDragOver"
          @drop.capture="guardDrop"
        >
          <button type="button" class="upload-trigger-btn" :aria-label="$t('artworks.dragUpload')">
            <span class="upload-icon-wrap">
              <el-icon class="upload-icon"><Upload /></el-icon>
            </span>
          </button>
          <p class="upload-main-text">{{ $t('artworks.dragUpload') }}</p>
          <p class="paste-hint">{{ $t('upload.pasteHint') }}</p>
        </el-upload>
      </div>
    </div>
  </div>

  <!-- F7: 主图区（is_cover=1 单独展示，不在下方网格重复） -->
  <section v-if="covers.length > 0" class="artwork-section">
    <h3 class="section-label">{{ $t('artworks.mainImages') }}</h3>
    <div class="main-artwork-row">
      <div v-for="art in covers" :key="art.id" class="main-artwork-card">
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
            :aria-label="$t('artworks.coverMoveUp')" :title="$t('artworks.coverMoveUp')"
            @click.stop="moveCover(art, -1)"
          >
            ↑
          </button>
          <button
            class="cover-reorder-btn" :disabled="coverOrderOf(art) >= coverCount || coverReordering"
            :aria-label="$t('artworks.coverMoveDown')" :title="$t('artworks.coverMoveDown')"
            @click.stop="moveCover(art, 1)"
          >
            ↓
          </button>
        </div>
        <button
          class="artwork-cover-star artwork-cover-star--on"
          :disabled="coverBusyId === art.id"
          :aria-label="$t('artworks.coverUnset')" :title="$t('artworks.coverUnset')"
          @click="toggleCover(art)"
        >
          ★
        </button>
        <button
          v-if="manageMode" type="button" class="artwork-select-layer"
          role="checkbox" :aria-checked="selectedIds.has(art.id)"
          :aria-label="art.title || $t('artworks.image')"
          @click="toggleSelect(art.id)"
        >
          <span class="artwork-checkbox" :class="{ 'artwork-checkbox--on': selectedIds.has(art.id) }">
            <span v-if="selectedIds.has(art.id)">✓</span>
          </span>
        </button>
        <div v-else class="artwork-actions">
          <!-- v0.35 波3 (REQ-024 F6): 作品编辑入口（档位标注+自由描述） -->
          <el-button size="small" @click="openEditDialog(art)">{{ $t('common.edit') }}</el-button>
          <el-button size="small" type="danger" @click="remove(art)">{{ $t('common.delete') }}</el-button>
        </div>
        <p class="artwork-title">{{ art.title || $t('artworks.untitled') }}</p>
      </div>
    </div>
  </section>

  <!-- 作品网格（F7: 只显示非主图；去重后为空则兜底显示全部） -->
  <section class="artwork-section">
    <h3 class="section-label">{{ $t('artworks.galleryTitle') }}</h3>
    <div class="artwork-gallery" :class="{ 'artwork-gallery--loading': loading }" v-loading="loading">
      <div v-if="!loading && artworks.length === 0" class="artwork-empty">
        <el-icon class="artwork-empty-icon"><Picture /></el-icon>
        <p class="artwork-empty-title">{{ $t('artworks.empty') }}</p>
        <p class="artwork-empty-hint">{{ $t('artworks.emptyHint') }}</p>
      </div>
      <div v-else class="artwork-grid">
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
          <button
            v-if="manageMode" type="button" class="artwork-select-layer"
            role="checkbox" :aria-checked="selectedIds.has(art.id)"
            :aria-label="art.title || $t('artworks.image')"
            @click="toggleSelect(art.id)"
          >
            <span class="artwork-checkbox" :class="{ 'artwork-checkbox--on': selectedIds.has(art.id) }">
              <span v-if="selectedIds.has(art.id)">✓</span>
            </span>
          </button>
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
            :aria-label="art.is_cover ? $t('artworks.coverUnset') : $t('artworks.coverSet')"
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
              :aria-label="$t('artworks.coverMoveUp')" :title="$t('artworks.coverMoveUp')"
              @click.stop="moveCover(art, -1)"
            >
              ↑
            </button>
            <button
              class="cover-reorder-btn" :disabled="coverOrderOf(art) >= coverCount || coverReordering"
              :aria-label="$t('artworks.coverMoveDown')" :title="$t('artworks.coverMoveDown')"
              @click.stop="moveCover(art, 1)"
            >
              ↓
            </button>
          </div>
          <p class="artwork-title">{{ art.title || $t('artworks.untitled') }}</p>
        </div>
      </div>
    </div>

    <!-- v0.42 Step 6: 分页器（>20 张时显示；封面置顶在后端排序已保证，前端勿重排） -->
    <el-pagination
      v-if="total > pageSize"
      :current-page="page"
      :page-size="pageSize"
      :total="total"
      layout="prev, pager, next"
      @current-change="onPageChange"
      class="artwork-pager"
    />
  </section>

  <!-- R45: 批量操作栏（多选模式下固定底部） -->
  <div v-if="manageMode" class="batch-bar">
    <span class="batch-count">{{ $t('artworks.selected', { n: selectedIds.size }) }}</span>
    <el-button size="small" @click="toggleManageMode">{{ $t('common.cancel') }}</el-button>
    <el-button size="small" type="danger" :disabled="selectedIds.size === 0" :loading="batchDeleting" @click="startBatchDelete">
      {{ $t('common.delete') }}
    </el-button>
  </div>

  <!-- R45/C59: 批量删除 ≥3 条用滑块确认 -->
  <el-dialog v-model="slideDialogVisible" :title="$t('artworks.batchDeleteTitle')" width="400px" class="artwork-dialog" @closed="slideProgress = 0">
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
    <!-- 键盘等价：滑块确认的替代按钮路径（滑块保持可用） -->
    <div class="batch-slide-alt">
      <el-button type="danger" size="small" @click="confirmBatchDelete">
        {{ $t('artworks.batchDeleteBtn') }}
      </el-button>
    </div>
  </el-dialog>

  <!-- v0.35 波3 (REQ-024 F6): 作品编辑弹窗 — 标题/自由描述/档位标注多选，保存即时 PUT -->
  <el-dialog v-model="editDialogVisible" :title="$t('artworks.editTitle')" width="520px" class="artwork-dialog" destroy-on-close>
    <el-form :model="editForm" label-position="left" label-width="96px">
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
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { artistApi, uploadApi } from '../../api/index'
import type { ArtworkWithTags, ArtStyleWithDetails } from '../../api/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadRequestOptions } from 'element-plus'
import { Picture, Upload } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { usePasteUpload } from '../../composables/usePasteUpload'
import { useSlideConfirm } from '../../composables/useSlideConfirm'
import { useDropGuard } from '../../composables/useDropGuard'
import { trackEvent } from '../../utils/track'
import { UI_PAGE_SIZE } from '../../constants/pagination'
import { MAX_IMAGE_BYTES, MAX_IMAGE_COUNT, MAX_IMAGE_MB } from '../../constants/upload'

const { t } = useI18n()

// ─── 粘贴上传（作品） ───
const { pasteError } = usePasteUpload({
  onFiles: handlePasteArtworkFiles,
  maxCount: MAX_IMAGE_COUNT,
  maxSizeMB: MAX_IMAGE_MB
})
watch(pasteError, (msg) => { if (msg) ElMessage.warning(msg) })

// G1: 页内拖拽守卫（捕获阶段挂在 el-upload 上，抢在 EP dragger 之前拦截）
const { guardDragEnter, guardDragOver, guardDrop } = useDropGuard()
/** 作品行（cover_order 运行时附带，类型库未声明） */
type ArtworkRow = ArtworkWithTags & { cover_order?: number }
const artworks = ref<ArtworkRow[]>([])
const loading = ref(true)
// v0.42 Step 6: 作品分页（20/页；封面置顶由后端排序保证，前端勿重排）
const page = ref(1)
const pageSize = ref(UI_PAGE_SIZE)
const total = ref(0)

// ─── F7: 主图去重（主图单独展示，网格只显示非主图） ───
/** 封面列表单源（is_cover=1，按 cover_order 排序；字段缺失 fallback 0 保持后端原序） */
const covers = computed(() =>
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
const selectedIds = ref(new Set<number>())

function toggleManageMode() {
  manageMode.value = !manageMode.value
  selectedIds.value = new Set<number>() // 进入/退出都清空选中
}

function toggleSelect(id: number) {
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

/** 键盘替代路径：直接确认批量删除（与滑块滑到底行为一致） */
async function confirmBatchDelete() {
  slideDialogVisible.value = false
  await doBatchDelete()
}

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
    selectedIds.value = new Set<number>()
    await loadArtworks()
  } finally {
    batchDeleting.value = false
  }
}

/**
 * 单文件 上传 → createArtwork → 敏感词提示 共用链。
 * 05D-A2 校验仅上传入口持有（validate=true）；粘贴路径维持现状不校验。
 * @returns {Promise<{ filePath: string, originalName: string } | null>} 校验拦截返回 null；失败抛错由调用方处理
 */
async function publishArtworkFile(file: File, { validate = false }: { validate?: boolean } = {}) {
  if (validate) {
    // 05D-A2: 上传前校验（仅图片 + ≤10MB；超限不发送）
    if (!file.type.startsWith('image/')) {
      ElMessage.warning(t('upload.fileNotImage'))
      return null
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1)
      ElMessage.warning(t('upload.fileTooBig', { name: file.name, size: sizeMB, max: MAX_IMAGE_MB }))
      return null
    }
  }
  const uploaded = await uploadApi.image(file)
  const res = await artistApi.createArtwork({ imagePath: uploaded.filePath, title: uploaded.originalName || file.name })
  // REQ-042: 命中敏感词 → 提示（不硬拦，先发后审）
  if (res?.warning?.sensitiveWords?.length) {
    ElMessage.warning(t('compliance.warning.hit', { words: res.warning.sensitiveWords.join('、') }))
  }
  return uploaded
}

async function handleUpload({ file }: UploadRequestOptions) {
  try {
    const uploaded = await publishArtworkFile(file, { validate: true })
    if (!uploaded) return
    ElMessage.success(t('artworks.uploaded'))
    trackEvent('artist_action', { action: 'artwork_publish', source: 'upload' })
    await loadArtworks()
  } catch (err) {
    ElMessage.error((err instanceof Error ? err.message : '') || t('common.uploadFailed'))
  }
}

async function remove(art: ArtworkRow) {
  try {
    await ElMessageBox.confirm(t('artworks.confirmDelete'), t('common.confirmDeleteTitle'), { type: 'warning' })
  } catch {
    return // 用户取消
  }
  try {
    await artistApi.deleteArtwork(art.id)
    ElMessage.success(t('common.deleted'))
    await loadArtworks()
  } catch (err) {
    // 围殲 a1-12: API 删除失败与用户取消分开处理——失败必须明示，不得当取消吞掉
    ElMessage.error(err instanceof Error ? err.message : String(err))
  }
}

// ─── REQ-017: 封面操作（星标切换，复用 v0.25 API） ───
const coverBusyId = ref<number | null>(null)

/** 封面总数（多封面时卡片显示 cover_order 序号） */
const coverCount = computed(() => covers.value.length)

/** 作品在封面序列中的序号（按 cover_order 排序，字段缺失 fallback 0 保持后端原序） */
function coverOrderOf(art: ArtworkRow) {
  return covers.value.findIndex(a => a.id === art.id) + 1
}

async function toggleCover(art: ArtworkRow) {
  coverBusyId.value = art.id
  try {
    if (art.is_cover) {
      await artistApi.unsetArtworkCover(art.id)
      art.is_cover = 0
      art.cover_order = 0
      ElMessage.success(t('artworks.coverUnsetSuccess'))
      trackEvent('artist_action', { action: 'artwork_set_cover', cover: 0 })
    } else {
      await artistApi.setArtworkCover(art.id)
      art.is_cover = 1
      ElMessage.success(t('artworks.coverSetSuccess'))
      trackEvent('artist_action', { action: 'artwork_set_cover', cover: 1 })
    }
    await loadArtworks()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
  } finally {
    coverBusyId.value = null
  }
}

// ─── v0.31: 多封面排序（↑↓ 按钮调整轮播顺序） ───
const coverReordering = ref(false)

async function moveCover(art: ArtworkRow, direction: number) {
  const coverList = covers.value
  const idx = coverList.findIndex(a => a.id === art.id)
  // L-11: 未命中（并发刷新下该作品可能已不在封面列表）直接返回，避免 -1 参与下标交换
  if (idx < 0) return
  const swapIdx = idx + direction
  if (swapIdx < 0 || swapIdx >= coverList.length) return

  // 交换位置
  const orderedIds = coverList.map(a => a.id)
  ;[orderedIds[idx], orderedIds[swapIdx]] = [orderedIds[swapIdx], orderedIds[idx]]

  coverReordering.value = true
  try {
    await artistApi.reorderCovers(orderedIds)
    ElMessage.success(t('artworks.coverReordered'))
    // 分页后勿用全量数组覆盖（会破坏分页语义），统一走分页刷新
    await loadArtworks()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
    await loadArtworks()
  } finally {
    coverReordering.value = false
  }
}

// 围剿 a1-13: 作品分页/上传刷新请求序号——上传后的刷新与翻页并发时，旧页响应不得覆盖新页
let loadSeq = 0
async function loadArtworks() {
  const mySeq = ++loadSeq
  loading.value = true
  try {
    const res = await artistApi.getArtworksPaged({ page: page.value, pageSize: pageSize.value })
    if (mySeq !== loadSeq) return
    artworks.value = res.items
    total.value = res.total
    // 删除/批量删除当前页最后一条后回退一页，避免空白页
    if (res.items.length === 0 && page.value > 1) {
      page.value -= 1
      await loadArtworks()
      return
    }
  } catch (err) {
    if (mySeq !== loadSeq) return
    ElMessage.error(err instanceof Error ? err.message : String(err))
  } finally {
    if (mySeq === loadSeq) loading.value = false
  }
}

/** v0.42 Step 6: 分页器翻页 */
function onPageChange(p: number) {
  page.value = p
  loadArtworks()
}

// ─── v0.35 波3 (REQ-024 F6): 作品编辑 — 档位标注多选 + 自由描述 ───
const artStyles = ref<ArtStyleWithDetails[]>([]) // 档位标注选项来源（仅取启用画风，排序沿用后端返回序）
const editDialogVisible = ref(false)
const editSaving = ref(false)
const editingArtworkId = ref<number | null>(null)
const editForm = reactive({ title: '', description: '', sizeIds: [] as number[] })

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

async function openEditDialog(art: ArtworkRow) {
  editingArtworkId.value = art.id
  Object.assign(editForm, {
    title: art.title || '',
    description: art.description || '',
    sizeIds: [...(art.size_tag_ids || [])]
  })
  editDialogVisible.value = true
}

/** 保存：两个 PUT 串行（后端无合并端点）；两请求均成功才算成功。
 *  第一步（标题/描述）失败 → 明确提示信息保存失败；
 *  第一步成功但第二步（档位标注）失败 → 明确提示标注保存失败，并刷新回显已保存的信息（弹窗保持打开便于重试）。 */
async function saveArtworkEdit() {
  editSaving.value = true
  try {
    const res = await artistApi.updateArtwork(editingArtworkId.value!, {
      title: editForm.title.trim() || null,
      description: editForm.description.trim() || null
    })
    // REQ-042: 命中敏感词 → 提示（不硬拦，先发后审）
    if (res?.warning?.sensitiveWords?.length) {
      ElMessage.warning(t('compliance.warning.hit', { words: res.warning.sensitiveWords.join('、') }))
    }
    try {
      await artistApi.setArtworkTags(editingArtworkId.value!, editForm.sizeIds)
    } catch (err) {
      ElMessage.error(t('artworks.editTagsSaveFailed', { reason: err instanceof Error ? err.message : String(err) }))
      await loadArtworks() // 半成功不回显：信息已保存，刷新后如实回显
      return
    }
    ElMessage.success(t('artworks.editSaved'))
    editDialogVisible.value = false
    await loadArtworks()
  } catch (err) {
    ElMessage.error(t('artworks.editInfoSaveFailed', { reason: err instanceof Error ? err.message : String(err) }))
  } finally {
    editSaving.value = false
  }
}

async function handlePasteArtworkFiles(files: File[]) {
  // 逐文件隔离：单个失败不中断后续文件；成功照常入库，失败列出文件名+原因
  const failedLines: string[] = []
  let okCount = 0
  for (const file of files) {
    try {
      await publishArtworkFile(file)
      okCount += 1
    } catch (err) {
      failedLines.push(t('artworks.pasteFailLine', {
        name: file.name,
        reason: (err instanceof Error ? err.message : '') || t('common.uploadFailed')
      }))
    }
  }
  if (okCount > 0) {
    await loadArtworks()
    trackEvent('artist_action', { action: 'artwork_publish', source: 'paste' })
  }
  if (failedLines.length === 0) {
    ElMessage.success(t('artworks.uploaded'))
    return
  }
  // 结束汇总：全部失败 / 部分失败均列出原因
  const title = okCount > 0
    ? t('artworks.pastePartial', { ok: okCount, failed: failedLines.length })
    : t('artworks.pasteFailedAll', { failed: failedLines.length })
  await ElMessageBox.alert(failedLines.join('\n'), title, {
    type: 'warning',
    confirmButtonText: t('common.confirm')
  })
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
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026） ═══ */
/* v127⑤：标题行——标题在左、批量管理入口在右，省掉独立工具栏卡片，顶部空间收紧 */
.page-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
}
.page-head-ctrl { display: flex; align-items: center; gap: 12px; }
.page-head-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }
/* H1 页面标题：文楷 28/700（REQ §1.3） */
.artwork-page-title { font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700; color: var(--ink); letter-spacing: .02em; }

/* 820-K：分组卡片收纳，组头带朱砂小印点（对齐 QuickNote/Watermark） */
.group {
  margin: 16px 0;
  padding: 4px 24px 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 0 8px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.group-head::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}

/* 820-K：一行一事，说明在左控件在右，栅格对齐 */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(420px, 560px); gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.field-text { min-width: 0; }
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; line-height: 1.5; }
.ctrl { min-width: 0; }
.ctrl--upload { width: 100%; }

/* ─── 上传区：EP dragger 纸墨化（虚线卡 + 圆图标 + 文案居中） ─── */
.artwork-upload { display: block; width: 100%; }
.artwork-upload :deep(.el-upload-dragger) {
  width: 100%;
  min-height: 112px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  background: var(--paper2);
  border: 1px dashed var(--line2);
  border-radius: var(--r-m);
  transition: border-color var(--dur-fast), background-color var(--dur-fast);
}
.artwork-upload :deep(.el-upload-dragger:hover),
.artwork-upload :deep(.el-upload-dragger.is-dragover) {
  border-color: var(--hq);
  background-color: var(--card);
}
.upload-icon-wrap {
  display: inline-flex; align-items: center; justify-content: center;
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--hq-t); color: var(--hq);
}
.upload-icon { font-size: calc(var(--font-scale, 1) * 24px); }
.upload-trigger-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0; border: none; background: none; cursor: pointer;
  color: inherit; font: inherit;
}
.upload-main-text { margin-top: 8px; font-size: calc(var(--font-scale, 1) * 15px); color: var(--ink2); }
.paste-hint { margin-top: 4px; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }

/* ─── 分区标题（与组头同语言：朱砂小印点） ─── */
.artwork-section { margin: 16px 0 4px; }
.section-label {
  display: flex; align-items: center; gap: 8px;
  margin: 0 0 12px;
  font-size: 16px; font-weight: 700; color: var(--ink);
}
.section-label::before {
  content: ""; width: 8px; height: 8px; flex: none;
  background: var(--zs); border-radius: var(--r-paper);
}

/* ─── F7: 主图区（单独展示，不在网格重复） ─── */
.main-artwork-row { display: flex; gap: 16px; flex-wrap: wrap; }
.main-artwork-card {
  position: relative;
  width: 220px; flex-shrink: 0;
  padding: 8px;
  background: var(--card);
  border: 1px solid color-mix(in srgb, var(--th) 55%, var(--line));
  border-radius: var(--r-m);
  box-shadow: var(--sh-1);
  transition: border-color var(--dur-fast);
}
.main-artwork-card:hover { border-color: var(--th); }
.main-artwork-img { width: 100%; aspect-ratio: 4 / 3; display: block; object-fit: cover; border-radius: var(--r-s); }
.main-artwork-tag,
.artwork-cover-tag {
  position: absolute; top: 8px; left: 8px; z-index: 2;
  padding: 4px 12px; border-radius: var(--r-pill);
  background: var(--th);
  color: #fff; font-size: calc(var(--font-scale, 1) * 11px); font-weight: 600; letter-spacing: 0.5px;
  pointer-events: none;
}
.main-artwork-card:hover .artwork-actions,
.main-artwork-card:focus-within .artwork-actions { opacity: 1; }

/* ─── 作品网格：卡片视觉（圆角/阴影/间距；hover 只动边框颜色） ─── */
.artwork-gallery { margin-top: 16px; }
.artwork-gallery--loading { min-height: 220px; }
.artwork-gallery :deep(.el-loading-mask) { background-color: color-mix(in srgb, var(--paper) 84%, transparent); }
.artwork-gallery :deep(.el-loading-spinner .circular) { color: var(--hq); }
.artwork-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}
.artwork-item {
  position: relative;
  padding: 8px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  box-shadow: var(--sh-1);
  transition: border-color var(--dur-fast);
}
.artwork-item:hover { border-color: var(--hq); }
.artwork-img { width: 100%; aspect-ratio: 1 / 1; display: block; object-fit: cover; border-radius: var(--r-s); }
.artwork-title {
  margin: 8px 4px 0;
  font-size: calc(var(--font-scale, 1) * 13px);
  color: var(--ink2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.artwork-actions {
  position: absolute; bottom: 8px; left: 8px; right: 8px;
  background: var(--overlay-bg, rgba(0,0,0,0.5)); padding: 8px; text-align: center;
  border-radius: var(--r-s);
  opacity: 0; transition: opacity var(--dur-mid);
}
.artwork-item:hover .artwork-actions,
.artwork-item:focus-within .artwork-actions { opacity: 1; }
/* 05D-A1: 触屏设备无 hover —— 操作层常显（桌面保持 hover 展开，克制动效纪律：只改可见性） */
@media (hover: none) {
  .artwork-actions { opacity: 1; }
}

/* 空态纸墨化（与卡片同族，虚线区分） */
.artwork-empty {
  padding: 40px 24px;
  background: var(--card);
  border: 1px dashed var(--line2);
  border-radius: var(--r-l);
  text-align: center;
}
.artwork-empty-icon { font-size: calc(var(--font-scale, 1) * 40px); color: var(--ink4); }
.artwork-empty-title { margin-top: 12px; font-size: 15px; color: var(--ink2); }
.artwork-empty-hint { margin-top: 4px; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink3); }

.artwork-pager { margin-top: 16px; display: flex; justify-content: center; }

/* 页宽容器查询收尾批：行堆叠断点改认容器宽（ArtistLayout 已设 container-type） */
@container (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .main-artwork-card { width: 100%; }
}

/* v0.35 波3: 作品编辑弹窗提示 */
.edit-hint { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink3); margin: 4px 0 0; line-height: 1.5; }
.artwork-dialog :deep(.el-dialog) { border-radius: var(--r-l); }
.artwork-dialog :deep(.el-dialog__title) { font-weight: 700; color: var(--ink); }

/* ─── REQ-017: 封面星标 + 标签 ─── */
.artwork-cover-star {
  position: absolute; top: 8px; right: 8px; z-index: 2;
  width: 30px; height: 30px; border-radius: 50%; border: none;
  background: color-mix(in srgb, var(--card) 75%, transparent);
  backdrop-filter: blur(4px);
  color: var(--ink2); font-size: calc(var(--font-scale, 1) * 18px); line-height: 1;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: color var(--dur-fast);
}
.artwork-cover-star:disabled { cursor: wait; opacity: 0.6; }
/* 封面星：藤黄=待确认/封面标记语义 */
.artwork-cover-star--on { color: var(--th); }
/* ─── v0.31: 多封面排序按钮 ─── */
.artwork-cover-reorder {
  position: absolute; bottom: 8px; right: 8px; z-index: 2;
  display: flex; gap: 4px;
}
.cover-reorder-btn {
  width: 24px; height: 24px; border-radius: var(--r-s); border: none;
  background: color-mix(in srgb, var(--card) 80%, transparent);
  backdrop-filter: blur(4px);
  color: var(--ink); font-size: calc(var(--font-scale, 1) * 12px); font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background var(--dur-fast);
}
.cover-reorder-btn:hover:not(:disabled) { background: var(--hq-t); }
.cover-reorder-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ─── R45: 多选模式 ─── */
.artwork-item--selected { outline: 2px solid var(--hq); outline-offset: -2px; }
.artwork-select-layer {
  position: absolute; inset: 0;
  cursor: pointer; background: rgba(0, 0, 0, 0.08);
  padding: 0; border: none; font: inherit; color: inherit;
}
.artwork-checkbox {
  position: absolute; top: 8px; left: 8px;
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid #fff; background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: calc(var(--font-scale, 1) * 14px); font-weight: 700;
  transition: background var(--dur-fast);
}
.artwork-checkbox--on { background: var(--hq); border-color: var(--hq); }

/* 批量操作栏（固定底部，纸墨化：卡片底 + 描边 + 胶囊） */
.batch-bar {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px; border-radius: var(--r-pill);
  background: var(--card); border: 1px solid var(--line2); box-shadow: var(--sh-2);
  z-index: 100;
}
.batch-count {
  padding: 4px 12px; border-radius: var(--r-pill);
  background: var(--hq-t); color: var(--hq);
  font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; white-space: nowrap;
}

/* 滑块确认（与 OrderDetail/QueueBoard 视觉一致，朱砂=危险操作） */
.batch-slide-hint { font-size: calc(var(--font-scale, 1) * 14px); color: var(--ink); margin-bottom: 16px; }
.batch-slide-alt { margin-top: 12px; display: flex; justify-content: center; }
</style>
