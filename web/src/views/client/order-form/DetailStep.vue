<template>
  <!-- ── 写需求 + 上传（v0.32: 动态步骤号） ── -->
  <div>
    <h3 class="step-title">{{ t('orderForm.step2Title') }}</h3>

    <!-- R58-4: 灵感标签快捷注入（R58-8: 改为画师自定义标签，未设置时不显示） -->
    <div v-if="inspireTags.length" class="inspire-block">
      <span class="inspire-hint">{{ t('orderForm.inspireHint') }}</span>
      <div class="inspire-tags">
        <button v-for="tag in inspireTags" :key="tag" type="button" class="inspire-tag" @click="appendTag(tag)">{{ tag }}</button>
      </div>
    </div>

    <!-- 需求描述 -->
    <el-form-item :label="t('orderForm.descLabel')" prop="description">
      <el-input
        v-model="description" type="textarea" :rows="5"
        :placeholder="t('orderForm.descPlaceholder')" :maxlength="MAX_DESC_LEN" show-word-limit
      />
    </el-form-item>

    <!-- 参考图上传（P1-4: tooltip 显示详细说明） -->
    <el-form-item>
      <template #label>
        <span>{{ t('orderForm.refLabel') }}</span>
        <el-tooltip :content="t('orderForm.refTip')" placement="top">
          <el-icon class="ref-tip-icon"><InfoFilled /></el-icon>
        </el-tooltip>
      </template>
      <el-upload
        :auto-upload="true" :http-request="uploadRequest"
        accept="image/*" list-type="picture-card" :limit="5"
        :file-list="refFileList" :on-exceed="onExceed"
        :on-remove="uploadRemove"
        @dragenter.capture="guardDragEnter"
        @dragover.capture="guardDragOver"
        @drop.capture="guardDrop"
      >
        <button type="button" class="upload-trigger-btn" :aria-label="t('orderForm.refUpload')">
          <el-icon><Plus /></el-icon>
        </button>
      </el-upload>
      <p class="paste-hint">{{ t('upload.pasteHint') }}</p>
    </el-form-item>

    <!-- 流程与收款预览（R1: 保持原位，增加修改说明告示） -->
    <el-form-item v-if="workflowStages.length || revisionNote" :label="t('orderForm.workflowLabel')">
      <WorkflowOverviewStrip v-if="workflowStages.length" :stages="workflowStages" />
      <div v-if="revisionNote" class="tpl-revision-note">
        <span>
          <strong class="tpl-revision-note-label">{{ t('artistHome.revisionNote') }}</strong>
          {{ revisionNote }}
        </span>
      </div>
    </el-form-item>

    <div class="step-nav">
      <el-button @click="emit('prev')">{{ t('orderForm.prevStep') }}</el-button>
      <el-button type="primary" @click="emit('next')">{{ t('orderForm.nextStep') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Plus, InfoFilled } from '@element-plus/icons-vue'
import WorkflowOverviewStrip from '../../../components/shared/WorkflowOverviewStrip.vue'
import { useDropGuard } from '../../../composables/useDropGuard.js'
import type { RefFileItem, WorkflowStageItem } from './types'

defineProps<{
  /** R58-8: 画师自定义灵感标签（未设置为空数组，不显示） */
  inspireTags: string[]
  workflowStages: WorkflowStageItem[]
  /** 画师修改说明（空串不显示） */
  revisionNote: string
  refFileList: RefFileItem[]
  /** el-upload http-request（composable 参考图上传，含大小/类型/匿名凭证校验） */
  uploadRequest: (options: { file: File }) => Promise<void>
  /** el-upload on-remove（composable 同步移除已上传记录） */
  uploadRemove: (file: { uid: string | number }) => void
}>()

const emit = defineEmits<{
  (e: 'prev'): void
  (e: 'next'): void
}>()

const { t } = useI18n()

/** 需求描述上限（模板 maxlength 与 appendTag 截断共用单一魔数来源） */
const MAX_DESC_LEN = 2000

/** 需求描述（v-model 上报父层 form.description） */
const description = defineModel<string>('description', { default: '' })

// G1: 页内拖拽守卫（参考图上传区统一防御；捕获阶段挂在 el-upload 上）
const { guardDragEnter, guardDragOver, guardDrop } = useDropGuard()

// R58-4: 灵感标签快捷注入（追加到描述尾，中文标点分隔，MAX_DESC_LEN 截断）
function appendTag(tag: string) {
  const sep = description.value && !/[，。、\s]$/.test(description.value) ? '，' : ''
  description.value = `${description.value}${sep}${tag}`.slice(0, MAX_DESC_LEN)
}

/** 超出 5 张限制提示（i18n 文案，与原内联写法一致） */
function onExceed() {
  ElMessage.warning(t('orderForm.refExceed'))
}
</script>

<style scoped>
.step-title {
  font-family: var(--font-display);
  font-size: clamp(18px, 3vw, 22px);
  color: var(--text-primary);
  margin: 0 0 16px;
}
.step-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 24px; }
@media (max-width: 860px) {
  .step-nav { padding-bottom: 64px; }
}

.paste-hint { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
/* P1-4: 参考图说明 tooltip 图标 */
.ref-tip-icon {
  margin-left: 4px;
  color: var(--text-secondary);
  cursor: help;
  vertical-align: middle;
  transition: color var(--dur-mid);
}
.ref-tip-icon:hover { color: var(--color-primary); }

/* ─── R58-4: 灵感标签 ─── */
.inspire-block { margin-bottom: 16px; }
.inspire-hint { font-size: 12px; color: var(--text-secondary); }
.inspire-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.inspire-tag {
  padding: 5px 14px; font-size: 13px; cursor: pointer;
  background: var(--bg-card); color: var(--text-secondary);
  border: 1px dashed var(--border-color-strong); border-radius: 999px;
  transition: transform var(--dur-fast) var(--ease-out), color var(--dur-mid), border-color var(--dur-mid), background var(--dur-mid);
}
.inspire-tag:hover {
  color: var(--color-primary); border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
.inspire-tag:active { transform: translateY(0) scale(0.96); }

/* 键盘可达：el-upload picture-card 触发区包真实按钮（点击冒泡到 EP 触发文件选择） */
.upload-trigger-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0; border: none; background: none; cursor: pointer;
  color: inherit; font: inherit;
}
.upload-trigger-btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
</style>
