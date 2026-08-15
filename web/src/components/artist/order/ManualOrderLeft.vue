<template>
  <!-- ═══ 左栏：客户说了什么（v0.42 拆分：自 ManualOrder.vue 拆分搬移，零行为变化） ═══ -->
  <section class="mo-col">
    <h3 class="mo-section">{{ $t('manualOrder.leftTitle') }}</h3>

    <!-- 客户QQ -->
    <el-form-item :label="$t('manualOrder.clientQq')" prop="clientQq">
      <el-input v-model="clientQq" :placeholder="$t('manualOrder.clientQqPlaceholder')" />
    </el-form-item>

    <!-- 参考图上传（大块粘贴区，左栏最显眼位置——画师流程：QQ收图→粘贴→再填其他） -->
    <div class="mo-ref-section">
      <div class="mo-ref-label">
        <span>{{ $t('manualOrder.references') }}</span>
        <el-tooltip :content="$t('manualOrder.refTip')" placement="top">
          <el-icon class="ref-tip-icon"><InfoFilled /></el-icon>
        </el-tooltip>
      </div>
      <!-- F2: 拖拽上传（drag + multiple），保留点击上传；G1: 页内图拖入拦截 -->
      <el-upload
        drag multiple
        :auto-upload="true" :http-request="handleRefUpload"
        accept="image/*" list-type="picture-card" :limit="MAX_IMAGE_COUNT"
        :file-list="refFileList" :on-exceed="() => ElMessage.warning($t('manualOrder.refExceed'))"
        :on-remove="handleRefRemove" class="mo-ref-upload"
        @dragenter.capture="guardDragEnter"
        @dragover.capture="guardDragOver"
        @drop.capture="guardDrop"
      >
        <button type="button" class="upload-trigger-btn" :aria-label="$t('manualOrder.uploadRefLabel')">
          <el-icon :size="24"><Plus /></el-icon>
        </button>
        <template #tip>
          <span class="drag-hint">{{ $t('manualOrder.dragHint') }}</span>
        </template>
      </el-upload>
      <p class="paste-hint">{{ $t('upload.pasteHint') }}</p>
    </div>

    <!-- 客户昵称 -->
    <el-form-item :label="$t('manualOrder.clientName')">
      <el-input v-model="clientName" :placeholder="$t('manualOrder.clientNamePlaceholder')" />
    </el-form-item>

    <!-- 需求描述 -->
    <el-form-item :label="$t('manualOrder.desc')">
      <el-input
        v-model="description" type="textarea" :rows="4"
        :placeholder="$t('manualOrder.descPlaceholder')" maxlength="2000" show-word-limit
      />
    </el-form-item>

    <!-- 优先级 -->
    <el-form-item :label="$t('manualOrder.priority')">
      <el-radio-group v-model="priority">
        <el-radio-button value="high">{{ $t('manualOrder.priorityHigh') }}</el-radio-button>
        <el-radio-button value="medium">{{ $t('manualOrder.priorityMedium') }}</el-radio-button>
        <el-radio-button value="low">{{ $t('manualOrder.priorityLow') }}</el-radio-button>
      </el-radio-group>
    </el-form-item>

    <!-- 截稿日 -->
    <el-form-item :label="$t('manualOrder.deadline')">
      <el-date-picker
        v-model="deadline" type="date" value-format="YYYY-MM-DD"
        :placeholder="$t('manualOrder.deadlinePlaceholder')"
        :disabled-date="disableDeadlineDate"
        clearable style="width: 200px"
      />
    </el-form-item>
    <!-- F3: 开稿日（可选，REQ-018 disabled-date 限今天之前不可选） -->
    <el-form-item :label="$t('manualOrder.startDate')">
      <el-date-picker
        v-model="startDate" type="date" value-format="YYYY-MM-DD"
        :placeholder="$t('manualOrder.startDatePlaceholder')"
        :disabled-date="disableStartDateDate"
        clearable style="width: 200px"
      />
    </el-form-item>

    <!-- QQ通知开关 -->
    <el-form-item>
      <el-checkbox v-model="clientNotify">{{ $t('manualOrder.clientNotify') }}</el-checkbox>
    </el-form-item>

    <!-- 该QQ历史订单面板（输入QQ后防抖500ms自动查询，查询逻辑在父组件） -->
    <div v-if="qqValid" class="mo-history" v-loading="qqHistoryLoading" element-loading-background="transparent">
      <h4 class="mo-history-title">{{ $t('manualOrder.historyTitle') }}</h4>
      <!-- REQ-035 批A: 客户信息卡（有标记/汇总时显示；无则整卡不渲染） -->
      <div v-if="clientProfile" class="mo-client-card">
        <div v-if="clientProfile.tags && clientProfile.tags.length" class="mo-client-tags">
          <el-tag v-for="tag in clientProfile.tags" :key="tag" size="small" class="mo-client-tag">{{ tag }}</el-tag>
        </div>
        <p v-if="clientProfile.note" class="mo-client-note">{{ clientProfile.note }}</p>
        <div v-if="clientSummary" class="mo-client-summary">
          <span>{{ $t('manualOrder.clientSummaryOrders', { n: clientSummary.totalOrders }) }}</span>
          <span>{{ $t('manualOrder.clientSummaryPaid', { amount: formatCents(clientSummary.totalPaidCents) }) }}</span>
          <span>{{ $t('manualOrder.clientSummaryLast', { date: formatDate(clientSummary.lastOrderAt) }) }}</span>
          <el-tag :type="statusType(clientSummary.lastOrderStatus)" size="small">{{ $t(`common.orderStatus.${clientSummary.lastOrderStatus}`) }}</el-tag>
        </div>
      </div>
      <div v-if="qqHistoryLoaded && qqHistory.length === 0" class="mo-history-empty">
        {{ $t('manualOrder.newClient') }}
      </div>
      <div v-else-if="qqHistory.length > 0" class="mo-history-list">
        <div v-for="o in qqHistory" :key="o.id" class="mo-history-item">
          <span class="mo-history-no">{{ o.order_no }}</span>
          <span class="mo-history-tier">{{ o.tier_name || $t('common.custom') }}</span>
          <el-tag :type="statusType(o.status)" size="small">{{ $t(`common.orderStatus.${o.status}`) }}</el-tag>
          <span class="mo-history-date">{{ formatDate(o.created_at) }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue'
import { uploadApi } from '../../../api/index.js'
import { ElMessage } from 'element-plus'
import { Plus, InfoFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { usePasteUpload } from '../../../composables/usePasteUpload.js'
import { useDropGuard } from '../../../composables/useDropGuard.js'
import { formatDateTimeShort } from '../../../utils/datetime.js'
import { formatCents } from '../../../utils/money.js'
import { statusType } from '../../../constants/order.js'
import { getAnonToken } from '../../../utils/track.js'
import { MAX_IMAGE_BYTES, MAX_IMAGE_COUNT, MAX_IMAGE_MB } from '../../../constants/upload.js'

defineProps({
  qqValid: Boolean,
  qqHistory: { type: Array, default: () => [] },
  qqHistoryLoading: Boolean,
  qqHistoryLoaded: Boolean,
  // REQ-035 批A: 客户标记/汇总（父组件并行加载；无标记时 null 不渲染卡片）
  clientProfile: { type: Object, default: null },
  clientSummary: { type: Object, default: null }
})
const emit = defineEmits(['update:uploadedRefs'])

// 客户表单字段（字段级 v-model 双向绑定——vue/no-mutating-props 规范：不直接改 props）
const clientQq = defineModel('clientQq', { type: String, default: '' })
const clientName = defineModel('clientName', { type: String, default: '' })
const description = defineModel('description', { type: String, default: '' })
const priority = defineModel('priority', { type: String, default: 'medium' })
const deadline = defineModel('deadline', { type: String, default: null })
const startDate = defineModel('startDate', { type: String, default: null })
const clientNotify = defineModel('clientNotify', { type: Boolean, default: false })

const { t } = useI18n()

// ─── 参考图上传状态（随卡移入本组件；提交用的路径数组经 emit 同步给父） ───
const refFileList = ref([])
const uploadedRefs = ref([])
const refUidMap = ref(new Map())
watch(uploadedRefs, (list) => emit('update:uploadedRefs', list.slice()), { deep: true })

// ─── 日期选择约束（B1/B2 同 ManualOrder 原实现；today0 在 setup 期构造一次） ───
const today0 = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })()
function disableDeadlineDate(d) {
  if (d < today0) return true
  if (startDate.value) return d < new Date(startDate.value + 'T00:00:00')
  return false
}
function disableStartDateDate(d) {
  if (d < today0) return true
  if (deadline.value) return d > new Date(deadline.value + 'T00:00:00')
  return false
}

