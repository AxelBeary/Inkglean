<template>
  <div class="workflow-editor" v-loading="loading">
    <!-- 流程列表 -->
    <div class="list-header">
      <h4 class="section-title">{{ $t('workflow.stageList') }}</h4>
      <el-button text size="small" @click="showHelp = true">{{ $t('workflow.helpBtn') }}</el-button>
    </div>
    <StageListView
      :stages="stages" :readonly="mode === 'template'"
      @reorder="onReorder" @add="onAdd" @rename="onRename"
      @update-desc="onUpdateDesc" @update-speech="onUpdateSpeech"
      @toggle-pay="onTogglePay" @delete="onDelete"
    />

    <!-- 比例条 -->
    <h4 class="section-title" style="margin-top: 20px">{{ $t('workflow.paymentBar') }}</h4>
    <PaymentBar :stages="stages" @change="onBarChange" @detach="onDetach" />

    <!-- 保存比例 -->
    <div class="save-row" v-if="dirtyNodes.length > 0">
      <el-button type="primary" size="small" @click="savePayment" :loading="saving">
        {{ $t('workflow.savePayment') }}
      </el-button>
      <span class="dirty-hint">{{ $t('workflow.unsaved') }}</span>
    </div>

    <!-- 流程全览 -->
    <h4 class="section-title" style="margin-top: 20px">{{ $t('workflow.overview') }}</h4>
    <WorkflowOverviewStrip :stages="stages" />

    <!-- 恢复默认（仅画师端） -->
    <div v-if="mode === 'artist'" class="reset-row">
      <el-button size="small" type="danger" plain @click="onReset">{{ $t('workflow.reset') }}</el-button>
    </div>

    <!-- 使用说明弹窗 -->
    <el-dialog v-model="showHelp" :title="$t('workflow.helpTitle')" width="480px">
      <ul class="help-body">
        <li v-for="(line, i) in $tm('workflow.helpLines')" :key="i">{{ line }}</li>
      </ul>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { artistApi, adminApi } from '../../api/index.js'
import StageListView from './StageListView.vue'
import PaymentBar from './PaymentBar.vue'
import WorkflowOverviewStrip from '../shared/WorkflowOverviewStrip.vue'

const props = defineProps({
  /** null = 画师自己; 数字 = 管理员编辑该画师 */
  artistId: { type: [Number, null], default: null },
  /** 'artist' | 'admin' | 'template' */
  mode: { type: String, default: 'artist' }
})

const { t } = useI18n()
const loading = ref(false)
const saving = ref(false)
const stages = ref([])
const dirtyNodes = ref([])
const showHelp = ref(false)

// API 分发：画师端 / 管理员端 / 默认模板
const api = computed(() => {
  if (props.mode === 'template') {
    return {
      get: () => adminApi.getDefaultWorkflow().then(r => {
        const list = (r || []).map(x => ({
          id: x.id, name: x.name, description: x.description, sortOrder: x.sort_order,
          takesPayment: !!x.takes_payment, basisPoints: x.basis_points, isFinal: false,
          speechTemplate: x.speech_template ?? ''
        }))
        // P1-7: 计算 isFinal（最后一个收款节点）
        const payNodes = list.filter(s => s.takesPayment)
        if (payNodes.length > 0) payNodes[payNodes.length - 1].isFinal = true
        return { stages: list }
      }),
      add: (_d) => Promise.reject(new Error('模板不支持添加')),
      update: () => Promise.reject(new Error('模板不支持编辑')),
      del: () => Promise.reject(new Error('模板不支持删除')),
      reorder: () => Promise.reject(new Error('模板不支持排序')),
      save: (nodes) => adminApi.updateDefaultWorkflow(nodes)
    }
  }
  if (props.artistId) {
    return {
      get: () => adminApi.getArtistWorkflow(props.artistId),
      add: (d) => adminApi.adminAddStage(props.artistId, d),
      update: (id, d) => adminApi.adminUpdateStage(props.artistId, id, d),
      del: (id) => adminApi.adminDeleteStage(props.artistId, id),
      reorder: (ids) => adminApi.adminReorderStages(props.artistId, ids),
      save: (nodes) => adminApi.adminSavePayment(props.artistId, nodes)
    }
  }
  return {
    get: () => artistApi.getWorkflow(),
    add: (d) => artistApi.addStage(d),
    update: (id, d) => artistApi.updateStage(id, d),
    del: (id) => artistApi.deleteStage(id),
    reorder: (ids) => artistApi.reorderStages(ids),
    save: (nodes) => artistApi.savePayment(nodes)
  }
})

