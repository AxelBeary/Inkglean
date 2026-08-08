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
                  <div
                    class="size-row"
                    :class="{ 'size-row--dim': (size._status || 'open') === 'close' }"
                    @dragover.prevent="onSizeDragOver"
                    @drop.prevent="onDropToSize(style, size, $event)"
                  >
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
                      <!-- REQ-036 (任务5): 尺寸摘要行实时更新（拖入即出现） -->
                      <div class="size-summary">
                        <span class="sum-label">{{ $t('styleManage.sizeSummaryLabel') }}</span>
                        <span
                          v-for="chip in sizeSummary(style, size)" :key="chip.id"
                          class="sum-chip" :class="chip.kind"
                          draggable="true" :title="$t('styleManage.addonDragBackHint')"
                          @dragstart="onChipDragStart(style, size, chip, $event)"
                        >{{ chip.name }} {{ chip.priceText }}</span>
                        <span v-if="!sizeSummary(style, size).length" class="sum-empty">{{ $t('styleManage.sizeSummaryEmpty') }}</span>
                      </div>
                    </div>
                    <!-- REQ-036 (任务5/验收7): 尺寸三态（前端本地状态，批B后端校验持久化） -->
                    <div class="size-status-seg">
                      <button
                        v-for="st in statusOptions" :key="st.value"
                        class="seg-btn" :class="[`seg-${st.value}`, { on: (size._status || 'open') === st.value }]"
                        :disabled="isLocked(style)"
                        @click="setSizeStatus(style, size, st.value)"
                      >
                        <i></i>{{ st.label }}
                      </button>
                    </div>
                    <div class="size-row-actions">
                      <el-button text size="small" :disabled="isLocked(style)" @click="openPreview(style, size)">{{ $t('styleManage.previewBtn') }}</el-button>
                      <el-button text size="small" :disabled="isLocked(style)" @click="openSizeDialog(style, size)">{{ $t('common.edit') }}</el-button>
                      <el-button text size="small" type="danger" :disabled="isLocked(style)" @click="confirmDeleteSize(style, size)">{{ $t('common.delete') }}</el-button>
                    </div>
                  </div>
                </template>
              </draggable>
              <el-empty v-if="!style.sizes.length" :description="$t('styleManage.sizeEmpty')" :image-size="40" />
            </div>

            <!-- ── 加购项池（REQ-036 批A: 双入口 + 池子胶囊 + 拖拽启用/停用） ── -->
            <div class="style-section">
              <div class="section-head">
                <h4 class="section-title">{{ $t('styleManage.addonTitle') }}</h4>
              </div>
              <!-- §2.1 双入口：新建（自动挂本画风+沉淀库） / 从已有挑选（原导入，已用项过滤） -->
              <div class="addon-pool-head">
                <el-button size="small" type="primary" plain :disabled="isLocked(style)" @click="openCreateAddon(style)">
                  {{ $t('styleManage.addonCreateBtn') }}
                </el-button>
                <el-button size="small" :disabled="isLocked(style)" @click="openImportDialog(style)">
                  {{ $t('styleManage.addonPickBtn') }}
                </el-button>
              </div>
              <!-- §2.2 池子（02H 三类分组）：胶囊 = 画风已挂增项；拖到尺寸行=启用，点击=三层弹窗 -->
              <div
                class="addon-pool"
                :class="{ 'pool--drag-over': poolDragOver }"
                @dragover.prevent="onPoolDragOver"
                @dragleave="onPoolDragLeave"
                @drop.prevent="onDropToPool(style, $event)"
              >
                <template v-for="grp in poolGroups(style)" :key="grp.cat">
                  <span v-if="grp.items.length" class="pool-group-label">{{ categoryLabel($t, grp.cat) }}</span>
                  <span
                    v-for="sa in grp.items" :key="sa.id"
                    class="addon-cap"
                    draggable="true"
                    :title="$t('styleManage.addonCapHint')"
                    @dragstart="onCapDragStart(style, sa, $event)"
                    @dragend="onCapDragEnd"
                    @click="openAddonSettings(style, sa)"
                  >
                    <span class="cap-name">{{ sa.template_name }}</span>
                    <span class="cap-price">{{ capPriceText(sa) }}</span>
                    <span class="cap-tag" :class="`cap-tag-${sa.template_control_type}`">{{ controlLabel(sa.template_control_type) }}</span>
                  </span>
                </template>
                <span v-if="!style.addons.length" class="pool-empty">{{ $t('styleManage.addonPoolEmpty') }}</span>
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

    <!-- REQ-036 批A (任务2): [+ 新建增项] 弹窗 —— created=建库+挂载, attached=直接挂载同名库模板 -->
    <AddonCreateDialog
      v-model="createDialogVisible"
      :style-id="createDialogStyleId"
      :templates="addonTemplates"
      @created="onAddonCreated"
      @attached="onAddonAttached"
    />

    <!-- REQ-036 批A (任务5): 预览弹窗 —— 顾客视角只读（状态标签 + 构成 + 合计 + 公式） -->
    <AddonPreviewDialog v-model="previewVisible" :style="previewStyle" :size="previewSize" />

    <!-- REQ-036 批A (任务4): 胶囊三层弹窗 —— 模板级/画风级/尺寸级 + 移除解绑 -->
    <AddonSettingsDialog v-model="settingsVisible" :style="settingsStyle" :sa="settingsSa" @saved="onSettingsSaved" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import draggable from 'vuedraggable'
import { artistApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
// REQ-036 批A: 增项直觉化子组件（新建/预览/三层设置）+ 共享纯函数
import AddonCreateDialog from './AddonCreateDialog.vue'
import AddonPreviewDialog from './AddonPreviewDialog.vue'
import AddonSettingsDialog from './AddonSettingsDialog.vue'
import { addonKind, addonCategory, categoryLabel, effectivePrice, formatAddonPrice } from './addon-utils.js'

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

// ─── REQ-036 批A: 加购项池 + 拖拽 + 三态 + 摘要 + 弹窗（直觉化重构，替换 v0.35 A4/A5 行内交互） ───

/** 尺寸三态选项（§2.3：可约/展示/关闭；本批前端本地状态，批B后端校验+持久化） */
const statusOptions = computed(() => [
  { value: 'open', label: t('styleManage.sizeStatusOpen') },
  { value: 'show', label: t('styleManage.sizeStatusShow') },
  { value: 'close', label: t('styleManage.sizeStatusClose') }
])

function setSizeStatus(style, size, value) {
  size._status = value // 本地状态（批A UI；批B 落库 + 算价/下单校验）
}

/** 02H: 池子三类分组（增项/用途/加急，顺序固定）——用途/加急分类按名称约定（见 addonCategory） */
function poolGroups(style) {
  return ['add', 'usage', 'rush'].map(cat => ({ cat, items: style.addons.filter(sa => addonCategory(sa) === cat) }))
}

/** 02H 单选约束（用户原话「用途、加急分别只能选一个」）：启用目标 usage/rush 时，同画风其他同类项 is_enabled=false
 * 返回 setStyleAddons items（含目标项 is_enabled=true + 其他同类 false）；增项类(add)不互斥 */
function mutexAddonItems(style, targetSa) {
  const cat = addonCategory(targetSa)
  if (cat === 'add') return null
  const items = style.addons.filter(sa => sa.id !== targetSa.id && addonCategory(sa) === cat && !!sa.is_enabled)
    .map(sa => ({ addon_template_id: sa.addon_template_id, is_enabled: false }))
  if (!items.length) return null
  return [{ addon_template_id: targetSa.addon_template_id, is_enabled: true }, ...items]
}

/** 画风级生效价文本（池子胶囊 / 预览明细 / 摘要 chip）：本身价 or 画风覆盖价 */
function capPriceText(sa) {
  return formatAddonPrice(effectivePrice(sa, null), sa.template_pricing_mode, sa.template_unit_label || undefined, sa.template_kind)
}

/**
 * 某尺寸已启用增项摘要（§2.7，实时）：画风级启用 && 尺寸级未隐藏
 * 返回 [{ id, name, kind, priceText }] — kind: add/qty/mul（三种计价形态视觉区分）
 */
function sizeSummary(style, size) {
  const ov = size._overrides || {}
  return style.addons
    .filter(sa => !!sa.is_enabled && !(ov[sa.id]?.is_hidden))
    .map(sa => ({
      id: sa.id,
      name: sa.template_name,
      kind: addonKind(sa),
      priceText: formatAddonPrice(effectivePrice(sa, ov[sa.id]?.price_override ?? null), sa.template_pricing_mode, sa.template_unit_label || undefined, sa.template_kind)
    }))
}

// ─── 新建增项（任务2）：表单 created → 建模板 + 挂本画风；attached → 直接挂载同名库模板 ───
const createDialogVisible = ref(false)
const createDialogStyleId = ref(null)

function openCreateAddon(style) {
  createDialogStyleId.value = style.id
  createDialogVisible.value = true
}

/** created：库中无同名 → 新建模板并挂到本画风（自动沉淀） */
async function onAddonCreated(payload) {
  const styleId = createDialogStyleId.value
  if (!styleId || !payload?.name) return
  try {
    const tpl = await artistApi.createAddonTemplate(payload)
    // 02H 单选约束：新建用途/加急默认启用 → 同画风其他同类画风级停用
    const styleObj = styles.value.find(s => s.id === styleId)
    const mutex = styleObj ? mutexAddonItems(styleObj, { id: -1, addon_template_id: tpl.id, template_kind: payload.kind === 'multiply' ? 'multiply' : 'add', template_name: payload.name, is_enabled: true }) : null
    if (mutex) { await artistApi.setStyleAddons(styleId, mutex) }
    await artistApi.setStyleAddons(styleId, [{ addon_template_id: tpl.id, is_enabled: true }])
    ElMessage.success(t('styleManage.addonCreatedAttached'))
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

/** attached：库中已有同名 → 直接挂载该模板 */
async function onAddonAttached({ templateId }) {
  const styleId = createDialogStyleId.value
  if (!styleId || !templateId) return
  try {
    await artistApi.setStyleAddons(styleId, [{ addon_template_id: templateId, is_enabled: true }])
    ElMessage.success(t('styleManage.addonAttached'))
    await load()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

// ─── 预览弹窗（任务5）：顾客视角只读 ───
const previewVisible = ref(false)
const previewStyle = ref(null)
const previewSize = ref(null)

function openPreview(style, size) {
  previewStyle.value = style
  previewSize.value = size
  previewVisible.value = true
}

// ─── 三层设置弹窗（任务4）───
const settingsVisible = ref(false)
const settingsStyle = ref(null)
const settingsSa = ref(null)

function openAddonSettings(style, sa) {
  settingsStyle.value = style
  settingsSa.value = sa
  settingsVisible.value = true
}

function onSettingsSaved() {
  load()
}

// ─── 拖拽（任务3，原生 HTML5 drag）：池 → 尺寸行 = 启用；摘要 chip → 池 = 停用 ───
const dragPayload = ref(null) // { styleId, saId, fromSizeId|null }
const poolDragOver = ref(false)
const DRAG_MIME = 'text/x-addon-sa'

function onCapDragStart(style, sa, e) {
  dragPayload.value = { styleId: style.id, saId: sa.id, fromSizeId: null }
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData(DRAG_MIME, String(sa.id))
}

/** 摘要 chip 拖拽：记录来源尺寸，drop 到池 = 停用该尺寸 */
function onChipDragStart(style, size, chip, e) {
  dragPayload.value = { styleId: style.id, saId: chip.id, fromSizeId: size.id }
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData(DRAG_MIME, String(chip.id))
}

function onCapDragEnd() {
  dragPayload.value = null
}

/** 尺寸行 dragover：仅接受增项拖拽（避免干扰 vuedraggable 排序） */
function onSizeDragOver(e) {
  if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault()
}

function onPoolDragOver(e) {
  if (e.dataTransfer.types.includes(DRAG_MIME)) {
    e.preventDefault()
    poolDragOver.value = true
  }
}
function onPoolDragLeave() { poolDragOver.value = false }

/** 拖到尺寸行 = 启用该尺寸（仅决定启用，不动价格；已启用 → 提示不重复） */
async function onDropToSize(style, size, _e) {
  const payload = dragPayload.value
  if (!payload || payload.styleId !== style.id) return
  if (payload.fromSizeId === size.id) return // 从本尺寸拖回 → 无操作
  const sa = style.addons.find(s => s.id === payload.saId)
  if (!sa) return
  const ov = size._overrides || {}
  if (!ov[sa.id]?.is_hidden) {
    ElMessage.info(t('styleManage.addonAlreadyEnabled', { name: sa.template_name, size: size.name }))
    return
  }
  try {
    // 02H 单选约束：用途/加急类拖入尺寸启用 → 同画风其他同类画风级停用（后端 multiply 全乘，前端保证单选）
    const mutex = mutexAddonItems(style, sa)
    if (mutex) {
      await artistApi.setStyleAddons(style.id, mutex)
      for (const m of mutex) {
        const other = style.addons.find(x => x.addon_template_id === m.addon_template_id)
        if (other) other.is_enabled = !!m.is_enabled
      }
    }
    await artistApi.setSizeOverrides(style.id, size.id, [{ style_addon_id: sa.id, price_override: ov[sa.id]?.price_override ?? null, is_hidden: false }])
    if (!size._overrides) size._overrides = {}
    size._overrides[sa.id] = { price_override: ov[sa.id]?.price_override ?? null, is_hidden: false }
    ElMessage.success(t('styleManage.addonEnabled', { size: size.name, name: sa.template_name }))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    dragPayload.value = null
    poolDragOver.value = false
  }
}

/** 拖回池 = 停用（来源尺寸记录在 fromSizeId） */
async function onDropToPool(style, _e) {
  const payload = dragPayload.value
  if (!payload || payload.styleId !== style.id) return
  if (!payload.fromSizeId) { dragPayload.value = null; return } // 池 → 池 = 无操作
  const size = style.sizes.find(s => s.id === payload.fromSizeId)
  const sa = style.addons.find(s => s.id === payload.saId)
  if (!size || !sa) { dragPayload.value = null; poolDragOver.value = false; return }
  const ov = size._overrides || {}
  try {
    await artistApi.setSizeOverrides(style.id, size.id, [{ style_addon_id: sa.id, price_override: ov[sa.id]?.price_override ?? null, is_hidden: true }])
    if (!size._overrides) size._overrides = {}
    size._overrides[sa.id] = { price_override: ov[sa.id]?.price_override ?? null, is_hidden: true }
    ElMessage.success(t('styleManage.addonDisabled', { size: size.name, name: sa.template_name }))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    dragPayload.value = null
    poolDragOver.value = false
  }
}

/** 预载各尺寸覆盖 → size._overrides = { [styleAddonId]: { price_override, is_hidden } } */
async function preloadOverrides(styleList) {
  await Promise.all(styleList.map(async style => {
    await Promise.all((style.sizes || []).map(async size => {
      try {
        const overrides = await artistApi.setSizeOverrides(style.id, size.id, []) // 空 items = 只读
        size._overrides = {}
        for (const o of overrides) {
          size._overrides[o.style_addon_id] = { price_override: o.price_override, is_hidden: !!o.is_hidden }
        }
      } catch {
        size._overrides = {}
      }
    }))
  }))
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
    await preloadOverrides(styles.value) // REQ-036: 预载覆盖（池/摘要/弹窗依赖 size._overrides）
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)

// REQ-036 批A (任务1-1): 暴露 reload —— TierManage 切回「画风与价格」tab 时调用，修复增项库建模板后切回不刷新
defineExpose({ reload: load })
</script>

<style scoped>
/* ═══ v0.38 第二批: 纸墨 token 换肤（REQ-026） ═══ */
/* v0.35 波1: 多画风开关栏 */
.multi-style-bar {
  margin-bottom: 16px; padding: 12px 16px;
  background: var(--card); border: 1px solid var(--line); border-radius: var(--r-l);
}
.multi-style-head { display: flex; align-items: center; gap: 12px; }
.multi-style-label { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink); }
.multi-style-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); margin: 6px 0 0; line-height: 1.5; }

.style-grid { display: flex; flex-direction: column; gap: 20px; }
/* A3: 拖拽幽灵 */
.ghost { opacity: 0.4; }
.style-card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.style-card-name { font-size: calc(var(--font-scale, 1) * 16px); font-weight: 700; font-family: var(--f-d); color: var(--ink); display: flex; align-items: center; gap: 8px; }
.style-card-actions { display: flex; align-items: center; gap: 4px; }
/* A3: 画风卡片拖拽柄 */
.style-drag-handle { cursor: grab; font-size: calc(var(--font-scale, 1) * 16px); color: var(--ink3); padding: 0 2px; }
.style-drag-handle:hover { color: var(--hq); }
.style-drag-handle:active { cursor: grabbing; }
/* F2: 开关关闭时非默认画风灰色 */
.style-card--locked { opacity: 0.65; }
.style-card-body--locked { pointer-events: none; }
.style-locked-hint {
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--th);
  background: var(--th-t);
  padding: 6px 10px; border-radius: var(--r-s); margin: 0 0 10px;
}
.style-desc { font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2); margin: 0 0 12px; line-height: 1.6; }
.style-cover { margin-bottom: 12px; }
.style-cover-img { width: 120px; height: 80px; border-radius: var(--r-m); border: 1px solid var(--line); }

