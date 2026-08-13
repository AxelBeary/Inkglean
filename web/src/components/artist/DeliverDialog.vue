<!--
  DeliverDialog — 交付弹窗（共享组件，OrderDetail 与 QueueBoard 复用）
  方案 B：修复工作流订单最后节点交付卡死
  提供两种交付方式：
    1. 上传交付文件（原流程）
    2. 无文件交付（画师确认本单无需交付文件）
  props: modelValue(显隐) + orderId
  emit: update:modelValue / delivered(交付成功后回传最新订单)
-->
<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="$t('orderDetail.deliverTitle')"
    width="420px"
  >
    <!-- 交付方式切换 -->
    <el-radio-group v-model="mode" style="margin-bottom: 14px">
      <el-radio-button value="file">{{ $t('deliverMode.file') }}</el-radio-button>
      <el-radio-button value="noFile">{{ $t('deliverMode.noFile') }}</el-radio-button>
    </el-radio-group>

    <!-- 模式一：上传文件 -->
    <template v-if="mode === 'file'">
      <el-upload
        drag :auto-upload="false" :limit="1" :file-list="deliverFileList"
        :on-change="handleDeliverFile" :on-remove="handleDeliverRemove"
        accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.psd,.ai,.tiff,.pdf,.zip,.rar,.7z,.mp4,.mov,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md"
        @dragenter.capture="guardDragEnter"
        @dragover.capture="guardDragOver"
        @drop.capture="guardDrop"
      >
        <button
          type="button" class="deliver-upload-btn"
          :aria-label="$t('orderDetail.dragUpload')"
        >
          <el-icon style="font-size: calc(var(--font-scale, 1) * 40px); color: var(--ink3)"><Upload /></el-icon>
        </button>
        <p>{{ $t('orderDetail.dragUpload') }}</p>
        <template #tip>
          <div class="el-upload__tip">{{ $t('orderDetail.uploadTip') }}</div>
        </template>
      </el-upload>
    </template>

    <!-- 模式二：无文件交付 -->
    <template v-else>
      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 8px">
        <span>{{ $t('deliverMode.noFileHint') }}</span>
      </el-alert>
    </template>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">{{ $t('common.cancel') }}</el-button>
      <el-button
        type="primary"
        :loading="delivering"
        :disabled="mode === 'file' && !deliverFile"
        @click="submitDeliver"
      >
        {{ $t('orderDetail.confirmDeliver') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { artistApi, uploadApi } from '../../api/index.js'
import { useDropGuard } from '../../composables/useDropGuard.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  orderId: { type: [Number, String], required: true }
})
const emit = defineEmits(['update:modelValue', 'delivered'])

const { t } = useI18n()

// G1: 页内拖拽守卫（捕获阶段挂在 el-upload 上，抢在 EP dragger 之前拦截）
const { guardDragEnter, guardDragOver, guardDrop } = useDropGuard()

const mode = ref('file') // 'file' | 'noFile'
const deliverFile = ref(null)
const deliverFileList = ref([])
const delivering = ref(false)

// P2-12: 交付文件前端校验（对齐 OrderDetail / 后端 upload.routes DELIVER_ALLOWED）
const DELIVER_MAX_SIZE = 50 * 1024 * 1024 // 50MB
const DELIVER_ALLOWED_EXT = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp',
  '.psd', '.ai', '.tiff', '.pdf',
  '.zip', '.rar', '.7z',
  '.mp4', '.mov',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.md'
]

// 每次打开弹窗时重置状态
watch(() => props.modelValue, (open) => {
  if (open) {
    mode.value = 'file'
    deliverFile.value = null
    deliverFileList.value = []
  }
})

function handleDeliverFile(file) {
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
  if (!DELIVER_ALLOWED_EXT.includes(ext)) {
    ElMessage.error(t('orderDetail.invalidFileType'))
    return
  }
  if (file.size > DELIVER_MAX_SIZE) {
    ElMessage.error(t('orderDetail.fileTooLarge'))
    return
  }
  deliverFile.value = file.raw
}

function handleDeliverRemove() {
  deliverFile.value = null
}

async function submitDeliver() {
  if (mode.value === 'file' && !deliverFile.value) return

  if (mode.value === 'noFile') {
    // 无文件交付：二次确认（高代价不可逆操作）
    try {
      await ElMessageBox.confirm(
        t('deliverMode.noFileConfirm'),
        t('orderDetail.deliverTitle'),
        { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
      )
    } catch {
      return // 用户取消
    }
  }

  delivering.value = true
  try {
    let updated
    if (mode.value === 'file') {
      const uploaded = await uploadApi.deliverable(deliverFile.value)
      updated = await artistApi.deliver(props.orderId, {
        filePath: uploaded.filePath,
        fileName: uploaded.originalName
      })
    } else {
      updated = await artistApi.deliverNoFile(props.orderId)
    }
    emit('update:modelValue', false)
    emit('delivered', updated)
    ElMessage.success(t('orderDetail.deliverSuccess'))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    delivering.value = false
  }
}
</script>

<style scoped>
/* 键盘可达：el-upload dragger 内包真实按钮（点击冒泡到 EP 触发文件选择） */
.deliver-upload-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0; border: none; background: none; cursor: pointer;
  color: inherit; font: inherit;
}
.deliver-upload-btn:focus-visible { outline: 2px solid var(--hq); outline-offset: 2px; }
</style>