async function load() {
  loading.value = true
  try {
    const res = await api.value.get()
    stages.value = res.stages || res
  } catch (err) { ElMessage.error(err.message) }
  finally { loading.value = false }
}

// ─── 即时操作 ───

async function onReorder(orderedIds) {
  try {
    const res = await api.value.reorder(orderedIds)
    stages.value = res.stages || res
  } catch (err) { ElMessage.error(err.message); await load() }
}

async function onAdd({ name }) {
  try {
    await api.value.add({ name })
    await load()
  } catch (err) { ElMessage.error(err.message) }
}

async function onRename(id, name) {
  try {
    await api.value.update(id, { name })
    await load()
  } catch (err) { ElMessage.error(err.message) }
}

async function onUpdateDesc(id, description) {
  try {
    await api.value.update(id, { description })
    await load()
  } catch (err) { ElMessage.error(err.message) }
}

// plan-node-speech：保存节点话术（PUT 时附带 speechTemplate + randomTemplate 字段，v0.27）
async function onUpdateSpeech(id, { speechTemplate, randomTemplate }) {
  try {
    await api.value.update(id, { speechTemplate, randomTemplate })
    await load()
    ElMessage.success(t('workflow.speechSaved'))
  } catch (err) { ElMessage.error(err.message); await load() }
}

async function onTogglePay(id, val) {
  // R22: 有未保存比例时先自动保存
  if (dirtyNodes.value.length > 0 && !await savePayment()) return
  try {
    await api.value.update(id, { takesPayment: val })
    await load()
  } catch (err) { ElMessage.error(err.message); await load() }
}

async function onDelete(id) {
  if (dirtyNodes.value.length > 0 && !await savePayment()) return
  try {
    await api.value.del(id)
    await load()
  } catch (err) { ElMessage.error(err.message) }
}

async function onDetach(id) {
  // Q弹拖离 = 关闭收款
  if (dirtyNodes.value.length > 0 && !await savePayment()) return
  try {
    await api.value.update(id, { takesPayment: false })
    ElMessage.info(t('workflow.detached'))
    await load()
  } catch (err) { ElMessage.error(err.message); await load() }
}

// ─── 比例保存 ───

function onBarChange(nodes) {
  dirtyNodes.value = nodes
}

async function savePayment() {
  if (dirtyNodes.value.length === 0) return true
  saving.value = true
  try {
    const res = await api.value.save(dirtyNodes.value)
    stages.value = res.stages || res
    dirtyNodes.value = []
    ElMessage.success(t('workflow.saved'))
    return true
  } catch (err) { ElMessage.error(err.message); return false }
  finally { saving.value = false }
}

// 离开页面拦截
function beforeUnload(e) {
  if (dirtyNodes.value.length > 0) { e.preventDefault(); e.returnValue = '' }
}

async function onReset() {
  try {
    await ElMessageBox.confirm(t('workflow.resetConfirm'), t('workflow.reset'), {
      confirmButtonText: t('workflow.reset'),
      cancelButtonText: t('common.cancel'),
      type: 'warning'
    })
  } catch { return }
  loading.value = true
  try {
    const res = await artistApi.resetWorkflow()
    stages.value = res.stages || res
    dirtyNodes.value = []
    ElMessage.success(t('workflow.resetDone'))
  } catch (err) { ElMessage.error(err.message) }
  finally { loading.value = false }
}

onMounted(() => {
  load()
  window.addEventListener('beforeunload', beforeUnload)
})

onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload))

defineExpose({ load })
</script>

<style scoped>
/* v0.38 第二批: 纸墨 token（REQ-026） */
.section-title {
  font-size: calc(var(--font-scale, 1) * 14px); font-weight: 600; color: var(--ink);
  margin: 0 0 10px;
}
.save-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.dirty-hint { font-size: calc(var(--font-scale, 1) * 12px); color: var(--th); }
.reset-row { margin-top: 24px; padding-top: 16px; border-top: 1px dashed var(--line); }
.list-header { display: flex; align-items: center; justify-content: space-between; }
.list-header .section-title { margin: 0; }
.help-body { line-height: 1.9; font-size: calc(var(--font-scale, 1) * 14px); color: var(--ink); margin: 0; padding-left: 20px; }
.help-body li { margin-bottom: 6px; }
</style>