.style-section { margin-top: 16px; padding-top: 12px; border-top: 1px dashed var(--line); }
.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.section-head .section-title { margin: 0; }
.section-title { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink); margin: 0 0 10px; }
/* 价格数字墨色不上色铁律（REQ §1.1），文楷落款感 */
.size-price { font-variant-numeric: tabular-nums; color: var(--ink); font-weight: 600; font-family: var(--f-d); }

/* A3: 尺寸行列表（替代原 el-table，支持拖拽） */
.size-row-list { display: flex; flex-direction: column; gap: 6px; }
.size-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: var(--r-m);
  background: var(--paper2); border: 1px solid var(--line);
}
.size-drag-handle { cursor: grab; font-size: calc(var(--font-scale, 1) * 15px); color: var(--ink3); flex-shrink: 0; }
.size-drag-handle:hover { color: var(--hq); }
.size-drag-handle:active { cursor: grabbing; }
.size-row-thumb { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.size-row-main { flex: 1; min-width: 0; }
.size-row-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.size-row-name { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.size-row-desc {
  font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); margin: 3px 0 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.size-row-actions { display: flex; gap: 2px; flex-shrink: 0; }
/* 尺寸缩略图 */
.size-thumb { width: 44px; height: 34px; border-radius: var(--r-s); border: 1px solid var(--line); vertical-align: middle; }
.size-thumb-empty { color: var(--ink4); }
.size-thumb-tag { transform: scale(0.9); }

.addon-tpl-name { font-size: calc(var(--font-scale, 1) * 14px); font-weight: 500; color: var(--ink); }

/* ═══ REQ-036 批A: 加购项池（双入口 + 胶囊 + 拖拽） ═══ */
.addon-pool-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.addon-pool {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  min-height: 44px; padding: 10px 12px;
  background: var(--paper2); border: 1px dashed var(--line2); border-radius: var(--r-m);
  transition: border-color 0.18s, background 0.18s;
}
.addon-pool.pool--drag-over { border-color: var(--hq); border-style: solid; background: var(--hq-t); }
.pool-empty { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink4); }
.pool-hint { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink3); margin: 6px 0 0; }
.addon-cap {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 20px;
  background: var(--card); border: 1px solid var(--line); box-shadow: var(--sh-1);
  cursor: pointer; user-select: none; transition: border-color 0.15s, transform 0.15s;
}
.addon-cap:hover { border-color: var(--hq); }
.addon-cap:active { transform: scale(0.97); }
.addon-cap .cap-name { font-size: calc(var(--font-scale, 1) * 12.5px); font-weight: 600; color: var(--ink); }
.addon-cap .cap-price { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); font-variant-numeric: tabular-nums; }
.addon-cap .cap-tag {
  font-size: calc(var(--font-scale, 1) * 10.5px); padding: 1px 6px; border-radius: 8px;
  background: var(--line); color: var(--ink3); flex: none;
}
.addon-cap .cap-tag.cap-tag-quantity { background: var(--sl-t); color: var(--sl); }
.addon-cap .cap-tag.cap-tag-radio { background: var(--th-t); color: var(--th); }

