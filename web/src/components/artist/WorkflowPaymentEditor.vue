<template>
  <div class="workflow-editor" v-loading="loading">
    <!-- 加载失败错误态 + 重试（不再 toast 后显示空列表） -->
    <div v-if="loadFailed" class="module-error">
      <span>{{ $t('workflow.loadFailed') }}</span>
      <el-button size="small" @click="load">{{ $t('dashboard.retry') }}</el-button>
    </div>
    <template v-else>
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
    </template>
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
/** 流程加载失败（独立错误态 + 重试，不再 toast 后显示空列表） */
const loadFailed = ref(false)
const saving = ref(false)
const stages = ref([])
const dirtyNodes = ref([])
const showHelp = ref(false)

// API 分发：画师端 / 管理员端 / 默认模板
// 默认模板行 → 前端 stages 映射（P1-7: isFinal = 最后一个收款节点）
function mapTemplateRows(rows) {
  const list = (rows || []).map(x => ({
    id: x.id, name: x.name, description: x.description, sortOrder: x.sort_order,
    takesPayment: !!x.takes_payment, basisPoints: x.basis_points, isFinal: false,
    speechTemplate: x.speech_template ?? ''
  }))
  const payNodes = list.filter(s => s.takesPayment)
  if (payNodes.length > 0) payNodes[payNodes.length - 1].isFinal = true
  return { stages: list }
}

// 后端仅提供默认模板的整体 PUT（无逐节点 API）——管理员默认流程编辑器
// 采用「本地编辑 + 整体保存」：每次操作本地改 stages 后立即 saveTemplateAll()，
// 由后端 updateDefaultTemplate 校验兜底（SUM_NOT_100 / BP_TOO_LOW / NO_PAYMENT_NODE）。
const isTemplateAdmin = computed(() => props.mode === 'admin' && !props.artistId)

// 与 server workflow.service.ts 常量保持一致
const TPL_MIN_BP = 500
const TPL_TOTAL_BP = 10000
const TPL_MAX_INSTALLMENTS = 20
const TPL_NEW_BP = 1000

// 本地临时 id（保存成功后由后端真实 id 覆盖）
let tplTempId = 0
function nextTplId() { return --tplTempId }

// 对齐后端 recalcFinal：尾款 = 10000 - 其他收款节点之和
function recalcFinalLocal() {
  const pays = stages.value.filter(s => s.takesPayment)
  const final = pays[pays.length - 1]
  if (!final) return
  const othersSum = pays.filter(s => s.id !== final.id).reduce((sum, s) => sum + (s.basisPoints || 0), 0)
  final.basisPoints = TPL_TOTAL_BP - othersSum
}

// 重算 isFinal（最后一个收款节点）——对齐后端 findFinal
function refreshIsFinalLocal() {
  const pays = stages.value.filter(s => s.takesPayment)
  for (const s of stages.value) s.isFinal = false
  if (pays.length > 0) pays[pays.length - 1].isFinal = true
}

// 整体保存：组装完整 nodes（PUT schema 只收 name/description/takesPayment/basisPoints，
// 非收款节点不传 basisPoints——传 0 会触发 minimum:500 校验失败）
// 保存前统一重算比例守恒（对齐后端 recalcFinal：尾款 = 10000 - 其他收款之和），
// 覆盖「比例条只传非尾款节点、尾款未同步」的场景。
async function saveTemplateAll() {
  recalcFinalLocal()
  refreshIsFinalLocal()
  const nodes = stages.value.map(s => ({
    name: s.name,
    // 后端 schema description 非 nullable：传空串（service 层 '' || null → null）
    description: s.description || '',
    takesPayment: !!s.takesPayment,
    ...(s.takesPayment ? { basisPoints: s.basisPoints ?? 0 } : {})
  }))
  const res = await adminApi.updateDefaultWorkflow(nodes)
  stages.value = mapTemplateRows(res).stages
  dirtyNodes.value = []
  return stages.value
}

// 管理员默认流程：话术保存拦截（后端模板表无 speech 列，PUT schema 拒收）
function templateSpeechBlocked() {
  ElMessage.info(t('workflow.templateNoSpeech'))
}

