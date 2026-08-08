<template>
  <div class="admin-page">
    <!-- 页头 -->
    <div class="page-head">
      <div>
        <h1 class="page-title font-display">{{ $t('admin.defaultWorkflow') }}</h1>
        <p class="page-sub">{{ $t('admin.defaultWorkflowHint') }}</p>
      </div>
    </div>

    <el-card shadow="never" class="section-card">
      <WorkflowPaymentEditor mode="admin" ref="editorRef" />
    </el-card>
    <el-button class="reset-btn" @click="resetTemplate" :loading="resetting">
      {{ $t('admin.resetTemplate') }}
    </el-button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { adminApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import WorkflowPaymentEditor from '../../components/artist/WorkflowPaymentEditor.vue'

const { t } = useI18n()
const editorRef = ref(null)
const resetting = ref(false)

async function resetTemplate() {
  try {
    await ElMessageBox.confirm(t('admin.resetConfirm'), t('admin.resetTemplate'), { type: 'warning' })
    resetting.value = true
    await adminApi.resetDefaultWorkflow()
    ElMessage.success(t('admin.resetDone'))
    editorRef.value?.load()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error(err.message)
  } finally { resetting.value = false }
}
</script>

<style scoped>
/* ═══ v0.45: 管理后台重设计（02-派工-管理后台重设计-20260807） ═══ */
.admin-page { }

/* 页头 */
.page-head { margin-bottom: var(--sp-5, 24px); }
.page-title {
  font-size: var(--fs-page-title, 26px);
  font-weight: 700;
  color: var(--ink);
  margin: 0 0 var(--sp-1, 4px);
  letter-spacing: .02em;
}
.page-sub { margin: 0; font-size: var(--fs-aux, 12.5px); color: var(--ink3); }

.section-card {
  max-width: 760px;
  border-radius: var(--r-l, 11px);
  border: 1px solid var(--line);
}
.reset-btn { margin-top: var(--sp-4, 16px); }
</style>