// ─── 辅助函数（QQ 历史面板展示） ───
const formatDate = (str) => formatDateTimeShort(str)

// ─── 参考图上传（随卡移入） ───
async function handleRefUpload({ file }) {
  if (file.size > MAX_IMAGE_BYTES) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    ElMessage.warning(t('manualOrder.fileTooBig', { name: file.name, size: sizeMB }))
    // a1: 超限不得按成功处理——throw 让 EP http-request 标记失败，文件不显示为已上传
    throw new Error(t('manualOrder.fileTooBig', { name: file.name, size: sizeMB }))
  }
  // G-7（P2-13 前端侧）: 参考图上传需匿名归属凭证（后端 F-10 契约）
  const anonToken = await getAnonToken()
  if (!anonToken) {
    ElMessage.error(t('manualOrder.anonTokenRequired'))
    throw new Error(t('manualOrder.anonTokenRequired'))
  }
  try {
    const uploaded = await uploadApi.reference(file, { headers: { 'x-anon-token': anonToken } })
    uploadedRefs.value.push(uploaded.filePath)
    refUidMap.value.set(file.uid, uploaded.filePath)
  } catch (err) {
    ElMessage.error(err.message || t('common.uploadFailed'))
    throw err
  }
}

function handleRefRemove(file) {
  const filePath = refUidMap.value.get(file.uid)
  if (filePath) {
    const idx = uploadedRefs.value.indexOf(filePath)
    if (idx > -1) uploadedRefs.value.splice(idx, 1)
    refUidMap.value.delete(file.uid)
  }
}

