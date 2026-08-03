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

    <div v-if="styles.length" class="style-grid">
      <el-card v-for="style in styles" :key="style.id" class="style-card" :class="{ 'style-card--locked': isLocked(style) }" shadow="hover">
        <!-- 卡头：名称 + 默认徽标 + 启用开关 + 操作 -->
        <template #header>
          <div class="style-card-header">
            <span class="style-card-name">
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

          <!-- ── 尺寸区（v0.35 波1: 图/描述/天数摘要 + 弹窗编辑） ── -->
          <div class="style-section">
            <div class="section-head">
              <h4 class="section-title">{{ $t('styleManage.sizeTitle') }}</h4>
              <el-button size="small" :disabled="isLocked(style)" @click="openSizeDialog(style)">{{ $t('styleManage.sizeAddBtn') }}</el-button>
            </div>
            <el-table :data="style.sizes" size="small" stripe>
              <el-table-column :label="$t('styleManage.sizeImageCol')" width="70">
                <template #default="{ row }">
                  <el-image
                    v-if="sizeThumb(row)" :src="`/uploads/${sizeThumb(row)}`"
                    fit="cover" class="size-thumb"
                  />
                  <span v-else class="size-thumb-empty">—</span>
                  <el-tag v-if="row.image_artwork_id" size="small" effect="plain" class="size-thumb-tag">{{ $t('styleManage.sizeFromArtworkTag') }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="$t('styleManage.sizeName')" min-width="90" prop="name" />
              <el-table-column :label="$t('styleManage.sizePrice')" width="100">
                <template #default="{ row }">
                  <span class="size-price">¥{{ row.base_price }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="$t('styleManage.sizeDescCol')" min-width="120">
                <template #default="{ row }">
                  <span class="size-desc-cell">{{ row.description || '—' }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="$t('styleManage.sizeDaysCol')" width="80">
                <template #default="{ row }">
                  {{ row.work_days ? $t('tiers.daysUnit', { n: row.work_days }) : '—' }}
                </template>
              </el-table-column>
              <el-table-column :label="$t('styleManage.sizeActions')" width="110" align="right">
                <template #default="{ row }">
                  <el-button text size="small" :disabled="isLocked(style)" @click="openSizeDialog(style, row)">{{ $t('common.edit') }}</el-button>
                  <el-button text size="small" type="danger" :disabled="isLocked(style)" @click="confirmDeleteSize(style, row)">{{ $t('common.delete') }}</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <!-- ── 增项区 ── -->
          <div class="style-section">
            <h4 class="section-title">{{ $t('styleManage.addonTitle') }}</h4>
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
                <!-- 价格覆盖（placeholder 显示模板默认价） -->
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
              <el-button size="small" style="margin-top: 8px" :disabled="isLocked(style)" :loading="addonSaving[style.id]" @click="saveStyleAddons(style)">
                {{ $t('styleManage.addonSave') }}
              </el-button>
            </div>
            <el-empty v-else :description="$t('styleManage.addonEmpty')" :image-size="40" />

            <!-- 尺寸覆盖面板（展开后显示各尺寸的覆盖设置） -->
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
                      @change="(val) => setOverridePrice(sa.id, size.id, val)"
                    />
                    <el-checkbox
                      :model-value="getOverrideHidden(sa.id, size.id)"
                      :disabled="isLocked(style)"
                      @change="(val) => setOverrideHidden(sa.id, size.id, val)"
                    >
                      {{ $t('styleManage.overrideHidden') }}
                    </el-checkbox>
                    <el-button size="small" :disabled="isLocked(style)" :loading="overrideSaving[`${sa.id}-${size.id}`]" @click="saveOverride(style, sa, size)">
                      {{ $t('common.save') }}
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-card>
    </div>
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
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const styles = ref([])
const artworks = ref([]) // 作品集（尺寸图"从作品集挑" + 缩略图解析）
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

// ─── 增项管理（启用/禁用/改价，批量保存） ───
const addonSaving = ref({}) // { [styleId]: boolean }

function onAddonToggle(style, sa, val) {
  sa.is_enabled = val ? 1 : 0
}
function onAddonPriceChange(style, sa, val) {
  sa.price_override = val ?? null
}

async function saveStyleAddons(style) {
  addonSaving.value[style.id] = true
  try {
    const items = style.addons.map(sa => ({
      addon_template_id: sa.addon_template_id,
      is_enabled: !!sa.is_enabled,
      price_override: sa.price_override ?? null
    }))
    await artistApi.setStyleAddons(style.id, items)
    ElMessage.success(t('styleManage.addonSaved'))
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    addonSaving.value[style.id] = false
  }
}

// ─── 尺寸覆盖（按需展开，不点开不显示） ───
const overrideExpanded = ref({})   // { [styleAddonId]: boolean }
const overrideLoading = ref({})    // { [styleAddonId]: boolean }
const overrideSaving = ref({})     // { [`${saId}-${sizeId}`]: boolean }
/** 覆盖数据：{ [styleAddonId]: { [sizeId]: { price_override, is_hidden } } } */
const overrideData = ref({})

function getOverridePrice(saId, sizeId) {
  return overrideData.value[saId]?.[sizeId]?.price_override ?? undefined
}
function getOverrideHidden(saId, sizeId) {
  return !!overrideData.value[saId]?.[sizeId]?.is_hidden
}
function setOverridePrice(saId, sizeId, val) {
  if (!overrideData.value[saId]) overrideData.value[saId] = {}
  if (!overrideData.value[saId][sizeId]) overrideData.value[saId][sizeId] = { price_override: null, is_hidden: false }
  overrideData.value[saId][sizeId].price_override = val ?? null
}
function setOverrideHidden(saId, sizeId, val) {
  if (!overrideData.value[saId]) overrideData.value[saId] = {}
  if (!overrideData.value[saId][sizeId]) overrideData.value[saId][sizeId] = { price_override: null, is_hidden: false }
  overrideData.value[saId][sizeId].is_hidden = !!val
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

/** 保存单个尺寸的覆盖 */
async function saveOverride(style, sa, size) {
  const key = `${sa.id}-${size.id}`
  overrideSaving.value[key] = true
  try {
    const data = overrideData.value[sa.id]?.[size.id] || { price_override: null, is_hidden: false }
    await artistApi.setSizeOverrides(style.id, size.id, [{
      style_addon_id: sa.id,
      price_override: data.price_override ?? null,
      is_hidden: !!data.is_hidden
    }])
    ElMessage.success(t('styleManage.overrideSaved'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    overrideSaving.value[key] = false
  }
}

// ─── 初始化 ───
async function load() {
  loading.value = true
  try {
    const [styleList, profile, artworkList] = await Promise.all([
      artistApi.getArtStyles(),
      artistApi.getProfile(),
      artistApi.getArtworks()
    ])
    styles.value = styleList
    multiStyleEnabled.value = !!profile.multi_style_enabled
    artworks.value = artworkList
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
/* v0.35 波1: 多画风开关栏 */
.multi-style-bar {
  margin-bottom: 16px; padding: 12px 16px;
  background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px;
}
.multi-style-head { display: flex; align-items: center; gap: 12px; }
.multi-style-label { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.multi-style-hint { font-size: 12px; color: var(--text-secondary); margin: 6px 0 0; line-height: 1.5; }

.style-grid { display: flex; flex-direction: column; gap: 20px; }
.style-card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.style-card-name { font-size: 16px; font-weight: 700; font-family: var(--font-display); color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
.style-card-actions { display: flex; align-items: center; gap: 4px; }
/* F2: 开关关闭时非默认画风灰色 */
.style-card--locked { opacity: 0.65; }
.style-card-body--locked { pointer-events: none; }
.style-locked-hint {
  font-size: 12px; color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  padding: 6px 10px; border-radius: 6px; margin: 0 0 10px;
}
.style-desc { font-size: 13px; color: var(--text-secondary); margin: 0 0 12px; line-height: 1.6; }
.style-cover { margin-bottom: 12px; }
.style-cover-img { width: 120px; height: 80px; border-radius: 8px; border: 1px solid var(--border-color); }

.style-section { margin-top: 16px; padding-top: 12px; border-top: 1px dashed var(--border-color); }
.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.section-head .section-title { margin: 0; }
.section-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 10px; }
.size-price { font-variant-numeric: tabular-nums; color: var(--el-color-primary); font-weight: 600; }
.size-desc-cell { font-size: 12px; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* 尺寸缩略图 */
.size-thumb { width: 44px; height: 34px; border-radius: 6px; border: 1px solid var(--border-color); vertical-align: middle; }
.size-thumb-empty { color: var(--text-muted); }
.size-thumb-tag { margin-left: 4px; transform: scale(0.9); }

.style-addon-list { display: flex; flex-direction: column; gap: 6px; }
.style-addon-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 6px 0; }
.addon-tpl-name { font-size: 14px; font-weight: 500; color: var(--text-primary); }

/* 尺寸覆盖面板 */
.override-panel {
  margin: 4px 0 12px; padding: 12px 16px;
  background: var(--bg-inset); border: 1px solid var(--border-color); border-radius: 8px;
}
.override-panel-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px; }
.override-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 4px 0; }
.override-size-name { font-size: 13px; color: var(--text-secondary); min-width: 60px; }

.cover-upload { display: flex; align-items: center; gap: 12px; }
.cover-preview { width: 80px; height: 60px; border-radius: 8px; border: 1px solid var(--border-color); }
.form-hint { font-size: 11px; color: var(--text-secondary); margin: 4px 0 0; }

/* v0.35 波1: 尺寸图设置区 */
.size-image-picker { display: flex; align-items: center; gap: 12px; }
.size-image-preview { width: 90px; height: 70px; border-radius: 8px; border: 1px solid var(--border-color); flex-shrink: 0; }
.size-image-actions { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }

/* v0.35 波1: 作品集挑选网格 */
.pick-hint { font-size: 12px; color: var(--text-secondary); margin: 0 0 12px; }
.pick-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px; max-height: 420px; overflow-y: auto;
}
.pick-item {
  position: relative; border-radius: 8px; overflow: hidden; cursor: pointer;
  border: 2px solid transparent; transition: border-color 0.2s, transform 0.2s;
}
.pick-item:hover { border-color: var(--el-color-primary); transform: translateY(-2px); }
.pick-img { width: 100%; height: 100px; display: block; }
.pick-title {
  display: block; font-size: 11px; color: var(--text-secondary);
  padding: 3px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
</style>