/* ═══ REQ-036 批A: 尺寸三态（石绿/藤黄/朱砂，色块+文字） ═══ */
.size-status-seg { display: inline-flex; flex-shrink: 0; border: 1px solid var(--line2); border-radius: 8px; padding: 2px; gap: 2px; background: var(--paper2); }
.seg-btn {
  border: none; background: transparent; padding: 3px 8px; font-size: calc(var(--font-scale, 1) * 11px);
  border-radius: 6px; color: var(--ink3); cursor: pointer; font-family: var(--f-b);
  display: inline-flex; align-items: center; gap: 4px; transition: 0.15s;
}
.seg-btn i { width: 6px; height: 6px; border-radius: 50%; display: inline-block; background: var(--ink4); }
.seg-btn:disabled { cursor: not-allowed; opacity: 0.5; }
.seg-open i { background: var(--sl); }
.seg-show i { background: var(--th); }
.seg-close i { background: var(--zs); }
.seg-btn.on { background: var(--card); color: var(--ink); font-weight: 600; box-shadow: var(--sh-1); }
.seg-btn.seg-open.on { color: var(--sl); }
.seg-btn.seg-show.on { color: var(--th); }
.seg-btn.seg-close.on { color: var(--zs); }
/* 关闭态整行弱化 */
.size-row--dim { opacity: 0.55; }

