<template>
  <!-- REQ-015: 手动录单全屏双栏独立页面（原 560px 抽屉 → 独立路由 /orders/new） -->
  <!-- v0.42 拆分：双栏搬到 ManualOrderLeft/ManualOrderRight（props/emit + defineExpose），父组件保留表单骨架/初始化/QQ历史/草稿/结果 -->
  <div class="manual-order-page">
    <h2>{{ $t('manualOrder.title') }}</h2>
    <p class="hint">{{ $t('manualOrder.hint') }}</p>

    <!-- REQ-035 §五 MVP-1: 粘贴消息解析入口（顶部） -->
    <div class="mo-toolbar">
      <el-button type="primary" plain :icon="ChatDotRound" @click="openParseDialog">
        {{ $t('manualOrder.parseMessageTitle') }}
      </el-button>
    </div>

    <!-- 初始化失败错误态 + 重试（subdomain/报价/画风/工作流任一失败都明示；报价功能失效要有感知） -->
    <el-alert
      v-if="initFailed || stylesFailed || pricingFailed || workflowFailed"
      type="error" :closable="false" show-icon
      style="margin-bottom: 16px"
      :title="$t('manualOrder.initLoadFailed')"
    >
      <el-button size="small" type="primary" style="margin-top: 8px" :loading="initLoading" @click="init">
        {{ $t('dashboard.retry') }}
      </el-button>
    </el-alert>

    <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="large">
      <div class="mo-grid">
        <!-- ═══ 左栏：客户信息（客户信息 + 参考图上传 + QQ 历史） ═══ -->
        <ManualOrderLeft
          v-model:clientQq="form.clientQq"
          v-model:clientName="form.clientName"
          v-model:description="form.description"
          v-model:note="form.note"
          v-model:priority="form.priority"
          v-model:deadline="form.deadline"
          v-model:startDate="form.startDate"
          v-model:clientNotify="form.clientNotify"
          :qq-valid="qqValid"
          :qq-history="qqHistory"
          :qq-history-loading="qqHistoryLoading"
          :qq-history-loaded="qqHistoryLoaded"
          :client-profile="clientProfile"
          :client-summary="(clientSummary as unknown as { totalOrders: number; totalPaidCents: number; lastOrderAt: string; lastOrderStatus: string } | null)"
          @update:uploaded-refs="uploadedRefs = $event"
          ref="leftRef"
        />
        <!-- ═══ 右栏：价格信息（画风/尺寸/增项/价格/初始状态/提交 + 移动端价格条） ═══ -->
        <ManualOrderRight
          v-model:clientQq="form.clientQq"
          v-model:clientName="form.clientName"
          v-model:description="form.description"
          v-model:note="form.note"
          v-model:priority="form.priority"
          v-model:deadline="form.deadline"
          v-model:startDate="form.startDate"
          v-model:clientNotify="form.clientNotify"
          :styles="styles"
          :pricing-data="(pricingData as unknown as Record<string, unknown> | undefined)"
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

    <!-- REQ-035 §五 MVP-1: 粘贴消息解析弹窗（解析→确认→回填，不自动提交）；820 第二批：叠加本地图片识别 -->
    <el-dialog v-model="parseDialogVisible" :title="$t('manualOrder.parseDialogTitle')" width="480px">
      <!-- 820: paste 事件在容器层拦截图片粘贴（文字粘贴不拦截，照旧进文本框） -->
      <div @paste="onParsePaste">
        <el-input
          v-model="parseInput"
          type="textarea"
          :rows="6"
          :placeholder="$t('manualOrder.parsePlaceholder')"
          resize="vertical"
        />
        <div class="parse-ocr-row">
          <el-button size="small" :icon="Picture" :loading="ocrBusy" @click="ocrFileInput?.click()">
            {{ $t('manualOrder.parseImageBtn') }}
          </el-button>
          <span class="parse-tip">{{ ocrBusy ? $t('manualOrder.parseImageBusy') : $t('manualOrder.parseImageTip') }}</span>
          <input
            ref="ocrFileInput"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/bmp,image/gif"
            style="display:none"
            @change="onOcrPick"
          >
        </div>
      </div>
      <div class="parse-result" v-if="parseResult">
        <div class="parse-row">
          <span class="parse-key">{{ $t('manualOrder.parseQqLabel') }}</span>
          <el-tag v-if="parseResult.clientQq" type="success">{{ parseResult.clientQq }}</el-tag>
          <span v-else class="parse-empty">{{ $t('manualOrder.parseQqEmpty') }}</span>
        </div>
        <div class="parse-row">
          <span class="parse-key">{{ $t('manualOrder.parseNameLabel') }}</span>
          <el-tag v-if="parseResult.clientName" type="success">{{ parseResult.clientName }}</el-tag>
          <span v-else class="parse-empty">{{ $t('manualOrder.parseNone') }}</span>
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
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { artistApi, artistPublicApi } from '../../api/index'
import type { ArtistOrderItem, PublicArtStyle, PublicPricingResult, WorkflowStageDTO, ClientProfile, ClientSummary } from '../../api/types'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { FETCH_ALL_PAGE_SIZE } from '../../constants/pagination'
import { useI18n } from 'vue-i18n'
import { trackEvent } from '../../utils/track'
import { safeGetItem, safeSetItem, safeRemoveItem } from '../../utils/storage'
import ManualOrderLeft from '../../components/artist/order/ManualOrderLeft.vue'
import ManualOrderRight from '../../components/artist/order/ManualOrderRight.vue'
import { parseMessage } from '../../utils/message-parser'
import { recognizeImageText, OcrError, OCR_MAX_SIZE_MB } from '../../utils/ocr'
import { parseReorderFill, buildReorderTextPrefill, buildReorderRefs, findReorderStyleTarget } from '../../utils/reorderFill'
import { MAX_IMAGE_COUNT } from '../../constants/upload'
import { ChatDotRound, Picture } from '@element-plus/icons-vue'

