<template>
  <!-- REQ-043 I6-a: 从 ArtStyleManager 拆出——尺寸新建/编辑 + 作品集挑选弹窗（纯搬移，零行为变化） -->
  <el-dialog v-model="visible" :title="editingSizeId ? $t('styleManage.sizeEditTitle') : $t('styleManage.sizeAddTitle')" width="460px" destroy-on-close>
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
      <el-button @click="visible = false">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="sizeSaving" @click="saveSize">{{ $t('common.save') }}</el-button>
    </template>
  </el-dialog>

  <!-- v0.35 波1 (REQ-024 F1): 从作品集挑选尺寸图 -->
  <el-dialog v-model="pickDialogVisible" :title="$t('styleManage.sizePickTitle')" width="640px">
    <p class="pick-hint">{{ $t('styleManage.sizePickHint') }}</p>
    <div v-if="artworks.length" class="pick-grid">
      <button
        v-for="art in artworks" :key="art.id"
        type="button" class="pick-item"
        :aria-label="art.title || $t('styleManage.sizePickTitle')"
        @click="onPickArtwork(art)"
      >
        <el-image :src="`/uploads/${art.image_path}`" fit="cover" class="pick-img" />
        <span v-if="art.title" class="pick-title">{{ art.title }}</span>
      </button>
    </div>
    <el-empty v-else :description="$t('styleManage.sizePickEmpty')" :image-size="60" />
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { artistApi, uploadApi } from '../../api/index.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 尺寸所属画风 id（弹窗保存目标） */
  styleId: { type: Number, default: null },
  /** 编辑对象；null = 新建 */
  size: { type: Object, default: null },
  /** 作品集（"从作品集挑" + 缩略图解析） */
  artworks: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue', 'saved', 'rowPatch'])
const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const editingSizeId = computed(() => props.size?.id ?? null)
const sizeSaving = ref(false)
const sizeUploading = ref(false)
const sizeForm = reactive({ name: '', base_price: 0, image: '', image_artwork_id: null, description: '', work_days: null })
const pickDialogVisible = ref(false)

/** 弹窗内当前预览图 */
const sizeFormPreview = computed(() => {
  if (sizeForm.image_artwork_id) {
    const art = props.artworks.find(a => a.id === sizeForm.image_artwork_id)
    if (art) return art.image_path
  }
  return sizeForm.image || ''
})

/** 打开时按当前编辑对象初始化表单（与旧 openSizeDialog 同口径） */
watch(() => props.modelValue, (open) => {
  if (!open) return
  const size = props.size
  if (size) {
    Object.assign(sizeForm, {
      name: size.name,
      base_price: size.base_price,
      image: size.image || '',
      image_artwork_id: size.image_artwork_id || null,
      description: size.description || '',
      work_days: size.work_days ?? null
    })
  } else {
    Object.assign(sizeForm, { name: '', base_price: 0, image: '', image_artwork_id: null, description: '', work_days: null })
  }
})

/** 即时保存成功后通知父组件同步列表行（避免整体重载，与原 patchSizeRow 同口径） */
function patchRow(patch) {
  if (!editingSizeId.value) return
  emit('rowPatch', { styleId: props.styleId, sizeId: editingSizeId.value, patch })
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
        await artistApi.updateStyleSize(props.styleId, editingSizeId.value, { image: uploaded.filePath })
        patchRow({ image: uploaded.filePath, image_artwork_id: null })
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
      await artistApi.updateStyleSize(props.styleId, editingSizeId.value, { image_artwork_id: art.id })
      patchRow({ image: null, image_artwork_id: art.id })
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
      await artistApi.updateStyleSize(props.styleId, editingSizeId.value, { image: null })
      patchRow({ image: null, image_artwork_id: null })
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
      await artistApi.updateStyleSize(props.styleId, editingSizeId.value, payload)
      ElMessage.success(t('styleManage.sizeSaved'))
    } else {
      await artistApi.createStyleSize(props.styleId, payload)
      ElMessage.success(t('styleManage.sizeAdded'))
    }
    visible.value = false
    emit('saved')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    sizeSaving.value = false
  }
}

function openPickDialog() {
  pickDialogVisible.value = true
}
</script>

<style scoped>
.form-hint { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink2); margin: 4px 0 0; }
/* v0.35 波1: 尺寸图设置区 */
.size-image-picker { display: flex; align-items: center; gap: 12px; }
.size-image-preview { width: 90px; height: 70px; border-radius: var(--r-m); border: 1px solid var(--line); flex-shrink: 0; }
.size-image-actions { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
/* v0.35 波1: 作品集挑选网格 */
.pick-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); margin: 0 0 12px; }
.pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px; max-height: 420px; overflow-y: auto;
}
.pick-item {
  position: relative; border-radius: var(--r-m); overflow: hidden; cursor: pointer;
  border: 2px solid transparent; transition: border-color var(--dur-mid), transform var(--dur-mid);
  padding: 0; background: none; font: inherit; color: inherit; text-align: inherit; display: block;
}
.pick-item:focus-visible { outline: 2px solid var(--hq); outline-offset: 2px; }
.pick-item:hover { border-color: var(--hq); box-shadow: var(--sh-1); }
.pick-item:active { transform: translateY(-2px); }
.pick-img { width: 100%; height: 100px; display: block; }
.pick-title {
  display: block; font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink2);
  padding: 3px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
</style>
