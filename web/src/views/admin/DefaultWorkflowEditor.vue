<template>
  <div class="admin-page">
    <el-page-header @back="$router.push('/admin')" :title="$t('admin.backToPanel')" :content="$t('admin.defaultWorkflow')" />
    <el-alert type="info" :closable="false" style="margin: 16px 0">
      {{ $t('admin.defaultWorkflowHint') }}
    </el-alert>
    <el-card style="max-width: 700px">
      <WorkflowPaymentEditor mode="template" ref="editorRef" />
    </el-card>
    <el-button style="margin-top: 12px" @click="resetTemplate" :loading="resetting">
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
.admin-page { max-width: 900px; margin: 0 auto; padding: 16px; }
</style>
