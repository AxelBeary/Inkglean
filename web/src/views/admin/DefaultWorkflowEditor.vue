<template>
  <div class="admin-page">
    <!-- 页头 -->
    <div class="admin-page-head">
      <div>
        <h1 class="admin-page-title font-display">{{ $t('admin.defaultWorkflow') }}</h1>
        <p class="admin-page-sub">{{ $t('admin.defaultWorkflowHint') }}</p>
      </div>
    </div>

    <el-card shadow="never" class="admin-section-card admin-section-card--workflow">
      <WorkflowPaymentEditor mode="admin" ref="editorRef" />
    </el-card>

    <!-- 819-I：一行一事——说明在左、重置按钮在右 -->
    <div class="group reset-group">
      <div class="row">
        <div class="reset-text">
          <div class="lab">{{ $t('admin.resetTemplate') }}</div>
          <div class="desc">{{ $t('admin.defaultWorkflowResetHint') }}</div>
        </div>
        <el-button class="reset-btn" @click="resetTemplate" :loading="resetting">
          {{ $t('admin.resetTemplate') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { adminApi } from '../../api/index'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import WorkflowPaymentEditor from '../../components/artist/WorkflowPaymentEditor.vue'

/** WorkflowPaymentEditor 暴露方法宽松形状（本页仅调用 load 重载） */
interface EditorRefLike {
  load: () => Promise<unknown> | void
}

const { t } = useI18n()
const editorRef = ref<EditorRefLike | null>(null)
const resetting = ref(false)

async function resetTemplate() {
  try {
    await ElMessageBox.confirm(t('admin.resetConfirm'), t('admin.resetTemplate'), { type: 'warning' })
    resetting.value = true
    await adminApi.resetDefaultWorkflow()
    ElMessage.success(t('admin.resetDone'))
    editorRef.value?.load()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error((err as Error).message)
  } finally { resetting.value = false }
}
</script>

<style scoped>
/* ═══ v0.45: 管理后台重设计（02-派工-管理后台重设计-20260807） ═══ */
.admin-page { }

.admin-section-card--workflow { max-width: 760px; }

/* 819-I：分组卡片 + 一行一事（对齐 QuickNote 基准） */
.group {
  max-width: 760px;
  margin-top: 16px;
  padding: 4px 24px 12px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-l);
  box-shadow: var(--sh-1);
}
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
  padding: 12px 0; border-top: 1px solid var(--line);
}
.lab { font-size: 15px; color: var(--ink); }
.desc { font-size: 13px; color: var(--ink3); margin-top: 4px; max-width: 520px; }
.reset-text { min-width: 0; }

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
  .reset-btn { width: 100%; }
}
</style>
