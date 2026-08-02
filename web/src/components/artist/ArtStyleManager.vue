<template>
  <div class="style-manager" v-loading="loading">
    <el-button type="primary" size="small" style="margin-bottom: 16px" @click="openCreateStyle">
      {{ $t('styleManage.styleAdd') }}
    </el-button>

    <div v-if="styles.length" class="style-grid">
      <el-card v-for="style in styles" :key="style.id" class="style-card" shadow="hover">
        <!-- 卡头：名称 + 启用开关 + 操作 -->
        <template #header>
          <div class="style-card-header">
            <span class="style-card-name">{{ style.name }}</span>
            <div class="style-card-actions">
              <el-switch
                :model-value="!!style.is_active" size="small"
                :active-text="$t('styleManage.styleActive')"
                @change="(val) => toggleActive(style, val)"
              />
              <el-button text size="small" @click="openEditStyle(style)">{{ $t('common.edit') }}</el-button>
              <el-button text size="small" type="danger" @click="confirmDeleteStyle(style)">{{ $t('common.delete') }}</el-button>
            </div>
          </div>
        </template>

        <!-- 描述 + 示例图 -->
        <p v-if="style.description" class="style-desc">{{ style.description }}</p>
        <div v-if="style.cover_image" class="style-cover">
          <el-image :src="`/uploads/${style.cover_image}`" fit="cover" class="style-cover-img" :alt="style.name" />
        </div>

        <!-- ── 尺寸区 ── -->
        <div class="style-section">
          <h4 class="section-title">{{ $t('styleManage.sizeTitle') }}</h4>
          <el-table :data="style.sizes" size="small" stripe>
            <el-table-column :label="$t('styleManage.sizeName')" min-width="100">
              <template #default="{ row }">
                <el-input v-if="editingSizeId === row.id" v-model="sizeEditForm.name" size="small" maxlength="50" />
                <span v-else>{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="$t('styleManage.sizePrice')" width="140">
              <template #default="{ row }">
                <el-input-number v-if="editingSizeId === row.id" v-model="sizeEditForm.base_price" :min="0" :max="999999" :step="10" size="small" style="width: 110px" />
                <span v-else class="size-price">¥{{ row.base_price }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="$t('styleManage.sizeActions')" width="130" align="right">
              <template #default="{ row }">
                <template v-if="editingSizeId === row.id">
                  <el-button text size="small" type="primary" @click="saveSizeEdit(style)">{{ $t('common.save') }}</el-button>
                  <el-button text size="small" @click="editingSizeId = null">{{ $t('common.cancel') }}</el-button>
                </template>
                <template v-else>
                  <el-button text size="small" @click="startSizeEdit(row)">{{ $t('common.edit') }}</el-button>
                  <el-button text size="small" type="danger" @click="confirmDeleteSize(style, row)">{{ $t('common.delete') }}</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
          <!-- 添加尺寸行 -->
          <div class="size-add-row">
            <el-input v-model="newSizeForm.name" :placeholder="$t('styleManage.sizeNamePlaceholder')" size="small" style="flex: 1" maxlength="50" />
            <el-input-number v-model="newSizeForm.base_price" :min="0" :max="999999" :step="10" size="small" style="width: 120px" />
            <el-button size="small" :disabled="!newSizeForm.name.trim()" @click="addSize(style)">{{ $t('styleManage.sizeAdd') }}</el-button>
          </div>
        </div>

        <!-- ── 增项区 ── -->
        <div class="style-section">
          <h4 class="section-title">{{ $t('styleManage.addonTitle') }}</h4>
          <div v-if="style.addons.length" class="style-addon-list">
            <div v-for="sa in style.addons" :key="sa.id" class="style-addon-row">
              <el-checkbox
                :model-value="!!sa.is_enabled"
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
                @change="(val) => onAddonPriceChange(style, sa, val)"
              />
              <!-- 尺寸覆盖展开按钮（有尺寸时才显示；REQ-023：不点开不显示） -->
              <el-button
                v-if="style.sizes.length"
                text size="small" type="primary"
                @click="toggleOverridePanel(style, sa)"
              >
                {{ overrideExpanded[sa.id] ? $t('styleManage.overrideCollapse') : $t('styleManage.overrideExpand') }}
              </el-button>
            </div>
            <el-button size="small" style="margin-top: 8px" :loading="addonSaving[style.id]" @click="saveStyleAddons(style)">
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
                    @change="(val) => setOverridePrice(sa.id, size.id, val)"
                  />
                  <el-checkbox
                    :model-value="getOverrideHidden(sa.id, size.id)"
                    @change="(val) => setOverrideHidden(sa.id, size.id, val)"
                  >
                    {{ $t('styleManage.overrideHidden') }}
                  </el-checkbox>
                  <el-button size="small" :loading="overrideSaving[`${sa.id}-${size.id}`]" @click="saveOverride(style, sa, size)">
                    {{ $t('common.save') }}
                  </el-button>
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const styles = ref([])
const loading = ref(true)

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

async function uploadCover({ file }) {
  coverUploading.value = true
  try {
    const uploaded = await uploadApi.image(file)
    styleForm.cover_image = uploaded.filePath
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

// ─── 尺寸 CRUD ───
const editingSizeId = ref(null)
const sizeEditForm = reactive({ name: '', base_price: 0 })
const newSizeForm = reactive({ name: '', base_price: 0 })

function startSizeEdit(row) {
  editingSizeId.value = row.id
  Object.assign(sizeEditForm, { name: row.name, base_price: row.base_price })
}

async function saveSizeEdit(style) {
  if (!sizeEditForm.name.trim()) {
    ElMessage.warning(t('styleManage.sizeNameRequired'))
    return
  }
  try {
    await artistApi.updateStyleSize(style.id, editingSizeId.value, {
      name: sizeEditForm.name.trim(),
      base_price: sizeEditForm.base_price
    })
    ElMessage.success(t('styleManage.sizeSaved'))
    editingSizeId.value = null
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function addSize(style) {
  if (!newSizeForm.name.trim()) return
  try {
    await artistApi.createStyleSize(style.id, {
      name: newSizeForm.name.trim(),
      base_price: newSizeForm.base_price
    })
    ElMessage.success(t('styleManage.sizeAdded'))
    Object.assign(newSizeForm, { name: '', base_price: 0 })
    await load()
  } catch (err) {
    ElMessage.error(err.message)
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
    styles.value = await artistApi.getArtStyles()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.style-grid { display: flex; flex-direction: column; gap: 20px; }
.style-card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.style-card-name { font-size: 16px; font-weight: 700; font-family: var(--font-display); color: var(--text-primary); }
.style-card-actions { display: flex; align-items: center; gap: 4px; }
.style-desc { font-size: 13px; color: var(--text-secondary); margin: 0 0 12px; line-height: 1.6; }
.style-cover { margin-bottom: 12px; }
.style-cover-img { width: 120px; height: 80px; border-radius: 8px; border: 1px solid var(--border-color); }

.style-section { margin-top: 16px; padding-top: 12px; border-top: 1px dashed var(--border-color); }
.section-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 10px; }
.size-price { font-variant-numeric: tabular-nums; color: var(--el-color-primary); font-weight: 600; }
.size-add-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }

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
</style>
