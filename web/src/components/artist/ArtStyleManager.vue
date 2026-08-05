<template>
  <div class="style-manager" v-loading="loading">
    <!-- v0.35 波1 (REQ-024 F2): 多画风开关 — 关=客户端只见默认画风，其他画风灰色不可编辑 -->
    <div class="multi-style-bar">
      <div class="multi-style-head">
        <span class="multi-style-label">{{ $t('styleManage.multiStyle') }}</span>
        <el-switch v-model="multiStyleEnabled" :loading="switchSaving" @change="onMultiStyleChange" />
      </div>
      <p class="multi-style-hint">{{ multiStyleEnabled ? $t('styleManage.multiStyleHintOn') : $t('styleManage.multiStyleHintOff') }}</p>
    </div>

    <el-button type="primary" size="small" style="margin-bottom: 16px" @click="openCreateStyle">
      {{ $t('styleManage.styleAdd') }}
    </el-button>

    <!-- v0.35 补漏 A3: 画风卡片拖拽排序（flex class 放 draggable 自身——v0.26 教训） -->
    <draggable
      v-if="styles.length"
      v-model="styles"
      item-key="id"
      handle=".style-drag-handle"
      ghost-class="ghost"
      class="style-grid"
      @end="onStyleDragEnd"
    >
      <template #item="{ element: style }">
        <el-card class="style-card" :class="{ 'style-card--locked': isLocked(style) }" shadow="hover">
          <!-- 卡头：拖拽柄 + 名称 + 默认徽标 + 启用开关 + 操作 -->
          <template #header>
            <div class="style-card-header">
              <span class="style-card-name">
                <span class="style-drag-handle" :title="$t('tiers.dragHint')">⠿</span>
                {{ style.name }}
                <!-- F2 验收 6: 只有一个画风时不出现"默认"概念 -->
                <el-tag v-if="styles.length > 1 && style.id === defaultStyleId" size="small" type="warning" effect="plain">{{ $t('styleManage.styleDefaultTag') }}</el-tag>
              </span>
              <div class="style-card-actions">
                <el-switch
                  :model-value="!!style.is_active" size="small"
                  :disabled="isLocked(style)"
                  :active-text="$t('styleManage.styleActive')"
                  @change="(val) => toggleActive(style, val)"
                />
                <el-button text size="small" :disabled="isLocked(style)" @click="openEditStyle(style)">{{ $t('common.edit') }}</el-button>
                <el-button text size="small" type="danger" :disabled="isLocked(style)" @click="confirmDeleteStyle(style)">{{ $t('common.delete') }}</el-button>
              </div>
            </div>
          </template>

          <!-- 锁定提示（F2: 开关关闭时非默认画风灰色不可编辑） -->
          <div class="style-card-body" :class="{ 'style-card-body--locked': isLocked(style) }">
            <p v-if="isLocked(style)" class="style-locked-hint">{{ $t('styleManage.styleLocked') }}</p>

            <!-- 描述 + 示例图 -->
            <p v-if="style.description" class="style-desc">{{ style.description }}</p>
            <div v-if="style.cover_image" class="style-cover">
              <el-image :src="`/uploads/${style.cover_image}`" fit="cover" class="style-cover-img" :alt="style.name" />
            </div>

            <!-- ── 尺寸区（v0.35 补漏 A3: 行列表 + 拖拽排序） ── -->
            <div class="style-section">
              <div class="section-head">
                <h4 class="section-title">{{ $t('styleManage.sizeTitle') }}</h4>
                <el-button size="small" :disabled="isLocked(style)" @click="openSizeDialog(style)">{{ $t('styleManage.sizeAddBtn') }}</el-button>
              </div>
              <draggable
                v-model="style.sizes"
                item-key="id"
                handle=".size-drag-handle"
                ghost-class="ghost"
                class="size-row-list"
                @end="onSizeDragEnd(style)"
              >
                <template #item="{ element: size }">
                  <div class="size-row">
                    <span class="size-drag-handle" :title="$t('tiers.dragHint')">⠿</span>
                    <div class="size-row-thumb">
                      <el-image v-if="sizeThumb(size)" :src="`/uploads/${sizeThumb(size)}`" fit="cover" class="size-thumb" />
                      <span v-else class="size-thumb-empty">—</span>
                      <el-tag v-if="size.image_artwork_id" size="small" effect="plain" class="size-thumb-tag">{{ $t('styleManage.sizeFromArtworkTag') }}</el-tag>
                    </div>
                    <div class="size-row-main">
                      <div class="size-row-head">
                        <span class="size-row-name">{{ size.name }}</span>
                        <span class="size-price">¥{{ size.base_price }}</span>
                      </div>
                      <p class="size-row-desc">
                        {{ size.description || '—' }}
                        <template v-if="size.work_days"> · {{ $t('tiers.daysUnit', { n: size.work_days }) }}</template>
                      </p>
                    </div>
                    <div class="size-row-actions">
                      <el-button text size="small" :disabled="isLocked(style)" @click="openSizeDialog(style, size)">{{ $t('common.edit') }}</el-button>
                      <el-button text size="small" type="danger" :disabled="isLocked(style)" @click="confirmDeleteSize(style, size)">{{ $t('common.delete') }}</el-button>
                    </div>
                  </div>
                </template>
              </draggable>
              <el-empty v-if="!style.sizes.length" :description="$t('styleManage.sizeEmpty')" :image-size="40" />
            </div>

            <!-- ── 增项区（v0.35 补漏 A4: ＋导入增项入口；A5: 勾选/改价即时保存） ── -->
            <div class="style-section">
              <div class="section-head">
                <h4 class="section-title">{{ $t('styleManage.addonTitle') }}</h4>
                <el-button
                  v-if="unimportedTemplates(style).length"
                  size="small" :disabled="isLocked(style)"
                  @click="openImportDialog(style)"
                >
                  {{ $t('styleManage.addonImportBtn') }}
                </el-button>
              </div>
              <div v-if="style.addons.length" class="style-addon-list">
                <div v-for="sa in style.addons" :key="sa.id" class="style-addon-row">
                  <el-checkbox
                    :model-value="!!sa.is_enabled"
                    :disabled="isLocked(style)"
                    @change="(val) => onAddonToggle(style, sa, val)"
                  >
                    <span class="addon-tpl-name">{{ sa.template_name }}</span>
                  </el-checkbox>
                  <el-tag size="small" :type="controlTagType(sa.template_control_type)">{{ controlLabel(sa.template_control_type) }}</el-tag>
                  <!-- 价格覆盖（placeholder 显示模板默认价；change 即时保存，防抖 500ms） -->
                  <el-input-number
                    :model-value="sa.price_override ?? undefined"
                    :placeholder="`¥${sa.template_default_price}`"
                    :min="0" :max="999999" :step="10" size="small"
                    style="width: 120px"
                    :disabled="isLocked(style)"
                    @change="(val) => onAddonPriceChange(style, sa, val)"
                  />
                  <!-- 尺寸覆盖展开按钮（有尺寸时才显示；REQ-023：不点开不显示） -->
                  <el-button
                    v-if="style.sizes.length"
                    text size="small" type="primary"
                    :disabled="isLocked(style)"
                    @click="toggleOverridePanel(style, sa)"
                  >
                    {{ overrideExpanded[sa.id] ? $t('styleManage.overrideCollapse') : $t('styleManage.overrideExpand') }}
                  </el-button>
                </div>
              </div>
              <el-empty v-else :description="$t('styleManage.addonEmpty')" :image-size="40" />

              <!-- 尺寸覆盖面板（v0.35 补漏 A5: 改价/隐藏即时保存，无行内保存按钮） -->
              <div v-for="sa in style.addons" :key="`ov-${sa.id}`">
                <div v-if="overrideExpanded[sa.id]" class="override-panel">
                  <div class="override-panel-title">
                    {{ $t('styleManage.overrideTitle', { name: sa.template_name }) }}
                  </div>
                  <div v-loading="overrideLoading[sa.id]">
                    <div v-for="size in style.sizes" :key="size.id" class="override-row">
                      <span class="override-size-name">{{ size.name }}</span>
                      <el-input-number
                        :model-value="getOverridePrice(sa.id, size.id)"
                        :placeholder="`¥${sa.price_override ?? sa.template_default_price}`"
                        :min="0" :max="999999" :step="10" size="small"
                        style="width: 120px"
                        :disabled="isLocked(style)"
                        @change="(val) => onOverridePriceChange(style, sa, size.id, val)"
                      />
                      <el-checkbox
                        :model-value="getOverrideHidden(sa.id, size.id)"
                        :disabled="isLocked(style)"
                        @change="(val) => onOverrideHiddenChange(style, sa, size.id, val)"
                      >
                        {{ $t('styleManage.overrideHidden') }}
                      </el-checkbox>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </template>
    </draggable>
    <el-empty v-else-if="!loading" :description="$t('styleManage.styleEmpty')" :image-size="80" />

    <!-- 新建/编辑画风弹窗 -->
    <el-dialog v-model="styleDialogVisible" :title="editingStyleId ? $t('styleManage.styleEditTitle') : $t('styleManage.styleAddTitle')" width="460px" destroy-on-close>
      <el-form :model="styleForm" label-position="top">
        <el-form-item :label="$t('styleManage.styleNameLabel')" required>
          <el-input v-model="styleForm.name" :placeholder="$t('styleManage.styleNamePlaceholder')" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item :label="$t('styleManage.styleDescLabel')">
          <el-input v-model="styleForm.description" type="textarea" :rows="2" :placeholder="$t('styleManage.styleDescPlaceholder')" maxlength="500" show-word-limit />
        </el-form-item>
        <el-form-item :label="$t('styleManage.styleCoverLabel')">
          <div class="cover-upload">
            <el-image v-if="styleForm.cover_image" :src="`/uploads/${styleForm.cover_image}`" fit="cover" class="cover-preview" />
            <el-upload :auto-upload="true" :http-request="uploadCover" :show-file-list="false" accept="image/*">
              <el-button size="small" :loading="coverUploading">
                {{ styleForm.cover_image ? $t('styleManage.styleCoverChange') : $t('styleManage.styleCoverUpload') }}
              </el-button>
            </el-upload>
            <el-button v-if="styleForm.cover_image" size="small" text type="danger" @click="styleForm.cover_image = ''">{{ $t('common.remove') }}</el-button>
          </div>
        </el-form-item>
        <!-- 新建时显示"从增项库导入"勾选 -->
        <el-form-item v-if="!editingStyleId">
          <el-checkbox v-model="styleForm.importAddons">{{ $t('styleManage.styleImportAddons') }}</el-checkbox>
          <p class="form-hint">{{ $t('styleManage.styleImportHint') }}</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="styleDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="styleSaving" @click="saveStyle">{{ $t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- v0.35 波1 (REQ-024 F1): 尺寸编辑弹窗 — 图（上传 or 作品集挑）+ 描述 + 天数，全部可选 -->
    <el-dialog v-model="sizeDialogVisible" :title="editingSizeId ? $t('styleManage.sizeEditTitle') : $t('styleManage.sizeAddTitle')" width="460px" destroy-on-close>
      <el-form :model="sizeForm" label-position="top">
        <el-form-item :label="$t('styleManage.sizeName')" required>
          <el-input v-model="sizeForm.name" :placeholder="$t('styleManage.sizeNamePlaceholder')" maxlength="50" />
        </el-form-item>
        <el-form-item :label="$t('styleManage.sizePrice')" required>
          <el-input-number v-model="sizeForm.base_price" :min="0" :max="999999" :step="10" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="$t('styleManage.sizeImageLabel')">
          <div class="size-image-picker">
            <el-image v-if="sizeFormPreview" :src="`/uploads/${sizeFormPreview}`" fit="cover" class="size-image-preview" />
            <div class="size-image-actions">
              <el-upload :auto-upload="true" :http-request="uploadSizeImage" :show-file-list="false" accept="image/*">
                <el-button size="small" :loading="sizeUploading">{{ $t('styleManage.sizeImageUpload') }}</el-button>
              </el-upload>
              <el-button size="small" @click="openPickDialog">{{ $t('styleManage.sizeImagePick') }}</el-button>
              <el-button v-if="sizeForm.image || sizeForm.image_artwork_id" size="small" text type="danger" @click="removeSizeImage">{{ $t('styleManage.sizeImageRemove') }}</el-button>
            </div>
          </div>
          <p class="form-hint">{{ $t('styleManage.sizeImageHint') }}</p>
        </el-form-item>
        <el-form-item :label="$t('styleManage.sizeDescLabel')">
          <el-input v-model="sizeForm.description" type="textarea" :rows="2" :placeholder="$t('styleManage.sizeDescPlaceholder')" maxlength="500" show-word-limit />
        </el-form-item>
        <el-form-item :label="$t('styleManage.sizeDaysLabel')">
          <el-input-number v-model="sizeForm.work_days" :min="1" :max="365" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sizeDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="sizeSaving" @click="saveSize">{{ $t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- v0.35 波1 (REQ-024 F1): 从作品集挑选尺寸图 -->
    <el-dialog v-model="pickDialogVisible" :title="$t('styleManage.sizePickTitle')" width="640px">
      <p class="pick-hint">{{ $t('styleManage.sizePickHint') }}</p>
      <div v-if="artworks.length" class="pick-grid">
        <div v-for="art in artworks" :key="art.id" class="pick-item" @click="onPickArtwork(art)">
          <el-image :src="`/uploads/${art.image_path}`" fit="cover" class="pick-img" />
          <span v-if="art.title" class="pick-title">{{ art.title }}</span>
        </div>
      </div>
      <el-empty v-else :description="$t('styleManage.sizePickEmpty')" :image-size="60" />
    </el-dialog>

    <!-- v0.35 补漏 A4: 从增项库导入（已有画风追加导入——SPEC-025 动线 5） -->
    <el-dialog v-model="importDialogVisible" :title="$t('styleManage.addonImportTitle')" width="460px">
      <div v-if="importCandidates.length" class="import-list">
        <el-checkbox-group v-model="importSelection">
          <div v-for="tpl in importCandidates" :key="tpl.id" class="import-row">
            <el-checkbox :value="tpl.id">
              <span class="addon-tpl-name">{{ tpl.name }}</span>
            </el-checkbox>
            <el-tag size="small" :type="controlTagType(tpl.control_type)">{{ controlLabel(tpl.control_type) }}</el-tag>
            <span class="import-price">¥{{ tpl.default_price }}</span>
          </div>
        </el-checkbox-group>
      </div>
      <el-empty v-else :description="$t('styleManage.addonImportEmpty')" :image-size="40" />
      <template #footer>
        <el-button @click="importDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" :disabled="!importSelection.length" :loading="importSaving" @click="confirmImportAddons">
          {{ $t('styleManage.addonImportConfirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import draggable from 'vuedraggable'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const styles = ref([])
const artworks = ref([]) // 作品集（尺寸图"从作品集挑" + 缩略图解析）
const addonTemplates = ref([]) // 增项库全量（A4 导入弹窗候选）
const loading = ref(true)

// ─── v0.35 波1 (F2): 多画风开关 ───
const multiStyleEnabled = ref(false)
const switchSaving = ref(false)

/** 默认画风 = 排序最前的启用画风（动态顺延，与后端公开接口规则一致） */
const defaultStyleId = computed(() => styles.value.find(s => s.is_active)?.id ?? null)

/** 开关关闭时，非默认画风灰色不可编辑（F2 验收 2） */
function isLocked(style) {
  return !multiStyleEnabled.value && style.id !== defaultStyleId.value
}

async function onMultiStyleChange(val) {
  switchSaving.value = true
  try {
    await artistApi.updateProfile({ multiStyleEnabled: !!val })
  } catch (err) {
    multiStyleEnabled.value = !val // 回滚开关
    ElMessage.error(err.message)
  } finally {
    switchSaving.value = false
  }
}

// ─── v0.35 补漏 A3: 拖拽排序（画风卡片 + 尺寸行双层） ───

/** 画风卡片拖拽结束 — 逐条 PUT sort_order（后端无批量 reorder 端点） */
async function onStyleDragEnd() {
  try {
    for (let i = 0; i < styles.value.length; i++) {
      if (styles.value[i].sort_order !== i) {
        await artistApi.updateArtStyle(styles.value[i].id, { sort_order: i })
        styles.value[i].sort_order = i
      }
    }
    ElMessage.success(t('tiers.reorderSaved'))
  } catch (err) {
    ElMessage.error(err.message)
    await load() // 回滚前端顺序
  }
}

/** 尺寸行拖拽结束 — 逐条 PUT sort_order */
async function onSizeDragEnd(style) {
  try {
    for (let i = 0; i < style.sizes.length; i++) {
      if (style.sizes[i].sort_order !== i) {
        await artistApi.updateStyleSize(style.id, style.sizes[i].id, { sort_order: i })
        style.sizes[i].sort_order = i
      }
    }
    ElMessage.success(t('tiers.reorderSaved'))
  } catch (err) {
    ElMessage.error(err.message)
    await load()
  }
}

// ─── 控件类型标签（与 AddonTemplateManager 一致） ───
function controlLabel(type) {
  return { switch: t('styleManage.tplControlSwitch'), quantity: t('styleManage.tplControlQuantity'), radio: t('styleManage.tplControlRadio') }[type] || type
}
function controlTagType(type) {
  return { switch: 'info', quantity: 'primary', radio: 'warning' }[type] || 'info'
}

// ─── 画风 CRUD ───
const styleDialogVisible = ref(false)
const editingStyleId = ref(null)
const styleSaving = ref(false)
const coverUploading = ref(false)
const styleForm = reactive({ name: '', description: '', cover_image: '', importAddons: true })

function openCreateStyle() {
  editingStyleId.value = null
  Object.assign(styleForm, { name: '', description: '', cover_image: '', importAddons: true })
  styleDialogVisible.value = true
}

function openEditStyle(style) {
  editingStyleId.value = style.id
  Object.assign(styleForm, { name: style.name, description: style.description || '', cover_image: style.cover_image || '', importAddons: false })
  styleDialogVisible.value = true
}

/**
 * 封面上传（v0.34 任务2：即时保存，对齐 R48 头像模式）
 * 编辑已有画风：上传成功立即 PUT cover_image——不依赖「确定」，避免"传了图没保存"陷阱（用户 2026-08-03 已踩）
 *   PUT 失败时回滚表单预览，避免"预览显示已保存、实际未保存"的不一致
 * 新建画风：无 id 可保存，只写表单 + 醒目提示「确定后生效」
 */
async function uploadCover({ file }) {
  coverUploading.value = true
  const prevCover = styleForm.cover_image
  try {
    const uploaded = await uploadApi.image(file)
    styleForm.cover_image = uploaded.filePath
    if (editingStyleId.value) {
      try {
        await artistApi.updateArtStyle(editingStyleId.value, { cover_image: uploaded.filePath })
        ElMessage.success(t('common.saved'))
      } catch (putErr) {
        styleForm.cover_image = prevCover // 回滚：预览与实际存储保持一致
        ElMessage.error(putErr.message)
      }
    } else {
      ElMessage({ type: 'warning', message: t('styleManage.sizeImageUploadHint'), duration: 5000 })
    }
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    coverUploading.value = false
  }
}

async function saveStyle() {
  if (!styleForm.name.trim()) {
    ElMessage.warning(t('styleManage.styleNameRequired'))
    return
  }
  styleSaving.value = true
  try {
    if (editingStyleId.value) {
      await artistApi.updateArtStyle(editingStyleId.value, {
        name: styleForm.name.trim(),
        description: styleForm.description.trim() || null,
        cover_image: styleForm.cover_image || null
      })
    } else {
      await artistApi.createArtStyle({
        name: styleForm.name.trim(),
        description: styleForm.description.trim() || null,
        cover_image: styleForm.cover_image || null,
        importAddons: styleForm.importAddons
      })
    }
    ElMessage.success(t('styleManage.styleSaved'))
    styleDialogVisible.value = false
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    styleSaving.value = false
  }
}

async function toggleActive(style, val) {
  try {
    await artistApi.updateArtStyle(style.id, { is_active: val })
    style.is_active = val ? 1 : 0
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function confirmDeleteStyle(style) {
  try {
    await ElMessageBox.confirm(
      t('styleManage.styleDeleteConfirm', { name: style.name }),
      t('styleManage.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    await artistApi.deleteArtStyle(style.id)
    ElMessage.success(t('styleManage.styleDeleted'))
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── v0.35 波1 (F1): 尺寸 CRUD（弹窗编辑：图/描述/天数全部可选） ───
const sizeDialogVisible = ref(false)
const editingSizeStyleId = ref(null) // 尺寸弹窗所属画风（与画风弹窗的 editingStyleId 区分）
const editingSizeId = ref(null)
const sizeSaving = ref(false)
const sizeUploading = ref(false)
const sizeForm = reactive({ name: '', base_price: 0, image: '', image_artwork_id: null, description: '', work_days: null })

/** 尺寸缩略图：image_artwork_id 有值 → 作品集实图；否则独立上传图（渲染优先级与客户端一致） */
function sizeThumb(size) {
  if (size.image_artwork_id) {
    const art = artworks.value.find(a => a.id === size.image_artwork_id)
    if (art) return art.image_path
  }
  return size.image || null
}

/** 弹窗内当前预览图 */
const sizeFormPreview = computed(() => {
  if (sizeForm.image_artwork_id) {
    const art = artworks.value.find(a => a.id === sizeForm.image_artwork_id)
    if (art) return art.image_path
  }
  return sizeForm.image || ''
})

function openSizeDialog(style, size) {
  editingSizeStyleId.value = style.id
  if (size) {
    editingSizeId.value = size.id
    Object.assign(sizeForm, {
      name: size.name,
      base_price: size.base_price,
      image: size.image || '',
      image_artwork_id: size.image_artwork_id || null,
      description: size.description || '',
      work_days: size.work_days ?? null
    })
  } else {
    editingSizeId.value = null
    Object.assign(sizeForm, { name: '', base_price: 0, image: '', image_artwork_id: null, description: '', work_days: null })
  }
  sizeDialogVisible.value = true
}

/** 把即时保存的结果同步到列表（避免整体重载） */
function patchSizeRow(styleId, sizeId, patch) {
  const style = styles.value.find(s => s.id === styleId)
  if (!style) return
  const size = style.sizes.find(s => s.id === sizeId)
  if (size) Object.assign(size, patch)
}

/**
 * 尺寸图上传（v0.34 即时保存模式）
 * 编辑已有尺寸：上传成功立即 PUT——失败回滚预览；新建尺寸：只写表单 + 提示「点保存后生效」
 */
async function uploadSizeImage({ file }) {
  sizeUploading.value = true
  const prev = { image: sizeForm.image, image_artwork_id: sizeForm.image_artwork_id }
  try {
    const uploaded = await uploadApi.image(file)
    sizeForm.image = uploaded.filePath
    sizeForm.image_artwork_id = null
    if (editingSizeId.value) {
      try {
        await artistApi.updateStyleSize(editingSizeStyleId.value, editingSizeId.value, { image: uploaded.filePath })
        patchSizeRow(editingSizeStyleId.value, editingSizeId.value, { image: uploaded.filePath, image_artwork_id: null })
        ElMessage.success(t('styleManage.sizeImageSavedMsg'))
      } catch (putErr) {
        sizeForm.image = prev.image
        sizeForm.image_artwork_id = prev.image_artwork_id
        ElMessage.error(putErr.message)
      }
    } else {
      ElMessage({ type: 'warning', message: t('styleManage.sizeImageUploadHint'), duration: 5000 })
    }
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    sizeUploading.value = false
  }
}

/** 从作品集挑选（点击选择器内的作品） */
async function onPickArtwork(art) {
  pickDialogVisible.value = false
  const prev = { image: sizeForm.image, image_artwork_id: sizeForm.image_artwork_id }
  sizeForm.image = ''
  sizeForm.image_artwork_id = art.id
  if (editingSizeId.value) {
    try {
      await artistApi.updateStyleSize(editingSizeStyleId.value, editingSizeId.value, { image_artwork_id: art.id })
      patchSizeRow(editingSizeStyleId.value, editingSizeId.value, { image: null, image_artwork_id: art.id })
      ElMessage.success(t('styleManage.sizeImageSavedMsg'))
    } catch (err) {
      sizeForm.image = prev.image
      sizeForm.image_artwork_id = prev.image_artwork_id
      ElMessage.error(err.message)
    }
  } else {
    ElMessage({ type: 'warning', message: t('styleManage.sizeImageUploadHint'), duration: 5000 })
  }
}

/** 移除尺寸图（即时保存模式同上传） */
async function removeSizeImage() {
  const prev = { image: sizeForm.image, image_artwork_id: sizeForm.image_artwork_id }
  sizeForm.image = ''
  sizeForm.image_artwork_id = null
  if (editingSizeId.value) {
    try {
      await artistApi.updateStyleSize(editingSizeStyleId.value, editingSizeId.value, { image: null })
      patchSizeRow(editingSizeStyleId.value, editingSizeId.value, { image: null, image_artwork_id: null })
      ElMessage.success(t('styleManage.sizeImageSavedMsg'))
    } catch (err) {
      sizeForm.image = prev.image
      sizeForm.image_artwork_id = prev.image_artwork_id
      ElMessage.error(err.message)
    }
  }
}

async function saveSize() {
  if (!sizeForm.name.trim()) {
    ElMessage.warning(t('styleManage.sizeNameRequired'))
    return
  }
  sizeSaving.value = true
  try {
    // 图片字段互斥：image_artwork_id 优先；都没有则显式清空（后端"传一清一"）
    const payload = {
      name: sizeForm.name.trim(),
      base_price: sizeForm.base_price,
      description: sizeForm.description.trim() || null,
      work_days: sizeForm.work_days
    }
    if (sizeForm.image_artwork_id) payload.image_artwork_id = sizeForm.image_artwork_id
    else payload.image = sizeForm.image || null

    if (editingSizeId.value) {
      await artistApi.updateStyleSize(editingSizeStyleId.value, editingSizeId.value, payload)
      ElMessage.success(t('styleManage.sizeSaved'))
    } else {
      await artistApi.createStyleSize(editingSizeStyleId.value, payload)
      ElMessage.success(t('styleManage.sizeAdded'))
    }
    sizeDialogVisible.value = false
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    sizeSaving.value = false
  }
}

async function confirmDeleteSize(style, size) {
  try {
    await ElMessageBox.confirm(
      t('styleManage.sizeDeleteConfirm', { name: size.name }),
      t('styleManage.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch { return }
  try {
    await artistApi.deleteStyleSize(style.id, size.id)
    ElMessage.success(t('styleManage.sizeDeleted'))
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── 作品集挑选弹窗 ───
const pickDialogVisible = ref(false)

function openPickDialog() {
  pickDialogVisible.value = true
}

// ─── v0.35 补漏 A4: 从增项库导入（已有画风追加导入） ───
const importDialogVisible = ref(false)
const importStyleId = ref(null)
const importSelection = ref([])
const importSaving = ref(false)

/** 该画风尚未导入的增项库模板 */
function unimportedTemplates(style) {
  const imported = new Set(style.addons.map(sa => sa.addon_template_id))
  return addonTemplates.value.filter(tpl => !imported.has(tpl.id))
}

const importCandidates = computed(() => {
  const style = styles.value.find(s => s.id === importStyleId.value)
  return style ? unimportedTemplates(style) : []
})

function openImportDialog(style) {
  importStyleId.value = style.id
  importSelection.value = []
  importDialogVisible.value = true
}

/** 确认导入：现有增项原状 + 新导入项（默认启用）整体 PUT（setStyleAddons upsert 语义） */
async function confirmImportAddons() {
  const style = styles.value.find(s => s.id === importStyleId.value)
  if (!style || !importSelection.value.length) return
  importSaving.value = true
  try {
    const items = [
      ...style.addons.map(sa => ({
        addon_template_id: sa.addon_template_id,
        is_enabled: !!sa.is_enabled,
        price_override: sa.price_override ?? null
      })),
      ...importSelection.value.map(tplId => ({ addon_template_id: tplId, is_enabled: true }))
    ]
    await artistApi.setStyleAddons(style.id, items)
    ElMessage.success(t('styleManage.addonImported'))
    importDialogVisible.value = false
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    importSaving.value = false
  }
}

// ─── v0.35 补漏 A5: 增项勾选/改价即时保存（同封面/例图模式，失败回滚） ───

/** 单个增项的即时 PUT（upsert 语义，只发该项） */
async function putStyleAddon(style, sa) {
  await artistApi.setStyleAddons(style.id, [{
    addon_template_id: sa.addon_template_id,
    is_enabled: !!sa.is_enabled,
    price_override: sa.price_override ?? null
  }])
}

async function onAddonToggle(style, sa, val) {
  const prev = sa.is_enabled
  sa.is_enabled = val ? 1 : 0 // 乐观更新
  try {
    await putStyleAddon(style, sa)
  } catch (err) {
    sa.is_enabled = prev // 回滚
    ElMessage.error(err.message)
  }
}

// 改价防抖：input-number 步进连点时 500ms 合并一次 PUT
const priceTimers = {}

function onAddonPriceChange(style, sa, val) {
  sa.price_override = val ?? null // 乐观更新
  const key = `addon-${style.id}-${sa.id}`
  clearTimeout(priceTimers[key])
  priceTimers[key] = setTimeout(async () => {
    try {
      await putStyleAddon(style, sa)
    } catch (err) {
      ElMessage.error(err.message)
      await load() // 回滚：拉服务端实际值
    }
  }, 500)
}

// ─── 尺寸覆盖（v0.35 补漏 A5: 改价/隐藏即时保存） ───
const overrideExpanded = ref({})   // { [styleAddonId]: boolean }
const overrideLoading = ref({})    // { [styleAddonId]: boolean }
/** 覆盖数据：{ [styleAddonId]: { [sizeId]: { price_override, is_hidden } } } */
const overrideData = ref({})

function getOverridePrice(saId, sizeId) {
  return overrideData.value[saId]?.[sizeId]?.price_override ?? undefined
}
function getOverrideHidden(saId, sizeId) {
  return !!overrideData.value[saId]?.[sizeId]?.is_hidden
}

/** 单个覆盖项的即时 PUT */
async function putOverride(style, sa, sizeId) {
  const data = overrideData.value[sa.id]?.[sizeId] || { price_override: null, is_hidden: false }
  await artistApi.setSizeOverrides(style.id, sizeId, [{
    style_addon_id: sa.id,
    price_override: data.price_override ?? null,
    is_hidden: !!data.is_hidden
  }])
}

function ensureOverrideCell(saId, sizeId) {
  if (!overrideData.value[saId]) overrideData.value[saId] = {}
  if (!overrideData.value[saId][sizeId]) overrideData.value[saId][sizeId] = { price_override: null, is_hidden: false }
  return overrideData.value[saId][sizeId]
}

/** 覆盖改价（乐观更新 + 防抖 PUT；失败回滚单格） */
function onOverridePriceChange(style, sa, sizeId, val) {
  const cell = ensureOverrideCell(sa.id, sizeId)
  const prev = cell.price_override
  cell.price_override = val ?? null
  const key = `ov-${sa.id}-${sizeId}`
  clearTimeout(priceTimers[key])
  priceTimers[key] = setTimeout(async () => {
    try {
      await putOverride(style, sa, sizeId)
    } catch (err) {
      cell.price_override = prev
      ElMessage.error(err.message)
    }
  }, 500)
}

/** 覆盖隐藏勾选（乐观更新 + 即时 PUT；失败回滚单格） */
async function onOverrideHiddenChange(style, sa, sizeId, val) {
  const cell = ensureOverrideCell(sa.id, sizeId)
  const prev = cell.is_hidden
  cell.is_hidden = !!val
  try {
    await putOverride(style, sa, sizeId)
  } catch (err) {
    cell.is_hidden = prev
    ElMessage.error(err.message)
  }
}

/** 展开/收起覆盖面板；展开时加载各尺寸的当前覆盖 */
async function toggleOverridePanel(style, sa) {
  if (overrideExpanded.value[sa.id]) {
    overrideExpanded.value[sa.id] = false
    return
  }
  overrideExpanded.value[sa.id] = true
  overrideLoading.value[sa.id] = true
  try {
    // 并发获取各尺寸的覆盖列表（空 items 的 PUT 是只读操作，返回当前覆盖）
    const results = await Promise.all(
      style.sizes.map(size => artistApi.setSizeOverrides(style.id, size.id, []).then(overrides => ({ sizeId: size.id, overrides })))
    )
    if (!overrideData.value[sa.id]) overrideData.value[sa.id] = {}
    for (const { sizeId, overrides } of results) {
      const match = overrides.find(o => o.style_addon_id === sa.id)
      overrideData.value[sa.id][sizeId] = match
        ? { price_override: match.price_override, is_hidden: !!match.is_hidden }
        : { price_override: null, is_hidden: false }
    }
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    overrideLoading.value[sa.id] = false
  }
}

// ─── 初始化 ───
async function load() {
  loading.value = true
  try {
    const [styleList, profile, artworkList, templates] = await Promise.all([
      artistApi.getArtStyles(),
      artistApi.getProfile(),
      artistApi.getArtworks(),
      artistApi.getAddonTemplates()
    ])
    styles.value = styleList
    multiStyleEnabled.value = !!profile.multi_style_enabled
    artworks.value = artworkList
    addonTemplates.value = templates
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026） ═══ */
/* v0.35 波1: 多画风开关栏 */
.multi-style-bar {
  margin-bottom: 16px; padding: 12px 16px;
  background: var(--card); border: 1px solid var(--line); border-radius: var(--r-l);
}
.multi-style-head { display: flex; align-items: center; gap: 12px; }
.multi-style-label { font-size: 14px; font-weight: 600; color: var(--ink); }
.multi-style-hint { font-size: 12px; color: var(--ink2); margin: 6px 0 0; line-height: 1.5; }

.style-grid { display: flex; flex-direction: column; gap: 20px; }
/* A3: 拖拽幽灵 */
.ghost { opacity: 0.4; }
.style-card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.style-card-name { font-size: 16px; font-weight: 700; font-family: var(--f-d); color: var(--ink); display: flex; align-items: center; gap: 8px; }
.style-card-actions { display: flex; align-items: center; gap: 4px; }
/* A3: 画风卡片拖拽柄 */
.style-drag-handle { cursor: grab; font-size: 16px; color: var(--ink3); padding: 0 2px; }
.style-drag-handle:hover { color: var(--hq); }
.style-drag-handle:active { cursor: grabbing; }
/* F2: 开关关闭时非默认画风灰色 */
.style-card--locked { opacity: 0.65; }
.style-card-body--locked { pointer-events: none; }
.style-locked-hint {
  font-size: 12px; color: var(--th);
  background: var(--th-t);
  padding: 6px 10px; border-radius: var(--r-s); margin: 0 0 10px;
}
.style-desc { font-size: 13px; color: var(--ink2); margin: 0 0 12px; line-height: 1.6; }
.style-cover { margin-bottom: 12px; }
.style-cover-img { width: 120px; height: 80px; border-radius: var(--r-m); border: 1px solid var(--line); }

.style-section { margin-top: 16px; padding-top: 12px; border-top: 1px dashed var(--line); }
.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.section-head .section-title { margin: 0; }
.section-title { font-size: 14px; font-weight: 600; color: var(--ink); margin: 0 0 10px; }
/* 价格数字墨色不上色铁律（REQ §1.1），文楷落款感 */
.size-price { font-variant-numeric: tabular-nums; color: var(--ink); font-weight: 600; font-family: var(--f-d); }

/* A3: 尺寸行列表（替代原 el-table，支持拖拽） */
.size-row-list { display: flex; flex-direction: column; gap: 6px; }
.size-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: var(--r-m);
  background: var(--paper2); border: 1px solid var(--line);
}
.size-drag-handle { cursor: grab; font-size: 15px; color: var(--ink3); flex-shrink: 0; }
.size-drag-handle:hover { color: var(--hq); }
.size-drag-handle:active { cursor: grabbing; }
.size-row-thumb { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.size-row-main { flex: 1; min-width: 0; }
.size-row-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.size-row-name { font-size: 14px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.size-row-desc {
  font-size: 12px; color: var(--ink2); margin: 3px 0 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.size-row-actions { display: flex; gap: 2px; flex-shrink: 0; }
/* 尺寸缩略图 */
.size-thumb { width: 44px; height: 34px; border-radius: var(--r-s); border: 1px solid var(--line); vertical-align: middle; }
.size-thumb-empty { color: var(--ink4); }
.size-thumb-tag { transform: scale(0.9); }

.style-addon-list { display: flex; flex-direction: column; gap: 6px; }
.style-addon-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 6px 0; }
.addon-tpl-name { font-size: 14px; font-weight: 500; color: var(--ink); }

/* 尺寸覆盖面板 */
.override-panel {
  margin: 4px 0 12px; padding: 12px 16px;
  background: var(--paper2); border: 1px solid var(--line); border-radius: var(--r-m);
}
.override-panel-title { font-size: 13px; font-weight: 600; color: var(--ink); margin-bottom: 10px; }
.override-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 4px 0; }
.override-size-name { font-size: 13px; color: var(--ink2); min-width: 60px; }

.cover-upload { display: flex; align-items: center; gap: 12px; }
.cover-preview { width: 80px; height: 60px; border-radius: var(--r-m); border: 1px solid var(--line); }
.form-hint { font-size: 11px; color: var(--ink2); margin: 4px 0 0; }

/* v0.35 波1: 尺寸图设置区 */
.size-image-picker { display: flex; align-items: center; gap: 12px; }
.size-image-preview { width: 90px; height: 70px; border-radius: var(--r-m); border: 1px solid var(--line); flex-shrink: 0; }
.size-image-actions { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }

/* v0.35 波1: 作品集挑选网格 */
.pick-hint { font-size: 12px; color: var(--ink2); margin: 0 0 12px; }
.pick-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px; max-height: 420px; overflow-y: auto;
}
.pick-item {
  position: relative; border-radius: var(--r-m); overflow: hidden; cursor: pointer;
  border: 2px solid transparent; transition: border-color 0.2s, transform 0.2s;
}
.pick-item:hover { border-color: var(--hq); transform: translateY(-2px); }
.pick-img { width: 100%; height: 100px; display: block; }
.pick-title {
  display: block; font-size: 11px; color: var(--ink2);
  padding: 3px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* A4: 增项导入弹窗 */
.import-list { max-height: 360px; overflow-y: auto; }
.import-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
/* 价格数字墨色不上色铁律（REQ §1.1） */
.import-price { margin-left: auto; font-size: 13px; color: var(--ink); font-variant-numeric: tabular-nums; }
</style>