const api = computed(() => {
  if (props.mode === 'template') {
    return {
      get: () => adminApi.getDefaultWorkflow().then(mapTemplateRows),
      add: (_d) => Promise.reject(new Error('模板不支持添加')),
      update: () => Promise.reject(new Error('模板不支持编辑')),
      del: () => Promise.reject(new Error('模板不支持删除')),
      reorder: () => Promise.reject(new Error('模板不支持排序')),
      save: (nodes) => adminApi.updateDefaultWorkflow(nodes)
    }
  }
  if (props.mode === 'admin' && !props.artistId) {
    // 仅 get/save 供 load()/savePayment 复用；结构操作走 handler 的本地分支
    return {
      get: () => adminApi.getDefaultWorkflow().then(mapTemplateRows),
      add: () => Promise.reject(new Error('管理员默认模板走本地编辑')),
      update: () => Promise.reject(new Error('管理员默认模板走本地编辑')),
      del: () => Promise.reject(new Error('管理员默认模板走本地编辑')),
      reorder: () => Promise.reject(new Error('管理员默认模板走本地编辑')),
      save: (dirtyNodes) => {
        // 比例条：用 dirtyNodes 覆盖本地比例后整体保存
        const overrides = new Map((dirtyNodes || []).map(n => [n.id, n.basisPoints]))
        for (const s of stages.value) {
          if (s.takesPayment && overrides.has(s.id)) s.basisPoints = overrides.get(s.id)
        }
        return saveTemplateAll()
      }
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
  loadFailed.value = false
  try {
    const res = await api.value.get()
    stages.value = res.stages || res
  } catch {
    loadFailed.value = true
  }
  finally { loading.value = false }
}

// ─── 即时操作 ───

async function onReorder(orderedIds) {
  if (isTemplateAdmin.value) {
    try {
      // 本地重排 + 尾款可能易主 → 重算
      const map = new Map(stages.value.map(s => [s.id, s]))
      stages.value = orderedIds.map(id => map.get(id)).filter(Boolean)
      recalcFinalLocal()
      refreshIsFinalLocal()
      await saveTemplateAll()
    } catch (err) { ElMessage.error(err.message); await load() }
    return
  }
  try {
    const res = await api.value.reorder(orderedIds)
    stages.value = res.stages || res
  } catch (err) { ElMessage.error(err.message); await load() }
}

async function onAdd({ name }) {
  if (isTemplateAdmin.value) {
    try {
      // 本地新增：默认不收款，插入到列表末尾（保存后由后端排序）
      stages.value.push({ id: nextTplId(), name, description: '', sortOrder: stages.value.length + 1, takesPayment: false, basisPoints: null, isFinal: false, speechTemplate: '' })
      await saveTemplateAll()
    } catch (err) { ElMessage.error(err.message); await load() }
    return
  }
  try {
    await api.value.add({ name })
    await load()
  } catch (err) { ElMessage.error(err.message) }
}

async function onRename(id, name) {
  if (isTemplateAdmin.value) {
    try {
      const s = stages.value.find(x => x.id === id)
      if (s) s.name = name
      await saveTemplateAll()
    } catch (err) { ElMessage.error(err.message); await load() }
    return
  }
  try {
    await api.value.update(id, { name })
    await load()
  } catch (err) { ElMessage.error(err.message) }
}

async function onUpdateDesc(id, description) {
  if (isTemplateAdmin.value) {
    try {
      const s = stages.value.find(x => x.id === id)
      if (s) s.description = description
      await saveTemplateAll()
    } catch (err) { ElMessage.error(err.message); await load() }
    return
  }
  try {
    await api.value.update(id, { description })
    await load()
  } catch (err) { ElMessage.error(err.message) }
}

// plan-node-speech：保存节点话术（PUT 时附带 speechTemplate + randomTemplate 字段，v0.27）
async function onUpdateSpeech(id, { speechTemplate, randomTemplate }) {
  // 管理员默认流程：模板无话术字段（后端表无列 + PUT schema 拒收）→ 诚实拦截
  if (isTemplateAdmin.value) { templateSpeechBlocked(); return }
  try {
    await api.value.update(id, { speechTemplate, randomTemplate })
    await load()
    ElMessage.success(t('workflow.speechSaved'))
  } catch (err) { ElMessage.error(err.message); await load() }
}

async function onTogglePay(id, val) {
  // R22: 有未保存比例时先自动保存
  if (dirtyNodes.value.length > 0 && !await savePayment()) return
  if (isTemplateAdmin.value) {
    try {
      const s = stages.value.find(x => x.id === id)
      if (!s || s.takesPayment === val) return
      // 对齐后端 updateStage 收款切换：开启从尾款扣；关闭并入尾款
      const pays = stages.value.filter(x => x.takesPayment)
      const final = pays[pays.length - 1]
      if (val) {
        if (s.isFinal) return // 尾款已是收款节点
        if (pays.length >= TPL_MAX_INSTALLMENTS) { ElMessage.warning(t('workflow.maxInstallments')); return }
        let newBp = TPL_NEW_BP
        if (final && final.basisPoints - newBp < TPL_MIN_BP) newBp = final.basisPoints - TPL_MIN_BP
        if (newBp < TPL_MIN_BP) { ElMessage.warning(t('workflow.finalTooLow')); return }
        s.takesPayment = true
        s.basisPoints = newBp
        if (final) final.basisPoints -= newBp
      } else {
        if (s.isFinal) { ElMessage.warning(t('workflow.finalCannotDisable')); return }
        if (final && final.id !== s.id) final.basisPoints += s.basisPoints
        s.takesPayment = false
        s.basisPoints = null
      }
      refreshIsFinalLocal()
      await saveTemplateAll()
    } catch (err) { ElMessage.error(err.message); await load() }
    return
  }
  try {
    await api.value.update(id, { takesPayment: val })
    await load()
  } catch (err) { ElMessage.error(err.message); await load() }
}

async function onDelete(id) {
  if (dirtyNodes.value.length > 0 && !await savePayment()) return
  if (isTemplateAdmin.value) {
    try {
      const s = stages.value.find(x => x.id === id)
      if (!s) return
      if (s.isFinal) { ElMessage.warning(t('workflow.finalCannotDelete')); return }
      // 对齐后端 deleteStage：收款节点比例并入尾款
      if (s.takesPayment) {
        const pays = stages.value.filter(x => x.takesPayment && x.id !== id)
        const final = pays[pays.length - 1]
        if (final) final.basisPoints += s.basisPoints
      }
      stages.value = stages.value.filter(x => x.id !== id)
      refreshIsFinalLocal()
      await saveTemplateAll()
    } catch (err) { ElMessage.error(err.message); await load() }
    return
  }
  try {
    await api.value.del(id)
    await load()
  } catch (err) { ElMessage.error(err.message) }
}

async function onDetach(id) {
  // Q弹拖离 = 关闭收款
  if (dirtyNodes.value.length > 0 && !await savePayment()) return
  if (isTemplateAdmin.value) {
    try {
      const s = stages.value.find(x => x.id === id)
      if (!s || !s.takesPayment) return
      if (s.isFinal) { ElMessage.warning(t('workflow.finalCannotDisable')); return }
      const pays = stages.value.filter(x => x.takesPayment && x.id !== id)
      const final = pays[pays.length - 1]
      if (final) final.basisPoints += s.basisPoints
      s.takesPayment = false
      s.basisPoints = null
      refreshIsFinalLocal()
      await saveTemplateAll()
      ElMessage.info(t('workflow.detached'))
    } catch (err) { ElMessage.error(err.message); await load() }
    return
  }
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
    // 批4 B10（方案 b）：活跃订单存在时后端附 appliesToNewOrdersOnly，提示仅影响新订单
    if (res.appliesToNewOrdersOnly) ElMessage.info(t('workflow.paymentNewOrdersOnly'))
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
/* 加载失败错误态（对齐 dashboard module-error） */
.module-error {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 24px 0; font-size: calc(var(--font-scale, 1) * 13px); color: var(--ink2);
}
</style>