/* ═══ REQ-036 批A: 尺寸摘要行（§2.7 实时更新，三种计价形态视觉区分） ═══ */
.size-summary {
  margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--line2);
  display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap;
}
.sum-label { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink4); padding-top: 2px; flex: none; }
.sum-chip {
  font-size: calc(var(--font-scale, 1) * 11px); padding: 1px 8px; border-radius: 9px;
  background: var(--hq-t); color: var(--hq); border: 1px solid transparent; cursor: grab;
  animation: chipIn 0.25s ease backwards;
}
.sum-chip.add { background: var(--paper2); color: var(--ink2); border: 1px solid var(--line); }
.sum-chip.qty { background: var(--sl-t); color: var(--sl); }
.sum-chip.mul { background: var(--zhe-t); color: var(--zhe); }
.sum-empty { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink4); }
@keyframes chipIn { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }

.cover-upload { display: flex; align-items: center; gap: 12px; }
.cover-preview { width: 80px; height: 60px; border-radius: var(--r-m); border: 1px solid var(--line); }
.form-hint { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink2); margin: 4px 0 0; }

/* v0.35 波1: 尺寸图设置区 */
.size-image-picker { display: flex; align-items: center; gap: 12px; }
.size-image-preview { width: 90px; height: 70px; border-radius: var(--r-m); border: 1px solid var(--line); flex-shrink: 0; }
.size-image-actions { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }

/* v0.35 波1: 作品集挑选网格 */
.pick-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); margin: 0 0 12px; }
.pick-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px; max-height: 420px; overflow-y: auto;
}
.pick-item {
  position: relative; border-radius: var(--r-m); overflow: hidden; cursor: pointer;
  border: 2px solid transparent; transition: border-color 0.2s, transform 0.2s;
}
.pick-item:hover { border-color: var(--hq); box-shadow: var(--sh-1); }
.pick-item:active { transform: translateY(-2px); }
.pick-img { width: 100%; height: 100px; display: block; }
.pick-title {
  display: block; font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink2);
  padding: 3px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* A4: 增项导入弹窗 */
.import-list { max-height: 360px; overflow-y: auto; }
.import-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
/* 价格数字墨色不上色铁律（REQ §1.1） */
.import-price { margin-left: auto; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink); font-variant-numeric: tabular-nums; }
</style>
