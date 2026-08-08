<template>
  <!-- REQ-015: 手动录单全屏双栏独立页面（原 560px 抽屉 → 独立路由 /orders/new） -->
  <!-- v0.42 拆分：双栏搬到 ManualOrderLeft/ManualOrderRight（props/emit + defineExpose），父组件保留表单骨架/初始化/QQ历史/草稿/结果 -->
  <ArtistLayout>
    <div class="manual-order-page">
      <h2>{{ $t('manualOrder.title') }}</h2>
      <p class="hint">{{ $t('manualOrder.hint') }}</p>

      <!-- REQ-035 §五 MVP-1: 粘贴消息解析入口（顶部） -->
      <div class="mo-toolbar">
        <el-button type="primary" plain :icon="ChatDotRound" @click="openParseDialog">
          {{ $t('manualOrder.parseMessageTitle') }}
        </el-button>
      </div>

      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="large">
        <div class="mo-grid">
          <!-- ═══ 左栏：客户说了什么（客户信息 + 参考图上传 + QQ 历史） ═══ -->
          <ManualOrderLeft
            v-model:clientQq="form.clientQq"
            v-model:clientName="form.clientName"
            v-model:description="form.description"
            v-model:priority="form.priority"
            v-model:deadline="form.deadline"
            v-model:startDate="form.startDate"
            v-model:clientNotify="form.clientNotify"
            :qq-valid="qqValid"
            :qq-history="qqHistory"
            :qq-history-loading="qqHistoryLoading"
            :qq-history-loaded="qqHistoryLoaded"
            :client-profile="clientProfile"
            :client-summary="clientSummary"
            @update:uploaded-refs="uploadedRefs = $event"
            ref="leftRef"
          />
          <!-- ═══ 右栏：怎么录（档位/画风/尺寸/增项/价格/初始状态/提交 + 移动端价格条） ═══ -->
          <ManualOrderRight
            v-model:clientQq="form.clientQq"
            v-model:clientName="form.clientName"
            v-model:tierId="form.tierId"
            v-model:description="form.description"
            v-model:priority="form.priority"
            v-model:deadline="form.deadline"
            v-model:startDate="form.startDate"
            v-model:clientNotify="form.clientNotify"
            v-model:usageMultiplierId="form.usageMultiplierId"
            v-model:rushMultiplierId="form.rushMultiplierId"
            :tiers="tiers"
            :styles="styles"
            :pricing-data="pricingData"
            :subdomain="subdomain"
            :workflow-stages="workflowStages"
            :uploaded-refs="uploadedRefs"
            :validate-form="validateForm"
            @submit-success="onSubmitSuccess"
            @dirty="scheduleDraftSave"
            ref="rightRef"
          />
        </div>
      </el-form>

      <!-- REQ-035 §五 MVP-1: 粘贴消息解析弹窗（解析→确认→回填，不自动提交） -->
      <el-dialog v-model="parseDialogVisible" :title="$t('manualOrder.parseDialogTitle')" width="480px">
        <el-input
          v-model="parseInput"
          type="textarea"
          :rows="6"
          :placeholder="$t('manualOrder.parsePlaceholder')"
          resize="vertical"
        />
        <div class="parse-result" v-if="parseResult">
          <div class="parse-row">
            <span class="parse-key">{{ $t('manualOrder.parseQqLabel') }}</span>
            <el-tag v-if="parseResult.clientQq" type="success">{{ parseResult.clientQq }}</el-tag>
            <span v-else class="parse-empty">{{ $t('manualOrder.parseQqEmpty') }}</span>
          </div>
          <div class="parse-row">
            <span class="parse-key">{{ $t('manualOrder.parseAmountLabel') }}</span>
            <span v-if="parseResult.hints.amount">{{ $t('manualOrder.parseAmountValue', { amount: parseResult.hints.amount }) }}</span>
            <span v-else class="parse-empty">{{ $t('manualOrder.parseNone') }}</span>
          </div>
          <div class="parse-row">
            <span class="parse-key">{{ $t('manualOrder.parseDeadlineLabel') }}</span>
            <span v-if="parseResult.hints.deadline">{{ parseResult.hints.deadline }}</span>
            <span v-else class="parse-empty">{{ $t('manualOrder.parseNone') }}</span>
          </div>
          <p class="parse-tip">{{ $t('manualOrder.parseConfirmTip') }}</p>
        </div>
        <template #footer>
          <el-button @click="parseDialogVisible = false">{{ $t('common.cancel') }}</el-button>
          <el-button type="primary" :disabled="!parseInput.trim()" @click="doParseMessage">
            {{ $t('manualOrder.parseBtn') }}
          </el-button>
          <el-button type="success" :disabled="!parseResult" @click="applyParseResult">
            {{ $t('manualOrder.parseApply') }}
          </el-button>
        </template>
      </el-dialog>

      <!-- 录入成功 -->
      <el-dialog v-model="showResult" :title="$t('manualOrder.resultTitle')" width="400px">
        <el-result icon="success" :title="$t('manualOrder.orderNo', { no: resultNo })">
          <template #sub-title>{{ $t('manualOrder.addedToQueue') }}</template>
          <template #extra>
            <el-button type="primary" @click="$router.push('/queue')">{{ $t('manualOrder.viewQueue') }}</el-button>
            <el-button @click="resetForm">{{ $t('manualOrder.continueEntry') }}</el-button>
          </template>
        </el-result>
      </el-dialog>
    </div>
  </ArtistLayout>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { artistApi, artistPublicApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { trackEvent } from '../../utils/track.js'
import ArtistLayout from '../../components/ArtistLayout.vue'
import ManualOrderLeft from '../../components/artist/order/ManualOrderLeft.vue'
import ManualOrderRight from '../../components/artist/order/ManualOrderRight.vue'
import { parseMessage } from '../../utils/message-parser.js'
import { ChatDotRound } from '@element-plus/icons-vue'

const { t } = useI18n()
const formRef = ref(null)
// REQ-035 §五 MVP-1: 粘贴消息解析（弹窗状态）
const parseDialogVisible = ref(false)
const parseInput = ref('')
const parseResult = ref(null)
const leftRef = ref(null)
const rightRef = ref(null)
const tiers = ref([])
const showResult = ref(false)
const resultNo = ref('')
/** 参考图路径数组（左栏上传后同步；提交时由右栏使用） */
const uploadedRefs = ref([])
const subdomain = ref('')
const pricingData = ref(null)
const styles = ref([])
const workflowStages = ref([])

const form = reactive({
  clientQq: '',
  clientName: '',
  tierId: null,
  description: '',
  priority: 'medium',
  deadline: null,
  startDate: null,
  clientNotify: false,
  usageMultiplierId: null,
  rushMultiplierId: null
})

// ─── REQ-035 §五 MVP-1: 粘贴消息解析（解析→确认→回填，不自动提交） ───
function openParseDialog() {
  parseInput.value = ''
  parseResult.value = null
  parseDialogVisible.value = true
}

function doParseMessage() {
  parseResult.value = parseMessage(parseInput.value)
}

/** 预填后人工确认：只回填识别到的 clientQq/description，金额/日期仅提示不自动填 */
function applyParseResult() {
  const r = parseResult.value
  if (!r) return
  if (r.clientQq) form.clientQq = r.clientQq
  if (r.description) form.description = r.description
  parseDialogVisible.value = false
  ElMessage.success(t('manualOrder.parseApplied'))
}

/** 提交校验（右栏经 prop 调用；函数形式保证取到挂载后的 el-form 实例） */
const validateForm = () => formRef.value?.validate()

const rules = {
  clientQq: [{ required: true, message: () => t('manualOrder.fillClientQq'), trigger: 'blur' }]
}

// 画风模式判定（草稿/回填使用；右栏 UI 联动在 ManualOrderRight 内部）
const isStyleMode = computed(() => styles.value.length > 0)
const isMultiStyle = computed(() => styles.value.length > 1)

// ─── QQ 历史订单（防抖 500ms，客户端过滤——API 零改动） ───
const qqValid = computed(() => /^\d{5,15}$/.test(form.clientQq.trim()))
const qqHistory = ref([])
const qqHistoryLoading = ref(false)
const qqHistoryLoaded = ref(false)
// REQ-035 批A: 客户标记/汇总（与历史订单并行加载；404/失败置 null 不阻塞历史）
const clientProfile = ref(null)
const clientSummary = ref(null)
let qqTimer = null
// 竞态保护：请求序号（慢请求不得覆盖快请求；输入变无效/重置也递增使旧请求失效）
let qqSeq = 0
watch(() => form.clientQq, (qq) => {
  const mySeq = ++qqSeq
  if (qqTimer) clearTimeout(qqTimer)
  const trimmed = (qq || '').trim()
  if (!/^\d{5,15}$/.test(trimmed)) {
    qqHistoryLoading.value = false
    qqHistory.value = []
    qqHistoryLoaded.value = false
    // REQ-035 批A: QQ 无效/切换时清掉上一个客户的标记与汇总
    clientProfile.value = null
    clientSummary.value = null
    return
  }
  qqHistoryLoading.value = true
  qqTimer = setTimeout(async () => {
    try {
      // REQ-035 批A: 历史订单 + 客户标记并行加载（标记 404/失败不影响历史查询）
      const [ordersRes, clientRes] = await Promise.all([
        artistApi.getOrders(undefined, { page: 1, pageSize: 200 }),
        artistApi.getToolsClient(trimmed).catch(() => null)
      ])
      if (mySeq !== qqSeq) return
      const items = ordersRes.items ?? ordersRes
      qqHistory.value = items.filter(o => o.client_qq === trimmed).slice(0, 5)
      const cp = clientRes ? clientRes.profile || null : null
      clientProfile.value = cp
      clientSummary.value = cp ? clientRes.summary || null : null
    } catch {
      if (mySeq !== qqSeq) return
      qqHistory.value = []
      clientProfile.value = null
      clientSummary.value = null
    } finally {
      if (mySeq === qqSeq) {
        qqHistoryLoading.value = false
        qqHistoryLoaded.value = true
      }
    }
  }, 500)
})

// ─── 提交成功（右栏完成 API 写入后回调；副作用集中：结果弹窗/埋点/清草稿） ───
function onSubmitSuccess({ order, postCreateFailed }) {
  resultNo.value = order.order_no
  showResult.value = true
  // 埋点（REQ-033 §4.2）：手动录单提交成功
  trackEvent('artist_action', { action: 'order_create' })
  // F6: 提交成功后清空草稿（下次进入不再弹恢复提示）
  clearDraft()
  if (postCreateFailed) {
    ElMessage.warning(t('manualOrder.postCreateFailed.summary', { orderNo: order.order_no, reason: postCreateFailed }))
  }
}

function resetForm() {
  showResult.value = false
  form.clientQq = ''
  form.clientName = ''
  form.tierId = null
  form.description = ''
  form.priority = 'medium'
  form.deadline = null
  form.startDate = null
  form.clientNotify = false
  form.usageMultiplierId = null
  form.rushMultiplierId = null
  // REQ-015 新增状态重置
  qqHistory.value = []
  qqHistoryLoaded.value = false
  // 子组件内部状态重置（参考图列表/右栏选择与价格）
  leftRef.value?.reset()
  rightRef.value?.reset()
  // F6: 表单重置时同步清空草稿（继续录入 = 已消费旧草稿）
  clearDraft()
}

// ─── F6: 录单草稿暂存（localStorage 自动保存 + 恢复提示，键带 subdomain 后缀隔离画师） ───
// 对齐 useOrderForm R57 实现；差异：localStorage（录单页误关页面场景，session 失效丢数据更痛）、
// 不暂存图片文件对象（只存可序列化字段）；恢复弹窗在画风/档位数据就绪后触发。
// v0.42 拆分：右栏状态（画风三步走/自定义增项/手输价）由 ManualOrderRight 经 getDraftState/setDraftState 协作。
const DRAFT_KEY_PREFIX = 'huiyue_manual_order_draft'
const draftKey = () => (subdomain.value ? `${DRAFT_KEY_PREFIX}_${subdomain.value}` : null)

/** 表单是否有内容（任一字段非空）——有内容才落盘，避免空表单刷新生造草稿键 */
function hasDraftContent() {
  const r = rightRef.value?.getDraftState() || {}
  return form.tierId != null
    // 多画风下"用户主动选了画风"即算；单画风自动选中不算（否则刚进页面就弹恢复框）
    || (isMultiStyle.value && r.styleId != null)
    || r.sizeId != null
    || !!form.description.trim()
    || !!form.clientQq.trim()
    || !!form.clientName.trim()
    || !!form.deadline
    || !!form.startDate
    || form.priority !== 'medium'
    || form.clientNotify
    || Object.values(r.addonSelections || {}).some(s => s && (s.toggled || s.quantity > 0 || s.optionLabel != null))
    || (r.customAddons || []).length > 0
    || r.finalPriceYuan != null
}

function saveDraft() {
  const key = draftKey()
  if (!key) return
  if (!hasDraftContent()) {
    try { localStorage.removeItem(key) } catch { /* 隐私模式等场景忽略 */ }
    return
  }
  const r = rightRef.value?.getDraftState() || {}
  try {
    localStorage.setItem(key, JSON.stringify({
      form: {
        clientQq: form.clientQq,
        clientName: form.clientName,
        tierId: form.tierId,
        description: form.description,
        priority: form.priority,
        deadline: form.deadline,
        startDate: form.startDate,
        clientNotify: form.clientNotify,
        usageMultiplierId: form.usageMultiplierId,
        rushMultiplierId: form.rushMultiplierId
      },
      // 画风三步走状态（styleId/sizeId/增项勾选），恢复时按 isStyleMode 互斥取用
      styleState: { styleId: r.styleId, sizeId: r.sizeId, addonSelections: r.addonSelections },
      // 自定义增项（只存可序列化字段，uid 恢复时重发）
      customAddons: r.customAddons || [],
      // G2: 手输价格恢复（恢复时保留脏标记，避免被重算价格覆盖）
      finalPriceYuan: r.finalPriceYuan,
      priceTouched: r.priceTouched
    }))
  } catch { /* ignore */ }
}

let draftTimer = null
function scheduleDraftSave() {
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(saveDraft, 800)
}

watch([() => form.clientQq, () => form.clientName, () => form.tierId, () => form.description,
  () => form.priority, () => form.deadline, () => form.startDate, () => form.clientNotify,
  () => form.usageMultiplierId, () => form.rushMultiplierId], scheduleDraftSave)
// 画风三步走/增项/自定义增项/手输价变化由 ManualOrderRight emit('dirty') 触发 scheduleDraftSave

/** 清空草稿键（提交成功 / 恢复弹窗取消 / 重置表单时） */
function clearDraft() {
  const key = draftKey()
  if (!key) return
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

/** 把草稿回填到表单（画风/尺寸/增项若已被画师删除则逐项丢弃——右栏 setDraftState 内部校验） */
function applyDraft(draft) {
  const f = draft.form || {}
  form.clientQq = f.clientQq || ''
  form.clientName = f.clientName || ''
  form.description = f.description || ''
  form.priority = f.priority || 'medium'
  form.deadline = f.deadline || null
  form.startDate = f.startDate || null
  form.clientNotify = !!f.clientNotify

  if (isStyleMode.value) {
    // ── 画风模式：tierId 置空，右栏恢复三步走状态 ──
    form.tierId = null
  } else {
    // ── 旧模型（tiers）：档位被删则丢弃该字段 ──
    const tierValid = f.tierId != null && tiers.value.some(tier => tier.id === f.tierId)
    form.tierId = tierValid ? f.tierId : null
    form.usageMultiplierId = tierValid ? (f.usageMultiplierId ?? null) : null
    form.rushMultiplierId = tierValid ? (f.rushMultiplierId ?? null) : null
  }

  // 右栏状态回填（画风三步走/自定义增项/手输价；倍率在尺寸有效时由子组件设置）
  const ss = draft.styleState || {}
  rightRef.value?.setDraftState({
    styleId: ss.styleId,
    sizeId: ss.sizeId,
    addonSelections: ss.addonSelections || {},
    customAddons: draft.customAddons,
    finalPriceYuan: draft.finalPriceYuan,
    priceTouched: draft.priceTouched,
    usageMultiplierId: f.usageMultiplierId,
    rushMultiplierId: f.rushMultiplierId
  })
}

/** 恢复提示：mounted 且画风/档位数据就绪后调用；确认回填，取消/关闭清空草稿键 */
async function restoreDraft() {
  const key = draftKey()
  if (!key) return
  let raw
  try { raw = localStorage.getItem(key) } catch { return }
  if (!raw) return
  let draft
  try { draft = JSON.parse(raw) } catch { return }
  if (!draft || !draft.form) return

  try {
    await ElMessageBox.confirm(t('manualOrder.draftFound'), t('common.confirm'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'info'
    })
    applyDraft(draft)
    ElMessage.success(t('manualOrder.draftRestored'))
  } catch {
    // 用户取消/关闭弹窗 → 清空草稿键（下次进入不再打扰）
    clearDraft()
  }
}

/** 页面关闭/刷新前同步落盘（补防抖窗口内最后一次输入；只保存不拦截，不弹原生确认框） */
function onBeforeUnload() {
  if (draftTimer) { clearTimeout(draftTimer); draftTimer = null }
  saveDraft()
}

// ─── 初始化 ───
onMounted(async () => {
  window.addEventListener('beforeunload', onBeforeUnload)
  try {
    const profile = await artistApi.getProfile()
    subdomain.value = profile.subdomain
    tiers.value = profile.tiers || []
    // 加载价格数据（增项+倍率）——右栏使用
    artistPublicApi.getPricing(profile.subdomain)
      .then(res => { pricingData.value = res })
      .catch(() => {})
    // v0.38 D路: 加载画风列表（失败静默走旧档位模式兜底；单画风自动选中在右栏 watch 处理）
    const stylesPromise = artistPublicApi.getPublicStyles(profile.subdomain)
      .then(res => { styles.value = res || [] })
      .catch(() => {})
    // F4: 加载工作流节点（判断初始状态可达性）——右栏使用
    artistApi.getWorkflow()
      .then(res => { workflowStages.value = res.stages || [] })
      .catch(() => {})
    // F6: 画风/档位数据就绪后检查本地草稿——恢复回填需要 styles 已加载才能匹配画风/尺寸
    await stylesPromise
    await restoreDraft()
  } catch { /* ignore */ }
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  if (draftTimer) { clearTimeout(draftTimer); draftTimer = null }
})
</script>

<style scoped>
/* ═══ v0.38: 全页换肤到纸墨 token（REQ-026 §二；模板与类名不动——测试断言依赖） ═══ */
/* ─── 页面容器（子组件内部样式各自 scoped 搬入） ─── */
.manual-order-page { max-width: 1200px; margin: 0 auto; }
/* H1 页面标题：文楷 28/700（REQ §1.3） */
.manual-order-page h2 {
  font-family: var(--f-d);
  font-size: calc(var(--font-scale, 1) * 28px); font-weight: 700;
  color: var(--ink);
  letter-spacing: .02em;
}
.hint { color: var(--ink3); font-size: calc(var(--font-scale, 1) * 13px); margin-top: 4px; }

/* ─── 双栏网格（≥1024px） ─── */
.mo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  align-items: start;
}

/* ─── 响应式：平板（600–1024px）单栏 ─── */
@media (max-width: 1023px) {
  .mo-grid { grid-template-columns: 1fr; }
}

/* ─── REQ-035 §五 MVP-1: 粘贴消息解析（顶部按钮 + 弹窗结果） ─── */
.mo-toolbar { margin: 12px 0 18px; }
.parse-result {
  margin-top: 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-m);
  padding: 12px 14px;
  background: var(--paper2);
  display: flex; flex-direction: column; gap: 8px;
}
.parse-row { display: flex; align-items: center; gap: 10px; font-size: calc(var(--font-scale, 1) * 13px); }
.parse-key { color: var(--ink2); width: 76px; flex: none; }
.parse-empty { color: var(--ink3); }
.parse-tip { margin: 2px 0 0; font-size: calc(var(--font-scale, 1) * 12px); color: var(--ink3); }

/* ─── 响应式：手机（<600px）底部钉住价格条（价格条本体在 ManualOrderRight） ─── */
@media (max-width: 599px) {
  /* 底部留白，防内容被价格条遮挡 */
  .manual-order-page { padding-bottom: 90px; }
}
</style>