// ─── 粘贴上传（R5 复用） ───
const { pasteError } = usePasteUpload({
  onFiles: handlePasteRefFiles,
  maxCount: MAX_IMAGE_COUNT,
  maxSizeMB: MAX_IMAGE_MB
})
watch(pasteError, (msg) => { if (msg) ElMessage.warning(msg) })

// G1: 页内拖拽守卫（捕获阶段挂在 el-upload 上，抢在 EP dragger 之前拦截）
const { guardDragEnter, guardDragOver, guardDrop } = useDropGuard()

async function handlePasteRefFiles(files) {
  const anonToken = await getAnonToken()
  if (!anonToken) {
    ElMessage.error(t('manualOrder.anonTokenRequired'))
    return
  }
  for (const file of files) {
    if (refFileList.value.length >= MAX_IMAGE_COUNT) {
      ElMessage.warning(t('manualOrder.refExceed'))
      break // a1: 已达上限提示后跳过剩余，不再中断已上传列表
    }
    // a1: 逐张 catch——单张失败不中断后续，失败有明确提示；成功后才 push 列表
    try {
      const uploaded = await uploadApi.reference(file, { headers: { 'x-anon-token': anonToken } })
      const uid = `paste-${crypto.randomUUID()}`
      uploadedRefs.value.push(uploaded.filePath)
      refUidMap.value.set(uid, uploaded.filePath)
      refFileList.value.push({ name: file.name || 'pasted-image.png', url: `/uploads/${uploaded.filePath}`, uid, status: 'success' })
    } catch (err) {
      ElMessage.error(err.message || t('common.uploadFailed'))
    }
  }
}

// ─── 重置（父组件 resetForm / 提交成功后调用） ───
function reset() {
  refFileList.value = []
  uploadedRefs.value = []
  refUidMap.value.clear()
}
defineExpose({ reset })
</script>

<style scoped>
/* ─── 左栏样式（自 ManualOrder.vue 原样搬入） ─── */
/* 分节标题：H2 思源 15/600，朱砂小方块 mark 呼应卡片头部（REQ §二） */
.mo-section {
  display: flex; align-items: center; gap: 9px;
  font-size: calc(var(--font-scale, 1) * 15px); font-weight: 600;
  color: var(--ink);
  margin: 0 0 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}
