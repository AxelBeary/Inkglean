<template>
  <!-- REQ-043 I6-a: 从 ArtStyleManager 拆出（拆出时纯搬移零行为变化）；
       F0200 起 uploadSizeImage/removeSizeImage/saveSize/关闭分支带 staged 孤儿图清理（见 script 内 F0200 注释） -->
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
      <!-- 迁移 v81: 档位含几次免费修改（0 = 不限；下单时快照进订单，之后改档位不影响已有订单） -->
      <el-form-item :label="$t('revision.limitLabel')">
        <el-input-number v-model="sizeForm.free_revisions" :min="0" :max="99" :step="1" :precision="0" style="width: 100%" />
        <p class="form-hint">{{ $t('revision.unlimitedHint') }}</p>
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

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import type { PropType } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadRequestOptions } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { artistApi, uploadApi } from '../../api/index'

/** 编辑中的尺寸行（父级列表行结构的最小子集） */
interface SizeEditTarget {
  id: number
  name: string
  base_price: number
  image?: string | null
  image_artwork_id?: number | null
  description?: string | null
  work_days?: number | null
  /** 该档位含几次免费修改（0 = 不限） */
  free_revisions?: number | null
}
/** 作品集条目（挑选尺寸图用） */
interface ArtworkLite {
  id: number
  image_path: string
  title?: string | null
}

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** 尺寸所属画风 id（弹窗保存目标） */
  styleId: { type: Number, default: null },
  /** 编辑对象；null = 新建 */
  size: { type: Object as PropType<SizeEditTarget | null>, default: null },
  /** 作品集（"从作品集挑" + 缩略图解析） */
  artworks: { type: Array as PropType<ArtworkLite[]>, default: () => [] }
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
const sizeForm = reactive({ name: '', base_price: 0, image: '', image_artwork_id: null as number | null, description: '', work_days: null as number | null, free_revisions: 0 })
const pickDialogVisible = ref(false)

// F0200（孤儿图清理·staged 模型）：只跟踪「本弹窗会话内已上传、但尚未被尺寸行引用」的路径——
// 新建模式上传成功后 / 编辑模式 PUT 失败回滚后的文件都登记在此；保存成功的路径随即摘除（已引用不能删），
// 关窗（取消/ESC/遮罩/保存后关闭统一走 watch close 分支）时 fire-and-forget 清理，防误删活图。
const stagedPaths = ref<string[]>([])
// F0200：与后端 /api/upload/cleanup 的 maxItems 同值（超限整单 400），分批提交
const CLEANUP_BATCH = 10

/** F0200: 登记一条未提交的上传路径（同路径重复登记不膨胀） */
function stagePath(path: string) {
  if (path && !stagedPaths.value.includes(path)) stagedPaths.value.push(path)
}

/** F0200: 摘除已提交路径（保存成功后调用——此时文件已被尺寸行引用，关窗清理绝不能带上它） */
function unstagePath(path: string) {
  stagedPaths.value = stagedPaths.value.filter(p => p !== path)
}

/**
 * F0200: 清理一批 staged 路径（fire-and-forget，不阻塞关窗/表单操作）。
 * 失败可见（复用既有通用键 common.networkError——locales 文件不在本批允许改动清单内），
 * 成功无需提示（孤儿回收本来就是无感清理；服务端幂等，ENOENT 按成功对账）。
 */
function cleanupStaged(paths: string[]) {
  if (!paths.length) return
  for (let i = 0; i < paths.length; i += CLEANUP_BATCH) {
    void uploadApi.cleanup(paths.slice(i, i + CLEANUP_BATCH))
      .catch(() => { ElMessage.warning(t('common.networkError')) })
  }
}

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
  if (open) {
    // F0200: 每次打开重置 staged——上个弹窗会话的未提交路径已在它的 close 分支清过，
    // 残留清单若不重置会把上次的孤儿算进本次（早已被删，幂等无害但口径混乱）
    stagedPaths.value = []
    const size = props.size
    if (size) {
      Object.assign(sizeForm, {
        name: size.name,
        base_price: size.base_price,
        image: size.image || '',
        image_artwork_id: size.image_artwork_id || null,
        description: size.description || '',
        work_days: size.work_days ?? null,
        free_revisions: size.free_revisions ?? 0
      })
    } else {
      Object.assign(sizeForm, { name: '', base_price: 0, image: '', image_artwork_id: null, description: '', work_days: null, free_revisions: 0 })
    }
    return
  }
  // F0200: 关闭分支（取消按钮 / ESC / 点遮罩 / 保存成功后 visible=false 全走这里）——
  // staged 剩余即「已上传未被引用」的孤儿，fire-and-forget 清理不阻塞关窗；
  // 保存成功的路径已在 saveSize 摘除，此处不会误删活图；失败弹可见警告（见 cleanupStaged）。
  cleanupStaged(stagedPaths.value)
  stagedPaths.value = []
})

/** 即时保存成功后通知父组件同步列表行（避免整体重载，与原 patchSizeRow 同口径） */
function patchRow(patch: Record<string, unknown>) {
  if (!editingSizeId.value) return
  emit('rowPatch', { styleId: props.styleId, sizeId: editingSizeId.value, patch })
}