const { t } = useI18n()
const route = useRoute()
const formRef = ref<FormInstance | null>(null)
// REQ-035 §五 MVP-1: 粘贴消息解析（弹窗状态）
const parseDialogVisible = ref(false)
const parseInput = ref('')
const parseResult = ref<ReturnType<typeof parseMessage> | null>(null)
const leftRef = ref<InstanceType<typeof ManualOrderLeft> | null>(null)
const rightRef = ref<InstanceType<typeof ManualOrderRight> | null>(null)
const showResult = ref(false)
const resultNo = ref('')
/** 参考图路径数组（左栏上传后同步；提交时由右栏使用） */
const uploadedRefs = ref<string[]>([])
const subdomain = ref('')
const pricingData = ref<PublicPricingResult | null>(null)
const styles = ref<PublicArtStyle[]>([])
const workflowStages = ref<WorkflowStageDTO[]>([])
/** 录单初始化（getProfile/getPricing/getPublicStyles/getWorkflow）失败明示 + 重试 */
const initLoading = ref(false)
const initFailed = ref(false)
const stylesFailed = ref(false)
const pricingFailed = ref(false)
const workflowFailed = ref(false)

const form = reactive({
  clientQq: '',
  clientName: '',
  description: '',
  // 818-D: 备注（源单备注回填；提交后经既有 addNote 接口写入新单）
  note: '',
  priority: 'medium',
  deadline: null as string | null,
  startDate: null as string | null,
  clientNotify: false
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

// ─── 820 第二批：本地图片识别（截图→文字→走上方解析管线；懒加载，首次使用才下载识别库）───
const ocrBusy = ref(false)
const ocrFileInput = ref<HTMLInputElement | null>(null)

async function runOcr(file: File | undefined | null) {
  if (!file || ocrBusy.value) return
  ocrBusy.value = true
  try {
    const text = await recognizeImageText(file)
    if (!text) {
      ElMessage.warning(t('manualOrder.parseImageEmpty'))
      return
    }
    // 识别文本回填文本框并自动解析，由用户在确认页核对（与文字粘贴同口径，不自动提交）
    parseInput.value = text
    doParseMessage()
    ElMessage.success(t('manualOrder.parseImageDone'))
  } catch (e) {
    const kind = e instanceof OcrError ? e.kind : 'recognize-failed'
    if (kind === 'not-image') ElMessage.warning(t('manualOrder.parseImageNotImage'))
    else if (kind === 'too-big') ElMessage.error(t('manualOrder.parseImageTooBig', { max: OCR_MAX_SIZE_MB }))
    else ElMessage.error(t('manualOrder.parseImageFailed'))
  } finally {
    ocrBusy.value = false
    if (ocrFileInput.value) ocrFileInput.value.value = ''
  }
}

function onOcrPick(e: Event) {
  const input = e.target as HTMLInputElement
  runOcr(input.files?.[0])
}

/** 粘贴拦截：剪贴板带图片 → 走识别；纯文字粘贴不拦截，照旧进文本框 */
function onParsePaste(e: ClipboardEvent) {
  const files = e.clipboardData?.files
  if (!files || files.length === 0) return
  const image = Array.from(files).find(f => f.type.startsWith('image/'))
  if (!image) return
  e.preventDefault()
  runOcr(image)
}

/** 预填后人工确认：只回填识别到的 clientQq/clientName/description，金额/日期仅提示不自动填 */
function applyParseResult() {
  const r = parseResult.value
  if (!r) return
  if (r.clientQq) form.clientQq = r.clientQq
  if (r.clientName) form.clientName = r.clientName
  if (r.description) form.description = r.description
  parseDialogVisible.value = false
  ElMessage.success(t('manualOrder.parseApplied'))
}

/** 提交校验（右栏经 prop 调用；函数形式保证取到挂载后的 el-form 实例） */
// 右栏（JS 组件）prop 声明为 () => Promise<boolean>；实际消费的是 el-form validate 结果，经 unknown 中转断言对齐声明，运行时不变
const validateForm = (() => formRef.value?.validate()) as unknown as () => Promise<boolean>

const rules = {
  clientQq: [{ required: true, message: () => t('manualOrder.fillClientQq'), trigger: 'blur' }]
}

// 多画风判定（草稿内容判定使用；右栏 UI 联动在 ManualOrderRight 内部）
const isMultiStyle = computed(() => styles.value.length > 1)

// ─── REQ-037 E1: QQ 历史会话内缓存 ───
// QQ 每次有效都拉全量订单（200 条）客户端过滤；会话内短时缓存避免连续录入重复重请求；
// 提交成功后手动失效（新订单应立即进入该 QQ 的历史）
/** QQ 历史订单会话内缓存形状 */
interface QqOrdersCacheShape { items: ArtistOrderItem[]; at: number }
let qqOrdersCache: QqOrdersCacheShape | null = null // { items, at }
const QQ_ORDERS_CACHE_TTL = 60_000
function invalidateQqOrdersCache() { qqOrdersCache = null }
async function getQqOrdersSource() {
  if (qqOrdersCache && Date.now() - qqOrdersCache.at < QQ_ORDERS_CACHE_TTL) return qqOrdersCache.items
  const res = await artistApi.getOrders(undefined, { page: 1, pageSize: FETCH_ALL_PAGE_SIZE })
  const items = res.items ?? res
  qqOrdersCache = { items, at: Date.now() }
  return items
}

// ─── QQ 历史订单（防抖 500ms，客户端过滤——API 零改动） ───
const qqValid = computed(() => /^\d{5,15}$/.test(form.clientQq.trim()))
const qqHistory = ref<ArtistOrderItem[]>([])
const qqHistoryLoading = ref(false)
const qqHistoryLoaded = ref(false)
// REQ-035 批A: 客户标记/汇总（与历史订单并行加载；404/失败置 null 不阻塞历史）
const clientProfile = ref<ClientProfile | null>(null)
const clientSummary = ref<ClientSummary | null>(null)
let qqTimer: ReturnType<typeof setTimeout> | null = null
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
      // REQ-037 E1: 历史订单走会话内缓存（同一 QQ 连续录入不重复拉全量）
      const [items, clientRes] = await Promise.all([
        getQqOrdersSource(),
        artistApi.getToolsClient(trimmed).catch(() => null)
      ])
      if (mySeq !== qqSeq) return
      qqHistory.value = items.filter(o => o.client_qq === trimmed).slice(0, 5)
      const cp = clientRes ? clientRes.profile || null : null
      clientProfile.value = cp
      clientSummary.value = cp ? clientRes!.summary || null : null
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
function onSubmitSuccess({ order, postCreateFailed }: { order: { order_no: string }; postCreateFailed?: string | null }) {
  resultNo.value = order.order_no
  showResult.value = true
  // 埋点（REQ-033 §4.2）：手动录单提交成功
  trackEvent('artist_action', { action: 'order_create' })
  // F6: 提交成功后清空草稿（下次进入不再弹恢复提示）
  clearDraft()
  // REQ-037 E1: 新订单入库 → QQ 历史缓存失效（下次查同 QQ 立即可见新单）
  invalidateQqOrdersCache()
  // G-4: 提交即消费草稿 → 本页视为全新（远端草稿更新可继续同步）
  userModified = false
  if (postCreateFailed) {
    ElMessage.warning(t('manualOrder.postCreateFailed.summary', { orderNo: order.order_no, reason: postCreateFailed }))
  }
}

function resetForm() {
  showResult.value = false
  form.clientQq = ''
  form.clientName = ''
  form.description = ''
  form.note = ''
  form.priority = 'medium'
  form.deadline = null
  form.startDate = null
  form.clientNotify = false
  // REQ-015 新增状态重置
  qqHistory.value = []
  qqHistoryLoaded.value = false
  // 子组件内部状态重置（参考图列表/右栏选择与价格）
  leftRef.value?.reset()
  rightRef.value?.reset()
  // F6: 表单重置时同步清空草稿（继续录入 = 已消费旧草稿）
  clearDraft()
  // G-4: 重置后视为未修改（远端草稿更新可继续同步）
  userModified = false
}

// ─── F6: 录单草稿暂存（localStorage 自动保存 + 恢复提示，键带 subdomain 后缀隔离画师） ───
// 对齐 useOrderForm R57 实现；差异：localStorage（录单页误关页面场景，session 失效丢数据更痛）、
// 不暂存图片文件对象（只存可序列化字段）；恢复弹窗在画风/档位数据就绪后触发。
// v0.42 拆分：右栏状态（画风三步走/自定义增项/手输价）由 ManualOrderRight 经 getDraftState/setDraftState 协作。
const DRAFT_KEY_PREFIX = 'huiyue_manual_order_draft'
const draftKey = () => (subdomain.value ? `${DRAFT_KEY_PREFIX}_${subdomain.value}` : null)

/** 右栏草稿状态形状（ManualOrderRight 为 JS 组件，getDraftState 返回未声明，局部补齐消费字段） */
interface RightDraftState {
  styleId?: number | null
  sizeId?: number | null
  addonSelections?: Record<string, { toggled?: boolean; quantity: number } | null>
  usageId?: number | null
  rushId?: number | null
  customAddons?: unknown[]
  finalPriceYuan?: number | null
  priceTouched?: boolean
}

/** 表单是否有内容（任一字段非空）——有内容才落盘，避免空表单刷新生造草稿键 */
function hasDraftContent() {
  const r = (rightRef.value?.getDraftState() || {}) as RightDraftState
  return (isMultiStyle.value && r.styleId != null)
    || r.sizeId != null
    || !!form.description.trim()
    || !!form.note.trim()
    || !!form.clientQq.trim()
    || !!form.clientName.trim()
    || !!form.deadline
    || !!form.startDate
    || form.priority !== 'medium'
    || form.clientNotify
    || Object.values(r.addonSelections || {}).some(s => s && (s.toggled || s.quantity > 0))
    || r.usageId != null
    || r.rushId != null
    || (r.customAddons || []).length > 0
    || r.finalPriceYuan != null
}

function saveDraft() {
  const key = draftKey()
  if (!key) return
  if (!hasDraftContent()) {
    safeRemoveItem(key)
    return
  }
  const r = (rightRef.value?.getDraftState() || {}) as RightDraftState
  // G-5: 裸读写换 safe 封装（写入失败静默降级）
  safeSetItem(key, JSON.stringify({
    form: {
      clientQq: form.clientQq,
      clientName: form.clientName,
      description: form.description,
      note: form.note,
      priority: form.priority,
      deadline: form.deadline,
      startDate: form.startDate,
      clientNotify: form.clientNotify
    },
    // SPEC-PRICE-2: 三步走状态（styleId/sizeId/普通增项勾选/用途/加急）
    styleState: { styleId: r.styleId, sizeId: r.sizeId, addonSelections: r.addonSelections, usageId: r.usageId, rushId: r.rushId },
    // 自定义增项（只存可序列化字段，uid 恢复时重发）
    customAddons: r.customAddons || [],
    // G2: 手输价格恢复（恢复时保留脏标记，避免被重算价格覆盖）
    finalPriceYuan: r.finalPriceYuan,
    priceTouched: r.priceTouched
  }))
}

let draftTimer: ReturnType<typeof setTimeout> | null = null
// ─── G-4（R-17）: 多标签草稿互害修复 ───
// userModified = 本标签页是否被用户修改过（storage 事件判断 last-edit-wins 的依据）；
// applyingRemoteSeq 用于远端回填后清掉由 watcher 连锁产生的脏标记（见 markRemoteApply）。
let userModified = false
let applyingRemoteSeq = 0
function scheduleDraftSave() {
  userModified = true
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(saveDraft, 800)
}

watch([() => form.clientQq, () => form.clientName, () => form.description, () => form.note,
  () => form.priority, () => form.deadline, () => form.startDate, () => form.clientNotify], scheduleDraftSave)
// 三步走/增项/自定义增项/手输价变化由 ManualOrderRight emit('dirty') 触发 scheduleDraftSave

/** 清空草稿键（提交成功 / 恢复弹窗取消 / 重置表单时） */
function clearDraft() {
  const key = draftKey()
  if (!key) return
  safeRemoveItem(key)
}

/** 远端草稿回填/重置后调用：等 watcher 连锁跑完再清脏标记（远端来源不算用户修改） */
function markRemoteApply() {
  const seq = ++applyingRemoteSeq
  nextTick(() => {
    if (seq === applyingRemoteSeq) userModified = false
  })
}

/** 草稿落盘形状（localStorage 序列化；旧草稿多余字段静默忽略） */
interface ManualDraftShape {
  form?: {
    clientQq?: string
    clientName?: string
    description?: string
    note?: string
    priority?: string
    deadline?: string | null
    startDate?: string | null
    clientNotify?: boolean
  }
  styleState?: {
    styleId?: number | null
    sizeId?: number | null
    addonSelections?: Record<string, { toggled?: boolean; quantity?: number }> | null
    usageId?: number | null
    rushId?: number | null
  }
  customAddons?: Array<Record<string, unknown>>
  finalPriceYuan?: number | null
  priceTouched?: boolean
}

/** 把草稿回填到表单（画风/尺寸/增项若已被画师删除则逐项丢弃——右栏 setDraftState 内部校验） */
function applyDraft(draft: ManualDraftShape) {
  const f = draft.form || {}
  form.clientQq = f.clientQq || ''
  form.clientName = f.clientName || ''
  form.description = f.description || ''
  form.note = f.note || ''
  form.priority = f.priority || 'medium'
  form.deadline = f.deadline || null
  form.startDate = f.startDate || null
  form.clientNotify = !!f.clientNotify

  // 右栏状态回填（三步走/用途加急/自定义增项/手输价；旧草稿中的 tierId/倍率字段静默忽略）
  const ss = draft.styleState || {}
  rightRef.value?.setDraftState({
    styleId: ss.styleId,
    sizeId: ss.sizeId,
    addonSelections: ss.addonSelections || {},
    usageId: ss.usageId ?? null,
    rushId: ss.rushId ?? null,
    customAddons: draft.customAddons,
    finalPriceYuan: draft.finalPriceYuan,
    priceTouched: draft.priceTouched
  })
  markRemoteApply()
}

// ─── 818-D + 819-J: 再来一单预填（读 /orders/new?from=<orderId>&fill=desc,style,note,refs） ───
// 契约：QQ/昵称无条件带上；描述/款式尺寸/备注按勾选；deadline/startDate/priority/收款/节点
// 一律不带（新单从零）；参考图勾选时走路径引用复用（不重复上传），数量受 MAX_IMAGE_COUNT
// 约束。预填即新草稿起点，清除旧草稿避免恢复弹窗覆盖本次回填。
async function applyReorderPrefill() {
  const fromId = Number(route.query.from)
  if (!Number.isInteger(fromId) || fromId <= 0) return
  const fillSet = parseReorderFill(route.query.fill as string | undefined)
  let source
  try {
    source = await artistApi.getOrder(fromId)
  } catch (err) {
    ElMessage.error(t('manualOrder.reorderSourceFailed', { message: err instanceof Error ? err.message : String(err) }))
    return
  }
  if (!source) return
  // 源单运行时形状与 ReorderSourceOrder（未导出）字段重合度不足，经 unknown 中转断言，运行时引用不变
  const reorderSource = source as unknown as Parameters<typeof buildReorderTextPrefill>[0]
  const text = buildReorderTextPrefill(reorderSource, fillSet)
  form.clientQq = text.clientQq
  form.clientName = text.clientName
  form.description = text.description
  form.note = text.note
  // 款式尺寸：源单尺寸仍存在于当前画风列表才回填（增项选择接口无结构化数据，留给画师重选）
  if (fillSet.has('style')) {
    const target = findReorderStyleTarget(reorderSource, styles.value)
    if (target) {
      rightRef.value?.setDraftState({
        styleId: target.styleId,
        sizeId: target.sizeId,
        addonSelections: {},
        usageId: null,
        rushId: null,
        customAddons: [],
        finalPriceYuan: null,
        priceTouched: false
      })
    }
  }
  // 819-J 二期：参考图——源单参考图路径引用灌入左栏（与新上传同一提交链路）；
  // 超上限截断轻提示；源单无参考图提示降级，其余预填不受影响
  if (fillSet.has('refs')) {
    const { refs, truncated } = buildReorderRefs(reorderSource)
    if (truncated) {
      ElMessage.warning(t('manualOrder.reorderRefsTruncated', { count: MAX_IMAGE_COUNT }))
    }
    if (refs.length > 0) {
      leftRef.value?.setReorderRefs(refs)
    } else {
      ElMessage.info(t('manualOrder.reorderNoRefs'))
    }
  }
  markRemoteApply()
  ElMessage.success(t('manualOrder.reorderPrefilled', { no: source.order_no || String(fromId) }))
}

/** 恢复提示：mounted 且画风/档位数据就绪后调用；确认回填，取消/关闭清空草稿键 */
async function restoreDraft() {
  const key = draftKey()
  if (!key) return
  let raw
  raw = safeGetItem(key)
  if (!raw) return
  let draft
  try { draft = JSON.parse(raw) } catch { return }
  if (!draft || !draft.form) return

  try {
    await ElMessageBox.confirm(t('manualOrder.draftFound'), t('common.confirm'), {
      // REQ-037 E3: 按钮文案显式化（恢复/丢弃草稿——旧 common.cancel「取消」实为丢弃）
      confirmButtonText: t('manualOrder.draftRestore'),
      cancelButtonText: t('manualOrder.draftDiscard'),
      type: 'info'
    })
    applyDraft(draft)
    ElMessage.success(t('manualOrder.draftRestored'))
  } catch {
    // 用户取消/关闭弹窗 → 清空草稿键（下次进入不再打扰）
    clearDraft()
  }
}

/**
 * G-4（R-17）: 他标签页草稿变更监听（window 'storage' 事件天然广播，仅其他文档触发）
 * ① 有内容变更：本页未被用户修改过 → 静默同步；已修改 → 不打断（last-edit-wins 取舍：
 *    本地正在录入的内容优先，避免被远端覆盖）
 * ③ 清除信号（newValue=null，本页提交/重置产生）：本页重置本地草稿状态
 *    （防 Tab A 提交后 Tab B 仍持已加载草稿重复提交）
 */
function onDraftStorage(e: StorageEvent) {
  const key = draftKey()
  if (!key || e.key !== key) return
  if (e.newValue == null) {
    if (!userModified) {
      resetForm()
      markRemoteApply()
    }
    return
  }
  if (userModified) return
  let draft
  try { draft = JSON.parse(e.newValue) } catch { return }
  if (!draft || !draft.form) return
  applyDraft(draft)
}

/** 页面关闭/刷新前同步落盘（补防抖窗口内最后一次输入；只保存不拦截，不弹原生确认框） */
function onBeforeUnload() {
  if (draftTimer) { clearTimeout(draftTimer); draftTimer = null }
  saveDraft()
}

// ─── 初始化 ───
/** 加载录单所需元数据（subdomain + 报价 + 画风 + 工作流）；失败明示 + 可重试 */
async function init() {
  initLoading.value = true
  initFailed.value = false
  stylesFailed.value = false
  pricingFailed.value = false
  workflowFailed.value = false
  try {
    const profile = await artistApi.getProfile()
    subdomain.value = profile.subdomain
    // 三路并行；任一路失败各自置位（错误横幅统一展示 + 重试入口）
    await Promise.all([
      // 加载价格元数据（分期比例/折扣开关）——右栏使用
      artistPublicApi.getPricing(profile.subdomain)
        .then(res => { pricingData.value = res })
        .catch(() => { pricingFailed.value = true }),
      // 加载画风列表（单画风自动选中在右栏 watch 处理）
      artistPublicApi.getPublicStyles(profile.subdomain)
        .then(res => { styles.value = res || [] })
        .catch(() => { stylesFailed.value = true }),
      // F4: 加载工作流节点（判断初始状态可达性）——右栏使用
      artistApi.getWorkflow()
        .then(res => { workflowStages.value = res.stages || [] })
        .catch(() => { workflowFailed.value = true })
    ])
    // 818-D: 有再来一单预填时优先走预填（预填即新草稿起点，不再弹旧草稿恢复）；
    // 否则按 F6 原逻辑检查本地草稿（恢复回填需要 styles 已加载才能匹配画风/尺寸）
    if (route.query.from != null) {
      await applyReorderPrefill()
      clearDraft()
    } else {
      await restoreDraft()
    }
  } catch {
    initFailed.value = true
  } finally {
    initLoading.value = false
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('storage', onDraftStorage) // G-4: 多标签草稿同步/清除广播
  init()
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('storage', onDraftStorage) // G-4: 成对清理
  if (draftTimer) { clearTimeout(draftTimer); draftTimer = null }
  // 围剿 a1-2: QQ 历史防抖定时器离页清理 + 在途请求作废（卸载递增序号）
  if (qqTimer) { clearTimeout(qqTimer); qqTimer = null }
  qqSeq++
})
</script>

<style scoped>
/* ═══ v0.38: 全页换肤到纸墨 token（REQ-026 §二；模板与类名不动——测试断言依赖） ═══ */
/* ─── 页面容器（子组件内部样式各自 scoped 搬入） ─── */
/* 页宽归一批：移除页级限宽 1200px + margin auto，交给 ArtistLayout 内容容器统一管（--page-max-w） */
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

/* ─── 响应式：平板（600–1024px）单栏 ───
   容器查询批：视口断点改认容器宽（布局容器已加 container-type: inline-size），
   防窗口宽而页窄（--page-max-w 小档）时双栏发挤；目标浏览器均支持 container queries，无需 fallback */
@container (max-width: 1023px) {
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
/* 820 第二批：图片识别行（按钮 + 提示，与解析结果同纸面底色） */
.parse-ocr-row {
  margin-top: 10px;
  display: flex; align-items: center; gap: 10px;
}

/* ─── 响应式：手机（<600px）底部钉住价格条（价格条本体在 ManualOrderRight） ─── */
@media (max-width: 599px) {
  /* 底部留白，防内容被价格条遮挡 */
  .manual-order-page { padding-bottom: 90px; }
}
</style>