.mo-section::before {
  content: '';
  width: 4px; height: 13px;
  background: var(--zs);
  border-radius: 2px 1px 2px 1px;
  flex: none;
}

/* ─── 参考图粘贴区（大块显眼） ─── */
.mo-ref-section {
  border: 2px dashed var(--line2);
  border-radius: var(--r-l);
  padding: 16px;
  background: var(--paper2);
  margin-bottom: 20px;
  transition: border-color var(--dur-mid);
}
.mo-ref-section:hover, .mo-ref-section:focus-within {
  border-color: var(--hq);
}
.mo-ref-label {
  display: flex; align-items: center; gap: 4px;
  font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600;
  color: var(--ink);
  margin-bottom: 10px;
}
.ref-tip-icon {
  color: var(--ink3); cursor: help;
  vertical-align: middle; transition: color var(--dur-mid);
}
.ref-tip-icon:hover { color: var(--hq); }
.mo-ref-upload :deep(.el-upload--picture-card) {
  width: 100%;
  height: 140px;
  /* F4: 46.67×100 细长条根因——固定 100px 高 + 窄父容器；改 16/9 矩形 + 最小高度兜底 */
  /* F4 修正（上传框变大根因，2026-08-07 五号实测 DOM）：EP 2.9 drag+picture-card 把 trigger 渲染进
     el-upload-list--picture-card（flex 容器）内部，aspect-ratio 参与 flex 尺寸协商导致上传后重排撑大；
     改固定高度不参与 flex 协商，list 容器设全宽（见下方新增规则） */
  border-radius: var(--r-m);
}
/* F4 修正：list flex 容器全宽，trigger/item 各自定尺寸不互相挤压 */
.mo-ref-upload :deep(.el-upload-list--picture-card) {
  width: 100%;
}
/* F4: drag 模式下 .el-upload-dragger 包在 picture-card 内——铺满整个虚线区，
   整块可拖拽（用户拍板：保留 drag，整个虚线区域可拖），中间图标垂直居中 */
.mo-ref-upload :deep(.el-upload-dragger) {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  border-radius: var(--r-m);
}
/* F4: 已上传缩略图保持 EP picture-card 默认方形（不被 dragger 铺满样式拉宽） */
.mo-ref-upload :deep(.el-upload-list--picture-card .el-upload-list__item) {
  width: 148px;
  height: 148px;
}
/* F2: 拖拽提示 */
.drag-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }
.paste-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); margin-top: 6px; }

/* 键盘可达：el-upload dragger 内包真实按钮（点击冒泡到 EP 触发文件选择） */
.upload-trigger-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0; border: none; background: none; cursor: pointer;
  color: inherit; font: inherit;
}
.upload-trigger-btn:focus-visible { outline: 2px solid var(--hq); outline-offset: 2px; }

/* ─── QQ 历史订单面板 ─── */
.mo-history {
  margin-top: 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  padding: 14px 16px;
  background: var(--paper2);
  min-height: 60px;
}
.mo-history-title {
  font-size: calc(var(--font-scale, 1) * 13px); font-weight: 700;
  color: var(--ink2);
  margin: 0 0 10px;
}
.mo-history-empty {
  font-size: calc(var(--font-scale, 1) * 14px); color: var(--sl);
  font-weight: 600; padding: 4px 0;
}
.mo-history-list { display: flex; flex-direction: column; gap: 8px; }
.mo-history-item {
  display: flex; align-items: center; gap: 8px;
  font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink);
  flex-wrap: wrap;
}
.mo-history-no { font-weight: 600; font-variant-numeric: tabular-nums; font-family: var(--f-d); }
.mo-history-tier { color: var(--ink2); }
.mo-history-date { color: var(--ink3); font-size: calc(var(--font-scale, 1) * 12px); margin-left: auto; }

/* ─── REQ-035 批A: 客户信息卡（纸墨 token 对齐 mo-history） ─── */
.mo-client-card {
  margin: 0 0 12px;
  padding: 10px 12px;
  background: var(--paper2);
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mo-client-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.mo-client-tag { font-family: var(--f-d); }
.mo-client-note { margin: 0; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink2); line-height: 1.5; }
.mo-client-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink); }
</style>