/**
 * 尺寸图上传（v0.34 即时保存模式）
 * 编辑已有尺寸：上传成功立即 PUT——失败回滚预览；新建尺寸：只写表单 + 提示「点保存后生效」
 * F0200: 两处「上传落盘但未被尺寸行引用」的状态都登记 staged，未提交即关闭时统一清理。
 */
async function uploadSizeImage({ file }: UploadRequestOptions) {
  sizeUploading.value = true
  const prev = { image: sizeForm.image, image_artwork_id: sizeForm.image_artwork_id }
  try {
    const uploaded = await uploadApi.image(file)
    sizeForm.image = uploaded.filePath
    sizeForm.image_artwork_id = null
    if (editingSizeId.value) {
      try {
        await artistApi.updateStyleSize(props.styleId as number, editingSizeId.value, { image: uploaded.filePath })
        patchRow({ image: uploaded.filePath, image_artwork_id: null })
        ElMessage.success(t('styleManage.sizeImageSavedMsg'))
      } catch (putErr) {
        sizeForm.image = prev.image
        sizeForm.image_artwork_id = prev.image_artwork_id
        // F0200: PUT 失败回滚——刚上传的文件此刻无任何尺寸行引用，登记 staged 关窗时清理
        stagePath(uploaded.filePath)
        ElMessage.error((putErr as Error).message)
      }
    } else {
      // F0200: 新建模式「点保存后才生效」——每次成功上传都登记（后传的替换先传的，先传的同样成孤儿）
      stagePath(uploaded.filePath)
      ElMessage({ type: 'warning', message: t('styleManage.sizeImageUploadHint'), duration: 5000 })
    }
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    sizeUploading.value = false
  }
}

/** 从作品集挑选（点击选择器内的作品） */
async function onPickArtwork(art: ArtworkLite) {
  pickDialogVisible.value = false
  const prev = { image: sizeForm.image, image_artwork_id: sizeForm.image_artwork_id }
  sizeForm.image = ''
  sizeForm.image_artwork_id = art.id
  if (editingSizeId.value) {
    try {
      await artistApi.updateStyleSize(props.styleId as number, editingSizeId.value, { image_artwork_id: art.id })
      patchRow({ image: null, image_artwork_id: art.id })
      ElMessage.success(t('styleManage.sizeImageSavedMsg'))
    } catch (err) {
      sizeForm.image = prev.image
      sizeForm.image_artwork_id = prev.image_artwork_id
      ElMessage.error((err as Error).message)
    }
  } else {
    ElMessage({ type: 'warning', message: t('styleManage.sizeImageUploadHint'), duration: 5000 })
  }
}

/** 移除尺寸图（即时保存模式同上传）
 *  F0200: 移除的若是「本弹窗 staged 未提交」的路径，此刻它已无任何引用——立即清理；
 *  编辑模式先等 PUT 成功再删（PUT 失败表单回滚该路径，删了会指向已不存在的文件）。 */
async function removeSizeImage() {
  const prev = { image: sizeForm.image, image_artwork_id: sizeForm.image_artwork_id }
  sizeForm.image = ''
  sizeForm.image_artwork_id = null
  if (editingSizeId.value) {
    try {
      await artistApi.updateStyleSize(props.styleId as number, editingSizeId.value, { image: null })
      patchRow({ image: null, image_artwork_id: null })
      ElMessage.success(t('styleManage.sizeImageSavedMsg'))
    } catch (err) {
      sizeForm.image = prev.image
      sizeForm.image_artwork_id = prev.image_artwork_id
      ElMessage.error((err as Error).message)
      return // F0200: 回滚即恢复引用态，不动 staged 里的文件
    }
  }
  if (prev.image && stagedPaths.value.includes(prev.image)) {
    unstagePath(prev.image)
    cleanupStaged([prev.image])
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
    const payload: {
      name: string
      base_price: number
      description: string | null
      work_days: number | null
      free_revisions: number
      image_artwork_id?: number | null
      image?: string | null
    } = {
      name: sizeForm.name.trim(),
      base_price: sizeForm.base_price,
      description: sizeForm.description.trim() || null,
      work_days: sizeForm.work_days,
      // 0 = 不限（契约语义）；空值按 0 落库，避免前端留 null 让后端 default 生效前语义漂
      free_revisions: sizeForm.free_revisions ?? 0
    }
    if (sizeForm.image_artwork_id) payload.image_artwork_id = sizeForm.image_artwork_id
    else payload.image = sizeForm.image || null

    if (editingSizeId.value) {
      await artistApi.updateStyleSize(props.styleId as number, editingSizeId.value, payload)
      ElMessage.success(t('styleManage.sizeSaved'))
    } else {
      await artistApi.createStyleSize(props.styleId as number, payload)
      ElMessage.success(t('styleManage.sizeAdded'))
    }
    // F0200: 提交成功 → 本条路径已被尺寸行引用，立即摘出 staged（随后的关窗清理只处理未引用孤儿；
    // image_artwork_id 分支不走这里——上传的图未被提交，留在 staged 由关窗清理回收）
    if (!sizeForm.image_artwork_id && sizeForm.image) unstagePath(sizeForm.image)
    visible.value = false
    emit('saved')
  } catch (err) {
    ElMessage.error((err as Error).message)
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
