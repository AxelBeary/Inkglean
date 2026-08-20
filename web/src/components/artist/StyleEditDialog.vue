<template>
  <!-- REQ-043 I6-a: 从 ArtStyleManager 拆出——画风新建/编辑弹窗（纯搬移，零行为变化） -->
  <el-dialog v-model="visible" :title="editingStyleId ? $t('styleManage.styleEditTitle') : $t('styleManage.styleAddTitle')" width="460px" destroy-on-close>
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
          <el-button v-if="styleForm.cover_image" size="small" text type="danger" :loading="coverUploading" @click="removeCover">{{ $t('common.remove') }}</el-button>
        </div>
      </el-form-item>
      <!-- 新建时显示"从增项库导入"勾选 -->
      <el-form-item v-if="!editingStyleId">
        <el-checkbox v-model="styleForm.importAddons">{{ $t('styleManage.styleImportAddons') }}</el-checkbox>
        <p class="form-hint">{{ $t('styleManage.styleImportHint') }}</p>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="styleSaving" @click="saveStyle">{{ $t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import type { PropType } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadRequestOptions } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { artistApi, uploadApi } from '../../api/index'
import type { ArtStyleInput } from '../../api/types'

/** 编辑中的画风行（父级列表行结构的最小子集） */
interface EditStyleLite {
  id: number
  name: string
  description?: string | null
  cover_image?: string | null
}

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 编辑对象；null = 新建 */
  style: { type: Object as PropType<EditStyleLite | null>, default: null }
})
const emit = defineEmits(['update:modelValue', 'saved'])
const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const editingStyleId = computed(() => props.style?.id ?? null)
const styleSaving = ref(false)
const coverUploading = ref(false)
const styleForm = reactive({ name: '', description: '', cover_image: '', importAddons: true })

/** 打开时按当前编辑对象初始化表单（与旧 openCreateStyle/openEditStyle 同口径） */
watch(() => props.modelValue, (open) => {
  if (!open) return
  const style = props.style
  if (style) {
    Object.assign(styleForm, { name: style.name, description: style.description || '', cover_image: style.cover_image || '', importAddons: false })
  } else {
    Object.assign(styleForm, { name: '', description: '', cover_image: '', importAddons: true })
  }
})

/**
 * 封面上传（v0.34 任务2：即时保存，对齐 R48 头像模式）
 * 编辑已有画风：上传成功立即 PUT cover_image——不依赖「确定」，避免"传了图没保存"陷阱（用户 2026-08-03 已踩）
 *   PUT 失败时回滚表单预览，避免"预览显示已保存、实际未保存"的不一致
 * 新建画风：无 id 可保存，只写表单 + 醒目提示「确定后生效」
 */
async function uploadCover({ file }: UploadRequestOptions) {
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
        ElMessage.error((putErr as Error).message)
      }
    } else {
      ElMessage({ type: 'warning', message: t('styleManage.sizeImageUploadHint'), duration: 5000 })
    }
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    coverUploading.value = false
  }
}

/**
 * 移除画风封面：与上传保持一致的「即时 PUT」语义（决策：选即时 PUT 而非显式提交——
 * 上传示例图已是即时保存（R48 头像模式），移除若只改本地会出现"预览已移除、实际未移除"的不一致；
 * 显式提交会引入第二个保存入口，与现有交互割裂）。PUT 失败回滚预览。
 */
async function removeCover() {
  if (!editingStyleId.value) {
    styleForm.cover_image = ''
    return
  }
  coverUploading.value = true
  const prevCover = styleForm.cover_image
  try {
    await artistApi.updateArtStyle(editingStyleId.value, { cover_image: null })
    styleForm.cover_image = ''
    ElMessage.success(t('common.saved'))
  } catch (err) {
    styleForm.cover_image = prevCover // 回滚：预览与实际存储保持一致
    ElMessage.error((err as Error).message)
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
      } as ArtStyleInput & { importAddons: boolean })
    }
    ElMessage.success(t('styleManage.styleSaved'))
    visible.value = false
    emit('saved')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    styleSaving.value = false
  }
}
</script>

<style scoped>
.cover-upload { display: flex; align-items: center; gap: 12px; }
.cover-preview { width: 80px; height: 60px; border-radius: var(--r-m); border: 1px solid var(--line); }
.form-hint { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink2); margin: 4px 0 0; }
</style>
