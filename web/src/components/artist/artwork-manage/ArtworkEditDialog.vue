<template>
  <!-- v0.35 波3 (REQ-024 F6): 作品编辑弹窗 — 标题/自由描述/档位标注多选，保存即时 PUT
       （F-09 拆分·施工员戊：自 ArtworkManage.vue 原样搬入；两个 PUT 的串行编排与 REQ-042 敏感词提示随弹窗走，
        保存结果照常上报父组件刷新列表；半成功路径仍保持"弹窗不关、刷新回显"口径） -->
  <el-dialog v-model="visible" :title="$t('artworks.editTitle')" width="520px" class="artwork-dialog" destroy-on-close>
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
      <el-button @click="visible = false">{{ $t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="editSaving" @click="saveArtworkEdit">{{ $t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { PropType } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { artistApi } from '../../../api/index'
import type { ArtStyleWithDetails } from '../../../api/types'

/** 编辑中的作品行（ArtworkWithTags 消费子集：仅本弹窗表单用到的字段） */
interface EditArtworkLite {
  id: number
  title: string | null
  description: string | null
  size_tag_ids?: number[]
}

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 编辑对象（父组件当前行；null = 未选中） */
  artwork: { type: Object as PropType<EditArtworkLite | null>, default: null },
  /** 档位标注选项来源（启用画风列表：父组件 onMounted 拉取后下发，与原 artStyles 同源同序） */
  styles: { type: Array as PropType<ArtStyleWithDetails[]>, default: () => [] }
})
const emit = defineEmits(['update:modelValue', 'saved'])
const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const editSaving = ref(false)
const editingArtworkId = computed(() => props.artwork?.id ?? null)
const editForm = reactive({ title: '', description: '', sizeIds: [] as number[] })

/** 档位选项：启用画风×尺寸展平；多画风时「画风 · 尺寸」防歧义（派工要求） */
const sizeOptions = computed(() => {
  const multi = props.styles.length > 1
  return props.styles.flatMap(style =>
    (style.sizes || []).map(size => ({
      value: size.id,
      label: multi ? `${style.name} · ${size.name}` : size.name
    }))
  )
})

/** 打开时按当前编辑对象初始化表单（与原 openEditDialog 的 Object.assign 同口径） */
watch(() => props.modelValue, (open) => {
  if (!open) return
  const art = props.artwork
  Object.assign(editForm, {
    title: art?.title || '',
    description: art?.description || '',
    sizeIds: [...(art?.size_tag_ids || [])]
  })
})

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
      emit('saved') // 半成功不回显：信息已保存，刷新后如实回显
      return
    }
    ElMessage.success(t('artworks.editSaved'))
    visible.value = false
    emit('saved')
  } catch (err) {
    ElMessage.error(t('artworks.editInfoSaveFailed', { reason: err instanceof Error ? err.message : String(err) }))
  } finally {
    editSaving.value = false
  }
}
</script>

<style scoped>
/* ─── 以下样式自 ArtworkManage.vue 原样搬入（选择器/值零改动） ─── */
/* v0.35 波3: 作品编辑弹窗提示 */
.edit-hint { font-size: calc(var(--font-scale, 1) * 11px); color: var(--ink3); margin: 4px 0 0; line-height: 1.5; }
.artwork-dialog :deep(.el-dialog) { border-radius: var(--r-l); }
.artwork-dialog :deep(.el-dialog__title) { font-weight: 700; color: var(--ink); }
</style>
